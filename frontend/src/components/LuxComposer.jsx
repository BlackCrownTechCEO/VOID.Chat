export default function LuxComposer({ value, onChange, onSend, disabled, status, placeholder }) {
  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) onSend();
    }
  }

  const isError  = status?.startsWith("⚠") || status?.startsWith("Failed") || status?.startsWith("Send failed");
  const isReady  = status === "Connected" || status === "E2EE ready" || status?.startsWith("Sent") || status?.startsWith("Joined");

  return (
    <footer className="composer-wrap">
      <div className="composer-grid">
        <textarea
          className="composer-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder || "Compose message…"}
          rows={2}
          disabled={disabled}
        />
        <button className="primary-btn" onClick={onSend} disabled={disabled || !value.trim()}>
          Send
        </button>
      </div>

      <div className="composer-meta">
        <div className="composer-hint">Enter to send · Shift+Enter for newline</div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div className={`status-pill ${isError?"error":isReady?"ready":""}`}>
            <span className={`status-dot ${isReady?"pulse":""}`} />
            <span>{status || "…"}</span>
          </div>
          <div style={{ opacity:0.5 }}>{value.length}</div>
        </div>
      </div>
    </footer>
  );
}
