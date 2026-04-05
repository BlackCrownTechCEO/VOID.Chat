export default function MessageBubble({ item }) {
  const mine = item.fromMe;
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
      <div style={{
        maxWidth: "72%",
        padding: "10px 12px",
        borderRadius: 16,
        background: mine ? "#2563eb" : "#1f2937"
      }}>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{mine ? "You" : item.sender}</div>
        <div>{item.text}</div>
      </div>
    </div>
  );
}
