import { useState } from "react";
import LuxAdminPanel from "./LuxAdminPanel.jsx";

// ── Nav tab definitions ───────────────────────────────────────
const TABS = [
  { id:"rooms",   label:"Channels", icon:"#" },
  { id:"dms",     label:"DMs",      icon:"✉" },
  { id:"groups",  label:"Groups",   icon:"⬡" },
  { id:"friends", label:"Friends",  icon:"✦" },
];

export default function LuxSidebar({
  me, alias, activeTab, onTabChange, isOwner, isAdmin, motd, status,
  avatarColor,
  onOpenProfile,
  // Rooms
  roomList, currentRoom, roomUsers, onJoinRoom, onCreateRoom, onSelectRoom,
  // DMs
  dmPeers, currentDmPeer, onStartDm, onSelectDmPeer,
  // Groups
  groups, currentGroupId, onSelectGroup, onCreateGroup, onJoinGroup,
  // Friends
  friends, friendRequests, onAcceptFriend, onDeclineFriend, onOpenFriendDm, onSendFriendRequest,
  // Admin
  onClaimOwner, onAdminCmd, onOwnerCmd, onBroadcast, onClearMessages,
}) {
  const pendingCount = friendRequests?.length || 0;
  const initials = (me || alias || "VØ").slice(0, 2).toUpperCase();
  const isConnected = status === "Connected" || status?.startsWith("Joined") || status?.startsWith("E2EE");

  return (
    <aside className="lux-sidebar">
      {/* Brand */}
      <div className="brand-row">
        <div className="brand-mark">VØ</div>
        <div>
          <div className="brand-title">VØID</div>
          <div className="brand-subtitle">Private. Encrypted. Luxurious.</div>
        </div>
      </div>

      {/* Identity card — click to open profile/settings */}
      <button className="identity-card-btn" onClick={onOpenProfile} title="Profile & Settings">
        <div className="identity-avatar" style={{ background: avatarColor || "var(--accent)" }}>
          {initials}
        </div>
        <div className="identity-info">
          <div className="identity-alias">{me || alias}</div>
          {me && me !== alias && (
            <div className="identity-sub-alias">{alias}</div>
          )}
          <div className="identity-meta">
            <span className={`status-dot-sm ${isConnected?"active":""}`} />
            {status}
          </div>
        </div>
        <div className="identity-settings-icon">⚙</div>
      </button>

      {/* Nav tabs */}
      <nav className="nav-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-tab ${activeTab===t.id ? "active" : ""}`}
            onClick={() => onTabChange(t.id)}
          >
            <span className="nav-tab-icon">{t.icon}</span>
            <span>{t.label}</span>
            {t.id==="friends" && pendingCount > 0 && (
              <span className="tab-badge">{pendingCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* MOTD banner */}
      {motd && (
        <div className="motd-bar">
          <span className="motd-icon">📢</span>
          <span>{motd}</span>
        </div>
      )}

      {/* Tab content */}
      <div className="sidebar-content">
        {activeTab==="rooms"   && <RoomsTab   roomList={roomList} currentRoom={currentRoom} roomUsers={roomUsers} onJoinRoom={onJoinRoom} onCreateRoom={onCreateRoom} onSelectRoom={onSelectRoom} />}
        {activeTab==="dms"     && <DmsTab     dmPeers={dmPeers} currentDmPeer={currentDmPeer} onStartDm={onStartDm} onSelectDmPeer={onSelectDmPeer} me={me} />}
        {activeTab==="groups"  && <GroupsTab  groups={groups} currentGroupId={currentGroupId} onSelectGroup={onSelectGroup} onCreateGroup={onCreateGroup} onJoinGroup={onJoinGroup} />}
        {activeTab==="friends" && <FriendsTab friends={friends} friendRequests={friendRequests} onAccept={onAcceptFriend} onDecline={onDeclineFriend} onDm={onOpenFriendDm} onAdd={onSendFriendRequest} />}
      </div>

      {/* Admin / Owner panel */}
      <LuxAdminPanel
        isOwner={isOwner}
        isAdmin={isAdmin}
        onClaimOwner={onClaimOwner}
        onAdminCmd={onAdminCmd}
        onOwnerCmd={onOwnerCmd}
        onBroadcast={onBroadcast}
        onClearMessages={onClearMessages}
        roomUsers={roomUsers}
      />
    </aside>
  );
}

// ── Rooms tab ─────────────────────────────────────────────────
function RoomsTab({ roomList, currentRoom, roomUsers, onJoinRoom, onCreateRoom, onSelectRoom }) {
  const [input, setInput] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const join = () => {
    if (!input.trim()) return;
    onJoinRoom(input.trim(), pw);
    setInput(""); setPw(""); setShowPw(false);
  };

  return (
    <div className="tab-panel">
      <div className="label">Join or create channel</div>
      <div className="room-join-row">
        <input className="lux-input" placeholder="#channel-name" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key==="Enter" && join()} />
        <button className="primary-btn" onClick={join}>Join</button>
      </div>
      {showPw ? (
        <input className="lux-input" style={{ marginTop:8 }} type="password" placeholder="Password (optional)"
          value={pw} onChange={(e) => setPw(e.target.value)} />
      ) : (
        <button className="link-btn" onClick={() => setShowPw(true)}>+ password</button>
      )}

      {roomList.length > 0 && (
        <>
          <div className="label" style={{ marginTop:14 }}>Your channels</div>
          <div className="item-list">
            {roomList.map((r) => (
              <button key={r.name}
                className={`channel-item ${currentRoom===r.name ? "active":""}`}
                onClick={() => onSelectRoom(r.name)}
              >
                <span className="channel-hash">#</span>
                <span className="channel-name">{r.name}</span>
                {r.isNsfw && <span className="nsfw-badge">18+</span>}
                {currentRoom===r.name && roomUsers.length > 0 && (
                  <span className="user-count">{roomUsers.length}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Users in current channel */}
      {currentRoom && roomUsers.length > 0 && (
        <>
          <div className="label" style={{ marginTop:14 }}>Online in #{currentRoom}</div>
          <div className="user-list">
            {roomUsers.slice(0, 12).map((u) => (
              <div key={u.id||u.name} className="user-item">
                <div className="avatar xs">{(u.name||"?").slice(1,3).toUpperCase()}</div>
                <span className="user-name">{u.name}</span>
                {u.isAdmin && <span className="role-badge admin">mod</span>}
              </div>
            ))}
            {roomUsers.length > 12 && <div className="user-item-more">+{roomUsers.length-12} more</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ── DMs tab ───────────────────────────────────────────────────
function DmsTab({ dmPeers, currentDmPeer, onStartDm, onSelectDmPeer, me }) {
  const [input, setInput] = useState("");
  const start = () => { if (input.trim()) { onStartDm(input.trim()); setInput(""); }};

  return (
    <div className="tab-panel">
      <div className="label">New encrypted DM</div>
      <div className="room-join-row">
        <input className="lux-input" placeholder="@peer-alias" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key==="Enter" && start()} />
        <button className="primary-btn" onClick={start}>Open</button>
      </div>
      <div className="label" style={{ marginTop:14 }}>
        Conversations {dmPeers.length > 0 && `(${dmPeers.length})`}
      </div>
      {dmPeers.length === 0 ? (
        <div className="empty-hint">No conversations yet. Enter an alias above to start.</div>
      ) : (
        <div className="item-list">
          {dmPeers.map((peer) => (
            <button key={peer}
              className={`dm-item ${currentDmPeer===peer ? "active":""}`}
              onClick={() => onSelectDmPeer(peer)}
            >
              <div className="avatar xs">{peer.slice(1,3).toUpperCase()}</div>
              <div style={{ textAlign:"left" }}>
                <div className="channel-name">{peer}</div>
                <div className="contact-meta" style={{ fontSize:"0.78rem" }}>🔐 E2EE</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Groups tab ────────────────────────────────────────────────
function GroupsTab({ groups, currentGroupId, onSelectGroup, onCreateGroup, onJoinGroup }) {
  const [createInput, setCreateInput] = useState("");
  const [joinInput, setJoinInput] = useState("");

  return (
    <div className="tab-panel">
      <div className="label">Create group</div>
      <div className="room-join-row">
        <input className="lux-input" placeholder="Group name…" value={createInput}
          onChange={(e) => setCreateInput(e.target.value)}
          onKeyDown={(e) => { if (e.key==="Enter" && createInput.trim()) { onCreateGroup(createInput.trim()); setCreateInput(""); }}} />
        <button className="primary-btn" onClick={() => { if (createInput.trim()) { onCreateGroup(createInput.trim()); setCreateInput(""); }}}>
          Create
        </button>
      </div>

      <div className="label" style={{ marginTop:12 }}>Join by ID</div>
      <div className="room-join-row">
        <input className="lux-input" placeholder="Group ID…" value={joinInput}
          onChange={(e) => setJoinInput(e.target.value)}
          onKeyDown={(e) => { if (e.key==="Enter" && joinInput.trim()) { onJoinGroup(joinInput.trim()); setJoinInput(""); }}} />
        <button className="primary-btn" onClick={() => { if (joinInput.trim()) { onJoinGroup(joinInput.trim()); setJoinInput(""); }}}>
          Join
        </button>
      </div>

      <div className="label" style={{ marginTop:14 }}>
        Your groups {groups.length > 0 && `(${groups.length})`}
      </div>
      {groups.length === 0 ? (
        <div className="empty-hint">No groups — create or join one above.</div>
      ) : (
        <div className="item-list">
          {groups.map((g) => (
            <button key={g.id}
              className={`channel-item ${currentGroupId===g.id ? "active":""}`}
              onClick={() => onSelectGroup(g.id)}
            >
              <span className="channel-hash">⬡</span>
              <div style={{ textAlign:"left" }}>
                <div className="channel-name">{g.name}</div>
                {g.topic && <div className="contact-meta" style={{ fontSize:"0.78rem" }}>{g.topic}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Friends tab (sidebar section) ─────────────────────────────
function FriendsTab({ friends, friendRequests, onAccept, onDecline, onDm, onAdd }) {
  const [input, setInput] = useState("");
  const online = friends.filter(f => f.online);
  const offline = friends.filter(f => !f.online);
  const submit = () => { if (input.trim()) { onAdd(input.trim()); setInput(""); }};

  return (
    <div className="tab-panel">
      {friendRequests.length > 0 && (
        <>
          <div className="label">Requests ({friendRequests.length})</div>
          {friendRequests.map((r) => (
            <div key={r.fromVoidId} className="friend-request-item compact">
              <span className="contact-name" style={{ flex:1 }}>{r.fromName}</span>
              <button className="small-chip accent-chip" onClick={() => onAccept(r.fromVoidId)}>✓</button>
              <button className="small-chip" onClick={() => onDecline(r.fromVoidId)}>✕</button>
            </div>
          ))}
        </>
      )}

      {online.length > 0 && (
        <>
          <div className="label" style={{ marginTop:8 }}>Online ({online.length})</div>
          {online.map((f) => <FriendRow key={f.voidId} f={f} onDm={onDm} />)}
        </>
      )}

      {offline.length > 0 && (
        <>
          <div className="label" style={{ marginTop:8 }}>Offline ({offline.length})</div>
          {offline.map((f) => <FriendRow key={f.voidId} f={f} onDm={onDm} />)}
        </>
      )}

      {friends.length === 0 && friendRequests.length === 0 && (
        <div className="empty-hint">No friends yet. Join a channel first.</div>
      )}

      <div className="label" style={{ marginTop:12 }}>Add friend</div>
      <div className="room-join-row">
        <input className="lux-input" placeholder="@alias in channel…" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key==="Enter" && submit()} />
        <button className="primary-btn" onClick={submit}>+</button>
      </div>
    </div>
  );
}

function FriendRow({ f, onDm }) {
  return (
    <div className="friend-item compact">
      <div className={`avatar xs ${f.online?"online":""}`}>{(f.name||"?").slice(1,3).toUpperCase()}</div>
      <span className="contact-name" style={{ flex:1 }}>{f.name}</span>
      <button className="small-chip" onClick={() => onDm(f.name)}>DM</button>
    </div>
  );
}
