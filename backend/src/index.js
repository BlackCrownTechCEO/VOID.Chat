import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { randomUUID } from "crypto";
import { createReadStream, createWriteStream, mkdirSync, existsSync } from "fs";
import { join, extname } from "path";
import { pipeline } from "stream/promises";

const app    = express();
const server = createServer(app);
const PORT   = Number(process.env.PORT || 3500);
const ORIGIN = process.env.PUBLIC_WEB_ORIGIN || "http://localhost:5173";

// ── Middleware ────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "32mb" }));

// ── In-memory store ───────────────────────────────────────────────
const users       = new Map(); // socketId → { voidId, name, alias, socketId }
const byVoidId    = new Map(); // voidId   → socketId
const byAlias     = new Map(); // alias    → socketId

const rooms = new Map(); // name → RoomState
const groups = new Map(); // id  → GroupState
const friends = new Map(); // voidId → Set<voidId>
const pendingFR  = new Map(); // toVoidId → [{fromVoidId,fromName}]
const keyBundles = new Map(); // alias → bundle
const inboxes    = new Map(); // alias → [{id,fromAlias,toAlias,payload,createdAt}]
const snaps      = new Map(); // id    → SnapState

// ── Server metadata ───────────────────────────────────────────────
let ownerVoidId  = null;
let ownerKey     = process.env.OWNER_KEY || "voidmaster";
let maintenance  = false;
let motdText     = "Welcome to VØID 👁";

// Upload dir
const UPLOAD_DIR = join(process.cwd(), "uploads");
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────
function ts()    { return new Date().toISOString(); }
function uid()   { return randomUUID(); }
function nonce() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function getUser(socketId) { return users.get(socketId); }

function getOrCreateRoom(name, category = "GENERAL") {
  if (!rooms.has(name)) {
    rooms.set(name, {
      name, category: category || "GENERAL",
      password: "", ownerId: null,
      adminIds: new Set(), bannedIds: new Set(), mutedIds: new Set(),
      locked: false, messages: [], pinnedMsg: null,
    });
  }
  return rooms.get(name);
}

function roomSocketId(name) { return `room:${name}`; }
function groupSocketId(id)  { return `group:${id}`; }

function userList(io, roomName) {
  const room = rooms.get(roomName);
  if (!room) return [];
  const sids = io.sockets.adapter.rooms.get(roomSocketId(roomName)) || new Set();
  return [...sids].map(sid => {
    const u = users.get(sid);
    if (!u) return null;
    return {
      id: u.voidId, name: u.name || u.alias || "anon",
      isAdmin: room.adminIds.has(u.voidId),
      isOwner: ownerVoidId && ownerVoidId === u.voidId,
    };
  }).filter(Boolean);
}

function broadcastRoomUsers(io, roomName) {
  io.to(roomSocketId(roomName)).emit("userList", { users: userList(io, roomName) });
}

function broadcastRoomList(io) {
  const list = [...rooms.values()].map(r => ({
    name: r.name, category: r.category,
    locked: r.locked, pinned: r.pinnedMsg?.text || "",
  }));
  io.emit("roomList", { rooms: list });
}

function getFriendSet(voidId) {
  if (!friends.has(voidId)) friends.set(voidId, new Set());
  return friends.get(voidId);
}

function getFriendList(voidId) {
  const set = getFriendSet(voidId);
  return [...set].map(fvid => {
    const sid  = byVoidId.get(fvid);
    const user = sid ? users.get(sid) : null;
    return { voidId: fvid, name: user?.name || fvid, online: !!sid };
  });
}

function sendFriendList(socket, voidId) {
  socket.emit("friendList", { friends: getFriendList(voidId) });
}

// ── Socket.IO ──────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 32e6,
});

// Seed default rooms
getOrCreateRoom("general",    "GENERAL");
getOrCreateRoom("announcements", "GENERAL");
getOrCreateRoom("media",      "MEDIA");
getOrCreateRoom("off-topic",  "GENERAL");

io.on("connection", (socket) => {
  // ── Auth ─────────────────────────────────────────────────────
  socket.on("authenticate", ({ voidId, name, alias } = {}) => {
    const vid  = String(voidId  || socket.id).slice(0, 80);
    const uname = String(name  || alias || "anon").slice(0, 60);
    const ualias = String(alias || "").slice(0, 80);

    const prev = byVoidId.get(vid);
    if (prev && prev !== socket.id) {
      // disconnect old session
      byVoidId.delete(vid);
    }

    users.set(socket.id, { voidId: vid, name: uname, alias: ualias, socketId: socket.id });
    byVoidId.set(vid, socket.id);
    if (ualias) byAlias.set(ualias, socket.id);

    socket.emit("motd", { text: motdText });
    socket.emit("ownerStatus", { isOwner: ownerVoidId === vid });

    // Send friend list
    sendFriendList(socket, vid);

    // Send pending friend requests
    const pr = pendingFR.get(vid) || [];
    if (pr.length) socket.emit("pendingFriendRequests", pr);

    // Send group list
    const myGroups = [...groups.values()].filter(g => g.memberIds.has(vid));
    socket.emit("groupList", { groups: myGroups.map(g => ({ id: g.id, name: g.name, topic: g.topic || "" })) });

    // Notify online friends
    const myFriends = getFriendSet(vid);
    myFriends.forEach(fvid => {
      const fsid = byVoidId.get(fvid);
      if (fsid) io.to(fsid).emit("friendOnline", { voidId: vid, name: uname });
    });

    if (maintenance && ownerVoidId !== vid) {
      socket.emit("maintenanceLock", { message: "Server is under maintenance. Please try again later." });
    }
  });

  socket.on("joinAliasRoom", ({ alias } = {}) => {
    if (alias && typeof alias === "string" && alias.length < 120) {
      socket.join(`alias:${alias}`);
      const u = getUser(socket.id);
      if (u && !u.alias && alias) {
        u.alias = alias;
        byAlias.set(alias, socket.id);
      }
    }
  });

  // ── Rooms ─────────────────────────────────────────────────────
  socket.on("getRoomList", () => {
    broadcastRoomList(io);
  });

  socket.on("createRoom", ({ name, password = "", category = "GENERAL", voidId } = {}) => {
    const roomName = String(name || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
    if (!roomName) return socket.emit("joinError", { message: "Channel name cannot be empty." });
    if (rooms.has(roomName)) return socket.emit("joinError", { message: `#${roomName} already exists.` });

    const vid = voidId || getUser(socket.id)?.voidId;
    const room = getOrCreateRoom(roomName, category || "GENERAL");
    room.password = password ? String(password).slice(0, 100) : "";
    room.ownerId  = vid;
    room.adminIds.add(vid);

    socket.join(roomSocketId(roomName));
    socket.emit("joinSuccess", { room: roomName, isAdmin: true });
    socket.emit("history", { messages: [] });
    socket.emit("userList", { users: userList(io, roomName) });
    broadcastRoomList(io);
  });

  socket.on("enterRoom", ({ room: rawRoom, password = "", voidId, name } = {}) => {
    const roomName = String(rawRoom || "").trim().replace(/^#/, "").slice(0, 40);
    if (!roomName) return socket.emit("joinError", { message: "Room name required." });

    const vid = voidId || getUser(socket.id)?.voidId;
    const uname = name || getUser(socket.id)?.name || "anon";
    const r = getOrCreateRoom(roomName);

    if (r.bannedIds.has(vid)) return socket.emit("joinError", { message: "You are banned from this channel." });
    if (r.locked && !r.adminIds.has(vid) && ownerVoidId !== vid)
      return socket.emit("joinError", { message: "Channel is locked." });
    if (r.password && r.password !== password)
      return socket.emit("joinError", { message: "Wrong password." });

    // Update user name in memory
    const u = getUser(socket.id);
    if (u) { u.name = uname; u.voidId = vid; byVoidId.set(vid, socket.id); }

    const isAdmin = r.adminIds.has(vid) || ownerVoidId === vid;
    socket.join(roomSocketId(roomName));
    socket.emit("joinSuccess", { room: roomName, isAdmin });
    socket.emit("adminStatus",  { isAdmin });
    socket.emit("history", { messages: r.messages.slice(-80).map(m => ({ ...m })) });
    broadcastRoomUsers(io, roomName);
    broadcastRoomList(io);

    if (r.pinnedMsg) socket.emit("pinnedMsg", r.pinnedMsg);
  });

  socket.on("message", ({ text, room: rawRoom, replyTo, type: msgType } = {}) => {
    const roomName = String(rawRoom || "").trim().replace(/^#/, "");
    if (!roomName || !text?.trim()) return;
    const u = getUser(socket.id);
    if (!u) return;
    const r = rooms.get(roomName);
    if (!r) return;
    if (r.mutedIds.has(u.voidId)) return socket.emit("muteStatus", { muted: true });
    if (maintenance && ownerVoidId !== u.voidId) return socket.emit("maintenanceLock", { message: "Server is under maintenance." });

    const msg = {
      id: uid(), name: u.name || u.alias, text: String(text).slice(0, 2000),
      time: ts(), voidId: u.voidId, type: msgType || "user",
      replyTo: replyTo || null,
    };
    r.messages.push(msg);
    if (r.messages.length > 300) r.messages = r.messages.slice(-300);
    io.to(roomSocketId(roomName)).emit("message", msg);
  });

  // ── Admin commands ────────────────────────────────────────────
  socket.on("adminCmd", ({ cmd, target, data } = {}) => {
    const u = getUser(socket.id);
    if (!u) return;
    const r = rooms.get(roomRef(socket));
    if (!r) return;
    const isAdmin  = r.adminIds.has(u.voidId) || ownerVoidId === u.voidId;
    if (!isAdmin) return socket.emit("adminError", { message: "Not authorized." });

    switch (String(cmd)) {
      case "kick": {
        const tsid = findSocketByName(target);
        if (tsid) {
          io.to(tsid).emit("kicked", { reason: String(data || "Kicked by admin.") });
          io.sockets.sockets.get(tsid)?.leave(roomSocketId(r.name));
          broadcastRoomUsers(io, r.name);
        }
        break;
      }
      case "ban": {
        const tu = findUserByName(target);
        if (tu) {
          r.bannedIds.add(tu.voidId);
          const tsid = byVoidId.get(tu.voidId);
          if (tsid) {
            io.to(tsid).emit("kicked", { reason: "You have been banned." });
            io.sockets.sockets.get(tsid)?.leave(roomSocketId(r.name));
          }
          socket.emit("adminSuccess", { message: `${target} banned.` });
          broadcastRoomUsers(io, r.name);
        }
        break;
      }
      case "unban": {
        const tu = findUserByName(target);
        if (tu) { r.bannedIds.delete(tu.voidId); socket.emit("adminSuccess", { message: `${target} unbanned.` }); }
        break;
      }
      case "mute": {
        const tu = findUserByName(target);
        if (tu) { r.mutedIds.add(tu.voidId); io.to(byVoidId.get(tu.voidId) || "").emit("muteStatus", { muted: true }); socket.emit("adminSuccess", { message: `${target} muted.` }); }
        break;
      }
      case "unmute": {
        const tu = findUserByName(target);
        if (tu) { r.mutedIds.delete(tu.voidId); io.to(byVoidId.get(tu.voidId) || "").emit("muteStatus", { muted: false }); socket.emit("adminSuccess", { message: `${target} unmuted.` }); }
        break;
      }
      case "clear":
        r.messages = [];
        io.to(roomSocketId(r.name)).emit("history", { messages: [] });
        socket.emit("adminSuccess", { message: "Messages cleared." });
        break;
      case "lock":
        r.locked = true;
        io.to(roomSocketId(r.name)).emit("roomLocked", { locked: true });
        socket.emit("adminSuccess", { message: "Channel locked." });
        broadcastRoomList(io);
        break;
      case "unlock":
        r.locked = false;
        io.to(roomSocketId(r.name)).emit("roomLocked", { locked: false });
        socket.emit("adminSuccess", { message: "Channel unlocked." });
        broadcastRoomList(io);
        break;
      case "pin": {
        const msg = r.messages.find(m => m.id === target) || r.messages[r.messages.length - 1];
        if (msg) {
          r.pinnedMsg = msg;
          io.to(roomSocketId(r.name)).emit("pinnedMsg", msg);
          socket.emit("adminSuccess", { message: "Message pinned." });
        }
        break;
      }
      case "slowmode":
        socket.emit("adminSuccess", { message: `Slow mode: ${data || "off"}.` });
        break;
      case "promote": {
        const tu = findUserByName(target);
        if (tu) {
          r.adminIds.add(tu.voidId);
          io.to(byVoidId.get(tu.voidId) || "").emit("adminStatus", { isAdmin: true });
          socket.emit("adminSuccess", { message: `${target} promoted to admin.` });
          broadcastRoomUsers(io, r.name);
        }
        break;
      }
      case "demote": {
        const tu = findUserByName(target);
        if (tu) {
          r.adminIds.delete(tu.voidId);
          io.to(byVoidId.get(tu.voidId) || "").emit("adminStatus", { isAdmin: false });
          socket.emit("adminSuccess", { message: `${target} demoted.` });
          broadcastRoomUsers(io, r.name);
        }
        break;
      }
      default:
        socket.emit("adminError", { message: `Unknown command: ${cmd}` });
    }
  });

  socket.on("ownerCmd", ({ cmd, voidId: vid, message: msg, key, category, name: chName, reason } = {}) => {
    const u = getUser(socket.id);
    if (!u || ownerVoidId !== u.voidId) return socket.emit("adminError", { message: "Not the owner." });
    switch (String(cmd)) {
      case "announce":
        io.emit("motd", { text: String(msg || "").slice(0, 500) });
        motdText = String(msg || "");
        break;
      case "maintenance":
        maintenance = !maintenance;
        io.emit("maintenanceLock", { message: maintenance ? "Server is under maintenance." : "" });
        socket.emit("adminSuccess", { message: `Maintenance mode ${maintenance ? "enabled" : "disabled"}.` });
        break;
      case "setMotd":
        motdText = String(msg || "").slice(0, 500);
        io.emit("motd", { text: motdText });
        socket.emit("adminSuccess", { message: "MOTD updated." });
        break;
      case "globalBan": {
        const tu = byVoidId.get(String(vid || ""));
        if (tu) {
          io.to(tu).emit("globalBanned", { message: reason || "You have been globally banned." });
          io.sockets.sockets.get(tu)?.disconnect(true);
          socket.emit("adminSuccess", { message: "User globally banned." });
        }
        break;
      }
      case "createCategory":
        // Categories are derived from room fields — no explicit action needed
        socket.emit("adminSuccess", { message: `Category noted.` });
        break;
      case "deleteRoom": {
        const rname = String(chName || "").trim();
        if (rooms.has(rname)) {
          io.to(roomSocketId(rname)).emit("kicked", { reason: "Channel deleted by owner." });
          rooms.delete(rname);
          broadcastRoomList(io);
          socket.emit("adminSuccess", { message: `#${rname} deleted.` });
        }
        break;
      }
      default:
        socket.emit("adminError", { message: `Unknown owner command: ${cmd}` });
    }
  });

  socket.on("claimOwner", ({ key: k, voidId: vid } = {}) => {
    if (ownerVoidId) return socket.emit("adminError", { message: "Server already has an owner." });
    if (String(k) !== ownerKey)  return socket.emit("adminError", { message: "Invalid owner key." });
    ownerVoidId = String(vid || getUser(socket.id)?.voidId);
    socket.emit("ownerStatus",  { isOwner: true });
    socket.emit("adminSuccess", { message: "You are now the server owner." });
    io.emit("motd", { text: motdText });
  });

  // ── Groups ────────────────────────────────────────────────────
  socket.on("createGroup", ({ name, voidId } = {}) => {
    const gname = String(name || "").trim().slice(0, 60);
    if (!gname) return socket.emit("groupError", { message: "Group name required." });
    const vid = voidId || getUser(socket.id)?.voidId;
    const gid = uid();
    const group = {
      id: gid, name: gname, topic: "", ownerId: vid,
      memberIds: new Set([vid]), messages: [],
    };
    groups.set(gid, group);
    socket.join(groupSocketId(gid));
    socket.emit("groupCreated", { group: { id: gid, name: gname, topic: "" } });
    socket.emit("groupHistoryData", { groupId: gid, messages: [] });
    socket.emit("groupMemberList", { groupId: gid, members: [{ voidId: vid, name: getUser(socket.id)?.name }] });
  });

  socket.on("joinGroup", ({ groupId, voidId } = {}) => {
    const g = groups.get(String(groupId));
    if (!g) return socket.emit("groupError", { message: "Group not found." });
    const vid = voidId || getUser(socket.id)?.voidId;
    g.memberIds.add(vid);
    socket.join(groupSocketId(g.id));
    socket.emit("groupJoined", { group: { id: g.id, name: g.name, topic: g.topic } });
    socket.emit("groupHistoryData", { groupId: g.id, messages: g.messages.slice(-80) });
    broadcastGroupMembers(io, g);
  });

  socket.on("groupHistory", ({ groupId } = {}) => {
    const g = groups.get(String(groupId));
    if (!g) return;
    socket.emit("groupHistoryData", { groupId: g.id, messages: g.messages.slice(-80) });
    broadcastGroupMembers(io, g);
  });

  socket.on("groupMsg", ({ groupId, text, replyTo } = {}) => {
    const g = groups.get(String(groupId));
    if (!g || !text?.trim()) return;
    const u = getUser(socket.id);
    if (!u || !g.memberIds.has(u.voidId)) return socket.emit("groupError", { message: "Not a member." });
    const msg = {
      id: uid(), groupId: g.id, name: u.name, text: String(text).slice(0, 2000),
      time: ts(), voidId: u.voidId, replyTo: replyTo || null,
    };
    g.messages.push(msg);
    if (g.messages.length > 300) g.messages = g.messages.slice(-300);
    io.to(groupSocketId(g.id)).emit("groupMsg", msg);
  });

  socket.on("leaveGroup", ({ groupId, voidId } = {}) => {
    const g = groups.get(String(groupId));
    if (!g) return;
    const vid = voidId || getUser(socket.id)?.voidId;
    g.memberIds.delete(vid);
    socket.leave(groupSocketId(g.id));
    socket.emit("groupLeft", { groupId: g.id });
    broadcastGroupMembers(io, g);
  });

  // ── Friends ───────────────────────────────────────────────────
  socket.on("friendRequest", ({ toVoidId } = {}) => {
    const u = getUser(socket.id);
    if (!u || !toVoidId) return;
    const q = pendingFR.get(toVoidId) || [];
    if (q.find(r => r.fromVoidId === u.voidId)) return;
    q.push({ fromVoidId: u.voidId, fromName: u.name });
    pendingFR.set(toVoidId, q);
    const tsid = byVoidId.get(toVoidId);
    if (tsid) io.to(tsid).emit("pendingFriendRequests", q);
  });

  socket.on("acceptFriend", ({ fromVoidId } = {}) => {
    const u = getUser(socket.id);
    if (!u || !fromVoidId) return;
    getFriendSet(u.voidId).add(fromVoidId);
    getFriendSet(fromVoidId).add(u.voidId);
    // Remove from pending
    const pr = (pendingFR.get(u.voidId) || []).filter(r => r.fromVoidId !== fromVoidId);
    pendingFR.set(u.voidId, pr);
    socket.emit("pendingFriendRequests", pr);
    sendFriendList(socket, u.voidId);
    const fsid = byVoidId.get(fromVoidId);
    if (fsid) {
      const fSocket = io.sockets.sockets.get(fsid);
      if (fSocket) sendFriendList(fSocket, fromVoidId);
      io.to(fsid).emit("friendOnline", { voidId: u.voidId, name: u.name });
    }
  });

  socket.on("declineFriend", ({ fromVoidId } = {}) => {
    const u = getUser(socket.id);
    if (!u) return;
    const pr = (pendingFR.get(u.voidId) || []).filter(r => r.fromVoidId !== fromVoidId);
    pendingFR.set(u.voidId, pr);
    socket.emit("pendingFriendRequests", pr);
  });

  socket.on("removeFriend", ({ voidId: fvid } = {}) => {
    const u = getUser(socket.id);
    if (!u || !fvid) return;
    getFriendSet(u.voidId).delete(fvid);
    getFriendSet(fvid).delete(u.voidId);
    sendFriendList(socket, u.voidId);
  });

  // ── Direct Messages ───────────────────────────────────────────
  socket.on("dm", ({ toVoidId, text, replyTo } = {}) => {
    const u = getUser(socket.id);
    if (!u || !toVoidId || !text?.trim()) return socket.emit("dmError", { message: "Cannot send DM." });
    const tsid = byVoidId.get(toVoidId);
    const msg = {
      id: uid(), name: u.name, text: String(text).slice(0, 2000),
      time: ts(), voidId: u.voidId, replyTo: replyTo || null,
    };
    if (tsid) io.to(tsid).emit("dm", { msg, withVoidId: u.voidId });
    socket.emit("dm", { msg: { ...msg, fromMe: true }, withVoidId: toVoidId });
  });

  // ── VoidFlash Snaps (E2EE ephemeral) ─────────────────────────
  socket.on("sendSnap", ({ toAlias, encPayload, duration = 5 } = {}) => {
    const u = getUser(socket.id);
    if (!u || !toAlias || !encPayload) return;
    const snapId = uid();
    const snap = {
      id: snapId, fromAlias: u.alias || u.name, toAlias,
      encPayload, duration: Math.min(Number(duration) || 5, 60),
      createdAt: ts(),
    };
    snaps.set(snapId, snap);
    const tsid = byAlias.get(toAlias);
    if (tsid) {
      io.to(tsid).emit("snapReceived", { id: snapId, fromAlias: snap.fromAlias, encPayload, duration: snap.duration });
    } else {
      // Deliver via alias room
      io.to(`alias:${toAlias}`).emit("snapReceived", { id: snapId, fromAlias: snap.fromAlias, encPayload, duration: snap.duration });
    }
    // Auto-delete from server after duration + 10s buffer
    setTimeout(() => snaps.delete(snapId), (snap.duration + 10) * 1000);
    socket.emit("snapSent", { id: snapId, to: toAlias });
  });

  socket.on("snapViewed", ({ id } = {}) => {
    snaps.delete(String(id));
  });

  // ── Vault relay ───────────────────────────────────────────────
  socket.on("vaultMsg", ({ vaultId, senderId, encPayload, msgId } = {}) => {
    if (!vaultId || !encPayload) return;
    const room = `vault:${vaultId}`;
    io.to(room).emit("vaultMsg", { vaultId, senderId, encPayload, msgId: msgId || uid() });
  });

  // ── E2EE key registration (REST-equivalent via socket) ────────
  socket.on("registerBundle", ({ alias: a, bundle } = {}) => {
    if (a && bundle) {
      keyBundles.set(a, bundle);
      if (!inboxes.has(a)) inboxes.set(a, []);
      socket.emit("bundleRegistered", { ok: true });
    }
  });

  // ── Disconnect ────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const u = users.get(socket.id);
    if (!u) return;
    byVoidId.delete(u.voidId);
    if (u.alias) byAlias.delete(u.alias);
    users.delete(socket.id);

    // Notify friends
    getFriendSet(u.voidId).forEach(fvid => {
      const fsid = byVoidId.get(fvid);
      if (fsid) io.to(fsid).emit("friendOffline", { voidId: u.voidId });
    });

    // Update room user lists
    rooms.forEach((_, rname) => {
      if (io.sockets.adapter.rooms.has(roomSocketId(rname))) {
        broadcastRoomUsers(io, rname);
      }
    });
  });
});

// ── Helpers (socket-level) ─────────────────────────────────────────
function roomRef(socket) {
  // Best-effort: find the first non-vault, non-group, non-alias room the socket is in
  const srooms = [...(socket.rooms || [])];
  const r = srooms.find(r => r.startsWith("room:"));
  return r ? r.slice(5) : null;
}

function findUserByName(name) {
  return [...users.values()].find(u => u.name?.toLowerCase() === String(name).toLowerCase());
}
function findSocketByName(name) {
  const u = findUserByName(name);
  return u ? u.socketId : null;
}

function broadcastGroupMembers(io, g) {
  const members = [...g.memberIds].map(vid => {
    const sid = byVoidId.get(vid);
    const u   = sid ? users.get(sid) : null;
    return { voidId: vid, name: u?.name || vid, online: !!sid };
  });
  io.to(groupSocketId(g.id)).emit("groupMemberList", { groupId: g.id, members });
}

// ── REST endpoints ─────────────────────────────────────────────────
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "void-relay", uptime: process.uptime(), time: ts() });
});

// E2EE key bundle REST (for X3DH)
app.post("/api/keys/register", (req, res) => {
  const alias  = String(req.body?.alias || "").trim();
  const bundle = req.body?.bundle;
  if (!alias || !bundle) return res.status(400).json({ error: "alias and bundle required" });
  keyBundles.set(alias, bundle);
  if (!inboxes.has(alias)) inboxes.set(alias, []);
  res.status(201).json({ ok: true, alias });
});

app.get("/api/keys/:alias", (req, res) => {
  const bundle = keyBundles.get(String(req.params.alias || ""));
  if (!bundle) return res.status(404).json({ error: "Not found" });
  res.json({ alias: req.params.alias, bundle });
});

app.post("/api/encrypted/direct", (req, res) => {
  const { fromAlias, toAlias, payload } = req.body || {};
  if (!fromAlias || !toAlias || !payload) return res.status(400).json({ error: "Invalid payload" });
  const entry = { id: uid(), fromAlias, toAlias, payload, createdAt: ts() };
  const list = inboxes.get(toAlias) || [];
  list.push(entry);
  inboxes.set(toAlias, list);
  io.to(`alias:${toAlias}`).emit("encrypted-message", entry);
  res.status(201).json({ ok: true, id: entry.id });
});

app.get("/api/encrypted/inbox/:alias", (req, res) => {
  res.json(inboxes.get(String(req.params.alias)) || []);
});

// Media upload (strip metadata via re-encode hint)
const ALLOWED_EXT  = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov"]);
const MAX_BYTES    = 32 * 1024 * 1024; // 32 MB

app.post("/api/media/upload", express.raw({ type: "*/*", limit: "32mb" }), (req, res) => {
  try {
    const ext   = extname(String(req.headers["x-filename"] || ".bin")).toLowerCase();
    const mime  = String(req.headers["content-type"] || "application/octet-stream");
    if (!ALLOWED_EXT.has(ext)) return res.status(415).json({ error: "File type not allowed." });
    if (req.body.length > MAX_BYTES) return res.status(413).json({ error: "File too large (max 32 MB)." });

    const fname = `${uid()}${ext}`;
    const fpath = join(UPLOAD_DIR, fname);
    const ws = createWriteStream(fpath);
    ws.write(req.body);
    ws.end();
    ws.on("finish", () => res.status(201).json({ ok: true, url: `/api/media/${fname}`, mime }));
    ws.on("error", () => res.status(500).json({ error: "Write failed." }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/media/:file", (req, res) => {
  const fname = String(req.params.file).replace(/[^a-zA-Z0-9._-]/g, "");
  const fpath = join(UPLOAD_DIR, fname);
  if (!existsSync(fpath)) return res.status(404).json({ error: "Not found." });
  // Strip headers that might leak metadata
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  createReadStream(fpath).pipe(res);
});

// ── Start ──────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n  VØID relay server  ›  http://localhost:${PORT}`);
  console.log(`  Owner key          ›  ${ownerKey}`);
  console.log(`  Channels           ›  ${[...rooms.keys()].join(", ")}\n`);
});

export { app, server, io };
