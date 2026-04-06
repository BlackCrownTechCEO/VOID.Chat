import { useState } from "react";
import LuxAdminPanel from "./LuxAdminPanel.jsx";

const TABS = [
  { id:"rooms",     label:"Channels",  icon:"#" },
  { id:"groups",    label:"Groups",    icon:"⬡" },
  { id:"connect",   label:"Connect",   icon:"✦" },   // DMs + Friends merged
  { id:"encrypted", label:"Encrypted", icon:"🔐" },  // E2EE servers
];

export default function LuxSidebar({
  me, alias, activeTab, onTabChange, isOwner, isAdmin, motd, status,
  avatarColor, avatarEmoji, onOpenProfile,
  // Rooms
  roomList, currentRoom, roomUsers, onJoinRoom, onCreateRoom, onSelectRoom,
  // DMs
  dmPeers, currentDmPeer, onStartDm, onSelectDmPeer,
  // Groups
  groups, currentGroupId, onSelectGroup, onCreateGroup, onJoinGroup,
  // Friends
  friends, friendRequests, onAcceptFriend, onDeclineFriend, onOpenFriendDm, onSendFriendRequest,
  // E2EE Vaults (encrypted servers)
  vaults, currentVaultId, onJoinVault, onCreateVault, onSelectVault,
  // Admin
  onClaimOwner, onAdminCmd, onOwnerCmd, onBroadcast, onClearMessages,
}) {
  const pendingCount = friendRequests?.length || 0;
  const initials = avatarEmoji || (me || alias || "VØ").slice(0, 2).toUpperCase();
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

      {/* Identity card */}
      <button className="identity-card-btn" onClick={onOpenProfile} title="Profile & Settings">
        <div className="identity-avatar" style={{ background: avatarEmoji ? "transparent" : (avatarColor || "var(--accent)"), fontSize: avatarEmoji ? "1.4rem" : undefined }}>
          {initials}
        </div>
        <div className="identity-info">
          <div className="identity-alias">{me || alias}</div>
          {me && me !== alias && <div className="identity-sub-alias">{alias}</div>}
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
          <button key={t.id} className={`nav-tab ${activeTab===t.id?"active":""}`} onClick={() => onTabChange(t.id)}>
            <span className="nav-tab-icon">{t.icon}</span>
            <span>{t.label}</span>
            {t.id==="connect" && pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
          </button>
        ))}
      </nav>

      {/* MOTD */}
      {motd && (
        <div className="motd-bar">
          <span className="motd-icon">📢</span>
          <span>{motd}</span>
        </div>
      )}

      {/* Tab content */}
      <div className="sidebar-content">
        {activeTab==="rooms" && (
          <RoomsTab roomList={roomList} currentRoom={currentRoom} roomUsers={roomUsers}
            onJoinRoom={onJoinRoom} onCreateRoom={onCreateRoom} onSelectRoom={onSelectRoom} />
        )}
        {activeTab==="groups" && (
          <GroupsTab groups={groups} currentGroupId={currentGroupId}
            onSelectGroup={onSelectGroup} onCreateGroup={onCreateGroup} onJoinGroup={onJoinGroup} />
        )}
        {activeTab==="connect" && (
          <ConnectTab
            dmPeers={dmPeers} currentDmPeer={currentDmPeer} onStartDm={onStartDm} onSelectDmPeer={onSelectDmPeer}
            friends={friends} friendRequests={friendRequests}
            onAccept={onAcceptFriend} onDecline={onDeclineFriend}
            onDm={onOpenFriendDm} onAdd={onSendFriendRequest}
          />
        )}
        {activeTab==="encrypted" && (
          <EncryptedTab
            vaults={vaults||[]} currentVaultId={currentVaultId}
            onJoinVault={onJoinVault} onCreateVault={onCreateVault} onSelectVault={onSelectVault}
          />
        )}
      </div>

      {/* Admin panel */}
      <LuxAdminPanel
        isOwner={isOwner} isAdmin={isAdmin}
        onClaimOwner={onClaimOwner} onAdminCmd={onAdminCmd} onOwnerCmd={onOwnerCmd}
        onBroadcast={onBroadcast} onClearMessages={onClearMessages} roomUsers={roomUsers}
      />
    </aside>
  );
}

// ── Rooms ─────────────────────────────────────────────────────
function RoomsTab({ roomList, currentRoom, roomUsers, onJoinRoom, onCreateRoom, onSelectRoom }) {
  const [input, setInput] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const join = () => { if (!input.trim()) return; onJoinRoom(input.trim(), pw); setInput(""); setPw(""); setShowPw(false); };
  return (
    <div className="tab-panel">
      <div className="label">Join or create channel</div>
      <div className="room-join-row">
        <input className="lux-input" placeholder="#channel-name" value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key==="Enter" && join()} />
        <button className="primary-btn" onClick={join}>Join</button>
      </div>
      {showPw
        ? <input className="lux-input" style={{ marginTop:8 }} type="password" placeholder="Password…" value={pw} onChange={(e) => setPw(e.target.value)} />
        : <button className="link-btn" onClick={() => setShowPw(true)}>+ password</button>}
      {roomList.length > 0 && <>
        <div className="label" style={{ marginTop:14 }}>Your channels</div>
        <div className="item-list">
          {roomList.map((r) => (
            <button key={r.name} className={`channel-item ${currentRoom===r.name?"active":""}`} onClick={() => onSelectRoom(r.name)}>
              <span className="channel-hash">#</span>
              <span className="channel-name">{r.name}</span>
              {currentRoom===r.name && roomUsers.length > 0 && <span className="user-count">{roomUsers.length}</span>}
            </button>
          ))}
        </div>
      </>}
      {currentRoom && roomUsers.length > 0 && <>
        <div className="label" style={{ marginTop:14 }}>Online in #{currentRoom}</div>
        <div className="user-list">
          {roomUsers.slice(0,12).map((u) => (
            <div key={u.id||u.name} className="user-item">
              <div className="avatar xs">{(u.name||"?").slice(1,3).toUpperCase()}</div>
              <span className="user-name">{u.name}</span>
              {u.isAdmin && <span className="role-badge admin">mod</span>}
            </div>
          ))}
          {roomUsers.length > 12 && <div className="user-item-more">+{roomUsers.length-12} more</div>}
        </div>
      </>}
    </div>
  );
}

// ── Groups ────────────────────────────────────────────────────
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
        <button className="primary-btn" onClick={() => { if (createInput.trim()) { onCreateGroup(createInput.trim()); setCreateInput(""); }}}>Create</button>
      </div>
      <div className="label" style={{ marginTop:12 }}>Join by ID</div>
      <div className="room-join-row">
        <input className="lux-input" placeholder="Group ID…" value={joinInput}
          onChange={(e) => setJoinInput(e.target.value)}
          onKeyDown={(e) => { if (e.key==="Enter" && joinInput.trim()) { onJoinGroup(joinInput.trim()); setJoinInput(""); }}} />
        <button className="primary-btn" onClick={() => { if (joinInput.trim()) { onJoinGroup(joinInput.trim()); setJoinInput(""); }}}>Join</button>
      </div>
      <div className="label" style={{ marginTop:14 }}>Your groups {groups.length > 0 && `(${groups.length})`}</div>
      {groups.length === 0
        ? <div className="empty-hint">No groups — create or join one above.</div>
        : <div className="item-list">
            {groups.map((g) => (
              <button key={g.id} className={`channel-item ${currentGroupId===g.id?"active":""}`} onClick={() => onSelectGroup(g.id)}>
                <span className="channel-hash">⬡</span>
                <div style={{ textAlign:"left" }}>
                  <div className="channel-name">{g.name}</div>
                  {g.topic && <div className="contact-meta" style={{ fontSize:"0.78rem" }}>{g.topic}</div>}
                </div>
              </button>
            ))}
          </div>}
    </div>
  );
}

// ── Connect (DMs + Friends merged) ────────────────────────────
function ConnectTab({ dmPeers, currentDmPeer, onStartDm, onSelectDmPeer, friends, friendRequests, onAccept, onDecline, onDm, onAdd }) {
  const [dmInput, setDmInput] = useState("");
  const [addInput, setAddInput] = useState("");
  const online = friends.filter(f => f.online);
  const offline = friends.filter(f => !f.online);

  return (
    <div className="tab-panel">
      {/* Friend requests */}
      {friendRequests.length > 0 && (
        <div className="connect-section">
          <div className="label connect-label">
            <span className="label-dot req" />
            Requests ({friendRequests.length})
          </div>
          {friendRequests.map((r) => (
            <div key={r.fromVoidId} className="friend-request-item compact">
              <div className="avatar xs">{(r.fromName||"?").slice(0,2).toUpperCase()}</div>
              <span className="contact-name" style={{ flex:1 }}>{r.fromName}</span>
              <button className="small-chip accent-chip" onClick={() => onAccept(r.fromVoidId)}>✓</button>
              <button className="small-chip" onClick={() => onDecline(r.fromVoidId)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Encrypted DMs */}
      <div className="connect-section">
        <div className="label connect-label"><span className="label-dot dm" />Encrypted DMs {dmPeers.length > 0 && `(${dmPeers.length})`}</div>
        <div className="room-join-row" style={{ marginBottom:8 }}>
          <input className="lux-input" placeholder="@peer-alias…" value={dmInput}
            onChange={(e) => setDmInput(e.target.value)}
            onKeyDown={(e) => { if (e.key==="Enter" && dmInput.trim()) { onStartDm(dmInput.trim()); setDmInput(""); }}} />
          <button className="primary-btn" onClick={() => { if (dmInput.trim()) { onStartDm(dmInput.trim()); setDmInput(""); }}}>🔐</button>
        </div>
        {dmPeers.length === 0
          ? <div className="empty-hint">Enter an alias above to start an E2EE DM.</div>
          : <div className="item-list">
              {dmPeers.map((peer) => (
                <button key={peer} className={`dm-item ${currentDmPeer===peer?"active":""}`} onClick={() => onSelectDmPeer(peer)}>
                  <div className="avatar xs">{peer.slice(1,3).toUpperCase()}</div>
                  <div style={{ textAlign:"left" }}>
                    <div className="channel-name">{peer}</div>
                    <div style={{ fontSize:"0.75rem", color:"var(--accent-2)" }}>🔐 E2EE</div>
                  </div>
                </button>
              ))}
            </div>}
      </div>

      {/* Friends online */}
      {online.length > 0 && (
        <div className="connect-section">
          <div className="label connect-label"><span className="label-dot online" />Online ({online.length})</div>
          {online.map((f) => <FriendRow key={f.voidId} f={f} onDm={onDm} />)}
        </div>
      )}

      {/* Friends offline */}
      {offline.length > 0 && (
        <div className="connect-section">
          <div className="label connect-label"><span className="label-dot" />Offline ({offline.length})</div>
          {offline.map((f) => <FriendRow key={f.voidId} f={f} onDm={onDm} />)}
        </div>
      )}

      {friends.length === 0 && friendRequests.length === 0 && (
        <div className="empty-hint" style={{ marginBottom:8 }}>No friends yet — join a channel and add someone.</div>
      )}

      {/* Add friend */}
      <div className="connect-section">
        <div className="label connect-label"><span className="label-dot" />Add friend</div>
        <div className="room-join-row">
          <input className="lux-input" placeholder="@alias in channel…" value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            onKeyDown={(e) => { if (e.key==="Enter" && addInput.trim()) { onAdd(addInput.trim()); setAddInput(""); }}} />
          <button className="primary-btn" onClick={() => { if (addInput.trim()) { onAdd(addInput.trim()); setAddInput(""); }}}>✦</button>
        </div>
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

// ── Encrypted Servers (Vaults) ────────────────────────────────
function EncryptedTab({ vaults, currentVaultId, onJoinVault, onCreateVault, onSelectVault }) {
  const [nameInput, setNameInput] = useState("");
  const [keyInput,  setKeyInput]  = useState("");
  const [mode,      setMode]      = useState("create"); // "create" | "join"

  const submit = () => {
    if (!nameInput.trim() || !keyInput.trim()) return;
    if (mode === "create") onCreateVault(nameInput.trim(), keyInput.trim());
    else                   onJoinVault(nameInput.trim(), keyInput.trim());
    setNameInput(""); setKeyInput("");
  };

  return (
    <div className="tab-panel">
      <div className="vault-hero">
        <div className="vault-hero-icon">🔐</div>
        <div className="vault-hero-title">Encrypted Servers</div>
        <div className="vault-hero-sub">All messages encrypted client-side. Server never sees plaintext.</div>
      </div>

      <div className="vault-mode-row">
        <button className={`vault-mode-btn ${mode==="create"?"active":""}`} onClick={() => setMode("create")}>Create vault</button>
        <button className={`vault-mode-btn ${mode==="join"?"active":""}`} onClick={() => setMode("join")}>Join vault</button>
      </div>

      <div className="modal-field" style={{ marginTop:12 }}>
        <input className="lux-input" placeholder="Vault name…" value={nameInput}
          onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key==="Enter" && submit()} />
      </div>
      <div className="modal-field" style={{ marginTop:8 }}>
        <input className="lux-input" type="password" placeholder="Passphrase (shared secret)…"
          value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => e.key==="Enter" && submit()} />
        <div className="modal-hint">Share the passphrase with trusted members only. It is never sent to the server.</div>
      </div>
      <button className="primary-btn" style={{ width:"100%", marginTop:10 }} onClick={submit}>
        {mode==="create" ? "Create encrypted vault" : "Join encrypted vault"}
      </button>

      {vaults.length > 0 && <>
        <div className="label" style={{ marginTop:16 }}>Your vaults ({vaults.length})</div>
        <div className="item-list">
          {vaults.map((v) => (
            <button key={v.id} className={`channel-item ${currentVaultId===v.id?"active":""}`} onClick={() => onSelectVault(v.id)}>
              <span className="channel-hash">🔐</span>
              <div style={{ textAlign:"left" }}>
                <div className="channel-name">{v.name}</div>
                <div style={{ fontSize:"0.75rem", color:"var(--accent-2)" }}>E2EE · AES-256-GCM</div>
              </div>
            </button>
          ))}
        </div>
      </>}

      {vaults.length === 0 && (
        <div className="empty-hint" style={{ marginTop:8 }}>No vaults yet. Create one or join with a shared passphrase.</div>
      )}
    </div>
  );
}
