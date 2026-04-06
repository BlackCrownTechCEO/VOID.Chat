export default function LuxHeader({
  title, meta, tab,
  roomUsers, isAdmin, isOwner, currentRoom,
  onAdminCmd,
}) {
  const initials = (() => {
    if (!title) return "VØ";
    if (title.startsWith("#"))  return title.slice(1, 3).toUpperCase();
    if (title.startsWith("@"))  return title.slice(1, 3).toUpperCase();
    return title.slice(0, 2).toUpperCase();
  })();

  const tabIcon = tab==="rooms" ? "#" : tab==="dms" ? "✉" : tab==="groups" ? "⬡" : "✦";

  return (
    <header className="chat-header">
      <div className="chat-title-row">
        <div className="avatar header-avatar">{initials}</div>
        <div>
          <div className="chat-name">
            <span className="header-tab-icon">{tabIcon}</span>
            {title}
          </div>
          <div className="chat-status">{meta}</div>
        </div>
      </div>

      <div className="header-actions">
        {tab==="dms" && (
          <button className="small-chip e2ee-chip" title="End-to-end encrypted">
            🔐 E2EE
          </button>
        )}
        {tab==="rooms" && currentRoom && (
          <>
            <button className="small-chip" title="Users online">
              {roomUsers?.length || 0} online
            </button>
            {(isAdmin || isOwner) && (
              <button className="small-chip accent-chip" title="Slow mode">Mod tools ↓</button>
            )}
          </>
        )}
        {tab==="groups" && (
          <button className="small-chip">Encrypted</button>
        )}
        {tab==="friends" && (
          <button className="small-chip e2ee-chip">🔐 Private</button>
        )}
      </div>
    </header>
  );
}
