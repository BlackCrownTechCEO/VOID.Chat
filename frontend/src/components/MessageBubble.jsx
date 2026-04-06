export default function MessageBubble({ item }) {
  const isSystem = item.type === "system" || item.sender === "System" || item.sender === "📌 Pinned" || item.sender === "⬡ SYSTEM";

  if (isSystem) {
    return (
      <div className="system-msg">
        <span className="system-msg-text">{item.text}</span>
      </div>
    );
  }

  return (
    <div className={`message-row ${item.fromMe ? "mine" : "theirs"}`}>
      {!item.fromMe && (
        <div className="msg-avatar">{(item.sender || "?").slice(1, 3).toUpperCase()}</div>
      )}
      <div className="message-bubble">
        {!item.fromMe && <div className="message-sender">{item.sender}</div>}
        <div className="message-text">{item.text}</div>
        {item.meta && <div className="message-meta">{item.meta}</div>}
      </div>
    </div>
  );
}
