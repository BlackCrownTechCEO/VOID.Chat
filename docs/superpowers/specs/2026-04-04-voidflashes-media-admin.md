# VoidFlashes, Media Upload & Admin Panel Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge Owner Panel into Admin Panel as a tab, add real file/camera media upload, and implement VoidFlashes — ephemeral E2E-encrypted messages with view-once, self-destruct timer, screenshot alerts, and camera capture.

**Architecture:** All features live in the existing vanilla-JS + Socket.IO stack with no new dependencies. Media is handled client-side via `FileReader` (base64) and never written to disk on the server. VoidFlash encryption reuses the existing `VoidCrypto` ECDH + AES-GCM system in `crypto.js`. The Owner Panel HTML is removed and its logic migrated into the Admin Panel modal under a new `⭐ Owner` left-nav tab.

**Tech Stack:** Node.js + Express + Socket.IO 4.7.2 · Vanilla JS · WebCrypto API (`crypto.js`) · `getUserMedia` for camera · No new npm packages

---

## 1. Owner Panel → Admin Panel Tab

### What changes
- The `#ownerModal` overlay and all `.owner-panel` / `.owner-tab` elements are removed from `index.html`.
- A new `⭐ Owner` nav item is added at the bottom of `#adminModal`'s `.admin-nav`. It is hidden by default (`display:none`) and shown only when `amOwner === true`.
- A new `#adminTab-owner` `.admin-section` is added inside `.admin-content`. It contains the full Owner Panel content (MOTD, Announce, Bans, Stats, Filters, Settings, Audit, Transfer) inside a secondary `.owner-sub-tabs` horizontal tab row at the top.
- The `#ownerPanelBtn` sidebar button now calls `openAdminPanel()` and then activates the Owner tab directly instead of opening the separate modal.
- All JS in `app.js` that references `ownerModal` / `ownerTab-*` is updated to target the new `adminTab-owner` section and its sub-tabs.
- CSS: `.owner-sub-tabs` row uses the existing `.admin-cmd-search` and frosted-glass `.admin-card` pattern. The ⭐ nav item uses `--gold: #f5c842` accent.

### Owner sub-sections (preserved 1:1)
MOTD · Announce · Bans · Stats · Filters · Settings · Audit · Transfer

---

## 2. Real Media Upload

### Client (`app.js` + `index.html`)

The `#attachBtn` click handler is replaced. Clicking 📎 now:
1. Toggles a `.attach-menu` popup above the compose bar (three options: Image, File, Camera).
2. **Image / File** — hidden `<input type="file">` triggers `FileReader.readAsDataURL`. On load, the attachment is stored in a pending state (`_pendingAttachment = { name, mimeType, dataUrl }`). A preview chip appears in the compose bar. Pressing send includes the attachment.
3. **Camera** — opens `#cameraModal` (see §3).

### Sending attachments (`app.js`)
```js
// In sendMsg():
if (_pendingAttachment) {
  const payload = { name: myName, attach: _pendingAttachment, replyTo: replyingTo }
  // In DM context: encrypt attach.dataUrl with VoidCrypto before emit
  socket.emit('message', payload)   // or 'sendDm' in DM context
  _pendingAttachment = null
}
```

### Server (`index.js`)
The `message` handler already passes `text` through. It is extended to accept `attach: { name, mimeType, dataUrl }`. The server validates:
- `mimeType` must match `/^(image\/(png|jpeg|gif|webp|svg\+xml)|application\/pdf|text\/.*)$/`
- `dataUrl` length ≤ 7 340 032 chars (≈ 5 MB base64)

The attachment is stored in the room's message history exactly like text. It is broadcast as-is to all room members.

### Rendering (`app.js` — `renderMsg`)
If `msg.attach` is present:
```js
// Image types → inline <img> with lightbox
if (msg.attach.mimeType.startsWith('image/')) {
  attachHtml = `<img src="${escHtml(msg.attach.dataUrl)}" class="msg-image msg-image--upload" 
    alt="${escHtml(msg.attach.name)}" loading="lazy"
    onclick="openLightbox(this.src)">`
} else {
  // Non-image → download link
  attachHtml = `<a class="msg-file-link" href="${escHtml(msg.attach.dataUrl)}" 
    download="${escHtml(msg.attach.name)}">${escHtml(msg.attach.name)}</a>`
}
```

### CSS (`style.css`)
```css
.msg-image--upload { max-width: min(320px, 90%); border-radius: 10px; cursor: zoom-in; }
.msg-file-link { color: var(--cyan); text-decoration: underline; font-size: .82rem; }
.attach-menu { position: absolute; bottom: 56px; left: 0; background: var(--bg2);
  border: 1px solid var(--bdr); border-radius: 12px; padding: 8px;
  display: flex; gap: 8px; z-index: 10; }
.attach-opt { flex: 1; text-align: center; padding: 10px 8px; border-radius: 8px;
  background: var(--bg3); border: 1px solid var(--bdr); cursor: pointer; font-size: .8rem; }
.attach-chip { display: flex; align-items: center; gap: 6px; padding: 4px 10px;
  background: var(--bg3); border: 1px solid var(--bdr); border-radius: 20px;
  font-size: .78rem; color: var(--tx2); margin-bottom: 6px; }
.attach-chip__remove { cursor: pointer; color: var(--red); }
#lightboxOverlay { position: fixed; inset: 0; background: #000c; z-index: 9999;
  display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
#lightboxOverlay img { max-width: 90vw; max-height: 90vh; border-radius: 10px; }
```

---

## 3. Camera Capture

### HTML (`index.html`)
A `#cameraModal` overlay is added (hidden by default):
```html
<div class="modal-overlay" id="cameraModal" style="display:none">
  <div class="modal modal--camera">
    <video id="cameraPreview" autoplay playsinline muted></video>
    <div class="camera-controls">
      <button id="camFlipBtn">🔄</button>
      <button id="camShutterBtn" class="shutter-btn"></button>
      <button id="camCloseBtn">✕</button>
    </div>
    <canvas id="cameraCanvas" style="display:none"></canvas>
  </div>
</div>
```

### JS (`app.js`)
```js
let _camStream = null
let _facingMode = 'user'

async function openCamera() {
  cameraModal.style.display = 'flex'
  _camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: _facingMode }, audio: false })
  cameraPreview.srcObject = _camStream
}

function captureFrame() {
  cameraCanvas.width  = cameraPreview.videoWidth
  cameraCanvas.height = cameraPreview.videoHeight
  cameraCanvas.getContext('2d').drawImage(cameraPreview, 0, 0)
  const dataUrl = cameraCanvas.toDataURL('image/jpeg', 0.85)
  closeCamera()
  _pendingAttachment = { name: 'camera.jpg', mimeType: 'image/jpeg', dataUrl }
  showAttachChip()
}

function closeCamera() {
  _camStream?.getTracks().forEach(t => t.stop())
  _camStream = null
  cameraModal.style.display = 'none'
}
```

`#camFlipBtn` toggles `_facingMode` between `'user'` and `'environment'` and restarts stream. Falls back to `<input type="file" accept="image/*" capture="environment">` if `getUserMedia` throws `NotAllowedError` or `NotFoundError`.

### CSS
```css
.modal--camera { background: #000; border-radius: 18px; overflow: hidden;
  width: min(480px, 95vw); aspect-ratio: 4/3; position: relative; padding: 0; }
#cameraPreview { width: 100%; height: 100%; object-fit: cover; display: block; }
.camera-controls { position: absolute; bottom: 16px; left: 0; right: 0;
  display: flex; justify-content: center; align-items: center; gap: 20px; }
.shutter-btn { width: 60px; height: 60px; border-radius: 50%;
  background: #fff; border: 4px solid #aaa; cursor: pointer; }
```

---

## 4. VoidFlashes

### Concept
A VoidFlash is a message (text or image) that is:
1. Encrypted with AES-GCM before leaving the sender's device.
2. Shown as a blurred overlay to the recipient until they tap it.
3. Automatically deleted on both sides after a timer (or immediately on view for view-once).

VoidFlashes work in DMs **and** room chats. In DMs, the shared ECDH key is used. In rooms, a per-room AES key (already in `VoidCrypto.generateRoomKey`) is used if available, otherwise the flash is sent with a server-generated nonce (best-effort encryption).

### Data shape
```js
// VoidFlash message extra fields (added to normal msg object)
{
  voidFlash: true,
  vfExpiry: 5000,      // ms after open; 0 = view-once (delete on first view)
  vfCipher: 'base64',  // AES-GCM ciphertext of { text, attach? }
  vfIv:     'base64',  // AES-GCM IV
  vfThumb:  null       // optional blurred thumbnail for image flashes (base64, 32×32)
}
```

### Compose UI (`index.html` + `app.js`)

The ⚡ button next to 📎 toggles `_vfMode`. When active:
```html
<!-- VoidFlash bar, shown above compose row when _vfMode is true -->
<div id="vfBar" style="display:none">
  <span>⚡ VOIDFLASH</span>
  <button class="vf-timer" data-ms="0">👁 Once</button>
  <button class="vf-timer" data-ms="3000">3s</button>
  <button class="vf-timer" data-ms="5000">5s</button>
  <button class="vf-timer" data-ms="10000">10s</button>
  <button class="vf-timer" data-ms="30000">30s</button>
</div>
```

`_vfExpiry` defaults to `0` (view-once). Clicking a timer chip sets `_vfExpiry`.

### Helper functions (define in `app.js`)
```js
// isDm: boolean — true when the current view is a DM conversation (existing var in app.js)
// currentDmVoidId: string — the voidId of the DM partner (existing var in app.js)

function makeThumb(dataUrl) {
  // Downscale image to 32×32 JPEG for preview blur thumbnail
  const c = document.createElement('canvas'); c.width = 32; c.height = 32
  const img = new Image(); img.src = dataUrl
  c.getContext('2d').drawImage(img, 0, 0, 32, 32)
  return c.toDataURL('image/jpeg', 0.5)
}

function showAttachChip() {
  // Show the pending attachment chip above compose bar
  const chip = $('attachChip')
  chip.style.display = 'flex'
  chip.querySelector('.attach-chip__name').textContent = _pendingAttachment.name
}

function buildVfContent(text, attach, vfExpiry) {
  // Returns innerHTML for an opened VoidFlash — text/image + countdown bar
  const imgHtml = attach?.mimeType.startsWith('image/')
    ? `<img src="${escHtml(attach.dataUrl)}" class="msg-image msg-image--upload vf-image">`  : ''
  const textHtml = text ? `<div class="vf-text">${escHtml(text)}</div>` : ''
  const timerHtml = vfExpiry > 0
    ? `<div class="vf-countdown-wrap"><div class="vf-countdown" style="width:100%"></div></div>` : ''
  return `<div class="vf-opened">${imgHtml}${textHtml}${timerHtml}
    <div class="vf-burning">🔥 ${vfExpiry === 0 ? 'View once' : `Burning…`}</div>
    <div class="e2e-lock">🔒 E2E</div></div>`
}
```

### Sending a VoidFlash (`app.js`)
```js
async function sendVoidFlash(text, attach) {
  const payload = JSON.stringify(attach ? { text, attach } : { text })
  let vfCipher, vfIv
  const dmPartnerPubKey = isDm ? knownPublicKeys.get(currentDmVoidId) : null
  const key = isDm ? (dmPartnerPubKey ? await VoidCrypto.deriveSharedKey(dmPartnerPubKey) : null)
                   : VoidCrypto.getRoomKey(currentRoom)
  if (key) {
    ({ ciphertext: vfCipher, iv: vfIv } = await VoidCrypto.encryptMsg(payload, key))
  } else {
    // fallback: send as-is with warning flag
    vfCipher = btoa(payload); vfIv = null
  }
  const event = isDm ? 'sendDm' : 'message'
  socket.emit(event, { name: myName, voidFlash: true, vfExpiry: _vfExpiry,
    vfCipher, vfIv, vfThumb: attach ? makeThumb(attach.dataUrl) : null, replyTo: replyingTo })
}
```

### Receiving & rendering (`app.js`)

In `renderMsg`, add a check at the top: if `msg.voidFlash` is true, call `renderVoidFlash(msg, li)` and return early (skip normal text rendering).

```js
function renderVoidFlash(msg, li) {
  li.classList.add('msg--voidflash')
  // Store msg object on the element so openVoidFlash can access it
  li.dataset.vfMsg = JSON.stringify({ id: msg.id, vfExpiry: msg.vfExpiry, vfCipher: msg.vfCipher, vfIv: msg.vfIv, name: msg.name })
  li.innerHTML = `
    <div class="vf-overlay" data-mid="${escHtml(msg.id)}" onclick="openVoidFlash(this)">
      <span class="vf-icon">⚡</span>
      <div>
        <div class="vf-from">VoidFlash from ${escHtml(msg.name)}</div>
        <div class="vf-meta">
          ${msg.vfExpiry === 0 ? '👁 View once' : `⏱ ${msg.vfExpiry/1000}s`} · 🔒 E2E
        </div>
      </div>
      <span class="vf-tap">TAP →</span>
    </div>`
}
```

### Opening a VoidFlash (`app.js`)
```js
async function openVoidFlash(el) {
  const li = el.closest('.msg--voidflash')
  const msg = JSON.parse(li.dataset.vfMsg)
  // 1. Decrypt
  const dmPartnerPubKey = isDm ? knownPublicKeys.get(currentDmVoidId) : null
  const key = isDm ? (dmPartnerPubKey ? await VoidCrypto.deriveSharedKey(dmPartnerPubKey) : null)
                   : VoidCrypto.getRoomKey(currentRoom)
  const plain = key && msg.vfIv
    ? await VoidCrypto.decryptMsg(msg.vfCipher, msg.vfIv, key)
    : atob(msg.vfCipher)
  const { text, attach } = JSON.parse(plain)

  // 2. Replace overlay with content + timer
  el.closest('.msg--voidflash').innerHTML = buildVfContent(text, attach, msg.vfExpiry)

  // 3. Start burn timer
  if (msg.vfExpiry === 0) {
    deleteVoidFlash(msg.id)
  } else {
    startBurnTimer(msg.id, msg.vfExpiry)
  }

  // 4. Screenshot detection
  attachScreenshotGuard(msg.id, msg.name)
}
```

### Burn timer + deletion (`app.js`)
```js
function startBurnTimer(msgId, ms) {
  const el = document.querySelector(`[data-mid="${msgId}"] .vf-countdown`)
  let remaining = ms
  const iv = setInterval(() => {
    remaining -= 100
    if (el) el.style.width = (remaining / ms * 100) + '%'
    if (remaining <= 0) { clearInterval(iv); deleteVoidFlash(msgId) }
  }, 100)
}

function deleteVoidFlash(msgId) {
  document.querySelector(`[data-mid="${msgId}"]`)
    ?.closest('.msg--voidflash')
    ?.replaceWith((() => {
        const g = document.createElement('li')
        g.className = 'msg msg--ghost'
        g.textContent = '⚡ VoidFlash opened · deleted'
        return g
      })())
  socket.emit('voidFlashOpened', { msgId })
}
```

### Server-side (`index.js`)
```js
socket.on('voidFlashOpened', ({ msgId }) => {
  const u = Users.get(socket.id)
  if (!u) return
  // Delete from room history
  Rooms.delMsg(u.room, msgId)
  // Notify room to remove the flash from their UI
  io.to(u.room).emit('deleteMsg', { msgId })
})
```

For DMs, `sendDm` is extended to accept `voidFlash`, `vfExpiry`, `vfCipher`, `vfIv`, `vfThumb`. The server relays these as-is (it never decrypts them). `voidFlashOpened` in DM context uses `DMs.delMsg`.

**Important:** The server's `message` handler must store `fromVoidId: socket.data.voidId` on the message object for VoidFlash messages so the screenshot handler can look up the sender. Add this inside the existing `buildMsg` call for VoidFlash messages:
```js
if (voidFlash) msg.fromVoidId = socket.data.voidId
```

### Screenshot detection (`app.js`)
```js
function attachScreenshotGuard(msgId, senderName) {
  const handler = () => socket.emit('vfScreenshot', { msgId })
  document.addEventListener('visibilitychange', handler, { once: true })
  // Also detect PrintScreen key
  document.addEventListener('keyup', e => {
    if (e.key === 'PrintScreen') socket.emit('vfScreenshot', { msgId })
  }, { once: true })
}
```

Server forwards `vfScreenshot` to the original sender:
```js
socket.on('vfScreenshot', ({ msgId }) => {
  const u = Users.get(socket.id)
  if (!u) return
  // Find the original sender's socket from room or DM history
  const msg = Rooms.history(u.room).find(m => m.id === msgId)
  if (!msg) return
  const senderSid = VoidSockets.sid(msg.fromVoidId || '')
  if (senderSid) io.to(senderSid).emit('vfScreenshotAlert', { byName: u.name, msgId })
})
```

Client shows a toast: `"👀 ${byName} screenshotted your VoidFlash"`.

---

## 5. Real E2E on DMs

`sendDm` in `app.js` is updated:
```js
async function emitDm(toVoidId, text, attach) {
  const theirPub = knownPublicKeys.get(toVoidId)
  if (theirPub) {
    const key = await VoidCrypto.deriveSharedKey(theirPub)
    const payload = JSON.stringify(attach ? { text, attach } : { text })
    const { ciphertext, iv } = await VoidCrypto.encryptMsg(payload, key)
    socket.emit('sendDm', { toVoidId, ciphertext, iv, e2e: true })
  } else {
    socket.emit('sendDm', { toVoidId, text, e2e: false })
    showToast('⚠ Sent unencrypted — recipient not online')
  }
}
```

`knownPublicKeys` is a `Map<voidId, pubKeyB64>` populated via the existing `publicKeys` socket event. The server already broadcasts `publishKey` to all sockets on connect — the client just needs to store it.

On receive, `dm` event handler:
```js
socket.on('dm', async ({ msg, withVoidId }) => {
  if (msg.e2e && msg.ciphertext) {
    const theirPub = knownPublicKeys.get(withVoidId)
    if (theirPub) {
      const key = await VoidCrypto.deriveSharedKey(theirPub)
      const plain = await VoidCrypto.decryptMsg(msg.ciphertext, msg.iv, key)
      const { text, attach } = JSON.parse(plain)
      msg.text = text
      msg.attach = attach
    }
  }
  renderDmMsg(msg)
})
```

The `sendDm` server handler passes through `ciphertext`/`iv` unchanged (it already passes `text` through; the same relay logic works).

---

## Files Modified

| File | Change |
|---|---|
| `server/public/index.html` | Remove `#ownerModal`; add Owner tab + sub-sections in admin; add `#vfBar`, `#cameraModal`, `#lightboxOverlay`; update `📎` button area |
| `server/public/app.js` | Owner tab migration; attach menu + FileReader; camera open/capture/close; VoidFlash compose/render/open/burn/delete; DM E2E wiring; screenshot guard |
| `server/public/style.css` | Owner nav item (gold accent); attach menu + chip; camera modal; VoidFlash overlay/countdown/ghost; lightbox; msg-image--upload |
| `server/index.js` | `message` handler: validate + relay `attach`; `sendDm`: relay `ciphertext/iv`; new `voidFlashOpened` handler; new `vfScreenshot` handler |

No new files. No new npm packages.
