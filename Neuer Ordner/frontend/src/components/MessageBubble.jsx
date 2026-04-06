export default function MessageBubble({ item }) {
  return (
    <div className={`message-row ${item.fromMe ? "mine" : "theirs"}`}>
      <div className="message-bubble">
        <div className="message-sender">{item.fromMe ? "You" : item.sender}</div>
        <div className="message-text">{item.text}</div>
        <div className="message-meta">{item.meta || "Encrypted message"}</div>
      </div>
    </div>
  );
}
