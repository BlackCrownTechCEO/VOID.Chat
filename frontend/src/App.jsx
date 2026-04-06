import { useEffect, useReducer, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./styles/luxury.css";
import LuxSidebar from "./components/LuxSidebar.jsx";
import LuxHeader from "./components/LuxHeader.jsx";
import LuxMessages from "./components/LuxMessages.jsx";
import LuxComposer from "./components/LuxComposer.jsx";
import LuxProfileSettings from "./components/LuxProfileSettings.jsx";
import VoidFlash, { flash } from "./components/VoidFlash.jsx";
import {
  registerBundle, createEncryptedOutgoing, decryptIncoming, ensureIdentity,
} from "./crypto/protocol.js";
import {
  encryptVaultMessage, decryptVaultMessage,
  registerVault, getVaultPassphrase, listVaults,
} from "./crypto/vault.js";

const API_URL = import.meta.env.VITE_API_URL || "";

// ── Identity helpers ──────────────────────────────────────────
function genAlias() {
  const words = ["ghost","echo","shadow","cipher","nova","void","flux","prism","zero","arc"];
  const seed = Math.random().toString(36).slice(2, 8);
  return `@${words[seed.length % words.length]}-${words[(seed.charCodeAt(0)||0) % words.length]}-${seed.slice(0,4)}`;
}
function persist(key, factory) {
  let v = localStorage.getItem(key);
  if (!v) { v = factory(); localStorage.setItem(key, v); }
  return v;
}
function persistJson(key, factory) {
  try { const v = localStorage.getItem(key); if (v) return JSON.parse(v); } catch {}
  const v = factory(); localStorage.setItem(key, JSON.stringify(v)); return v;
}
function nonce() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ── Reducer ───────────────────────────────────────────────────
const INIT = {
  activeTab: "rooms",
  alias: null, voidId: null,
  isOwner: false, isConnected: false, registered: false,
  motd: "", status: "Initializing…",
  currentRoom: null,
  roomMessages: {}, roomUsers: {}, roomIsAdmin: {}, roomList: [],
  currentDmPeer: null, dmMessages: {},
  friends: [], friendRequests: [],
  currentGroupId: null, groups: [], groupMessages: {}, groupMeta: {},
  currentVaultId: null, vaults: [], vaultMessages: {},
  composeText: "",
};

function addReaction(msgs, id, emoji, byMe) {
  return msgs.map(m => {
    if (m.id !== id) return m;
    const prev = m.reactions || [];
    const existing = prev.find(r => r.emoji === emoji);
    if (existing) {
      const updated = existing.count <= 1 && existing.byMe
        ? prev.filter(r => r.emoji !== emoji)
        : prev.map(r => r.emoji === emoji ? { ...r, count: byMe ? r.count : r.count+1, byMe: r.byMe || byMe } : r);
      return { ...m, reactions: updated };
    }
    return { ...m, reactions: [...prev, { emoji, count:1, byMe }] };
  });
}

function reducer(s, a) {
  switch (a.type) {
    case "SET": return { ...s, ...a.payload };
    case "ROOM_MSG": {
      const prev = s.roomMessages[a.room] || [];
      return { ...s, roomMessages: { ...s.roomMessages, [a.room]: [...prev, a.msg].slice(-300) }};
    }
    case "ROOM_HISTORY": return { ...s, roomMessages: { ...s.roomMessages, [a.room]: a.msgs }};
    case "ROOM_USERS":   return { ...s, roomUsers: { ...s.roomUsers, [a.room]: a.users }};
    case "JOIN_ROOM": {
      const exists = s.roomList.find(r => r.name === a.room);
      return { ...s, currentRoom: a.room, activeTab:"rooms",
        roomIsAdmin: { ...s.roomIsAdmin, [a.room]: a.isAdmin||false },
        roomList: exists ? s.roomList : [...s.roomList, { name:a.room, isNsfw:false }],
      };
    }
    case "ADMIN_STATUS": return { ...s, roomIsAdmin: { ...s.roomIsAdmin, [s.currentRoom]: a.isAdmin }};
    case "DM_MSG": {
      const prev = s.dmMessages[a.peer] || [];
      return { ...s, dmMessages: { ...s.dmMessages, [a.peer]: [...prev, a.msg].slice(-300) }};
    }
    case "UPDATE_DM_META": {
      const msgs = (s.dmMessages[a.peer] || []).map(m => m.id===a.id ? { ...m, meta:a.meta } : m);
      return { ...s, dmMessages: { ...s.dmMessages, [a.peer]: msgs }};
    }
    case "GROUP_MSG": {
      const prev = s.groupMessages[a.groupId] || [];
      return { ...s, groupMessages: { ...s.groupMessages, [a.groupId]: [...prev, a.msg].slice(-300) }};
    }
    case "GROUP_HISTORY": return { ...s, groupMessages: { ...s.groupMessages, [a.groupId]: a.msgs }};
    case "GROUP_META":    return { ...s, groupMeta: { ...s.groupMeta, [a.groupId]: { ...s.groupMeta[a.groupId], ...a.meta }}};
    case "ADD_GROUP": {
      const exists = s.groups.find(g => g.id===a.group.id);
      return { ...s,
        groups: exists ? s.groups.map(g => g.id===a.group.id ? {...g,...a.group} : g) : [...s.groups, a.group],
        currentGroupId: a.group.id, activeTab:"groups",
      };
    }
    case "SET_GROUPS":       return { ...s, groups: a.groups };
    case "SET_FRIENDS":      return { ...s, friends: a.friends };
    case "FRIEND_REQUESTS":  return { ...s, friendRequests: a.requests };
    case "FRIEND_ONLINE":    return { ...s, friends: s.friends.map(f => f.voidId===a.voidId ? {...f,online:true,name:a.name||f.name} : f) };
    case "LEAVE_GROUP":      return { ...s,
      groups: s.groups.filter(g => g.id!==a.groupId),
      currentGroupId: s.currentGroupId===a.groupId ? null : s.currentGroupId,
    };
    case "VAULT_MSG": {
      const prev = s.vaultMessages[a.vaultId] || [];
      return { ...s, vaultMessages: { ...s.vaultMessages, [a.vaultId]: [...prev, a.msg].slice(-300) }};
    }
    case "SET_VAULTS":  return { ...s, vaults: a.vaults };
    case "REACT_MSG": {
      const { tab, room, peer, groupId, vaultId, msgId, emoji, byMe } = a;
      if (tab==="rooms"  && room)    return { ...s, roomMessages:  { ...s.roomMessages,  [room]:    addReaction(s.roomMessages[room]||[], msgId, emoji, byMe) }};
      if (tab==="connect" && peer)   return { ...s, dmMessages:    { ...s.dmMessages,    [peer]:    addReaction(s.dmMessages[peer]||[], msgId, emoji, byMe) }};
      if (tab==="groups" && groupId) return { ...s, groupMessages: { ...s.groupMessages, [groupId]: addReaction(s.groupMessages[groupId]||[], msgId, emoji, byMe) }};
      if (tab==="encrypted" && vaultId) return { ...s, vaultMessages: { ...s.vaultMessages, [vaultId]: addReaction(s.vaultMessages[vaultId]||[], msgId, emoji, byMe) }};
      return s;
    }
    default: return s;
  }
}

// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [state, dispatch] = useReducer(reducer, {
    ...INIT,
    alias:  persist("void.alias",  genAlias),
    voidId: persist("void.voidId", () => crypto.randomUUID()),
    vaults: listVaults(),
  });
  const [displayName, setDisplayName] = useState(() => localStorage.getItem("void.displayName") || "");
  const [settings,    setSettings]    = useState(() => persistJson("void.settings", () => ({
    avatarColor:"#7c5cff", avatarEmoji:"", sounds:true, timestamps:true,
    compact:false, fontSize:"medium", theme:"void", enterToSend:true,
  })));
  const [profileOpen, setProfileOpen] = useState(false);
  const [replyTo,     setReplyTo]     = useState(null);

  const socketRef  = useRef(null);
  const roomRef    = useRef(null);
  const friendsRef = useRef([]);
  const { alias, voidId } = state;
  const myName = displayName || alias;

  useEffect(() => { roomRef.current    = state.currentRoom; });
  useEffect(() => { friendsRef.current = state.friends; });

  // Apply CSS variables from settings
  useEffect(() => {
    document.documentElement.setAttribute("data-font-size", settings.fontSize || "medium");
    document.documentElement.setAttribute("data-compact",   settings.compact ? "1" : "0");
    document.documentElement.setAttribute("data-theme",     settings.theme   || "void");
  }, [settings.fontSize, settings.compact, settings.theme]);

  // ── E2EE init ─────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    ensureIdentity()
      .then(() => registerBundle(API_URL, alias))
      .then(() => { if (alive) { dispatch({ type:"SET", payload:{ registered:true, status:"E2EE ready" }}); flash("E2EE identity ready 🔐", "success"); }})
      .catch(() => { if (alive) dispatch({ type:"SET", payload:{ status:"E2EE init failed" }}); });
    return () => { alive = false; };
  }, [alias]);

  // ── Socket.IO ─────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API_URL || window.location.origin, {
      transports:["websocket","polling"], reconnectionDelay:1500, reconnectionAttempts:8,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      dispatch({ type:"SET", payload:{ isConnected:true, status:"Connected" }});
      socket.emit("authenticate", { voidId, name:myName });
      socket.emit("joinAliasRoom", { alias });
      // Rejoin vaults on reconnect
      listVaults().forEach(v => socket.emit("enterRoom", { name:myName, room:`vault:${v.id}`, password:"", voidId }));
    });
    socket.on("disconnect",    () => dispatch({ type:"SET", payload:{ isConnected:false, status:"Reconnecting…" }}));
    socket.on("connect_error", () => dispatch({ type:"SET", payload:{ status:"Relay error — retrying" }}));

    socket.on("motd",          ({ text })     => dispatch({ type:"SET", payload:{ motd:text }}));
    socket.on("ownerStatus",   ({ isOwner })  => dispatch({ type:"SET", payload:{ isOwner }}));
    socket.on("adminStatus",   ({ isAdmin })  => dispatch({ type:"ADMIN_STATUS", isAdmin }));
    socket.on("adminError",    ({ message })  => { dispatch({ type:"SET", payload:{ status:`⚠ ${message}` }}); flash(`⚠ ${message}`, "error"); });
    socket.on("adminSuccess",  ({ message })  => dispatch({ type:"SET", payload:{ status:message }}));
    socket.on("kicked",        ({ reason })   => { dispatch({ type:"SET", payload:{ currentRoom:null, status:reason }}); flash(`Kicked: ${reason}`, "warn"); });
    socket.on("globalBanned",  ({ message })  => { dispatch({ type:"SET", payload:{ status:`Banned: ${message}` }}); flash(`Banned: ${message}`, "error"); });
    socket.on("muteStatus",    ({ muted })    => dispatch({ type:"SET", payload:{ status:muted?"You are muted":"Unmuted" }}));
    socket.on("maintenanceLock",({ message }) => dispatch({ type:"SET", payload:{ status:message }}));

    socket.on("joinSuccess", ({ room, isAdmin }) => {
      dispatch({ type:"JOIN_ROOM", room, isAdmin });
      dispatch({ type:"SET", payload:{ status:`Joined #${room}` }});
      flash(`Joined #${room}`, "success");
    });
    socket.on("joinError",  ({ message })  => { dispatch({ type:"SET", payload:{ status:message }}); flash(message, "error"); });
    socket.on("roomList",   ({ rooms })    => dispatch({ type:"SET", payload:{ roomList:rooms||[] }}));
    socket.on("roomLocked", ({ locked })   => dispatch({ type:"SET", payload:{ status:locked?"Room locked":"Room unlocked" }}));
    socket.on("pinnedMsg",  (msg) => {
      const room = roomRef.current;
      if (msg && room) dispatch({ type:"ROOM_MSG", room, msg:{ id:nonce(), sender:"📌 Pinned", text:msg.text||"", fromMe:false, meta:"", type:"system" }});
    });
    socket.on("message", (msg) => {
      const room = roomRef.current;
      if (!room) return;
      const m = { id:msg.id||nonce(), sender:msg.name||"System", text:msg.text||"", fromMe:msg.name===myName, meta:msg.time||"", type:msg.type||"user" };
      dispatch({ type:"ROOM_MSG", room, msg:m });
      if (!m.fromMe && document.hidden) flash(`${m.sender}: ${m.text.slice(0,40)}`, "info");
    });
    socket.on("history", ({ messages }) => {
      const room = roomRef.current;
      if (!room) return;
      dispatch({ type:"ROOM_HISTORY", room, msgs:(messages||[]).map(m=>({ id:m.id||nonce(), sender:m.name||"System", text:m.text||"", fromMe:m.name===myName, meta:m.time||"", type:m.type||"user" }))});
    });
    socket.on("userList", ({ users }) => {
      const room = roomRef.current;
      if (room) dispatch({ type:"ROOM_USERS", room, users:users||[] });
    });

    // Socket DMs
    socket.on("dm", ({ msg, withVoidId }) => {
      const f = friendsRef.current.find(f => f.voidId===withVoidId);
      const peer = f?.name || withVoidId;
      dispatch({ type:"DM_MSG", peer, msg:{ id:msg.id||nonce(), sender:msg.name||"?", text:msg.text||"", fromMe:msg.name===myName, meta:msg.time||"", type:"user" }});
      if (document.hidden) flash(`DM from ${peer}`, "dm");
    });
    socket.on("dmError", ({ message }) => dispatch({ type:"SET", payload:{ status:message }}));

    // E2EE DMs
    socket.on("encrypted-message", async (entry) => {
      if (entry.toAlias !== alias) return;
      try {
        const plaintext = await decryptIncoming(entry.fromAlias, entry.payload);
        dispatch({ type:"DM_MSG", peer:entry.fromAlias, msg:{ id:entry.id, sender:entry.fromAlias, text:plaintext, fromMe:false, meta:"🔐 E2EE" }});
        flash(`🔐 Encrypted DM from ${entry.fromAlias}`, "dm");
      } catch {
        dispatch({ type:"DM_MSG", peer:entry.fromAlias, msg:{ id:entry.id, sender:entry.fromAlias, text:"[Encrypted — cannot decrypt]", fromMe:false, meta:"Decrypt failed" }});
      }
    });

    // Friends
    socket.on("friendList", ({ friends }) =>
      dispatch({ type:"SET_FRIENDS", friends:(friends||[]).map(f=>({ voidId:f.voidId, name:f.name, online:f.online||false }))}));
    socket.on("pendingFriendRequests", (reqs) => {
      dispatch({ type:"FRIEND_REQUESTS", requests:reqs||[] });
      if ((reqs||[]).length > 0) flash(`${reqs.length} friend request${reqs.length>1?"s":""}`, "friend");
    });
    socket.on("friendOnline", ({ voidId:fvid, name }) => {
      dispatch({ type:"FRIEND_ONLINE", voidId:fvid, name });
      flash(`${name} came online`, "friend");
    });

    // Groups
    socket.on("groupList",    ({ groups })  => dispatch({ type:"SET_GROUPS", groups:(groups||[]).map(g=>({ id:g.id, name:g.name, topic:g.topic||"" }))}));
    socket.on("groupCreated", ({ group })   => { if (group) dispatch({ type:"ADD_GROUP", group:{ id:group.id, name:group.name, topic:group.topic||"" }}); });
    socket.on("groupJoined",  ({ group })   => { if (group) { dispatch({ type:"ADD_GROUP", group:{ id:group.id, name:group.name, topic:group.topic||"" }}); flash(`Joined group ${group.name}`, "success"); }});
    socket.on("groupMsg",     (msg)         => {
      if (!msg?.groupId) return;
      const m = { id:msg.id||nonce(), sender:msg.name||"System", text:msg.text||"", fromMe:msg.name===myName, meta:msg.time||"", type:msg.type||"user" };
      dispatch({ type:"GROUP_MSG", groupId:msg.groupId, msg:m });
      if (!m.fromMe && document.hidden) flash(`${m.sender}: ${m.text.slice(0,40)}`, "info");
    });
    socket.on("groupHistoryData", ({ groupId, messages }) => {
      if (!groupId) return;
      dispatch({ type:"GROUP_HISTORY", groupId, msgs:(messages||[]).map(m=>({ id:m.id||nonce(), sender:m.name||"System", text:m.text||"", fromMe:m.name===myName, meta:m.time||"", type:m.type||"user" }))});
    });
    socket.on("groupMemberList", ({ groupId, members }) => { if (groupId) dispatch({ type:"GROUP_META", groupId, meta:{ members:members||[] }}); });
    socket.on("groupLeft",  ({ groupId }) => dispatch({ type:"LEAVE_GROUP", groupId }));
    socket.on("groupError", ({ message }) => { dispatch({ type:"SET", payload:{ status:message }}); flash(message, "error"); });

    // Vault (encrypted server) messages — piggyback on room message, decrypt client-side
    socket.on("vaultMsg", async ({ vaultId, senderId, encPayload, msgId }) => {
      const passphrase = getVaultPassphrase(vaultId);
      if (!passphrase) return;
      const vault = listVaults().find(v => v.id === vaultId);
      const text = await decryptVaultMessage(passphrase, vault?.name || vaultId, encPayload);
      const m = { id:msgId||nonce(), sender:senderId, text, fromMe:senderId===alias, meta:"🔐 Vault" };
      dispatch({ type:"VAULT_MSG", vaultId, msg:m });
      if (!m.fromMe && document.hidden) flash(`🔐 Vault: ${text.slice(0,40)}`, "flash");
    });

    return () => { socket.disconnect(); };
  }, [voidId, alias, myName]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (ev, data) => socketRef.current?.emit(ev, data);

  // ── Send ──────────────────────────────────────────────────────
  async function handleSend() {
    const text = state.composeText.trim();
    if (!text) return;
    dispatch({ type:"SET", payload:{ composeText:"" }});
    const reply = replyTo ? { id:replyTo.id, sender:replyTo.sender, text:replyTo.text } : undefined;
    setReplyTo(null);

    if      (state.activeTab==="rooms"     && state.currentRoom)    emit("message",  { text, room:state.currentRoom, replyTo:reply });
    else if (state.activeTab==="groups"    && state.currentGroupId) emit("groupMsg", { groupId:state.currentGroupId, text, replyTo:reply });
    else if (state.activeTab==="connect"   && state.currentDmPeer)  await sendE2eeDm(state.currentDmPeer, text, reply);
    else if (state.activeTab==="encrypted" && state.currentVaultId) await sendVaultMsg(state.currentVaultId, text, reply);
  }

  async function sendE2eeDm(peer, text, replyTo) {
    if (!state.registered) { dispatch({ type:"SET", payload:{ status:"E2EE not ready" }}); return; }
    const lid = nonce();
    dispatch({ type:"DM_MSG", peer, msg:{ id:lid, sender:myName, text, fromMe:true, meta:"Sending…", replyTo }});
    try {
      const { header, envelope } = await createEncryptedOutgoing(API_URL, alias, peer, text);
      const res = await fetch(`${API_URL}/api/encrypted/direct`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ fromAlias:alias, toAlias:peer, payload:{ header, envelope }}),
      });
      if (!res.ok) throw new Error(`relay ${res.status}`);
      dispatch({ type:"UPDATE_DM_META", peer, id:lid, meta:"🔐 Delivered" });
    } catch (err) {
      dispatch({ type:"UPDATE_DM_META", peer, id:lid, meta:"Send failed" });
      flash(`DM failed: ${err.message}`, "error");
    }
  }

  async function sendVaultMsg(vaultId, text, replyTo) {
    const vault = state.vaults.find(v => v.id===vaultId);
    const passphrase = getVaultPassphrase(vaultId);
    if (!vault || !passphrase) return;
    const lid = nonce();
    dispatch({ type:"VAULT_MSG", vaultId, msg:{ id:lid, sender:myName, text, fromMe:true, meta:"🔐 Encrypted", replyTo }});
    try {
      const encPayload = await encryptVaultMessage(passphrase, vault.name, text);
      emit("vaultMsg", { vaultId, senderId:alias, encPayload, msgId:lid });
    } catch (err) {
      flash(`Vault send failed: ${err.message}`, "error");
    }
  }

  // ── Actions ───────────────────────────────────────────────────
  function joinRoom(name, pw="")   { if (name.trim()) emit("enterRoom",  { name:myName, room:name.trim().replace(/^#/,""), password:pw, voidId }); }
  function createRoom(name, pw="") { if (name.trim()) emit("createRoom", { name:name.trim(), password:pw, voidId }); }
  function adminCmd(cmd,tgt,dat)   { emit("adminCmd", { cmd, target:tgt||"", data:dat||"" }); }
  function ownerCmd(cmd, data={})  { emit("ownerCmd", { cmd, voidId, ...data }); }
  function claimOwner(key)         { emit("claimOwner", { key, voidId }); }
  function createGroup(name)       { if (name.trim()) emit("createGroup", { name:name.trim(), voidId }); }
  function joinGroupById(id)       { emit("joinGroup", { groupId:id, voidId }); emit("groupHistory", { groupId:id }); }
  function selectGroup(id)         { dispatch({ type:"SET", payload:{ currentGroupId:id, activeTab:"groups" }}); emit("groupHistory", { groupId:id }); }
  function sendFriendRequest(targetName) {
    const users = state.roomUsers[state.currentRoom] || [];
    const target = users.find(u => u.name?.toLowerCase()===targetName.toLowerCase());
    if (target) emit("friendRequest", { toVoidId:target.id });
    else flash(`"${targetName}" not found in current channel`, "warn");
  }
  function openFriendDm(name) { dispatch({ type:"SET", payload:{ currentDmPeer:name, activeTab:"connect" }}); }
  function startDm(peer)      { if (peer.trim()) dispatch({ type:"SET", payload:{ currentDmPeer:peer.trim(), activeTab:"connect" }}); }

  function createVault(name, passphrase) {
    const id = crypto.randomUUID().slice(0,8);
    registerVault(id, name, passphrase);
    dispatch({ type:"SET_VAULTS", vaults:listVaults() });
    dispatch({ type:"SET", payload:{ currentVaultId:id, activeTab:"encrypted" }});
    emit("enterRoom", { name:myName, room:`vault:${id}`, password:"", voidId });
    flash(`Vault "${name}" created 🔐`, "flash");
  }
  function joinVault(name, passphrase) {
    // Derive a deterministic vault ID from name+passphrase hash (simplified: use name as ID)
    const id = btoa(name).replace(/[^a-zA-Z0-9]/g,"").slice(0,8);
    registerVault(id, name, passphrase);
    dispatch({ type:"SET_VAULTS", vaults:listVaults() });
    dispatch({ type:"SET", payload:{ currentVaultId:id, activeTab:"encrypted" }});
    emit("enterRoom", { name:myName, room:`vault:${id}`, password:"", voidId });
    flash(`Joined vault "${name}" 🔐`, "flash");
  }
  function selectVault(id) { dispatch({ type:"SET", payload:{ currentVaultId:id, activeTab:"encrypted" }}); }

  function handleReact(msgId, emoji) {
    dispatch({ type:"REACT_MSG", tab:state.activeTab, room:state.currentRoom, peer:state.currentDmPeer, groupId:state.currentGroupId, vaultId:state.currentVaultId, msgId, emoji, byMe:true });
  }

  function saveProfile({ displayName:dn, avatarColor, avatarEmoji, sounds, timestamps, compact, fontSize, theme, enterToSend }) {
    const trimmed = dn.trim();
    setDisplayName(trimmed);
    localStorage.setItem("void.displayName", trimmed);
    const next = { ...settings, avatarColor, avatarEmoji, sounds, timestamps, compact, fontSize, theme, enterToSend };
    setSettings(next);
    localStorage.setItem("void.settings", JSON.stringify(next));
    socketRef.current?.emit("authenticate", { voidId, name:trimmed||alias });
    flash("Profile saved", "success");
  }

  // ── Derived ───────────────────────────────────────────────────
  const messages = (() => {
    if (state.activeTab==="rooms"     && state.currentRoom)    return state.roomMessages[state.currentRoom]    || [];
    if (state.activeTab==="connect"   && state.currentDmPeer)  return state.dmMessages[state.currentDmPeer]   || [];
    if (state.activeTab==="groups"    && state.currentGroupId) return state.groupMessages[state.currentGroupId]|| [];
    if (state.activeTab==="encrypted" && state.currentVaultId) return state.vaultMessages[state.currentVaultId]|| [];
    return [];
  })();

  const isAdmin   = state.currentRoom ? (state.roomIsAdmin[state.currentRoom]||false) : false;
  const roomUsers = state.roomUsers[state.currentRoom] || [];
  const dmPeers   = Object.keys(state.dmMessages);
  const canSend   =
    (state.activeTab==="rooms"     && !!state.currentRoom    && state.isConnected) ||
    (state.activeTab==="connect"   && !!state.currentDmPeer  && state.registered)  ||
    (state.activeTab==="groups"    && !!state.currentGroupId && state.isConnected) ||
    (state.activeTab==="encrypted" && !!state.currentVaultId && state.isConnected);

  const headerTitle = (() => {
    if (state.activeTab==="rooms")     return state.currentRoom ? `#${state.currentRoom}` : "Channels";
    if (state.activeTab==="connect")   return state.currentDmPeer || "Connect";
    if (state.activeTab==="groups")    { const g=state.groups.find(g=>g.id===state.currentGroupId); return g?.name||"Groups"; }
    if (state.activeTab==="encrypted") { const v=state.vaults.find(v=>v.id===state.currentVaultId); return v?.name ? `🔐 ${v.name}` : "Encrypted"; }
    return "VØID";
  })();
  const headerMeta = (() => {
    if (state.activeTab==="rooms")     return roomUsers.length ? `${roomUsers.length} online` : "Public channel";
    if (state.activeTab==="connect")   return state.currentDmPeer ? (state.registered ? "End-to-end encrypted · X3DH" : "E2EE initializing…") : `${state.friends.length} friends`;
    if (state.activeTab==="groups")    return "Group channel";
    if (state.activeTab==="encrypted") return "AES-256-GCM · passphrase E2EE";
    return "";
  })();

  const composerPlaceholder =
    state.activeTab==="connect"   ? "Compose encrypted message…" :
    state.activeTab==="rooms"     ? (state.currentRoom ? `Message #${state.currentRoom}` : "Join a channel first") :
    state.activeTab==="groups"    ? "Compose group message…" :
    state.activeTab==="encrypted" ? "Compose encrypted vault message…" : "Compose…";

  // Show empty state panel for connect/encrypted when nothing is selected
  const showEmptyState = (state.activeTab==="connect" && !state.currentDmPeer) ||
                         (state.activeTab==="encrypted" && !state.currentVaultId);

  return (
    <div className={`lux-shell ${settings.compact?"compact":""} font-${settings.fontSize||"medium"}`}>
      <VoidFlash />
      {profileOpen && (
        <LuxProfileSettings
          alias={alias} voidId={voidId} displayName={displayName}
          settings={settings} onSave={saveProfile} onClose={() => setProfileOpen(false)}
        />
      )}
      <div className="lux-app">
        <LuxSidebar
          me={myName} alias={alias}
          activeTab={state.activeTab}
          onTabChange={(tab) => dispatch({ type:"SET", payload:{ activeTab:tab }})}
          isOwner={state.isOwner} isAdmin={isAdmin}
          motd={state.motd} status={state.status}
          avatarColor={settings.avatarColor} avatarEmoji={settings.avatarEmoji}
          onOpenProfile={() => setProfileOpen(true)}
          roomList={state.roomList} currentRoom={state.currentRoom} roomUsers={roomUsers}
          onJoinRoom={joinRoom} onCreateRoom={createRoom}
          onSelectRoom={(name) => dispatch({ type:"SET", payload:{ currentRoom:name, activeTab:"rooms" }})}
          dmPeers={dmPeers} currentDmPeer={state.currentDmPeer}
          onStartDm={startDm}
          onSelectDmPeer={(p) => dispatch({ type:"SET", payload:{ currentDmPeer:p, activeTab:"connect" }})}
          groups={state.groups} currentGroupId={state.currentGroupId}
          onSelectGroup={selectGroup} onCreateGroup={createGroup} onJoinGroup={joinGroupById}
          friends={state.friends} friendRequests={state.friendRequests}
          onAcceptFriend={(fvid) => emit("acceptFriend", { fromVoidId:fvid })}
          onDeclineFriend={(fvid) => emit("declineFriend", { fromVoidId:fvid })}
          onOpenFriendDm={openFriendDm} onSendFriendRequest={sendFriendRequest}
          vaults={state.vaults} currentVaultId={state.currentVaultId}
          onJoinVault={joinVault} onCreateVault={createVault} onSelectVault={selectVault}
          onClaimOwner={claimOwner} onAdminCmd={adminCmd} onOwnerCmd={ownerCmd}
          onBroadcast={(text) => ownerCmd("announce", { message:text })}
          onClearMessages={() => adminCmd("clear")}
        />

        <main className="lux-main">
          <LuxHeader
            title={headerTitle} meta={headerMeta} tab={state.activeTab}
            roomUsers={roomUsers} isAdmin={isAdmin} isOwner={state.isOwner}
            currentRoom={state.currentRoom} onAdminCmd={adminCmd}
          />

          {showEmptyState ? (
            <div className="connect-empty">
              <div className="empty-state">
                <div className="empty-panel">
                  <div className="empty-icon">{state.activeTab==="encrypted"?"🔐":"✦"}</div>
                  <div className="empty-title">
                    {state.activeTab==="encrypted" ? "Encrypted Vaults" : "Connect"}
                  </div>
                  <div style={{ color:"var(--muted)", fontSize:"0.9rem" }}>
                    {state.activeTab==="encrypted"
                      ? "Create or join a vault with a shared passphrase. All messages are AES-256-GCM encrypted before leaving your device."
                      : "Select a conversation from the sidebar, or start an encrypted DM with any alias."}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <LuxMessages
                messages={messages}
                onReact={handleReact}
                onReply={(msg) => setReplyTo(msg)}
                showTimestamps={settings.timestamps}
                avatarColor={settings.avatarColor}
              />
              <LuxComposer
                value={state.composeText}
                onChange={(v) => dispatch({ type:"SET", payload:{ composeText:v }})}
                onSend={handleSend}
                disabled={!canSend}
                status={state.status}
                placeholder={composerPlaceholder}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
