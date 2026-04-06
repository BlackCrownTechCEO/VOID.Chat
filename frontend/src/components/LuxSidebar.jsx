function ContactItem({ item, active, onSelect }) {
  return (
    <button className={`contact-item ${active ? "active" : ""}`} onClick={() => onSelect(item)}>
      <div className="avatar">{item.name.slice(1, 3).toUpperCase()}</div>
      <div style={{ textAlign: "left" }}>
        <div className="contact-name">{item.name}</div>
        <div className="contact-meta">{item.meta}</div>
      </div>
      <div className="contact-dot" />
    </button>
  );
}

import LuxAdminPanel from "./LuxAdminPanel.jsx";

export default function LuxSidebar({
  me,
  peerAlias,
  setPeerAlias,
  contacts,
  currentContact,
  onSelectContact,
  onBroadcast,
  onClearMessages,
  connectedAliases
}) {
  return (
    <aside className="lux-sidebar">
      <div className="brand-row">
        <div className="brand-mark">VØ</div>
        <div>
          <div className="brand-title">VØID</div>
          <div className="brand-subtitle">Private. Quiet. Luxurious.</div>
        </div>
      </div>

      <section className="identity-card">
        <div className="label">Your identity</div>
        <div className="identity-alias">{me}</div>
        <div className="identity-meta">Secure alias active · Direct encrypted channel ready</div>
      </section>

      <section className="search-card">
        <div className="label">Connect peer</div>
        <input
          className="lux-input"
          value={peerAlias}
          onChange={(e) => setPeerAlias(e.target.value)}
          placeholder="@peer-alias"
        />
      </section>

      <section className="section-card" style={{ flex: 1, minHeight: 0 }}>
        <div className="label">Recent secure contacts</div>
        <div className="contact-list">
          {contacts.map((item) => (
            <ContactItem
              key={item.id}
              item={item}
              active={currentContact?.id === item.id}
              onSelect={onSelectContact}
            />
          ))}
        </div>
      </section>

      <LuxAdminPanel
        onBroadcast={onBroadcast}
        onClearMessages={onClearMessages}
        aliases={connectedAliases}
      />
    </aside>
  );
}
