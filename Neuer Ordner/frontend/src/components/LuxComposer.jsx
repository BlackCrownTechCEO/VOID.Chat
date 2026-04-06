import { useMemo } from "react";

export default function LuxComposer({ value, onChange, onSend, disabled, status }) {
  const charCount = value.length;
  const helper = useMemo(() => {
    if (disabled) return "Enter a peer alias before sending";
    return "Messages are sent through your existing project transport";
  }, [disabled]);

  return (
    <footer className="composer-wrap">
      <div className="composer-grid">
        <textarea
          className="composer-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Compose a more elegant encrypted message…"
          rows={2}
        />
        <button className="primary-btn" onClick={onSend} disabled={disabled}>
          Send
        </button>
      </div>

      <div className="composer-meta">
        <div>{helper}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="status-pill">
            <span className="status-dot" />
            <span>{status}</span>
          </div>
          <div>{charCount} chars</div>
        </div>
      </div>
    </footer>
  );
}
