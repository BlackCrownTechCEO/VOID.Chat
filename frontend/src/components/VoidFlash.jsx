import { useState, useEffect, useCallback } from "react";

// Module-level trigger — call flash(msg, type) from anywhere after mount
let _dispatch = null;

export function flash(message, type = "info", duration = 3200) {
  _dispatch?.({ id: Math.random().toString(36).slice(2) + Date.now(), message, type, duration });
}

const ICONS = { success:"✓", error:"⚠", info:"◈", dm:"🔐", friend:"✦", flash:"⚡", warn:"◬" };
const LABELS = { success:"Success", error:"Error", info:"VØID", dm:"Encrypted DM", friend:"Friend", flash:"VoidFlash", warn:"Warning" };

export default function VoidFlash() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _dispatch = (toast) => {
      setToasts(prev => [...prev.slice(-4), toast]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), toast.duration);
    };
    return () => { _dispatch = null; };
  }, []);

  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  if (!toasts.length) return null;

  return (
    <div className="vf-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`vf-toast vf-${t.type}`} onClick={() => dismiss(t.id)}>
          <span className="vf-icon">{ICONS[t.type] || "◈"}</span>
          <div className="vf-body">
            <div className="vf-label">{LABELS[t.type] || "VØID"}</div>
            <div className="vf-msg">{t.message}</div>
          </div>
          <button className="vf-close" onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}>✕</button>
        </div>
      ))}
    </div>
  );
}
