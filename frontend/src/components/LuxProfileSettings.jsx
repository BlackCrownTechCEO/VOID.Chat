import { useState } from "react";

const AVATAR_COLORS = [
  "#7c5cff","#3dd9eb","#f472b6","#34d399","#fb923c","#a78bfa","#60a5fa","#e879f9",
];

const AVATAR_EMOJIS = [
  "👻","🔮","⚡","🦊","🐺","🌙","🔥","💎","🎭","🦋","🌊","🗡️",
  "🦅","🌌","🎪","🧬","🔱","⚔️","🦄","🌟",
];

const FONT_SIZES = ["small","medium","large"];
const THEMES = [
  { id:"void",    label:"VØID Dark" },
  { id:"abyss",   label:"Abyss"     },
  { id:"aurora",  label:"Aurora"    },
];

export default function LuxProfileSettings({ alias, voidId, displayName, settings, onSave, onClose }) {
  const [tab,          setTab]          = useState("profile");
  const [nameInput,    setNameInput]    = useState(displayName || "");
  const [avatarColor,  setAvatarColor]  = useState(settings.avatarColor  || AVATAR_COLORS[0]);
  const [avatarEmoji,  setAvatarEmoji]  = useState(settings.avatarEmoji  || "");
  const [avatarMode,   setAvatarMode]   = useState(settings.avatarEmoji ? "emoji" : "color");
  const [sounds,       setSounds]       = useState(settings.sounds       ?? true);
  const [timestamps,   setTimestamps]   = useState(settings.timestamps   ?? true);
  const [compact,      setCompact]      = useState(settings.compact      ?? false);
  const [fontSize,     setFontSize]     = useState(settings.fontSize     || "medium");
  const [theme,        setTheme]        = useState(settings.theme        || "void");
  const [enterToSend,  setEnterToSend]  = useState(settings.enterToSend  ?? true);
  const [confirmReset, setConfirmReset] = useState(false);

  const displayEmoji  = avatarMode === "emoji" && avatarEmoji;
  const initials      = displayEmoji ? avatarEmoji : (nameInput || alias || "VØ").slice(0, 2).toUpperCase();
  const previewStyle  = displayEmoji
    ? { fontSize:"1.6rem", background:"transparent", display:"grid", placeItems:"center" }
    : { background: avatarColor };

  function save() {
    onSave({
      displayName: nameInput.trim(),
      avatarColor,
      avatarEmoji: avatarMode === "emoji" ? avatarEmoji : "",
      sounds, timestamps, compact, fontSize, theme, enterToSend,
    });
    onClose();
  }

  function resetIdentity() {
    Object.keys(localStorage).filter(k => k.startsWith("void.")).forEach(k => localStorage.removeItem(k));
    window.location.reload();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target===e.currentTarget && onClose()}>
      <div className="modal-panel">

        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <div className="avatar" style={{ ...previewStyle, width:40, height:40, borderRadius:12, flexShrink:0 }}>{initials}</div>
            <div>
              <div style={{ fontWeight:700, fontSize:"1.05rem" }}>{nameInput || alias}</div>
              <div style={{ fontSize:"0.78rem", color:"var(--muted-2)" }}>{alias}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {["profile","settings","appearance"].map((t) => (
            <button key={t} className={`modal-tab ${tab===t?"active":""}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ── */}
        {tab === "profile" && (
          <div className="modal-body">
            <div className="modal-field">
              <label className="label">Display name</label>
              <input className="lux-input" placeholder={alias} value={nameInput} maxLength={32} autoFocus
                onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => e.key==="Enter" && save()} />
              <div className="modal-hint">Shown to others in channels and DMs. Leave blank to use alias.</div>
            </div>

            {/* Avatar mode toggle */}
            <div className="modal-field">
              <label className="label">Profile picture</label>
              <div className="avatar-mode-row">
                <button className={`vault-mode-btn ${avatarMode==="color"?"active":""}`} onClick={() => setAvatarMode("color")}>Colour</button>
                <button className={`vault-mode-btn ${avatarMode==="emoji"?"active":""}`} onClick={() => setAvatarMode("emoji")}>Emoji</button>
              </div>

              {avatarMode === "color" && (
                <div className="avatar-color-row" style={{ marginTop:10 }}>
                  {AVATAR_COLORS.map((c) => (
                    <button key={c} className={`avatar-swatch ${avatarColor===c?"selected":""}`}
                      style={{ background:c }} onClick={() => setAvatarColor(c)} />
                  ))}
                </div>
              )}

              {avatarMode === "emoji" && (
                <div className="avatar-emoji-grid">
                  {AVATAR_EMOJIS.map((e) => (
                    <button key={e} className={`avatar-emoji-btn ${avatarEmoji===e?"selected":""}`}
                      onClick={() => setAvatarEmoji(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              )}

              {/* Preview */}
              <div className="avatar-preview">
                <div className="avatar" style={{ ...previewStyle, width:52, height:52, fontSize: displayEmoji?"1.8rem":"1.1rem", borderRadius:14 }}>
                  {initials}
                </div>
                <div style={{ color:"var(--muted)", fontSize:"0.85rem" }}>Preview</div>
              </div>
            </div>

            <div className="modal-field readonly-field">
              <label className="label">Alias (protocol identity)</label>
              <div className="readonly-value">{alias}</div>
              <div className="modal-hint">Used for E2EE key lookup — auto-generated, cannot be changed.</div>
            </div>
            <div className="modal-field readonly-field">
              <label className="label">Void ID</label>
              <div className="readonly-value void-id-value" title={voidId}>{voidId?.slice(0,8)}…{voidId?.slice(-4)}</div>
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && (
          <div className="modal-body">
            <div className="modal-field">
              <label className="label">Notifications</label>
              <SettingsRow label="Sound alerts" hint="Play a sound on new message." value={sounds} onChange={setSounds} />
            </div>
            <div className="modal-field">
              <label className="label">Messages</label>
              <SettingsRow label="Show timestamps" hint="Display time next to messages." value={timestamps} onChange={setTimestamps} />
              <SettingsRow label="Enter to send" hint="Press Enter to send; Shift+Enter for newline." value={enterToSend} onChange={setEnterToSend} style={{ marginTop:8 }} />
              <SettingsRow label="Compact mode" hint="Smaller, denser message list." value={compact} onChange={setCompact} style={{ marginTop:8 }} />
            </div>
            <div className="modal-field danger-zone">
              <label className="label" style={{ color:"#f87171" }}>Danger zone</label>
              {!confirmReset
                ? <button className="danger-btn" onClick={() => setConfirmReset(true)}>Reset local identity &amp; data</button>
                : <div className="confirm-reset">
                    <div className="modal-hint" style={{ color:"#f87171" }}>Clears E2EE keys, alias, sessions. Irreversible.</div>
                    <div style={{ display:"flex", gap:8, marginTop:8 }}>
                      <button className="danger-btn" onClick={resetIdentity}>Yes, reset everything</button>
                      <button className="ghost-btn" onClick={() => setConfirmReset(false)}>Cancel</button>
                    </div>
                  </div>}
            </div>
          </div>
        )}

        {/* ── APPEARANCE TAB ── */}
        {tab === "appearance" && (
          <div className="modal-body">
            <div className="modal-field">
              <label className="label">Theme</label>
              <div className="theme-row">
                {THEMES.map((t) => (
                  <button key={t.id} className={`theme-btn ${theme===t.id?"active":""}`} onClick={() => setTheme(t.id)}>
                    <div className={`theme-preview theme-preview-${t.id}`} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-field">
              <label className="label">Font size</label>
              <div className="font-size-row">
                {FONT_SIZES.map((s) => (
                  <button key={s} className={`font-size-btn ${fontSize===s?"active":""}`} onClick={() => setFontSize(s)}>
                    {s.charAt(0).toUpperCase()+s.slice(1)}
                  </button>
                ))}
              </div>
              <div className="modal-hint">Changes the message text size.</div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={save}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

function SettingsRow({ label, hint, value, onChange, style }) {
  return (
    <div className="settings-row" style={style}>
      <div>
        <div style={{ fontWeight:500 }}>{label}</div>
        {hint && <div className="modal-hint">{hint}</div>}
      </div>
      <button className={`toggle-btn ${value?"on":""}`} onClick={() => onChange(v => !v)} role="switch" aria-checked={value}>
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}
