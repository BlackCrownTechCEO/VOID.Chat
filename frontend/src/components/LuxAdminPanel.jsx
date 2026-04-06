import { useState } from "react";

const OWNER_KEY = import.meta.env.VITE_OWNER_KEY || "void-owner";

export default function LuxAdminPanel({ onBroadcast, onClearMessages, aliases }) {
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");
  const [keyError, setKeyError] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const unlock = () => {
    if (input === OWNER_KEY) {
      setUnlocked(true);
      setKeyError(false);
      setInput("");
    } else {
      setKeyError(true);
    }
  };

  const handleBroadcast = () => {
    if (!announcement.trim()) return;
    onBroadcast?.(announcement.trim());
    setAnnouncement("");
  };

  return (
    <section className="admin-panel-wrap">
      <button className="admin-toggle" onClick={() => setOpen((v) => !v)}>
        <span className="admin-icon">⬡</span>
        <span>Owner / Admin</span>
        <span className="admin-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="admin-body">
          {!unlocked ? (
            <div className="admin-lock">
              <div className="label">Owner key required</div>
              <input
                className="lux-input"
                type="password"
                placeholder="Enter owner key…"
                value={input}
                onChange={(e) => { setInput(e.target.value); setKeyError(false); }}
                onKeyDown={(e) => e.key === "Enter" && unlock()}
              />
              {keyError && <div className="admin-error">Invalid key</div>}
              <button className="primary-btn admin-unlock-btn" onClick={unlock}>Unlock</button>
            </div>
          ) : (
            <div className="admin-controls">
              <div className="admin-section">
                <div className="label">Connected aliases ({aliases?.length ?? 0})</div>
                <div className="alias-list">
                  {aliases?.length ? aliases.map((a) => (
                    <div key={a} className="alias-chip">{a}</div>
                  )) : <div className="admin-empty">No aliases connected</div>}
                </div>
              </div>

              <div className="admin-section">
                <div className="label">Broadcast announcement</div>
                <textarea
                  className="composer-input admin-textarea"
                  rows={2}
                  placeholder="System message to all users…"
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                />
                <button className="primary-btn admin-action-btn" onClick={handleBroadcast}>
                  Broadcast
                </button>
              </div>

              <div className="admin-section">
                <div className="label">Danger zone</div>
                <button
                  className="ghost-btn admin-action-btn danger-btn"
                  onClick={() => { if (window.confirm("Clear all messages?")) onClearMessages?.(); }}
                >
                  Clear all messages
                </button>
                <button
                  className="ghost-btn admin-action-btn"
                  style={{ marginTop: 8 }}
                  onClick={() => setUnlocked(false)}
                >
                  Lock admin panel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
