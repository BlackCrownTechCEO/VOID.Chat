import { useState } from "react";

const OWNER_ENV_KEY = import.meta.env.VITE_OWNER_KEY || "";

export default function LuxAdminPanel({
  isOwner, isAdmin,
  onClaimOwner, onAdminCmd, onOwnerCmd,
  onBroadcast, onClearMessages,
  roomUsers,
}) {
  const [open,       setOpen]       = useState(false);
  const [unlocked,   setUnlocked]   = useState(false);
  const [keyInput,   setKeyInput]   = useState("");
  const [keyError,   setKeyError]   = useState(false);
  const [activeSection, setSection] = useState("overview");

  // Command fields
  const [targetInput,   setTarget]   = useState("");
  const [dataInput,     setData]     = useState("");
  const [motdInput,     setMotd]     = useState("");
  const [announcement,  setAnnounce] = useState("");

  const effectivelyUnlocked = unlocked || isOwner || isAdmin;

  function unlock() {
    if (!keyInput) { setKeyError(true); return; }
    const valid = OWNER_ENV_KEY && keyInput === OWNER_ENV_KEY;
    if (valid) {
      setUnlocked(true);
      setKeyError(false);
      onClaimOwner?.(keyInput); // authenticate server-side too
      setKeyInput("");
    } else {
      // Try server-side claim even if env key not set
      onClaimOwner?.(keyInput);
      setUnlocked(true); // Optimistic; server will respond with ownerStatus
      setKeyError(false);
      setKeyInput("");
    }
  }

  function cmd(c, target, data) {
    onAdminCmd?.(c, target || targetInput, data || dataInput);
    setTarget(""); setData("");
  }

  const sections = [
    { id:"overview", label:"Overview" },
    { id:"users",    label:"Users" },
    { id:"room",     label:"Room" },
    ...(isOwner || unlocked ? [{ id:"owner", label:"Owner" }] : []),
  ];

  return (
    <section className="admin-panel-wrap">
      <button className="admin-toggle" onClick={() => setOpen(v => !v)}>
        <span className="admin-icon">⬡</span>
        <span>{isOwner ? "Owner Panel" : "Admin Panel"}</span>
        {(isOwner || isAdmin) && <span className="admin-badge">{isOwner ? "OWNER" : "ADMIN"}</span>}
        <span className="admin-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="admin-body">
          {!effectivelyUnlocked ? (
            <div className="admin-lock">
              <div className="label">Enter owner or admin key</div>
              <input
                className="lux-input" type="password" placeholder="Key…"
                value={keyInput}
                onChange={(e) => { setKeyInput(e.target.value); setKeyError(false); }}
                onKeyDown={(e) => e.key==="Enter" && unlock()}
              />
              {keyError && <div className="admin-error">Invalid key</div>}
              <button className="primary-btn admin-action-btn" onClick={unlock}>Unlock</button>
            </div>
          ) : (
            <>
              {/* Section tabs */}
              <div className="admin-tabs">
                {sections.map(s => (
                  <button key={s.id}
                    className={`admin-tab ${activeSection===s.id?"active":""}`}
                    onClick={() => setSection(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Overview */}
              {activeSection==="overview" && (
                <div className="admin-section">
                  <div className="label">
                    Status: {isOwner ? "✦ Owner" : isAdmin ? "⬡ Admin" : "Unlocked"}
                  </div>
                  <div className="label" style={{ marginTop:8 }}>Online in room ({roomUsers?.length||0})</div>
                  <div className="alias-list">
                    {(roomUsers||[]).length
                      ? (roomUsers||[]).map(u => <div key={u.id||u.name} className="alias-chip">{u.name}</div>)
                      : <div className="admin-empty">No users</div>
                    }
                  </div>
                  <button className="ghost-btn admin-action-btn danger-btn"
                    style={{ marginTop:12 }}
                    onClick={() => { if (window.confirm("Lock admin panel?")) setUnlocked(false); }}>
                    Lock panel
                  </button>
                </div>
              )}

              {/* User management */}
              {activeSection==="users" && (
                <div className="admin-section">
                  <div className="label">Target username</div>
                  <input className="lux-input" placeholder="@username" value={targetInput}
                    onChange={(e) => setTarget(e.target.value)} />

                  <div className="admin-cmd-grid">
                    <button className="ghost-btn" onClick={() => cmd("kick")}>Kick</button>
                    <button className="ghost-btn danger-btn" onClick={() => cmd("ban")}>Ban</button>
                    <button className="ghost-btn" onClick={() => cmd("mute")}>Mute</button>
                    <button className="ghost-btn" onClick={() => cmd("unmute")}>Unmute</button>
                    <button className="ghost-btn" onClick={() => cmd("warn")}>Warn</button>
                    <button className="ghost-btn" onClick={() => cmd("clearwarns")}>Clear warns</button>
                    <button className="ghost-btn" onClick={() => cmd("promote")}>Promote mod</button>
                    <button className="ghost-btn" onClick={() => cmd("demote")}>Demote</button>
                  </div>

                  <div className="label" style={{ marginTop:12 }}>Temp mute (minutes)</div>
                  <div className="room-join-row">
                    <input className="lux-input" type="number" placeholder="5" value={dataInput}
                      onChange={(e) => setData(e.target.value)} />
                    <button className="primary-btn" onClick={() => cmd("tempmute")}>Mute</button>
                  </div>
                </div>
              )}

              {/* Room management */}
              {activeSection==="room" && (
                <div className="admin-section">
                  <div className="admin-cmd-grid">
                    <button className="ghost-btn" onClick={() => cmd("lock","","")}>Lock room</button>
                    <button className="ghost-btn" onClick={() => cmd("unlock","","")}>Unlock</button>
                    <button className="ghost-btn danger-btn" onClick={() => { if(window.confirm("Clear chat?")) { onClearMessages?.(); cmd("clear","",""); }}}>Clear chat</button>
                    <button className="ghost-btn" onClick={() => cmd("unpin","","")}>Unpin</button>
                  </div>

                  <div className="label" style={{ marginTop:12 }}>Pin message</div>
                  <div className="room-join-row">
                    <input className="lux-input" placeholder="Message text to pin…" value={dataInput}
                      onChange={(e) => setData(e.target.value)} />
                    <button className="primary-btn" onClick={() => cmd("pin","",dataInput)}>Pin</button>
                  </div>

                  <div className="label" style={{ marginTop:12 }}>Set topic</div>
                  <div className="room-join-row">
                    <input className="lux-input" placeholder="Channel topic…" value={dataInput}
                      onChange={(e) => setData(e.target.value)} />
                    <button className="primary-btn" onClick={() => cmd("settopic","",dataInput)}>Set</button>
                  </div>

                  <div className="label" style={{ marginTop:12 }}>Broadcast to room</div>
                  <textarea className="composer-input admin-textarea" rows={2}
                    placeholder="System announcement…"
                    value={announcement}
                    onChange={(e) => setAnnounce(e.target.value)} />
                  <button className="primary-btn admin-action-btn"
                    onClick={() => { if(announcement.trim()) { onBroadcast?.(announcement.trim()); setAnnounce(""); }}}>
                    Broadcast
                  </button>
                </div>
              )}

              {/* Owner-only */}
              {activeSection==="owner" && (
                <div className="admin-section">
                  <div className="label">Server MOTD</div>
                  <div className="room-join-row">
                    <input className="lux-input" placeholder="Message of the day…" value={motdInput}
                      onChange={(e) => setMotd(e.target.value)} />
                    <button className="primary-btn" onClick={() => { if(motdInput.trim()) { onOwnerCmd?.("setMOTD", { text:motdInput.trim() }); setMotd(""); }}}>
                      Set
                    </button>
                  </div>

                  <div className="label" style={{ marginTop:12 }}>Global announcement</div>
                  <textarea className="composer-input admin-textarea" rows={2}
                    placeholder="Broadcast to all rooms…"
                    value={announcement}
                    onChange={(e) => setAnnounce(e.target.value)} />
                  <button className="primary-btn admin-action-btn"
                    onClick={() => { if(announcement.trim()) { onOwnerCmd?.("announce", { message:announcement.trim() }); setAnnounce(""); }}}>
                    Global Broadcast
                  </button>

                  <div className="label" style={{ marginTop:12 }}>Global ban voidId</div>
                  <div className="room-join-row">
                    <input className="lux-input" placeholder="voidId…" value={targetInput}
                      onChange={(e) => setTarget(e.target.value)} />
                    <button className="ghost-btn danger-btn"
                      onClick={() => { if(targetInput.trim()) { onOwnerCmd?.("globalBan", { targetVoidId:targetInput.trim() }); setTarget(""); }}}>
                      Ban
                    </button>
                  </div>

                  <div className="admin-cmd-grid" style={{ marginTop:12 }}>
                    <button className="ghost-btn" onClick={() => onOwnerCmd?.("maintenance", { enabled:true })}>Maintenance ON</button>
                    <button className="ghost-btn" onClick={() => onOwnerCmd?.("maintenance", { enabled:false })}>Maintenance OFF</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
