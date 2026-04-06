import { useState } from "react";
import LuxAdminPanel from "./LuxAdminPanel.jsx";

const TABS = [
  { id:"rooms",     label:"Channels",  icon:"#" },
  { id:"groups",    label:"Groups",    icon:"⬡" },
  { id:"connect",   label:"Connect",   icon:"✦" },
  { id:"encrypted", label:"Encrypted", icon:"🔐" },
];

const CATEGORY_ORDER = ["GENERAL","MEDIA","PRIVATE","OTHER"];
const CATEGORY_ICONS = { GENERAL:"💬", MEDIA:"🖼", PRIVATE:"🔒", OTHER:"📂" };

export default function LuxSidebar({
  me, alias, activeTab, onTabChange, isOwner, isAdmin, motd, status,
  avatarColor, avatarEmoji, onOpenProfile,
  roomList, currentRoom, roomUsers, onJoinRoom, onCreateRoom, onSelectRoom,
  dmPeers, currentDmPeer, onStartDm, onSelectDmPeer,
  groups, currentGroupId, onSelectGroup, onCreateGroup, onJoinGroup,
  friends, friendRequests, onAcceptFriend, onDeclineFriend, onOpenFriendDm, onSendFriendRequest,
  vaults, currentVaultId, onJoinVault, onCreateVault, onSelectVault,
  onClaimOwner, onAdminCmd, onOwnerCmd, onBroadcast, onClearMessages,
  onSendSnap,
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
          <div className="brand-subtitle">Private · Encrypted · Luxurious</div>
        </div>
      </div>

      {/* Identity card */}
      <button className="identity-card-btn" onClick={onOpenProfile} title="Profile & Settings">
        <div className="identity-avatar"
          style={{ background: avatarEmoji ? "transparent" : (avatarColor || "var(--accent)"),
                   fontSize: avatarEmoji ? "1.4rem" : undefined }}>
          {initials}
        </div>
        <div className="identity-info">
          <div className="identity-alias">{me || alias}</div>
          {me && me !== alias && <div className="identity-sub-alias">{alias}</div>}
          <div className="identity-meta">
            <span className={`status-dot-sm${isConnected ? " active" : ""}`} />
            {status}
          </div>
        </div>
        <div className="identity-settings-icon">⚙</div>
      </button>

      {/* Nav tabs */}
      <nav className="nav-tabs">
        {TABS.map((t) => (
          <button key={t.id}
            className={`nav-tab${activeTab === t.id ? " active" : ""}`}
            onClick={() => onTabChange(t.id)}>
            <span className="nav-tab-icon">{t.icon}</span>
            <span>{t.label}</span>
            {t.id === "connect" && pendingCount > 0 && (
              <span className="tab-badge">{pendingCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* MOTD */}
      {motd && (
        <div className="motd-bar">
          <span className="motd-icon">📢</span>
          <span className="motd-text">{motd}</span>
        </div>
      )}

      {/* Tab content */}
      <div className="sidebar-content">
        {activeTab === "rooms" && (
          <RoomsTab
            roomList={roomList} currentRoom={currentRoom} roomUsers={roomUsers}
            onJoinRoom={onJoinRoom} onCreateRoom={onCreateRoom} onSelectRoom={onSelectRoom}
            isOwner={isOwner} isAdmin={isAdmin} onOwnerCmd={onOwnerCmd}
          />
        )}
        {activeTab === "groups" && (
          <GroupsTab
            groups={groups} currentGroupId={currentGroupId}
            onSelectGroup={onSelectGroup} onCreateGroup={onCreateGroup} onJoinGroup={onJoinGroup}
          />
        )}
        {activeTab === "connect" && (
          <ConnectTab
            dmPeers={dmPeers} currentDmPeer={currentDmPeer}
            onStartDm={onStartDm} onSelectDmPeer={onSelectDmPeer}
            friends={friends} friendRequests={friendRequests}
            onAccept={onAcceptFriend} onDecline={onDeclineFriend}
            onDm={onOpenFriendDm} onAdd={onSendFriendRequest}
            onSendSnap={onSendSnap}
          />
        )}
        {activeTab === "encrypted" && (
          <EncryptedTab
            vaults={vaults || []} currentVaultId={currentVaultId}
            onJoinVault={onJoinVault} onCreateVault={onCreateVault} onSelectVault={onSelectVault}
          />
        )}
      </div>

      {/* Admin / Owner panel */}
      <LuxAdminPanel
        isOwner={isOwner} isAdmin={isAdmin}
        onClaimOwner={onClaimOwner} onAdminCmd={onAdminCmd} onOwnerCmd={onOwnerCmd}
        onBroadcast={onBroadcast} onClearMessages={onClearMessages} roomUsers={roomUsers}
      />
    </aside>
  );
}

// ── Rooms Tab (Discord-style categories) ──────────────────────────
function RoomsTab({ roomList, currentRoom, roomUsers, onJoinRoom, onCreateRoom, onSelectRoom, isOwner, isAdmin, onOwnerCmd }) {
  const [input,    setInput]    = useState("");
  const [pw,       setPw]       = useState("");
  const [cat,      setCat]      = useState("GENERAL");
  const [showAdv,  setShowAdv]  = useState(false);
  const [collapsed, setCollapsed] = useState({});

  function join()   { if (!input.trim()) return; onJoinRoom(input.trim(), pw);   setInput(""); setPw(""); }
  function create() { if (!input.trim()) return; onCreateRoom(input.trim(), pw, cat); setInput(""); setPw(""); setCat("GENERAL"); }

  const toggleCat = (c) => setCollapsed(p => ({ ...p, [c]: !p[c] }));

  // Group rooms by category
  const byCategory = {};
  for (const r of (roomList || [])) {
    const c = (r.category || "GENERAL").toUpperCase();
    if (!byCategory[c]) byCategory[c] = [];
    byCategory[c].push(r);
  }
  const cats = CATEGORY_ORDER.filter(c => byCategory[c]?.length);
  // Add any unknown categories
  for (const c of Object.keys(byCategory)) {
    if (!CATEGORY_ORDER.includes(c)) cats.push(c);
  }

  return (
    <div className="tab-panel">
      {/* Quick join */}
      <div className="sidebar-section-label">Join channel</div>
      <div className="room-join-row">
        <input className="lux-input" placeholder="#channel-name" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && join()} />
        <button className="icon-btn accent-btn" onClick={join} title="Join">↵</button>
        {(isOwner || isAdmin) && (
          <button className="icon-btn" onClick={create} title="Create channel">＋</button>
        )}
      </div>

      {/* Advanced create options */}
      {(isOwner || isAdmin) && (
        <button className="link-btn" onClick={() => setShowAdv(v => !v)} style={{ marginBottom: 4 }}>
          {showAdv ? "▲ Less options" : "▼ Category & password"}
        </button>
      )}
      {showAdv && (isOwner || isAdmin) && (
        <div className="adv-create-opts">
          <div className="lux-select-wrap">
            <select className="lux-select" value={cat} onChange={e => setCat(e.target.value)}>
              {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c] || "📂"} {c}</option>)}
            </select>
          </div>
          <input className="lux-input" type="password" placeholder="Password (optional)…"
            value={pw} onChange={e => setPw(e.target.value)} />
        </div>
      )}

      {/* Channel categories */}
      {cats.length > 0 && cats.map(c => (
        <div key={c} className="channel-category">
          <button className="category-header" onClick={() => toggleCat(c)}>
            <span className="category-chevron">{collapsed[c] ? "▶" : "▼"}</span>
            <span className="category-icon">{CATEGORY_ICONS[c] || "📂"}</span>
            <span className="category-name">{c}</span>
            <span className="category-count">{byCategory[c].length}</span>
          </button>
          {!collapsed[c] && (
            <div className="channel-list">
              {byCategory[c].map(r => (
                <button key={r.name}
                  className={`channel-item${currentRoom === r.name ? " active" : ""}${r.locked ? " locked" : ""}`}
                  onClick={() => onSelectRoom(r.name)}>
                  <span className="channel-hash">#</span>
                  <span className="channel-name">{r.name}</span>
                  {r.locked && <span className="channel-lock-icon" title="Locked">🔒</span>}
                  {currentRoom === r.name && roomUsers.length > 0 && (
                    <span className="user-count">{roomUsers.length}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Online users in current channel */}
      {currentRoom && roomUsers.length > 0 && (
        <div className="channel-members-section">
          <div className="sidebar-section-label">
            <span className="label-dot online" />
            Online in #{currentRoom} ({roomUsers.length})
          </div>
          <div className="user-list">
            {roomUsers.slice(0, 10).map(u => (
              <div key={u.id || u.name} className="user-item">
                <div className="avatar xs online">{(u.name || "?").slice(0, 2).toUpperCase()}</div>
                <span className="user-name">{u.name}</span>
                {u.isOwner  && <span className="role-badge owner">owner</span>}
                {!u.isOwner && u.isAdmin && <span className="role-badge admin">mod</span>}
              </div>
            ))}
            {roomUsers.length > 10 && (
              <div className="user-item-more">+{roomUsers.length - 10} more</div>
            )}
          </div>
        </div>
      )}

      {/* Owner: delete channel */}
      {isOwner && currentRoom && (
        <button className="danger-btn-sm" style={{ marginTop: 12 }}
          onClick={() => { if (window.confirm(`Delete #${currentRoom}?`)) onOwnerCmd?.("deleteRoom", { name: currentRoom }); }}>
          🗑 Delete #{currentRoom}
        </button>
      )}
    </div>
  );
}

// ── Groups Tab ────────────────────────────────────────────────────
function GroupsTab({ groups, currentGroupId, onSelectGroup, onCreateGroup, onJoinGroup }) {
  const [createInput, setCreateInput] = useState("");
  const [joinInput,   setJoinInput]   = useState("");

  return (
    <div className="tab-panel">
      <div className="sidebar-section-label">Create group</div>
      <div className="room-join-row">
        <input className="lux-input" placeholder="Group name…" value={createInput}
          onChange={e => setCreateInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && createInput.trim()) { onCreateGroup(createInput.trim()); setCreateInput(""); }}} />
        <button className="icon-btn accent-btn" title="Create"
          onClick={() => { if (createInput.trim()) { onCreateGroup(createInput.trim()); setCreateInput(""); }}}>＋</button>
      </div>

      <div className="sidebar-section-label" style={{ marginTop: 12 }}>Join by ID</div>
      <div className="room-join-row">
        <input className="lux-input" placeholder="Paste group ID…" value={joinInput}
          onChange={e => setJoinInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && joinInput.trim()) { onJoinGroup(joinInput.trim()); setJoinInput(""); }}} />
        <button className="icon-btn accent-btn" title="Join"
          onClick={() => { if (joinInput.trim()) { onJoinGroup(joinInput.trim()); setJoinInput(""); }}}>↵</button>
      </div>

      <div className="sidebar-section-label" style={{ marginTop: 14 }}>
        Your groups {groups.length > 0 && `(${groups.length})`}
      </div>
      {groups.length === 0 ? (
        <div className="empty-hint">No groups yet — create or join one above.</div>
      ) : (
        <div className="item-list">
          {groups.map(g => (
            <button key={g.id}
              className={`channel-item${currentGroupId === g.id ? " active" : ""}`}
              onClick={() => onSelectGroup(g.id)}>
              <span className="channel-hash">⬡</span>
              <div style={{ textAlign: "left" }}>
                <div className="channel-name">{g.name}</div>
                {g.topic && <div className="channel-topic">{g.topic}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Connect Tab (DMs + Friends + Snaps) ───────────────────────────
function ConnectTab({ dmPeers, currentDmPeer, onStartDm, onSelectDmPeer, friends, friendRequests, onAccept, onDecline, onDm, onAdd, onSendSnap }) {
  const [dmInput,  setDmInput]  = useState("");
  const [addInput, setAddInput] = useState("");
  const [snapPeer, setSnapPeer] = useState(null);

  const online  = (friends || []).filter(f => f.online);
  const offline = (friends || []).filter(f => !f.online);

  return (
    <div className="tab-panel">
      {/* Pending friend requests */}
      {(friendRequests || []).length > 0 && (
        <div className="connect-section">
          <div className="sidebar-section-label connect-label">
            <span className="label-dot req" />
            Requests ({friendRequests.length})
          </div>
          {friendRequests.map(r => (
            <div key={r.fromVoidId} className="friend-request-item compact">
              <div className="avatar xs">{(r.fromName || "?").slice(0, 2).toUpperCase()}</div>
              <span className="contact-name">{r.fromName}</span>
              <button className="small-chip accent-chip" onClick={() => onAccept(r.fromVoidId)} title="Accept">✓</button>
              <button className="small-chip"             onClick={() => onDecline(r.fromVoidId)} title="Decline">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Encrypted DMs */}
      <div className="connect-section">
        <div className="sidebar-section-label connect-label">
          <span className="label-dot dm" />
          Encrypted DMs {dmPeers.length > 0 && `(${dmPeers.length})`}
        </div>
        <div className="room-join-row" style={{ marginBottom: 8 }}>
          <input className="lux-input" placeholder="@peer-alias…" value={dmInput}
            onChange={e => setDmInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && dmInput.trim()) { onStartDm(dmInput.trim()); setDmInput(""); }}} />
          <button className="icon-btn accent-btn" title="Start E2EE DM"
            onClick={() => { if (dmInput.trim()) { onStartDm(dmInput.trim()); setDmInput(""); }}}>🔐</button>
        </div>
        {dmPeers.length === 0 ? (
          <div className="empty-hint">Enter an alias above to start an E2EE DM.</div>
        ) : (
          <div className="item-list">
            {dmPeers.map(peer => (
              <div key={peer} className="dm-row">
                <button
                  className={`dm-item${currentDmPeer === peer ? " active" : ""}`}
                  onClick={() => onSelectDmPeer(peer)}>
                  <div className="avatar xs">{peer.slice(0, 2).toUpperCase()}</div>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div className="channel-name">{peer}</div>
                    <div className="channel-topic">🔐 E2EE · X3DH</div>
                  </div>
                </button>
                {onSendSnap && (
                  <button className="snap-inline-btn" title="Send VoidSnap ⚡"
                    onClick={() => setSnapPeer(snapPeer === peer ? null : peer)}>⚡</button>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Inline snap composer */}
        {snapPeer && (
          <SnapInlineComposer toAlias={snapPeer} onSend={onSendSnap} onClose={() => setSnapPeer(null)} />
        )}
      </div>

      {/* Friends online */}
      {online.length > 0 && (
        <div className="connect-section">
          <div className="sidebar-section-label connect-label">
            <span className="label-dot online" />Online ({online.length})
          </div>
          {online.map(f => <FriendRow key={f.voidId} f={f} onDm={onDm} onSnap={onSendSnap} />)}
        </div>
      )}

      {/* Friends offline */}
      {offline.length > 0 && (
        <div className="connect-section">
          <div className="sidebar-section-label connect-label">
            <span className="label-dot" />Offline ({offline.length})
          </div>
          {offline.map(f => <FriendRow key={f.voidId} f={f} onDm={onDm} onSnap={onSendSnap} />)}
        </div>
      )}

      {(friends || []).length === 0 && (friendRequests || []).length === 0 && (
        <div className="empty-hint">No friends yet — join a channel and add someone.</div>
      )}

      {/* Add friend */}
      <div className="connect-section">
        <div className="sidebar-section-label connect-label">
          <span className="label-dot" />Add friend
        </div>
        <div className="room-join-row">
          <input className="lux-input" placeholder="@alias from channel…" value={addInput}
            onChange={e => setAddInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && addInput.trim()) { onAdd(addInput.trim()); setAddInput(""); }}} />
          <button className="icon-btn accent-btn" title="Send friend request"
            onClick={() => { if (addInput.trim()) { onAdd(addInput.trim()); setAddInput(""); }}}>✦</button>
        </div>
      </div>
    </div>
  );
}

function FriendRow({ f, onDm, onSnap }) {
  const [showSnap, setShowSnap] = useState(false);
  return (
    <div className="friend-section-wrap">
      <div className="friend-item compact">
        <div className={`avatar xs${f.online ? " online" : ""}`}>
          {(f.name || "?").slice(0, 2).toUpperCase()}
        </div>
        <span className="contact-name">{f.name}</span>
        <button className="small-chip" onClick={() => onDm(f.name)} title="DM">DM</button>
        {onSnap && (
          <button className="small-chip snap-chip" onClick={() => setShowSnap(v => !v)} title="Send Snap">⚡</button>
        )}
      </div>
      {showSnap && onSnap && (
        <SnapInlineComposer toAlias={f.name} onSend={onSnap} onClose={() => setShowSnap(false)} />
      )}
    </div>
  );
}

function SnapInlineComposer({ toAlias, onSend, onClose }) {
  const [text, setText] = useState("");
  const [dur,  setDur]  = useState(5);
  return (
    <div className="snap-inline-composer">
      <div className="snap-ic-header">
        <span>⚡ Snap → <strong>{toAlias}</strong></span>
        <button className="snap-ic-close" onClick={onClose}>✕</button>
      </div>
      <textarea className="snap-ic-input" rows={2}
        placeholder="Self-destructs after viewing…"
        value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey && text.trim()) { onSend(toAlias, text.trim(), dur); onClose(); }}} />
      <div className="snap-ic-footer">
        <div className="snap-dur-chips">
          {[3, 5, 10, 30].map(d => (
            <button key={d}
              className={`snap-dur-btn${dur === d ? " active" : ""}`}
              onClick={() => setDur(d)}>{d}s</button>
          ))}
        </div>
        <button className="snap-ic-send"
          disabled={!text.trim()}
          onClick={() => { onSend(toAlias, text.trim(), dur); onClose(); }}>
          ⚡ Send
        </button>
      </div>
    </div>
  );
}

// ── Encrypted Vaults Tab ──────────────────────────────────────────
function EncryptedTab({ vaults, currentVaultId, onJoinVault, onCreateVault, onSelectVault }) {
  const [nameInput, setNameInput] = useState("");
  const [keyInput,  setKeyInput]  = useState("");
  const [mode,      setMode]      = useState("create");

  function submit() {
    if (!nameInput.trim() || !keyInput.trim()) return;
    if (mode === "create") onCreateVault(nameInput.trim(), keyInput.trim());
    else                   onJoinVault(nameInput.trim(), keyInput.trim());
    setNameInput(""); setKeyInput("");
  }

  return (
    <div className="tab-panel">
      <div className="vault-hero">
        <div className="vault-hero-icon">🔐</div>
        <div className="vault-hero-title">Encrypted Vaults</div>
        <div className="vault-hero-sub">
          Messages encrypted client-side with AES-256-GCM.<br />
          Server never sees plaintext.
        </div>
      </div>

      <div className="vault-mode-row">
        <button className={`vault-mode-btn${mode === "create" ? " active" : ""}`} onClick={() => setMode("create")}>Create</button>
        <button className={`vault-mode-btn${mode === "join"   ? " active" : ""}`} onClick={() => setMode("join")}>Join</button>
      </div>

      <div className="modal-field" style={{ marginTop: 12 }}>
        <input className="lux-input" placeholder="Vault name…" value={nameInput}
          onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
      </div>
      <div className="modal-field" style={{ marginTop: 8 }}>
        <input className="lux-input" type="password" placeholder="Shared passphrase…"
          value={keyInput} onChange={e => setKeyInput(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        <div className="modal-hint">Never sent to the server — keep it private.</div>
      </div>
      <button className="primary-btn full-width-btn" onClick={submit} style={{ marginTop: 10 }}>
        {mode === "create" ? "🔐 Create vault" : "🔓 Join vault"}
      </button>

      {vaults.length > 0 && (
        <>
          <div className="sidebar-section-label" style={{ marginTop: 16 }}>
            Your vaults ({vaults.length})
          </div>
          <div className="item-list">
            {vaults.map(v => (
              <button key={v.id}
                className={`channel-item${currentVaultId === v.id ? " active" : ""}`}
                onClick={() => onSelectVault(v.id)}>
                <span className="channel-hash">🔐</span>
                <div style={{ textAlign: "left" }}>
                  <div className="channel-name">{v.name}</div>
                  <div className="channel-topic">AES-256-GCM · passphrase</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {vaults.length === 0 && (
        <div className="empty-hint" style={{ marginTop: 8 }}>
          No vaults yet. Create one or join a shared vault.
        </div>
      )}
    </div>
  );
}
