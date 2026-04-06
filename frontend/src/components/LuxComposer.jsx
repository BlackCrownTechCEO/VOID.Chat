import { useRef } from "react";
import { MediaUploadButton } from "./MediaManager.jsx";

export default function LuxComposer({
  value, onChange, onSend, disabled, status, placeholder,
  replyTo, onCancelReply,
  onMediaUploaded, // (result: { url, mime }) => void
  enterToSend = true,
}) {
  const textareaRef = useRef(null);

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey && enterToSend) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
    if (e.key === "Escape" && replyTo) onCancelReply?.();
  }

  const isError = status?.startsWith("⚠") || status?.startsWith("Failed") || status?.startsWith("Relay error");
  const isReady = status === "Connected" || status === "E2EE ready"
    || status?.startsWith("Sent") || status?.startsWith("Joined")
    || status?.startsWith("E2EE") || status?.startsWith("Joined");

  return (
    <footer className="composer-wrap">
      {/* Reply banner */}
      {replyTo && (
        <div className="reply-banner">
          <span className="reply-banner-icon">↩</span>
          <div className="reply-banner-body">
            <span className="reply-banner-sender">Replying to {replyTo.sender}</span>
            <span className="reply-banner-text">
              {replyTo.text.slice(0, 80)}{replyTo.text.length > 80 ? "…" : ""}
            </span>
          </div>
          <button className="reply-banner-close" onClick={onCancelReply} title="Cancel reply">✕</button>
        </div>
      )}

      <div className="composer-grid">
        {/* Media attach */}
        {onMediaUploaded && (
          <MediaUploadButton onUploaded={onMediaUploaded} disabled={disabled} />
        )}

        <textarea
          ref={textareaRef}
          className="composer-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder || "Compose message…"}
          rows={2}
          disabled={disabled}
          aria-label="Message composer"
        />

        <button
          className="composer-send-btn"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          title="Send (Enter)"
          aria-label="Send message">
          ↑
        </button>
      </div>

      <div className="composer-meta">
        <div className="composer-hint">
          {enterToSend ? "Enter to send · Shift+Enter newline" : "Shift+Enter to send · Enter for newline"}
          {replyTo ? " · Esc to cancel reply" : ""}
        </div>
        <div className="composer-right-meta">
          <div className={`status-pill${isError ? " error" : isReady ? " ready" : ""}`}>
            <span className={`status-dot${isReady ? " pulse" : ""}`} />
            <span>{status || "…"}</span>
          </div>
          <div className="char-count" style={{ opacity: value.length > 1800 ? 1 : 0.35 }}>
            {value.length}/2000
          </div>
        </div>
      </div>
    </footer>
  );
}
