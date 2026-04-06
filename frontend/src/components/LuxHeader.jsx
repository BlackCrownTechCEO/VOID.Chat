export default function LuxHeader({ currentContact }) {
  const displayName = currentContact?.name || "Encrypted Conversation";
  const displayMeta = currentContact?.meta || "Secure channel active";

  return (
    <header className="chat-header">
      <div className="chat-title-row">
        <div className="avatar">{displayName.slice(1, 3).toUpperCase()}</div>
        <div>
          <div className="chat-name">{displayName}</div>
          <div className="chat-status">{displayMeta}</div>
        </div>
      </div>

      <div className="header-actions">
        <button className="small-chip">Shielded</button>
        <button className="small-chip">Verified</button>
        <button className="ghost-btn">Details</button>
      </div>
    </header>
  );
}
