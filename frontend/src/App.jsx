import { useEffect, useReducer, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./styles/luxury.css";
import LuxSidebar from "./components/LuxSidebar.jsx";
import LuxHeader from "./components/LuxHeader.jsx";
import LuxMessages from "./components/LuxMessages.jsx";
import LuxComposer from "./components/LuxComposer.jsx";
import {
  registerBundle,
  createEncryptedOutgoing,
  decryptIncoming,
  ensureIdentity,
} from "./crypto/protocol.js";

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
function nonce() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ── App state reducer ─────────────────────────────────────────
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
  composeText: "",
};

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
      return { ...s, currentRoom: a.room, activeTab: "rooms",
        roomIsAdmin: { ...s.roomIsAdmin, [a.room]: a.isAdmin || false },
        roomList: exists ? s.roomList : [...s.roomList, { name: a.room, isNsfw: false }],
      };
    }
    case "ADMIN_STATUS": return { ...s, roomIsAdmin: { ...s.roomIsAdmin, [s.currentRoom]: a.isAdmin }};
    case "DM_MSG": {
      const prev = s.dmMessages[a.peer] || [];
      return { ...s, dmMessages: { ...s.dmMessages, [a.peer]: [...prev, a.msg].slice(-300) }};
    }
    case "UPDATE_DM_META": {
      const msgs = (s.dmMessages[a.peer] || []).map(m => m.id === a.id ? { ...m, meta: a.meta } : m);
      return { ...s, dmMessages: { ...s.dmMessages, [a.peer]: msgs }};
    }
    case "GROUP_MSG": {
      const prev = s.groupMessages[a.groupId] || [];
      return { ...s, groupMessages: { ...s.groupMessages, [a.groupId]: [...prev, a.msg].slice(-300) }};
    }
    case "GROUP_HISTORY": return { ...s, groupMessages: { ...s.groupMessages, [a.groupId]: a.msgs }};
    case "GROUP_META":    return { ...s, groupMeta: { ...s.groupMeta, [a.groupId]: { ...s.groupMeta[a.groupId], ...a.meta }}};
    case "ADD_GROUP": {
      const exists = s.groups.find(g => g.id === a.group.id);
      return { ...s,
        groups: exists ? s.groups.map(g => g.id === a.group.id ? {...g,...a.group} : g) : [...s.groups, a.group],
        currentGroupId: a.group.id, activeTab: "groups",
      };
    }
    case "SET_GROUPS":    return { ...s, groups: a.groups };
    case "SET_FRIENDS":   return { ...s, friends: a.friends };
    case "FRIEND_REQUESTS": return { ...s, friendRequests: a.requests };
    case "FRIEND_ONLINE": return { ...s, friends: s.friends.map(f => f.voidId===a.voidId ? {...f,online:true,name:a.name||f.name} : f) };
    case "LEAVE_GROUP": return { ...s,
      groups: s.groups.filter(g => g.id !== a.groupId),
      currentGroupId: s.currentGroupId === a.groupId ? null : s.currentGroupId,
    };
    default: return s;
  }
}

// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [state, dispatch] = useReducer(reducer, {
    ...INIT,
    alias:  persist("void.alias",  genAlias),
    voidId: persist("void.voidId", () => crypto.randomUUID()),
  });
  const socketRef  = useRef(null);
  const roomRef    = useRef(null);  // stale-closure guard
  const friendsRef = useRef([]);
  const { alias, voidId } = state;

  useEffect(() => { roomRef.current    = state.currentRoom; });
  useEffect(() => { friendsRef.current = state.friends; });

  // ── E2EE init ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    ensureIdentity()
      .then(() => registerBundle(API_URL, alias))
      .then(() => { if (alive) dispatch({ type:"SET", payload:{ registered:true, status:"E2EE ready" }}); })
      .catch(() => { if (alive) dispatch({ type:"SET", payload:{ status:"E2EE init failed" }}); });
    return () => { alive = false; };
  }, [alias]);

  // ── Socket.IO ────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API_URL || window.location.origin, {
      transports: ["websocket","polling"],
      reconnectionDelay: 1500, reconnectionAttempts: 8,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      dispatch({ type:"SET", payload:{ isConnected:true, status:"Connected" }});
      socket.emit("authenticate", { voidId, name: alias });
      socket.emit("joinAliasRoom", { alias });
    });
    socket.on("disconnect",    () => dispatch({ type:"SET", payload:{ isConnected:false, status:"Reconnecting…" }}));
    socket.on("connect_error", () => dispatch({ type:"SET", payload:{ status:"Relay error — retrying" }}));

    // Server info
    socket.on("motd",          ({ text })      => dispatch({ type:"SET", payload:{ motd:text }}));
    socket.on("ownerStatus",   ({ isOwner })   => dispatch({ type:"SET", payload:{ isOwner }}));
    socket.on("adminStatus",   ({ isAdmin })   => dispatch({ type:"ADMIN_STATUS", isAdmin }));
    socket.on("adminError",    ({ message })   => dispatch({ type:"SET", payload:{ status:`⚠ ${message}` }}));
    socket.on("adminSuccess",  ({ message })   => dispatch({ type:"SET", payload:{ status:message }}));
    socket.on("kicked",        ({ reason })    => dispatch({ type:"SET", payload:{ currentRoom:null, status:reason }}));
    socket.on("globalBanned",  ({ message })   => dispatch({ type:"SET", payload:{ status:`Banned: ${message}` }}));
    socket.on("muteStatus",    ({ muted })     => dispatch({ type:"SET", payload:{ status: muted?"You are muted":"Unmuted" }}));
    socket.on("maintenanceLock",({ message })  => dispatch({ type:"SET", payload:{ status:message }}));

    // Rooms
    socket.on("joinSuccess",  ({ room, isAdmin }) => {
      dispatch({ type:"JOIN_ROOM", room, isAdmin });
      dispatch({ type:"SET", payload:{ status:`Joined #${room}` }});
    });
    socket.on("joinError",  ({ message })   => dispatch({ type:"SET", payload:{ status:message }}));
    socket.on("roomList",   ({ rooms })     => dispatch({ type:"SET", payload:{ roomList: rooms||[] }}));
    socket.on("roomLocked", ({ locked })    => dispatch({ type:"SET", payload:{ status: locked?"Room locked":"Room unlocked" }}));
    socket.on("pinnedMsg", (msg) => {
      const room = roomRef.current;
      if (msg && room) dispatch({ type:"ROOM_MSG", room, msg:{ id:nonce(), sender:"📌 Pinned", text:msg.text||"", fromMe:false, meta:"", type:"system" }});
    });
    socket.on("message", (msg) => {
      const room = roomRef.current;
      if (!room) return;
      dispatch({ type:"ROOM_MSG", room, msg:{
        id: msg.id||nonce(), sender: msg.name||"System", text: msg.text||"",
        fromMe: msg.name===alias, meta: msg.time||"", type: msg.type||"user",
      }});
    });
    socket.on("history", ({ messages }) => {
      const room = roomRef.current;
      if (!room) return;
      dispatch({ type:"ROOM_HISTORY", room, msgs:(messages||[]).map(m=>({
        id:m.id||nonce(), sender:m.name||"System", text:m.text||"",
        fromMe:m.name===alias, meta:m.time||"", type:m.type||"user",
      }))});
    });
    socket.on("userList", ({ users }) => {
      const room = roomRef.current;
      if (room) dispatch({ type:"ROOM_USERS", room, users:users||[] });
    });

    // Socket.IO DMs (friend-required)
    socket.on("dm", ({ msg, withVoidId }) => {
      const f = friendsRef.current.find(f => f.voidId===withVoidId);
      const peer = f?.name || withVoidId;
      dispatch({ type:"DM_MSG", peer, msg:{
        id:msg.id||nonce(), sender:msg.name||"?", text:msg.text||"",
        fromMe:msg.name===alias, meta:msg.time||"", type:"user",
      }});
    });
    socket.on("dmError",      ({ message }) => dispatch({ type:"SET", payload:{ status:message }}));

    // E2EE encrypted messages
    socket.on("encrypted-message", async (entry) => {
      if (entry.toAlias !== alias) return;
      try {
        const plaintext = await decryptIncoming(entry.fromAlias, entry.payload);
        dispatch({ type:"DM_MSG", peer:entry.fromAlias, msg:{
          id:entry.id, sender:entry.fromAlias, text:plaintext, fromMe:false, meta:"🔐 E2EE",
        }});
      } catch {
        dispatch({ type:"DM_MSG", peer:entry.fromAlias, msg:{
          id:entry.id, sender:entry.fromAlias, text:"[Encrypted — cannot decrypt]", fromMe:false, meta:"Decrypt failed",
        }});
      }
    });

    // Friends
    socket.on("friendList", ({ friends }) =>
      dispatch({ type:"SET_FRIENDS", friends:(friends||[]).map(f=>({ voidId:f.voidId, name:f.name, online:f.online||false }))}));
    socket.on("pendingFriendRequests", (reqs) =>
      dispatch({ type:"FRIEND_REQUESTS", requests:reqs||[] }));
    socket.on("friendOnline",  ({ voidId:fvid, name }) => dispatch({ type:"FRIEND_ONLINE", voidId:fvid, name }));

    // Groups
    socket.on("groupList", ({ groups }) =>
      dispatch({ type:"SET_GROUPS", groups:(groups||[]).map(g=>({ id:g.id, name:g.name, topic:g.topic||"" }))}));
    socket.on("groupCreated", ({ group }) => { if (group) dispatch({ type:"ADD_GROUP", group:{ id:group.id, name:group.name, topic:group.topic||"" }}); });
    socket.on("groupJoined",  ({ group }) => { if (group) dispatch({ type:"ADD_GROUP", group:{ id:group.id, name:group.name, topic:group.topic||"" }}); });
    socket.on("groupMsg", (msg) => {
      if (!msg?.groupId) return;
      dispatch({ type:"GROUP_MSG", groupId:msg.groupId, msg:{
        id:msg.id||nonce(), sender:msg.name||"System", text:msg.text||"",
        fromMe:msg.name===alias, meta:msg.time||"", type:msg.type||"user",
      }});
    });
    socket.on("groupHistoryData", ({ groupId, messages }) => {
      if (!groupId) return;
      dispatch({ type:"GROUP_HISTORY", groupId, msgs:(messages||[]).map(m=>({
        id:m.id||nonce(), sender:m.name||"System", text:m.text||"",
        fromMe:m.name===alias, meta:m.time||"", type:m.type||"user",
      }))});
    });
    socket.on("groupMemberList", ({ groupId, members }) => {
      if (groupId) dispatch({ type:"GROUP_META", groupId, meta:{ members:members||[] }});
    });
    socket.on("groupLeft",  ({ groupId }) => dispatch({ type:"LEAVE_GROUP", groupId }));
    socket.on("groupError", ({ message }) => dispatch({ type:"SET", payload:{ status:message }}));

    return () => { socket.disconnect(); };
  }, [voidId, alias]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Emit ─────────────────────────────────────────────────────
  const emit = (ev, data) => socketRef.current?.emit(ev, data);

  // ── Send ─────────────────────────────────────────────────────
  async function handleSend() {
    const text = state.composeText.trim();
    if (!text) return;
    dispatch({ type:"SET", payload:{ composeText:"" }});
    if      (state.activeTab==="rooms"  && state.currentRoom)    emit("message",  { text, room:state.currentRoom });
    else if (state.activeTab==="groups" && state.currentGroupId) emit("groupMsg", { groupId:state.currentGroupId, text });
    else if (state.activeTab==="dms"    && state.currentDmPeer)  await sendE2eeDm(state.currentDmPeer, text);
  }

  async function sendE2eeDm(peer, text) {
    if (!state.registered) { dispatch({ type:"SET", payload:{ status:"E2EE not ready" }}); return; }
    const lid = nonce();
    dispatch({ type:"DM_MSG", peer, msg:{ id:lid, sender:alias, text, fromMe:true, meta:"Sending…" }});
    try {
      const { header, envelope } = await createEncryptedOutgoing(API_URL, alias, peer, text);
      const res = await fetch(`${API_URL}/api/encrypted/direct`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ fromAlias:alias, toAlias:peer, payload:{ header, envelope }}),
      });
      if (!res.ok) throw new Error(`relay ${res.status}`);
      dispatch({ type:"UPDATE_DM_META", peer, id:lid, meta:"🔐 Delivered" });
      dispatch({ type:"SET", payload:{ status:`Sent to ${peer}` }});
    } catch (err) {
      dispatch({ type:"UPDATE_DM_META", peer, id:lid, meta:"Send failed" });
      dispatch({ type:"SET", payload:{ status:`Failed: ${err.message}` }});
    }
  }

  // ── Actions ───────────────────────────────────────────────────
  function joinRoom(name, pw="")   { if (name.trim()) emit("enterRoom",  { name:alias, room:name.trim().replace(/^#/,""), password:pw, voidId }); }
  function createRoom(name, pw="") { if (name.trim()) emit("createRoom", { name:name.trim(), password:pw, voidId }); }
  function adminCmd(cmd,tgt,dat)   { emit("adminCmd", { cmd, target:tgt||"", data:dat||"" }); }
  function ownerCmd(cmd, data={})  { emit("ownerCmd", { cmd, voidId, ...data }); }
  function claimOwner(key)         { emit("claimOwner", { key, voidId }); }
  function createGroup(name)       { if (name.trim()) emit("createGroup", { name:name.trim(), voidId }); }
  function joinGroupById(id)       { emit("joinGroup", { groupId:id, voidId }); emit("groupHistory", { groupId:id }); }
  function selectGroup(id) {
    dispatch({ type:"SET", payload:{ currentGroupId:id, activeTab:"groups" }});
    emit("groupHistory", { groupId:id });
  }
  function sendFriendRequest(targetName) {
    const users = state.roomUsers[state.currentRoom] || [];
    const target = users.find(u => u.name?.toLowerCase()===targetName.toLowerCase());
    if (target) emit("friendRequest", { toVoidId:target.id });
    else dispatch({ type:"SET", payload:{ status:`"${targetName}" not in room` }});
  }
  function openFriendDm(name) { dispatch({ type:"SET", payload:{ currentDmPeer:name, activeTab:"dms" }}); }
  function startDm(peer)      { if (peer.trim()) dispatch({ type:"SET", payload:{ currentDmPeer:peer.trim(), activeTab:"dms" }}); }

  // ── Derived ───────────────────────────────────────────────────
  const messages = (() => {
    if (state.activeTab==="rooms"  && state.currentRoom)    return state.roomMessages[state.currentRoom] || [];
    if (state.activeTab==="dms"    && state.currentDmPeer)  return state.dmMessages[state.currentDmPeer] || [];
    if (state.activeTab==="groups" && state.currentGroupId) return state.groupMessages[state.currentGroupId] || [];
    return [];
  })();

  const isAdmin    = state.currentRoom ? (state.roomIsAdmin[state.currentRoom]||false) : false;
  const roomUsers  = state.roomUsers[state.currentRoom] || [];
  const dmPeers    = Object.keys(state.dmMessages);
  const canSend    =
    (state.activeTab==="rooms"  && !!state.currentRoom    && state.isConnected) ||
    (state.activeTab==="dms"    && !!state.currentDmPeer  && state.registered)  ||
    (state.activeTab==="groups" && !!state.currentGroupId && state.isConnected);

  const headerTitle = (() => {
    if (state.activeTab==="rooms")   return state.currentRoom ? `#${state.currentRoom}` : "Channels";
    if (state.activeTab==="dms")     return state.currentDmPeer || "Direct Messages";
    if (state.activeTab==="groups") { const g=state.groups.find(g=>g.id===state.currentGroupId); return g?.name||"Groups"; }
    if (state.activeTab==="friends") return "Friends";
    return "VØID";
  })();
  const headerMeta = (() => {
    if (state.activeTab==="rooms")   return roomUsers.length ? `${roomUsers.length} online` : "Public channel";
    if (state.activeTab==="dms")     return state.registered ? "End-to-end encrypted · X3DH" : "E2EE initializing…";
    if (state.activeTab==="groups")  return "Group channel";
    if (state.activeTab==="friends") return `${state.friends.length} friends · ${state.friendRequests.length} pending`;
    return "";
  })();

  const composerPlaceholder =
    state.activeTab==="dms"    ? "Compose encrypted message…" :
    state.activeTab==="rooms"  ? (state.currentRoom ? `Message #${state.currentRoom}` : "Join a channel first") :
    state.activeTab==="groups" ? "Compose group message…" : "Compose…";

  return (
    <div className="lux-shell">
      <div className="lux-app">
        <LuxSidebar
          me={alias}
          activeTab={state.activeTab}
          onTabChange={(tab) => dispatch({ type:"SET", payload:{ activeTab:tab }})}
          isOwner={state.isOwner}
          isAdmin={isAdmin}
          motd={state.motd}
          status={state.status}
          roomList={state.roomList}
          currentRoom={state.currentRoom}
          roomUsers={roomUsers}
          onJoinRoom={joinRoom}
          onCreateRoom={createRoom}
          onSelectRoom={(name) => dispatch({ type:"SET", payload:{ currentRoom:name, activeTab:"rooms" }})}
          dmPeers={dmPeers}
          currentDmPeer={state.currentDmPeer}
          onStartDm={startDm}
          onSelectDmPeer={(p) => dispatch({ type:"SET", payload:{ currentDmPeer:p, activeTab:"dms" }})}
          groups={state.groups}
          currentGroupId={state.currentGroupId}
          onSelectGroup={selectGroup}
          onCreateGroup={createGroup}
          onJoinGroup={joinGroupById}
          friends={state.friends}
          friendRequests={state.friendRequests}
          onAcceptFriend={(fvid) => emit("acceptFriend", { fromVoidId:fvid })}
          onDeclineFriend={(fvid) => emit("declineFriend", { fromVoidId:fvid })}
          onOpenFriendDm={openFriendDm}
          onSendFriendRequest={sendFriendRequest}
          onClaimOwner={claimOwner}
          onAdminCmd={adminCmd}
          onOwnerCmd={ownerCmd}
          onBroadcast={(text) => ownerCmd("announce", { message:text })}
          onClearMessages={() => adminCmd("clear")}
        />

        <main className="lux-main">
          <LuxHeader
            title={headerTitle}
            meta={headerMeta}
            tab={state.activeTab}
            roomUsers={roomUsers}
            isAdmin={isAdmin}
            isOwner={state.isOwner}
            currentRoom={state.currentRoom}
            onAdminCmd={adminCmd}
          />

          {state.activeTab==="friends" ? (
            <FriendsPanel
              friends={state.friends}
              requests={state.friendRequests}
              onAccept={(fvid) => emit("acceptFriend", { fromVoidId:fvid })}
              onDecline={(fvid) => emit("declineFriend", { fromVoidId:fvid })}
              onDm={openFriendDm}
              onAddFriend={sendFriendRequest}
            />
          ) : (
            <>
              <LuxMessages messages={messages} />
              <LuxComposer
                value={state.composeText}
                onChange={(v) => dispatch({ type:"SET", payload:{ composeText:v }})}
                onSend={handleSend}
                disabled={!canSend}
                status={state.status}
                placeholder={composerPlaceholder}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Friends Panel (main area) ─────────────────────────────────
function FriendsPanel({ friends, requests, onAccept, onDecline, onDm, onAddFriend }) {
  const [addInput, setAddInput] = useState("");
  const submit = () => { if (addInput.trim()) { onAddFriend(addInput.trim()); setAddInput(""); } };
  return (
    <div className="friends-panel">
      {requests.length > 0 && (
        <div className="friends-section">
          <div className="label">Pending requests ({requests.length})</div>
          {requests.map((r) => (
            <div key={r.fromVoidId} className="friend-request-item">
              <div className="avatar sm">{(r.fromName||"?").slice(0,2).toUpperCase()}</div>
              <div className="friend-info">
                <div className="contact-name">{r.fromName}</div>
                <div className="contact-meta">Wants to connect</div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button className="small-chip accent-chip" onClick={() => onAccept(r.fromVoidId)}>Accept</button>
                <button className="small-chip" onClick={() => onDecline(r.fromVoidId)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="friends-section">
        <div className="label">Friends ({friends.length})</div>
        {friends.length === 0
          ? <div className="empty-hint">No friends yet — join a channel and add someone.</div>
          : friends.map((f) => (
            <div key={f.voidId} className="friend-item">
              <div className={`avatar sm ${f.online?"online":""}`}>{(f.name||"?").slice(1,3).toUpperCase()}</div>
              <div className="friend-info">
                <div className="contact-name">{f.name}</div>
                <div className={`contact-meta ${f.online?"online-text":""}`}>{f.online?"● Online":"○ Offline"}</div>
              </div>
              <button className="small-chip" onClick={() => onDm(f.name)}>DM</button>
            </div>
          ))
        }
      </div>
      <div className="friends-section">
        <div className="label">Add friend (must be in current channel)</div>
        <div className="room-join-row">
          <input className="lux-input" placeholder="@their-alias…" value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            onKeyDown={(e) => e.key==="Enter" && submit()} />
          <button className="primary-btn" onClick={submit}>Add</button>
        </div>
      </div>
    </div>
  );
}
