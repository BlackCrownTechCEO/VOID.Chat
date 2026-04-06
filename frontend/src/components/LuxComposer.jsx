export default function LuxComposer({ value, onChange, onSend, disabled, status, placeholder, replyTo, onCancelReply }) {
  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) onSend();
    }
    if (e.key === "Escape" && replyTo) onCancelReply?.();
  }

  const isError = status?.startsWith("⚠") || status?.startsWith("Failed") || status?.startsWith("Send failed");
  const isReady = status === "Connected" || status === "E2EE ready" || status?.startsWith("Sent") || status?.startsWith("Joined") || status?.startsWith("E2EE");

  return (
    <footer className="composer-wrap">
      {/* Reply banner */}
      {replyTo && (
        <div className="reply-banner">
          <span className="reply-banner-icon">↩</span>
          <div className="reply-banner-body">
            <span className="reply-banner-sender">Replying to {replyTo.sender}</span>
            <span className="reply-banner-text">{replyTo.text.slice(0, 60)}{replyTo.text.length > 60 ? "…" : ""}</span>
          </div>
          <button className="reply-banner-close" onClick={onCancelReply} title="Cancel reply">✕</button>
        </div>
      )}

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
        <div className="composer-hint">Enter to send · Shift+Enter for newline · Esc to cancel reply</div>
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
