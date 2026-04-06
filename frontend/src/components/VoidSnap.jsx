/**
 * VoidSnap — E2EE ephemeral "flash" messages.
 * Messages auto-destruct after `duration` seconds of being viewed.
 * Encrypted with the recipient's X3DH key bundle before sending.
 */
import { useState, useEffect, useRef } from "react";

// ── Incoming snap viewer ──────────────────────────────────────────
export function SnapViewer({ snap, onDismiss }) {
  const [timeLeft, setTimeLeft] = useState(snap.duration || 5);
  const [opened,   setOpened]   = useState(false);

  useEffect(() => {
    if (!opened) return;
    const t = setInterval(() => setTimeLeft(p => {
      if (p <= 1) { clearInterval(t); onDismiss(snap.id); return 0; }
      return p - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [opened, snap.id, onDismiss]);

  if (!opened) {
    return (
      <div className="snap-sealed" onClick={() => setOpened(true)} role="button" tabIndex={0}
        onKeyDown={e => e.key === "Enter" && setOpened(true)}>
        <div className="snap-sealed-icon">⚡</div>
        <div className="snap-sealed-label">VoidSnap from <strong>{snap.fromAlias}</strong></div>
        <div className="snap-sealed-sub">Tap to open · self-destructs in {snap.duration}s</div>
      </div>
    );
  }

  return (
    <div className="snap-open">
      <div className="snap-open-bar">
        <span className="snap-open-from">⚡ {snap.fromAlias}</span>
        <span className="snap-timer">{timeLeft}s</span>
      </div>
      <div className="snap-open-body">{snap.text || "[Encrypted media]"}</div>
      <div className="snap-progress">
        <div className="snap-progress-fill" style={{ animationDuration: `${snap.duration}s` }} />
      </div>
    </div>
  );
}

// ── Outgoing snap composer ────────────────────────────────────────
export function SnapComposer({ toAlias, onSend, onClose }) {
  const [text,     setText]     = useState("");
  const [duration, setDuration] = useState(5);
  const textRef = useRef(null);

  useEffect(() => textRef.current?.focus(), []);

  function send() {
    if (!text.trim()) return;
    onSend({ toAlias, text: text.trim(), duration });
    onClose();
  }

  return (
    <div className="snap-composer" role="dialog" aria-label="Send VoidSnap">
      <div className="snap-composer-header">
        <span className="snap-composer-icon">⚡</span>
        <span>VoidSnap to <strong>{toAlias}</strong></span>
        <button className="snap-composer-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <textarea
        ref={textRef}
        className="snap-composer-input"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type a self-destructing message…"
        maxLength={500}
        rows={4}
        onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) send(); }}
      />
      <div className="snap-composer-footer">
        <div className="snap-duration-row">
          <span className="snap-duration-label">Destroys after</span>
          {[3, 5, 10, 30].map(d => (
            <button key={d}
              className={`snap-dur-btn${duration === d ? " active" : ""}`}
              onClick={() => setDuration(d)}>
              {d}s
            </button>
          ))}
        </div>
        <button className="snap-send-btn" onClick={send} disabled={!text.trim()}>
          ⚡ Send Snap
        </button>
      </div>
    </div>
  );
}

// ── Snap notification bubble ──────────────────────────────────────
export function SnapNotif({ count, onClick }) {
  if (!count) return null;
  return (
    <button className="snap-notif-btn" onClick={onClick} aria-label={`${count} incoming snap${count > 1 ? "s" : ""}`}>
      <span className="snap-notif-icon">⚡</span>
      <span className="snap-notif-count">{count}</span>
    </button>
  );
}
