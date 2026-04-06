# VOID.Chat — Pre-Alpha v1

VØID is a secure, end-to-end encrypted social platform — alias-based, metadata-minimized, and modular.

---

This build upgrades the previous production starter with a real end-to-end encrypted direct-message protocol foundation:

- browser identity generation
- signed prekey bundle registration
- X3DH-style session bootstrap
- symmetric ratchet chain keys
- AES-GCM message encryption
- opaque encrypted envelopes on the backend
- per-user encrypted inbox delivery over Socket.IO

## Important
This is a strong working protocol foundation, but it is **not a formally audited full Signal implementation**.
It implements:
- identity key agreement
- prekey-based session setup
- session persistence
- envelope transport

It does **not** yet implement:
- a full DH Double Ratchet
- skipped message key replay windows
- multi-device session reconciliation
- production-secure browser key storage (use IndexedDB/non-exportable CryptoKey next)

## Quick start
```bash
npm install
npm run install:all
npm run dev:backend
npm run dev:web
```

Open two browser windows.
Each gets a local alias and registers a bundle.
Set each other's alias as the peer and start chatting.

## Environment
Backend runs on `http://localhost:3500`
Frontend runs on `http://localhost:5173`
