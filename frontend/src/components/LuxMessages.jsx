import MessageBubble from "./MessageBubble.jsx";

export default function LuxMessages({ messages }) {
  if (!messages.length) {
    return (
      <div className="messages-wrap">
        <div className="message-surface">
          <div className="empty-state">
            <div className="empty-panel">
              <div className="empty-title">A quieter, more premium conversation space.</div>
              <div>
                Enter a peer alias, establish your encrypted session, and start a more refined VØID experience.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-wrap">
      <div className="message-surface">
        {messages.map((item) => (
          <MessageBubble key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
