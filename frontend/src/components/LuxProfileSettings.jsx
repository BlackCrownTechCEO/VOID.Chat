import { useState } from "react";

const AVATAR_COLORS = [
  "#7c5cff","#3dd9eb","#f472b6","#34d399","#fb923c","#a78bfa","#60a5fa","#e879f9",
];

export default function LuxProfileSettings({ alias, voidId, displayName, settings, onSave, onClose }) {
  const [tab,         setTab]         = useState("profile");
  const [nameInput,   setNameInput]   = useState(displayName || "");
  const [avatarColor, setAvatarColor] = useState(settings.avatarColor || AVATAR_COLORS[0]);
  const [sounds,      setSounds]      = useState(settings.sounds ?? true);
  const [timestamps,  setTimestamps]  = useState(settings.timestamps ?? true);
  const [confirmReset, setConfirmReset] = useState(false);

  const initials = (nameInput || alias || "VØ").slice(0, 2).toUpperCase();

  function save() {
    onSave({ displayName: nameInput.trim(), avatarColor, sounds, timestamps });
    onClose();
  }

  function resetIdentity() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("void."));
    keys.forEach(k => localStorage.removeItem(k));
    window.location.reload();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target===e.currentTarget && onClose()}>
      <div className="modal-panel">

        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <div className="avatar" style={{ background: avatarColor, flexShrink:0 }}>{initials}</div>
            <div>
              <div style={{ fontWeight:700, fontSize:"1.05rem" }}>{nameInput || alias}</div>
              <div style={{ fontSize:"0.78rem", color:"var(--muted-2)" }}>{alias}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          <button className={`modal-tab ${tab==="profile"?"active":""}`} onClick={() => setTab("profile")}>Profile</button>
          <button className={`modal-tab ${tab==="settings"?"active":""}`} onClick={() => setTab("settings")}>Settings</button>
        </div>

        {/* Profile tab */}
        {tab === "profile" && (
          <div className="modal-body">
            <div className="modal-field">
              <label className="label">Display name</label>
              <input
                className="lux-input"
                placeholder={alias}
                value={nameInput}
                maxLength={32}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                autoFocus
              />
              <div className="modal-hint">Shown to others in channels and DMs. Leave blank to use your alias.</div>
            </div>

            <div className="modal-field">
              <label className="label">Avatar colour</label>
              <div className="avatar-color-row">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`avatar-swatch ${avatarColor===c?"selected":""}`}
                    style={{ background: c }}
                    onClick={() => setAvatarColor(c)}
                    title={c}
                  />
                ))}
              </div>
              <div className="avatar-preview">
                <div className="avatar" style={{ background: avatarColor, width:52, height:52, fontSize:"1.1rem" }}>
                  {initials}
                </div>
                <div style={{ color:"var(--muted)", fontSize:"0.85rem" }}>Preview</div>
              </div>
            </div>

            <div className="modal-field readonly-field">
              <label className="label">Alias (protocol identity)</label>
              <div className="readonly-value">{alias}</div>
              <div className="modal-hint">Auto-generated. Used for E2EE key lookup — cannot be changed.</div>
            </div>

            <div className="modal-field readonly-field">
              <label className="label">Void ID</label>
              <div className="readonly-value void-id-value" title={voidId}>
                {voidId?.slice(0, 8)}…{voidId?.slice(-4)}
              </div>
            </div>
          </div>
        )}

        {/* Settings tab */}
        {tab === "settings" && (
          <div className="modal-body">
            <div className="modal-field">
              <label className="label">Notifications</label>
              <div className="settings-row">
                <div>
                  <div style={{ fontWeight:500 }}>Sound alerts</div>
                  <div className="modal-hint">Play a sound when a message arrives.</div>
                </div>
                <button
                  className={`toggle-btn ${sounds?"on":""}`}
                  onClick={() => setSounds(v => !v)}
                  role="switch"
                  aria-checked={sounds}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="modal-field">
              <label className="label">Display</label>
              <div className="settings-row">
                <div>
                  <div style={{ fontWeight:500 }}>Show timestamps</div>
                  <div className="modal-hint">Display time next to each message.</div>
                </div>
                <button
                  className={`toggle-btn ${timestamps?"on":""}`}
                  onClick={() => setTimestamps(v => !v)}
                  role="switch"
                  aria-checked={timestamps}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="modal-field danger-zone">
              <label className="label" style={{ color:"#f87171" }}>Danger zone</label>
              {!confirmReset ? (
                <button className="danger-btn" onClick={() => setConfirmReset(true)}>
                  Reset local identity &amp; data
                </button>
              ) : (
                <div className="confirm-reset">
                  <div className="modal-hint" style={{ color:"#f87171" }}>
                    This clears your E2EE keys, alias, and all local data. Irreversible.
                  </div>
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <button className="danger-btn" onClick={resetIdentity}>Yes, reset everything</button>
                    <button className="ghost-btn" onClick={() => setConfirmReset(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={save}>Save changes</button>
        </div>

      </div>
    </div>
  );
}
