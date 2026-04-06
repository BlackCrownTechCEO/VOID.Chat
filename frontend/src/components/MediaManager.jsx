/**
 * MediaManager — upload + preview with client-side metadata stripping.
 * Images are re-drawn through a <canvas> before upload to strip EXIF.
 * Videos are sent as-is (server stores, no transcode server-side).
 */
import { useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "";
const MAX_MB  = 32;

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime";

// Strip EXIF from image by re-drawing through canvas
async function stripImageMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error("canvas.toBlob failed"));
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".png"), { type: "image/png" }));
      }, "image/png");
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function uploadFile(file) {
  const isImage = file.type.startsWith("image/");
  const isGif   = file.type === "image/gif";

  let toSend = file;
  if (isImage && !isGif) {
    toSend = await stripImageMeta(file);
  }

  if (toSend.size > MAX_MB * 1024 * 1024) {
    throw new Error(`File too large (max ${MAX_MB} MB)`);
  }

  const ext = toSend.name.match(/\.[^.]+$/)?.[0] || ".bin";
  const res = await fetch(`${API_URL}/api/media/upload`, {
    method: "POST",
    headers: {
      "Content-Type": toSend.type,
      "X-Filename": `upload${ext}`,
    },
    body: toSend,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || "Upload failed");
  }

  return await res.json(); // { ok, url, mime }
}

// ── MediaPreview — shown inside a message bubble ──────────────────
export function MediaPreview({ url, mime, alt = "media" }) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  if (!url) return null;
  const full = url.startsWith("http") ? url : `${API_URL}${url}`;

  if (mime?.startsWith("video/")) {
    return (
      <div className="media-preview media-video">
        <video controls preload="metadata" className="media-el" src={full}
          onLoadedData={() => setLoading(false)}
          onError={() => setError(true)} />
        {error && <div className="media-error">Video unavailable</div>}
      </div>
    );
  }

  return (
    <div className="media-preview media-image">
      {loading && !error && <div className="media-skeleton" />}
      <img
        src={full} alt={alt}
        className={`media-el${loading ? " media-loading" : ""}`}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        style={loading ? { opacity: 0, position: "absolute" } : {}}
      />
      {error && <div className="media-error">Image unavailable</div>}
    </div>
  );
}

// ── MediaUploadButton — drop-in for the composer ──────────────────
export function MediaUploadButton({ onUploaded, disabled }) {
  const inputRef    = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err,       setErr]       = useState(null);

  async function handleFiles(files) {
    if (!files?.length) return;
    setErr(null);
    setUploading(true);
    try {
      const results = await Promise.all([...files].map(uploadFile));
      results.forEach(r => onUploaded(r));
    } catch (e) {
      setErr(e.message);
      setTimeout(() => setErr(null), 4000);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="media-upload-wrap">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: "none" }}
        onChange={e => handleFiles(e.target.files)}
      />
      <button
        type="button"
        className={`composer-attach-btn${uploading ? " uploading" : ""}`}
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        title="Attach media (EXIF stripped)"
        aria-label="Attach media"
      >
        {uploading ? "⏳" : "📎"}
      </button>
      {err && <div className="media-upload-err">{err}</div>}
    </div>
  );
}

// ── MediaGallery — full-screen lightbox for a list of URLs ────────
export function MediaGallery({ items, startIndex = 0, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const item = items[idx];
  if (!item) return null;

  return (
    <div className="media-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label="Media viewer">
      <div className="media-lightbox-inner" onClick={e => e.stopPropagation()}>
        <button className="media-lb-close" onClick={onClose} aria-label="Close">✕</button>
        {items.length > 1 && (
          <>
            <button className="media-lb-prev" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>‹</button>
            <button className="media-lb-next" onClick={() => setIdx(i => Math.min(items.length - 1, i + 1))} disabled={idx === items.length - 1}>›</button>
          </>
        )}
        <div className="media-lb-content">
          <MediaPreview url={item.url} mime={item.mime} alt={`Media ${idx + 1}`} />
        </div>
        <div className="media-lb-counter">{idx + 1} / {items.length}</div>
      </div>
    </div>
  );
}
