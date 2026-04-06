import { useState } from "react";
import { MediaPreview } from "./MediaManager.jsx";

const QUICK_REACTIONS = ["👍","❤️","😂","🔥","🙏","😮","👀","💯"];

export default function MessageBubble({ item, onReact, onReply, avatarColor }) {
  const [showPicker, setShowPicker] = useState(false);

  const isSystem = item.type === "system" || item.sender === "System"
    || item.sender === "📌 Pinned" || item.sender === "⬡ SYSTEM";

  if (isSystem) {
    return (
      <div className="system-msg">
        <span className="system-msg-icon">◈</span>
        <span className="system-msg-text">{item.text}</span>
      </div>
    );
  }

  const initials = (item.sender || "?").replace(/^@/, "").slice(0, 2).toUpperCase();

  return (
    <div className={`message-row${item.fromMe ? " mine" : " theirs"}`}
      onMouseLeave={() => setShowPicker(false)}>

      {/* Avatar */}
      {!item.fromMe && (
        <div className="msg-avatar" style={{ background: avatarColor || undefined }}>
          {item.avatarEmoji || initials}
        </div>
      )}

      <div className="message-bubble-wrap">
        {/* Reply-to context */}
        {item.replyTo && (
          <div className="reply-context">
            <span className="reply-bar" />
            <div className="reply-content">
              <span className="reply-sender">{item.replyTo.sender}</span>
              <span className="reply-text">
                {item.replyTo.text.slice(0, 80)}{item.replyTo.text.length > 80 ? "…" : ""}
              </span>
            </div>
          </div>
        )}

        {/* Bubble */}
        <div className="message-bubble">
          {!item.fromMe && (
            <div className="message-sender">
              {item.sender}
              {item.isOwner  && <span className="msg-role-badge owner">owner</span>}
              {!item.isOwner && item.isAdmin && <span className="msg-role-badge admin">mod</span>}
            </div>
          )}

          {/* Text */}
          {item.text && <div className="message-text">{renderText(item.text)}</div>}

          {/* Media attachment */}
          {item.mediaUrl && (
            <MediaPreview url={item.mediaUrl} mime={item.mediaMime} alt="attachment" />
          )}

          {/* Meta / timestamp */}
          {item.meta && <div className="message-meta">{item.meta}</div>}
        </div>

        {/* Reactions */}
        {item.reactions && item.reactions.length > 0 && (
          <div className="reaction-row">
            {item.reactions.map(r => (
              <button key={r.emoji}
                className={`reaction-chip${r.byMe ? " mine" : ""}`}
                onClick={() => onReact?.(item.id, r.emoji)}
                title={`${r.count} reaction${r.count !== 1 ? "s" : ""}`}>
                {r.emoji} <span className="reaction-count">{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Action bar (hover) */}
        <div className="msg-actions">
          <button className="msg-action-btn" title="React" onClick={() => setShowPicker(v => !v)}>😊</button>
          <button className="msg-action-btn" title="Reply" onClick={() => onReply?.(item)}>↩</button>
        </div>

        {/* Reaction picker */}
        {showPicker && (
          <div className={`reaction-picker${item.fromMe ? " picker-left" : " picker-right"}`}>
            {QUICK_REACTIONS.map(e => (
              <button key={e} className="reaction-pick-btn"
                onClick={() => { onReact?.(item.id, e); setShowPicker(false); }}>
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Simple text renderer: linkify URLs, preserve newlines
function renderText(text) {
  const URL_RE = /(https?:\/\/[^\s<>"]+)/g;
  const parts = text.split(URL_RE);
  return parts.map((p, i) =>
    URL_RE.test(p)
      ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="msg-link">{p}</a>
      : p.split("\n").map((line, j, arr) => (
          <span key={`${i}-${j}`}>
            {line}
            {j < arr.length - 1 && <br />}
          </span>
        ))
  );
}
