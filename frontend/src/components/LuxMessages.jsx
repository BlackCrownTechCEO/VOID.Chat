import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble.jsx";

export default function LuxMessages({ messages }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!messages.length) {
    return (
      <div className="messages-wrap">
        <div className="message-surface">
          <div className="empty-state">
            <div className="empty-panel">
              <div className="empty-icon">🔮</div>
              <div className="empty-title">VØID — Secure by design.</div>
              <div>Join a channel, open an encrypted DM, or select a group to begin.</div>
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
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
