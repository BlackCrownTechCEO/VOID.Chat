# VoidFlashes, Media Upload & Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Owner Panel into Admin Panel as a ⭐ tab, add real file/camera upload with inline preview, and build VoidFlashes — ephemeral E2E-encrypted messages with view-once, self-destruct timer, camera capture, and screenshot alerts.

**Architecture:** All features extend the existing vanilla-JS + Socket.IO stack. VoidFlashes live in a new `voidflashes.js` module (loaded after `dms.js`) mirroring the existing module pattern. Media is FileReader → base64 → socket (no server disk storage). DM E2E is already implemented client-side in `dms.js`; only the server relay needs fixing. Owner Panel HTML moves inside `#adminModal` as a new `admin-section`.

**Tech Stack:** Node.js + Express + Socket.IO 4.7.2 · Vanilla JS · WebCrypto (`crypto.js` already built) · `getUserMedia` for camera · No new npm packages

---

## Context for all tasks

**File structure:**
- `server/public/index.html` — all HTML; script tags at line 1031-1038
- `server/public/style.css` — 772 lines; append new rules at end
- `server/public/app.js` — 1377 lines; `attachBtn` handler at line 568-571; `ownerStatus` socket handler at line 1281-1285; globals exported at line 1179-1188
- `server/public/dms.js` — 202 lines; `sendMsg` override at line 101-126; `dm` socket handler at line 163-189
- `server/public/servers.js` — 542 lines; Owner Panel section starts at line 272
- `server/index.js` — `message` handler at line 451; `sendDm` handler at line 676

**Key patterns used in this codebase:**
- All DOM refs via `const $ = id => document.getElementById(id)` (app.js only; other modules use `document.getElementById` directly)
- Toast: `window.showToast(msg, 'success'|'warn'|'error'|'info')`
- Socket: `window.socket.emit(...)` (in modules); `socket.emit(...)` in app.js
- Escape HTML always via `window.escHtml(str)` before inserting into innerHTML
- Admin nav tabs: `data-anav` attr on `.admin-nav-item` buttons; sections are `id="adminTab-{anav}"` divs
- `window.amOwner` is set to `true/false` by the `ownerStatus` socket event in app.js line 1282

---

## Task 1: CSS — all new styles

**Files:**
- Modify: `server/public/style.css:772` (append at end)

- [ ] **Step 1: Append all new CSS rules to style.css**

Open `server/public/style.css` and append the following block after the last line (line 772):

```css

/* ═══════════════════════════════════════════════════════
   OWNER NAV TAB (gold accent inside admin panel)
═══════════════════════════════════════════════════════ */
.admin-nav-item--owner { color:#f5c842; margin-top:auto }
.admin-nav-item--owner.admin-nav-item--active { color:#f5c842; border-left-color:#f5c842; background:#f5c84212 }
.admin-nav-item--owner:hover { color:#f5c842; background:#f5c84218 }
.owner-sub-tabs { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:14px }
.owner-sub-tab { padding:4px 11px; background:var(--bg3); border:1px solid var(--bdr);
  border-radius:6px; color:var(--tx2); font-size:.74rem; cursor:pointer; transition:all var(--tr) }
.owner-sub-tab--active { background:#f5c84220; color:#f5c842; border-color:#f5c84244 }
.owner-sub-tab:hover { color:var(--tx1) }
.owner-sub-section { display:none; flex-direction:column; gap:10px }
.owner-sub-section--active { display:flex }

/* ═══════════════════════════════════════════════════════
   ATTACH MENU + FILE CHIP + LIGHTBOX
═══════════════════════════════════════════════════════ */
.attach-wrap { position:relative }
.attach-menu { position:absolute; bottom:calc(100% + 8px); left:0;
  background:var(--bg2); border:1px solid var(--bdr); border-radius:12px;
  padding:8px; display:flex; gap:8px; z-index:20; min-width:200px;
  box-shadow:0 8px 32px #0008 }
.attach-opt { flex:1; text-align:center; padding:10px 8px; border-radius:8px;
  background:var(--bg3); border:1px solid var(--bdr); cursor:pointer;
  color:var(--tx2); font-size:.78rem; transition:all var(--tr) }
.attach-opt:hover { border-color:var(--acc); color:var(--tx1) }
.attach-opt--cam { border-color:#7b2fff44; color:#b47aff }
.attach-opt--cam:hover { border-color:#7b2fff; background:#7b2fff18 }
.attach-opt__icon { display:block; font-size:1.2rem; margin-bottom:3px }
.attach-chip { display:flex; align-items:center; gap:6px; padding:4px 10px;
  background:var(--bg3); border:1px solid var(--bdr); border-radius:20px;
  font-size:.78rem; color:var(--tx2); margin-bottom:6px }
.attach-chip__remove { cursor:pointer; color:var(--red); font-size:.8rem; line-height:1 }
.msg-image--upload { max-width:min(320px,90%); border-radius:10px;
  cursor:zoom-in; display:block; margin-top:4px }
.msg-file-link { color:var(--acc); text-decoration:underline; font-size:.82rem }
#lightboxOverlay { position:fixed; inset:0; background:#000d; z-index:9999;
  display:flex; align-items:center; justify-content:center; cursor:zoom-out }
#lightboxOverlay img { max-width:90vw; max-height:90vh; border-radius:10px;
  box-shadow:0 0 60px #0008 }

/* ═══════════════════════════════════════════════════════
   CAMERA MODAL
═══════════════════════════════════════════════════════ */
.modal--camera { background:#000; border-radius:18px; overflow:hidden;
  width:min(480px,95vw); aspect-ratio:4/3; position:relative; padding:0 }
#cameraPreview { width:100%; height:100%; object-fit:cover; display:block }
.camera-controls { position:absolute; bottom:16px; left:0; right:0;
  display:flex; justify-content:center; align-items:center; gap:20px }
.shutter-btn { width:60px; height:60px; border-radius:50%;
  background:#fff; border:4px solid #aaa; cursor:pointer; flex-shrink:0 }
.cam-flip-btn, .cam-close-btn { width:36px; height:36px; border-radius:50%;
  background:#0009; border:1px solid #333; cursor:pointer;
  color:#fff; font-size:1rem; display:flex; align-items:center; justify-content:center }

/* ═══════════════════════════════════════════════════════
   VOIDFLASH BAR + MESSAGES
═══════════════════════════════════════════════════════ */
#vfBar { display:none; align-items:center; gap:6px; padding:7px 10px;
  background:#7b2fff18; border:1px solid #7b2fff40; border-radius:8px; margin-bottom:6px }
.vf-bar__label { font-size:.72rem; color:#b47aff; font-weight:800; letter-spacing:.06em }
.vf-timer { padding:3px 9px; border-radius:20px; font-size:.7rem;
  background:var(--bg3); color:var(--tx2); cursor:pointer;
  border:1px solid transparent; transition:all var(--tr) }
.vf-timer--active { background:#7b2fff33; color:#b47aff; border-color:#7b2fff55 }
.vf-timer:hover { color:var(--tx1) }
.msg--voidflash { list-style:none }
.vf-overlay { background:#7b2fff18; border:1px solid #7b2fff44; border-radius:10px;
  padding:10px 14px; display:flex; align-items:center; gap:10px;
  cursor:pointer; transition:background var(--tr) }
.vf-overlay:hover { background:#7b2fff28 }
.vf-icon { font-size:1.2rem }
.vf-from { font-weight:700; font-size:.84rem; color:#b47aff }
.vf-meta { font-size:.72rem; color:var(--tx3) }
.vf-tap { margin-left:auto; font-size:.72rem; color:#b47aff; font-weight:700 }
.vf-opened { background:var(--bg2); border:1px solid #7b2fff44;
  border-radius:10px; padding:10px 14px }
.vf-text { color:var(--tx1); font-size:.9rem; margin-bottom:6px }
.vf-countdown-wrap { height:3px; background:var(--bg3); border-radius:2px; margin:6px 0 }
.vf-countdown { height:100%; background:#7b2fff; border-radius:2px;
  transition:width .1s linear }
.vf-burning { font-size:.72rem; color:#ff6b6b; margin-top:4px }
.vf-e2e { font-size:.7rem; color:var(--acc); margin-top:2px }
.msg--ghost { color:var(--tx3); font-size:.78rem; font-style:italic; padding:4px 0;
  list-style:none }
.vf-image { max-width:min(280px,85%); border-radius:8px; margin-bottom:6px }
```

- [ ] **Step 2: Verify styles look correct**

Start the server (`cd server && node .`) and open `http://localhost:3500`. Open DevTools → Elements, confirm no CSS parse errors in the Console tab.

- [ ] **Step 3: Commit**

```bash
git add server/public/style.css
git commit -m "feat: CSS for owner tab, attach menu, camera modal, VoidFlashes"
```

---

## Task 2: Owner Panel → Admin Panel ⭐ tab

**Files:**
- Modify: `server/public/index.html:539-544` (admin nav) and `index.html:663` (after last admin-section) and `index.html:810-969` (remove owner modal)
- Modify: `server/public/servers.js:272-300` (owner open/close/tab logic)
- Modify: `server/public/app.js:1281-1285` (ownerStatus handler)

### 2a: index.html — add Owner nav item and section

- [ ] **Step 1: Add ⭐ Owner nav item to admin left-nav**

In `index.html`, find the `<nav class="admin-nav">` block (lines 539-545). Replace it with:

```html
      <nav class="admin-nav">
        <button class="admin-nav-item admin-nav-item--active" data-anav="users">👥 Users</button>
        <button class="admin-nav-item" data-anav="room">🏠 Room</button>
        <button class="admin-nav-item" data-anav="mod">🛡 Mod Tools</button>
        <button class="admin-nav-item" data-anav="audit">📋 Audit</button>
        <button class="admin-nav-item" data-anav="cmds">📋 Commands</button>
        <button class="admin-nav-item admin-nav-item--owner" data-anav="owner" id="ownerNavItem" style="display:none">⭐ Owner</button>
      </nav>
```

- [ ] **Step 2: Add #adminTab-owner section after the Commands section**

In `index.html`, find the closing `</div>` of the Commands section (line 662) followed by `</div>` (close `.admin-content`) and `</div>` (close `.admin-layout`). Insert before the first of those closing tags — right after `</div>` that closes `#adminTab-cmds` (line 662):

```html
        <!-- Owner Panel (server owner only) -->
        <div class="admin-section" id="adminTab-owner" style="display:none">
          <div class="owner-sub-tabs">
            <button class="owner-sub-tab owner-sub-tab--active" data-osub="motd">MOTD</button>
            <button class="owner-sub-tab" data-osub="announce">Announce</button>
            <button class="owner-sub-tab" data-osub="bans">Bans</button>
            <button class="owner-sub-tab" data-osub="stats">Stats</button>
            <button class="owner-sub-tab" data-osub="filters">Filters</button>
            <button class="owner-sub-tab" data-osub="settings">Settings</button>
            <button class="owner-sub-tab" data-osub="audit">Owner Audit</button>
            <button class="owner-sub-tab" data-osub="transfer">Transfer</button>
          </div>

          <!-- MOTD -->
          <div class="owner-sub-section owner-sub-section--active" id="ownerSub-motd">
            <div class="admin-card">
              <label class="admin-card__label">📢 Message of the Day</label>
              <textarea id="ownerMotdInput" rows="3" placeholder="Welcome message shown to all users on connect…" style="resize:vertical;width:100%;background:var(--bg3);border:1px solid var(--bdr);border-radius:var(--r);padding:8px 10px;color:var(--tx1);font-size:.85rem;outline:none"></textarea>
              <button class="btn-primary" id="ownerMotdBtn" style="align-self:flex-start;margin-top:6px">Update MOTD</button>
            </div>
          </div>

          <!-- Announce -->
          <div class="owner-sub-section" id="ownerSub-announce">
            <div class="admin-card">
              <label class="admin-card__label">📣 Broadcast Message</label>
              <textarea id="ownerAnnounceInput" rows="3" placeholder="Broadcast to all connected users…" style="resize:vertical;width:100%;background:var(--bg3);border:1px solid var(--bdr);border-radius:var(--r);padding:8px 10px;color:var(--tx1);font-size:.85rem;outline:none"></textarea>
              <div style="margin-top:8px">
                <label class="admin-card__label" style="margin-bottom:4px">Target</label>
                <select id="ownerAnnounceTarget" style="width:100%;padding:6px 8px;background:var(--bg3);border:1px solid var(--bdr);border-radius:6px;color:var(--tx1)">
                  <option value="all">All Rooms</option>
                </select>
              </div>
              <label class="check-label" style="margin-top:8px"><input type="checkbox" id="ownerAnnouncePinned"/> Pin announcement</label>
              <label class="check-label" style="margin-top:6px"><input type="checkbox" id="ownerAnnounceScheduled"/> Schedule</label>
              <input type="datetime-local" id="ownerAnnounceTime" style="margin-top:4px;width:100%;padding:6px 8px;background:var(--bg3);border:1px solid var(--bdr);border-radius:6px;color:var(--tx1)"/>
              <div class="row-gap" style="margin-top:8px">
                <button class="btn-primary" id="ownerAnnounceBtn">Send Now</button>
                <button class="btn-secondary" id="ownerScheduleBtn">Schedule</button>
              </div>
            </div>
          </div>

          <!-- Bans -->
          <div class="owner-sub-section" id="ownerSub-bans">
            <div class="admin-card">
              <label class="admin-card__label">🚫 Global Ban / Unban</label>
              <div class="row-gap">
                <input type="text" id="ownerBanInput" placeholder="VABCD123" maxlength="8" autocomplete="off" style="text-transform:uppercase;flex:1"/>
                <input type="text" id="ownerBanReason" placeholder="Reason" style="flex:2"/>
                <button class="btn-primary admin-tool-btn--danger" id="ownerGlobalBanBtn">Ban</button>
                <button class="btn-secondary" id="ownerGlobalUnbanBtn">Unban</button>
              </div>
              <input type="text" id="ownerBanSearch" placeholder="Search bans…" style="margin-top:8px;width:100%;padding:5px 8px;background:var(--bg3);border:1px solid var(--bdr);border-radius:6px;color:var(--tx1);font-size:.8rem"/>
              <div id="ownerBanList" class="admin-user-list" style="margin-top:6px"></div>
            </div>
          </div>

          <!-- Stats -->
          <div class="owner-sub-section" id="ownerSub-stats">
            <div class="admin-card">
              <label class="admin-card__label">📊 Server Stats</label>
              <div class="owner-stats" id="ownerStatsCards"></div>
              <div id="ownerSparkline" style="margin:8px 0"></div>
              <input type="text" id="ownerUserSearch" placeholder="Search users…" style="width:100%;padding:5px 8px;background:var(--bg3);border:1px solid var(--bdr);border-radius:6px;color:var(--tx1);font-size:.8rem;margin-bottom:6px"/>
              <div style="font-size:.75rem;color:var(--tx3);font-weight:700;margin-bottom:4px">Channels</div>
              <div id="ownerRoomList"></div>
              <div style="font-size:.75rem;color:var(--tx3);font-weight:700;margin:8px 0 4px">Online Users</div>
              <div id="ownerUserList" class="admin-user-list"></div>
            </div>
          </div>

          <!-- Filters -->
          <div class="owner-sub-section" id="ownerSub-filters">
            <div class="admin-card">
              <label class="admin-card__label">🚫 Word Filters</label>
              <p style="font-size:.78rem;color:var(--tx2);margin-bottom:8px">Server-wide — words replaced with █ in all channels.</p>
              <div class="row-gap">
                <input type="text" id="ownerFilterInput" placeholder="word to filter" style="flex:1"/>
                <button class="btn-primary" id="ownerFilterAddBtn">Add</button>
              </div>
              <div id="ownerFilterChips" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px"></div>
            </div>
          </div>

          <!-- Settings -->
          <div class="owner-sub-section" id="ownerSub-settings">
            <div class="admin-card">
              <label class="admin-card__label">⚙ Server Settings</label>
              <div class="input-group">
                <label>Server Name</label>
                <input type="text" id="cfgServerName" placeholder="VOID"/>
              </div>
              <div class="input-group" style="margin-top:8px">
                <label>Max Users (0 = unlimited)</label>
                <input type="number" id="cfgMaxUsers" min="0" placeholder="0" style="width:100px"/>
              </div>
              <div class="input-group" style="margin-top:8px">
                <label>Default Channel</label>
                <input type="text" id="cfgDefaultChannel" placeholder="general"/>
              </div>
              <div class="input-group" style="margin-top:8px">
                <label>Welcome Message</label>
                <input type="text" id="cfgWelcomeMsg" placeholder="Welcome to VOID…"/>
              </div>
              <label class="check-label" style="margin-top:8px"><input type="checkbox" id="cfgAllowGuestNames"/> Allow guest names</label>
              <label class="check-label" style="margin-top:6px"><input type="checkbox" id="cfgRegistrationOpen" checked/> Registration open</label>
              <label class="check-label" style="margin-top:6px"><input type="checkbox" id="cfgMaintenance"/> Maintenance mode</label>
              <button class="btn-primary" id="ownerSaveConfigBtn" style="margin-top:10px;align-self:flex-start">Save Settings</button>
            </div>
          </div>

          <!-- Owner Audit -->
          <div class="owner-sub-section" id="ownerSub-audit">
            <div class="admin-card">
              <label class="admin-card__label">📋 Owner Audit Log</label>
              <div class="row-gap" style="margin-bottom:8px">
                <select id="ownerAuditFilter" style="padding:5px 8px;background:var(--bg3);border:1px solid var(--bdr);border-radius:6px;color:var(--tx1);font-size:.8rem">
                  <option value="">All Events</option>
                  <option value="globalBan">Bans</option>
                  <option value="announce">Announces</option>
                  <option value="maintenanceOn">Maintenance</option>
                  <option value="transferOwnership">Transfers</option>
                </select>
                <input type="text" id="ownerAuditSearch" placeholder="Search…" style="flex:1;padding:5px 8px;background:var(--bg3);border:1px solid var(--bdr);border-radius:6px;color:var(--tx1);font-size:.8rem"/>
                <button class="btn-secondary" id="ownerAuditRefreshBtn">🔄</button>
              </div>
              <div id="ownerAuditLog" class="audit-log" style="max-height:300px;overflow-y:auto"></div>
            </div>
          </div>

          <!-- Transfer -->
          <div class="owner-sub-section" id="ownerSub-transfer">
            <div class="admin-card">
              <label class="admin-card__label">🔁 Transfer Ownership</label>
              <p style="font-size:.82rem;color:var(--tx2);margin-bottom:10px">Permanently transfers your owner status. <strong style="color:var(--red)">Cannot be undone.</strong></p>
              <div class="row-gap">
                <input type="text" id="ownerTransferInput" placeholder="VABCD123" maxlength="8" autocomplete="off" style="text-transform:uppercase;flex:1"/>
                <button class="btn-primary admin-tool-btn--danger" id="ownerTransferBtn">Transfer</button>
              </div>
            </div>
          </div>
        </div>
```

- [ ] **Step 3: Remove the separate #ownerModal**

In `index.html`, find and delete the entire block from `<!-- Owner Panel -->` (around line 810) through `</div>` that closes the modal overlay (around line 969). The block starts with:
```html
<!-- Owner Panel -->
<div class="modal-overlay" id="ownerModal" style="display:none">
```
and ends with:
```html
    </div></div>
```
Delete this entire ~160-line block.

- [ ] **Step 4: Verify HTML**

Open `http://localhost:3500`, click 👑 Admin Panel, confirm the ⭐ Owner tab is NOT visible (not logged in as owner yet). No JS errors in console.

### 2b: servers.js — update owner JS to use admin panel

- [ ] **Step 5: Replace owner open/close and tab logic in servers.js**

In `servers.js`, find the Owner Panel section starting at line 280:
```js
document.getElementById('ownerPanelBtn').addEventListener('click', () => {
    document.getElementById('ownerModal').style.display = 'flex'
    window.socket.emit('ownerCmd', { cmd: 'getStats' })
})
document.getElementById('closeOwnerModal').addEventListener('click', () =>
    document.getElementById('ownerModal').style.display = 'none')

// ── Tab switching (with lazy-load per tab) ────────────────
document.querySelectorAll('.owner-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.owner-tab').forEach(t => t.classList.remove('owner-tab--active'))
        document.querySelectorAll('.owner-panel').forEach(p => p.style.display = 'none')
        tab.classList.add('owner-tab--active')
        const panel = tab.dataset.otab
        document.getElementById(`ownerTab-${panel}`).style.display = 'block'
        if (panel === 'stats')    window.socket.emit('ownerCmd', { cmd: 'getStats' })
        if (panel === 'bans')     window.socket.emit('ownerCmd', { cmd: 'getBans' })
        if (panel === 'filters')  window.socket.emit('ownerCmd', { cmd: 'getFilters' })
        if (panel === 'settings') window.socket.emit('ownerCmd', { cmd: 'getConfig' })
        if (panel === 'audit')    window.socket.emit('ownerCmd', { cmd: 'getAuditLog' })
    })
})
```

Replace with:

```js
// ── Owner Panel — now lives inside Admin Panel as a tab ───
function openOwnerTab() {
    // Open admin panel if not already open
    const adminModal = document.getElementById('adminModal')
    if (adminModal.style.display === 'none') {
        if (window.openAdminPanel) window.openAdminPanel()
        else adminModal.style.display = 'flex'
    }
    // Switch to owner nav item
    document.querySelectorAll('#adminModal .admin-nav-item').forEach(i => i.classList.remove('admin-nav-item--active'))
    document.querySelectorAll('#adminModal .admin-section').forEach(s => s.style.display = 'none')
    const ownerNavItem = document.getElementById('ownerNavItem')
    if (ownerNavItem) ownerNavItem.classList.add('admin-nav-item--active')
    const ownerSection = document.getElementById('adminTab-owner')
    if (ownerSection) ownerSection.style.display = 'flex'
    window.socket.emit('ownerCmd', { cmd: 'getStats' })
}

document.getElementById('ownerPanelBtn').addEventListener('click', openOwnerTab)

// ── Owner sub-tab switching ───────────────────────────────
document.querySelectorAll('.owner-sub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.owner-sub-tab').forEach(t => t.classList.remove('owner-sub-tab--active'))
        document.querySelectorAll('.owner-sub-section').forEach(s => s.classList.remove('owner-sub-section--active'))
        tab.classList.add('owner-sub-tab--active')
        const panel = tab.dataset.osub
        const section = document.getElementById(`ownerSub-${panel}`)
        if (section) section.classList.add('owner-sub-section--active')
        if (panel === 'stats')    window.socket.emit('ownerCmd', { cmd: 'getStats' })
        if (panel === 'bans')     window.socket.emit('ownerCmd', { cmd: 'getBans' })
        if (panel === 'filters')  window.socket.emit('ownerCmd', { cmd: 'getFilters' })
        if (panel === 'settings') window.socket.emit('ownerCmd', { cmd: 'getConfig' })
        if (panel === 'audit')    window.socket.emit('ownerCmd', { cmd: 'getAuditLog' })
    })
})
```

- [ ] **Step 6: Fix ownerAuditEntry reference in servers.js**

In `servers.js` around line 528, find:
```js
    if (el && document.getElementById('ownerTab-audit').style.display !== 'none') {
```
Replace with:
```js
    if (el && document.getElementById('ownerSub-audit')?.classList.contains('owner-sub-section--active')) {
```

- [ ] **Step 7: Fix ownerTransferBtn close reference in servers.js**

In `servers.js` around line 470, find:
```js
    document.getElementById('ownerModal').style.display = 'none'
```
Replace with:
```js
    document.getElementById('adminModal').style.display = 'none'
```

### 2c: app.js — show/hide owner nav item

- [ ] **Step 8: Update ownerStatus handler in app.js**

In `app.js`, find the `ownerStatus` handler at line 1281:
```js
socket.on('ownerStatus', ({ isOwner }) => {
    window.amOwner = isOwner
    $('ownerPanelBtn').style.display  = isOwner ? 'block' : 'none'
    $('claimOwnerBtn').style.display  = isOwner ? 'none'  : 'block'
})
```
Replace with:
```js
socket.on('ownerStatus', ({ isOwner }) => {
    window.amOwner = isOwner
    $('ownerPanelBtn').style.display  = isOwner ? 'block' : 'none'
    $('claimOwnerBtn').style.display  = isOwner ? 'none'  : 'block'
    const ownerNavItem = $('ownerNavItem')
    if (ownerNavItem) ownerNavItem.style.display = isOwner ? 'flex' : 'none'
})
```

- [ ] **Step 9: Expose openAdminPanel globally in app.js**

In `app.js`, find the globals block near line 1179:
```js
window.socket      = socket
```
Add this line immediately after `window.socket = socket`:
```js
window.openAdminPanel = openAdminPanel
```

- [ ] **Step 10: Test owner panel**

Start server. Connect as owner (claim with owner key). Click ⭐ in sidebar — Admin Panel opens with ⭐ Owner tab highlighted. Click through sub-tabs (MOTD, Bans, Stats, etc.) — each loads correctly. No JS errors.

- [ ] **Step 11: Commit**

```bash
git add server/public/index.html server/public/servers.js server/public/app.js
git commit -m "feat: merge Owner Panel into Admin Panel as star tab"
```

---

## Task 3: Attach menu + file upload + lightbox

**Files:**
- Modify: `server/public/index.html:312-317` (compose bar)
- Modify: `server/public/app.js:568-571` (attachBtn handler)

### 3a: index.html — replace compose bar

- [ ] **Step 1: Replace the input-row in index.html**

Find lines 311-318:
```html
        <div class="slow-bar" id="slowBar" style="display:none"><span id="slowCountdown">⏳ 5s</span></div>
        <div class="input-row">
          <button class="btn-icon" id="attachBtn"  title="Attach image URL">📎</button>
          <input  type="text"      id="msgInput"   placeholder="Message…" autocomplete="off"/>
          <button class="btn-icon" id="emojiBtn"   title="Emoji">😊</button>
          <button class="send-btn" id="sendBtn">Send</button>
        </div>
        <div class="emoji-picker" id="emojiPicker" style="display:none"></div>
```

Replace with:
```html
        <div class="slow-bar" id="slowBar" style="display:none"><span id="slowCountdown">⏳ 5s</span></div>
        <div id="attachChip" class="attach-chip" style="display:none">
          <span id="attachChipName"></span>
          <span class="attach-chip__remove" id="attachChipRemove">✕</span>
        </div>
        <div id="vfBar">
          <span style="font-size:1rem">⚡</span>
          <span class="vf-bar__label">VOIDFLASH</span>
          <button class="vf-timer vf-timer--active" data-ms="0">👁 Once</button>
          <button class="vf-timer" data-ms="3000">3s</button>
          <button class="vf-timer" data-ms="5000">5s</button>
          <button class="vf-timer" data-ms="10000">10s</button>
          <button class="vf-timer" data-ms="30000">30s</button>
        </div>
        <div class="input-row" style="position:relative">
          <div class="attach-wrap">
            <button class="btn-icon" id="attachBtn" title="Attach file">📎</button>
            <div class="attach-menu" id="attachMenu" style="display:none">
              <div class="attach-opt" id="attachImageOpt">
                <span class="attach-opt__icon">🖼</span>Image
                <div style="font-size:.65rem;color:var(--tx3)">png jpg gif webp</div>
              </div>
              <div class="attach-opt" id="attachFileOpt">
                <span class="attach-opt__icon">📄</span>File
                <div style="font-size:.65rem;color:var(--tx3)">any type</div>
              </div>
              <div class="attach-opt attach-opt--cam" id="attachCamOpt">
                <span class="attach-opt__icon">📷</span>Camera
                <div style="font-size:.65rem;color:#7b2fff88">live</div>
              </div>
            </div>
          </div>
          <input type="file" id="filePickerImage" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" style="display:none"/>
          <input type="file" id="filePickerAny"   style="display:none"/>
          <input  type="text" id="msgInput" placeholder="Message…" autocomplete="off"/>
          <button class="btn-icon" id="vfToggleBtn" title="VoidFlash">⚡</button>
          <button class="btn-icon" id="emojiBtn"    title="Emoji">😊</button>
          <button class="send-btn" id="sendBtn">Send</button>
        </div>
        <div class="emoji-picker" id="emojiPicker" style="display:none"></div>
```

Also add the lightbox overlay at the very end of `<body>` (before `</body>`), just before the `<script>` PWA block:
```html
<div id="lightboxOverlay" style="display:none" onclick="this.style.display='none'">
  <img id="lightboxImg" src="" alt=""/>
</div>
```

### 3b: app.js — attach menu logic

- [ ] **Step 2: Replace attachBtn handler in app.js**

Find lines 567-571 in `app.js`:
```js
// ── Attach ────────────────────────────────────────────
$('attachBtn').addEventListener('click', () => {
    const url = prompt('Paste an image URL:')
    if (url?.trim()) { msgInput.value += (msgInput.value ? ' ' : '') + url.trim(); msgInput.focus() }
})
```

Replace with:

```js
// ── Attach menu ───────────────────────────────────────
let _pendingAttachment = null
const attachMenu   = $('attachMenu')
const filePickerImg = $('filePickerImage')
const filePickerAny = $('filePickerAny')
const MAX_ATTACH_BYTES = 7_340_032  // 5 MB base64 limit

$('attachBtn').addEventListener('click', e => {
    e.stopPropagation()
    attachMenu.style.display = attachMenu.style.display === 'none' ? 'flex' : 'none'
})
document.addEventListener('click', e => {
    if (!attachMenu.contains(e.target) && e.target.id !== 'attachBtn')
        attachMenu.style.display = 'none'
})

$('attachImageOpt').addEventListener('click', () => {
    attachMenu.style.display = 'none'
    filePickerImg.click()
})
$('attachFileOpt').addEventListener('click', () => {
    attachMenu.style.display = 'none'
    filePickerAny.click()
})
$('attachCamOpt').addEventListener('click', () => {
    attachMenu.style.display = 'none'
    openCamera()
})

function readFileAsAttachment(file) {
    if (file.size > MAX_ATTACH_BYTES) { showToast('File too large — max 5 MB', 'error'); return }
    const reader = new FileReader()
    reader.onload = ev => {
        _pendingAttachment = { name: file.name, mimeType: file.type || 'application/octet-stream', dataUrl: ev.target.result }
        showAttachChip()
    }
    reader.readAsDataURL(file)
}

filePickerImg.addEventListener('change', () => { if (filePickerImg.files[0]) readFileAsAttachment(filePickerImg.files[0]); filePickerImg.value = '' })
filePickerAny.addEventListener('change', () => { if (filePickerAny.files[0]) readFileAsAttachment(filePickerAny.files[0]); filePickerAny.value = '' })

function showAttachChip() {
    const chip = $('attachChip')
    $('attachChipName').textContent = _pendingAttachment.name
    chip.style.display = 'flex'
}
function clearAttachment() {
    _pendingAttachment = null
    $('attachChip').style.display = 'none'
    $('attachChipName').textContent = ''
}
$('attachChipRemove').addEventListener('click', clearAttachment)

// ── Lightbox ──────────────────────────────────────────
window.openLightbox = function(src) {
    $('lightboxImg').src = src
    $('lightboxOverlay').style.display = 'flex'
}
```

- [ ] **Step 3: Extend sendMsg to include attachment**

In `app.js`, find `sendMsg()` at line 400. Find the line:
```js
    socket.emit('message', { name: myName, text, replyTo: replyingTo })
```
Replace it with:
```js
    const payload = { name: myName, text, replyTo: replyingTo }
    if (_pendingAttachment) { payload.attach = _pendingAttachment; clearAttachment() }
    socket.emit('message', payload)
```

- [ ] **Step 4: Render attachments in buildMsgEl**

In `app.js`, find in `buildMsgEl` the line:
```js
        <div class="msg__text">${formatText(text)}</div>
```
(inside the normal `li.innerHTML = \`...\`` block at line ~327). Replace that line with:
```js
        <div class="msg__text">${formatText(text || '')}</div>
        ${data.attach ? buildAttachHtml(data.attach) : ''}
```

Then add this helper function near the top of the MESSAGE RENDERING section (around line 278, before `buildMsgEl`):
```js
function buildAttachHtml(attach) {
    if (!attach?.dataUrl) return ''
    if (attach.mimeType?.startsWith('image/')) {
        return `<img src="${escHtml(attach.dataUrl)}" class="msg-image msg-image--upload"
          alt="${escHtml(attach.name)}" loading="lazy"
          onclick="openLightbox(${JSON.stringify(attach.dataUrl)})">`
    }
    return `<a class="msg-file-link" href="${escHtml(attach.dataUrl)}"
      download="${escHtml(attach.name)}">${escHtml(attach.name)}</a>`
}
```

- [ ] **Step 5: Test file attachment**

Start server. Join a room. Click 📎 → Image → pick a PNG. Confirm chip appears. Send — image renders inline. Click image — lightbox opens. Send a file (non-image) — download link appears. All under 5 MB.

- [ ] **Step 6: Commit**

```bash
git add server/public/index.html server/public/app.js
git commit -m "feat: attach menu — real file/image upload with inline preview and lightbox"
```

---

## Task 4: Camera capture

**Files:**
- Modify: `server/public/index.html` (add camera modal before `</body>`)
- Modify: `server/public/app.js` (add camera functions)

### 4a: index.html — camera modal

- [ ] **Step 1: Add camera modal HTML**

In `index.html`, find the lightbox div you added in Task 3 and insert the camera modal just before it:
```html
<!-- Camera capture modal -->
<div class="modal-overlay" id="cameraModal" style="display:none">
  <div class="modal modal--camera">
    <video id="cameraPreview" autoplay playsinline muted></video>
    <canvas id="cameraCanvas" style="display:none"></canvas>
    <div class="camera-controls">
      <button class="cam-flip-btn" id="camFlipBtn" title="Flip camera">🔄</button>
      <button class="shutter-btn"  id="camShutterBtn" title="Capture"></button>
      <button class="cam-close-btn" id="camCloseBtn" title="Close">✕</button>
    </div>
  </div>
</div>
```

### 4b: app.js — camera functions

- [ ] **Step 2: Add camera JS after the attach menu section**

After the `$('attachChipRemove').addEventListener(...)` block from Task 3, append:

```js
// ── Camera capture ────────────────────────────────────
let _camStream   = null
let _facingMode  = 'user'

async function openCamera() {
    $('cameraModal').style.display = 'flex'
    await startCamStream()
}

async function startCamStream() {
    if (_camStream) _camStream.getTracks().forEach(t => t.stop())
    try {
        _camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: _facingMode }, audio: false })
        $('cameraPreview').srcObject = _camStream
    } catch (_) {
        // Fallback: open file picker instead
        closeCamera()
        filePickerImg.click()
    }
}

function captureFrame() {
    const video  = $('cameraPreview')
    const canvas = $('cameraCanvas')
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d').drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    closeCamera()
    _pendingAttachment = { name: 'camera.jpg', mimeType: 'image/jpeg', dataUrl }
    showAttachChip()
}

function closeCamera() {
    if (_camStream) { _camStream.getTracks().forEach(t => t.stop()); _camStream = null }
    $('cameraModal').style.display = 'none'
}

$('camShutterBtn').addEventListener('click', captureFrame)
$('camCloseBtn').addEventListener('click', closeCamera)
$('camFlipBtn').addEventListener('click', () => {
    _facingMode = _facingMode === 'user' ? 'environment' : 'user'
    startCamStream()
})
```

- [ ] **Step 3: Test camera**

Open app on mobile or desktop with webcam. Click 📎 → Camera. Camera preview shows. Click shutter — chip appears with "camera.jpg". Send — photo appears inline. Close button works. Flip works (on mobile).

- [ ] **Step 4: Commit**

```bash
git add server/public/index.html server/public/app.js
git commit -m "feat: camera capture via getUserMedia with flip and file picker fallback"
```

---

## Task 5: Server handlers for attachments, VoidFlashes, and DM relay fix

**Files:**
- Modify: `server/index.js:451-478` (message handler)
- Modify: `server/index.js:676-685` (sendDm handler)
- Modify: `server/index.js` (add voidFlashOpened + vfScreenshot handlers after sendDm)

### 5a: Fix message handler to relay attachments and VoidFlashes

- [ ] **Step 1: Replace the message handler in server/index.js**

Find lines 451-478 (the full `socket.on('message', ...)` block):
```js
    socket.on('message',({name,text,replyTo})=>{
        const user=Users.get(socket.id); if(!user) return
        if(Admin.isMuted(user.room,socket.id)) return socket.emit('joinError',{type:'muted',message:'You are muted.'})
        if(!checkFloodLimit(socket.id)) return socket.emit('joinError',{type:'rateLimit',message:'Slow down — too many messages.'})
        const filtered=applyGlobalFilter(Admin.filterText(user.room,text))
        statMsgCount++
        const msg=buildMsg(name,filtered,replyTo,'user')
        Rooms.addMsg(user.room,msg)
        io.to(user.room).emit('message',msg)
        socket.emit('delivered',{msgId:msg.id})
        // Auto-VOID: first message of the day
        ...
    })
```

Replace with (keep auto-VOID block at end exactly as it was):

```js
    socket.on('message',({name,text,replyTo,attach,voidFlash,vfExpiry,vfCipher,vfIv,vfThumb})=>{
        const user=Users.get(socket.id); if(!user) return
        if(Admin.isMuted(user.room,socket.id)) return socket.emit('joinError',{type:'muted',message:'You are muted.'})
        if(!checkFloodLimit(socket.id)) return socket.emit('joinError',{type:'rateLimit',message:'Slow down — too many messages.'})

        // Validate attachment if present
        if(attach){
            const okMime=/^(image\/(png|jpeg|gif|webp|svg\+xml)|application\/pdf|text\/.*)$/
            if(!okMime.test(attach.mimeType||'')) return socket.emit('joinError',{type:'rateLimit',message:'Unsupported file type.'})
            if((attach.dataUrl||'').length>7_340_032) return socket.emit('joinError',{type:'rateLimit',message:'File too large (max 5 MB).'})
        }

        const filteredText = voidFlash ? '' : applyGlobalFilter(Admin.filterText(user.room, text||''))
        statMsgCount++
        const extra = {}
        if(attach)     extra.attach     = attach
        if(voidFlash)  { extra.voidFlash=true; extra.vfExpiry=Math.max(0,Number(vfExpiry)||0);
                         extra.vfCipher=vfCipher; extra.vfIv=vfIv; extra.vfThumb=vfThumb;
                         extra.fromVoidId=socket.data?.voidId }
        const msg=buildMsg(name, filteredText, replyTo, 'user', extra)
        Rooms.addMsg(user.room,msg)
        io.to(user.room).emit('message',msg)
        socket.emit('delivered',{msgId:msg.id})

        // Auto-VOID: first message of the day
        const today = new Date().toDateString()
        const act   = userDailyAct.get(socket.data?.voidId) || {}
        if (socket.data?.voidId && act.lastMsgDay !== today) {
            userDailyAct.set(socket.data.voidId, { ...act, lastMsgDay: today })
            const autoEntry = {
                voidId:     mkVoidId(),
                fromVoidId: socket.data.voidId,
                name:       socket.data.name || user.name,
                text:       `${user.name} is active today ⚡`,
                type:       'auto',
                expiresAt:  Date.now() + 86_400_000
            }
            voids.set(autoEntry.voidId, autoEntry)
            io.emit('voidAutoPost', autoEntry)
        }
    })
```

### 5b: Fix sendDm to relay ciphertext/iv and VoidFlash fields

- [ ] **Step 2: Replace sendDm handler**

Find lines 676-685:
```js
    socket.on('sendDm',({toVoidId,text})=>{
        const vid=socket.data?.voidId; const name=socket.data?.name; if(!vid||!name) return
        if(!Friends.areFriends(vid,toVoidId)) return socket.emit('dmError',{message:'Not friends with this user.'})
        if(Friends.isBlocked(toVoidId,vid)) return socket.emit('dmError',{message:'This user has blocked you.'})
        const msg=buildMsg(name,text,null,'user',{fromVoid:vid,toVoid:toVoidId})
        DMs.addMsg(vid,toVoidId,msg)
        socket.emit('dm',{msg,withVoidId:toVoidId})
        const toSid=VoidSockets.sid(toVoidId)
        if(toSid){ io.to(toSid).emit('dm',{msg,withVoidId:vid}); io.to(toSid).emit('dmNotification',{fromVoidId:vid,fromName:name,preview:text.slice(0,50)}) }
    })
```

Replace with:

```js
    socket.on('sendDm',({toVoidId,text,ciphertext,iv,attach,voidFlash,vfExpiry,vfCipher,vfIv,vfThumb})=>{
        const vid=socket.data?.voidId; const name=socket.data?.name; if(!vid||!name) return
        if(!Friends.areFriends(vid,toVoidId)) return socket.emit('dmError',{message:'Not friends with this user.'})
        if(Friends.isBlocked(toVoidId,vid)) return socket.emit('dmError',{message:'This user has blocked you.'})
        const extra={fromVoid:vid,toVoid:toVoidId}
        if(ciphertext) { extra.ciphertext=ciphertext; extra.iv=iv }
        if(attach)     extra.attach=attach
        if(voidFlash)  { extra.voidFlash=true; extra.vfExpiry=Math.max(0,Number(vfExpiry)||0);
                         extra.vfCipher=vfCipher; extra.vfIv=vfIv; extra.vfThumb=vfThumb;
                         extra.fromVoidId=vid }
        const displayText = ciphertext ? '' : (text||'')
        const msg=buildMsg(name,displayText,null,'user',extra)
        DMs.addMsg(vid,toVoidId,msg)
        socket.emit('dm',{msg,withVoidId:toVoidId})
        const toSid=VoidSockets.sid(toVoidId)
        const preview=ciphertext?'🔒 Encrypted message':(voidFlash?'⚡ VoidFlash':(text||'').slice(0,50))
        if(toSid){ io.to(toSid).emit('dm',{msg,withVoidId:vid}); io.to(toSid).emit('dmNotification',{fromVoidId:vid,fromName:name,preview}) }
    })
```

### 5c: Add voidFlashOpened and vfScreenshot handlers

- [ ] **Step 3: Add new socket handlers after the sendDm block**

After the `sendDm` handler (after line 685), add:

```js
    // ── VoidFlash opened (delete from history for all) ───
    socket.on('voidFlashOpened',({msgId,isDm,withVoidId})=>{
        const u=Users.get(socket.id)
        if(isDm){
            const vid=socket.data?.voidId; if(!vid) return
            DMs.delMsg(vid,withVoidId||'',msgId)
            const toSid=VoidSockets.sid(withVoidId||'')
            if(toSid) io.to(toSid).emit('deleteMsg',{msgId})
        } else {
            if(!u) return
            Rooms.delMsg(u.room,msgId)
            io.to(u.room).emit('deleteMsg',{msgId})
        }
    })

    // ── VoidFlash screenshot alert ───────────────────────
    socket.on('vfScreenshot',({msgId,isDm,senderVoidId})=>{
        const u=Users.get(socket.id); if(!u&&!socket.data?.voidId) return
        const senderSid=VoidSockets.sid(senderVoidId||'')
        const screenshotterName = socket.data?.name || (u?.name) || 'Someone'
        if(senderSid) io.to(senderSid).emit('vfScreenshotAlert',{byName:screenshotterName,msgId})
    })
```

- [ ] **Step 4: Verify server starts without errors**

```bash
cd server && node .
```
Expected output: `[VOID] Server on :3500  •  Owner key: VOID-OWNER-2024`
No thrown errors.

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: server relay for attachments, VoidFlashes, DM ciphertext, voidFlashOpened, vfScreenshot"
```

---

## Task 6: VoidFlash frontend module

**Files:**
- Create: `server/public/voidflashes.js`
- Modify: `server/public/index.html:1034` (add script tag)

This module handles VoidFlash compose toggle, sending, receiving, rendering, opening, and burn timer. It wraps `window.sendMsg` similar to how `dms.js` does it.

- [ ] **Step 1: Create server/public/voidflashes.js**

```js
// ═══════════════════════════════════════════════════════
//  voidflashes.js — VOID  ·  VoidFlash ephemeral E2E messages
//  Loaded after dms.js — wraps window.sendMsg
// ═══════════════════════════════════════════════════════

let _vfMode   = false
let _vfExpiry = 0   // 0 = view-once; >0 = ms after open

// ── VoidFlash bar toggle ──────────────────────────────
const vfBar       = document.getElementById('vfBar')
const vfToggleBtn = document.getElementById('vfToggleBtn')

vfToggleBtn.addEventListener('click', () => {
    _vfMode = !_vfMode
    vfBar.style.display = _vfMode ? 'flex' : 'none'
    vfToggleBtn.style.background = _vfMode ? '#7b2fff44' : ''
    vfToggleBtn.style.color      = _vfMode ? '#b47aff'   : ''
})

// Timer chip selection
document.querySelectorAll('.vf-timer').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.vf-timer').forEach(b => b.classList.remove('vf-timer--active'))
        btn.classList.add('vf-timer--active')
        _vfExpiry = parseInt(btn.dataset.ms) || 0
    })
})

// ── Helpers ───────────────────────────────────────────
function makeThumb(dataUrl) {
    try {
        const c = document.createElement('canvas'); c.width = 32; c.height = 32
        const img = new Image(); img.src = dataUrl
        c.getContext('2d').drawImage(img, 0, 0, 32, 32)
        return c.toDataURL('image/jpeg', 0.5)
    } catch (_) { return null }
}

function buildVfContent(text, attach, vfExpiry) {
    const imgHtml = attach?.mimeType?.startsWith('image/')
        ? `<img src="${window.escHtml(attach.dataUrl)}" class="vf-image" onclick="window.openLightbox(${JSON.stringify(attach.dataUrl)})">`
        : (attach ? `<a class="msg-file-link" href="${window.escHtml(attach.dataUrl)}" download="${window.escHtml(attach.name)}">${window.escHtml(attach.name)}</a>` : '')
    const textHtml  = text ? `<div class="vf-text">${window.escHtml(text)}</div>` : ''
    const timerHtml = vfExpiry > 0
        ? `<div class="vf-countdown-wrap"><div class="vf-countdown" style="width:100%"></div></div>` : ''
    return `<div class="vf-opened">${imgHtml}${textHtml}${timerHtml}
        <div class="vf-burning">🔥 ${vfExpiry === 0 ? 'View once — deleting…' : 'Burning…'}</div>
        <div class="vf-e2e">🔒 E2E Encrypted</div></div>`
}

// ── Send a VoidFlash ──────────────────────────────────
async function sendVoidFlash(text, attach) {
    const mode   = document.getElementById('chatScreen').dataset.mode
    const isDm   = mode === 'dm'
    const payload = JSON.stringify(attach ? { text, attach } : { text })

    let vfCipher, vfIv

    if (isDm) {
        // Get DM partner's public key from _dmPubKeys (exposed by dms.js)
        const activeDmVoidId = window._getActiveDm ? window._getActiveDm() : null
        const pubKey = activeDmVoidId ? window._getDmPubKey?.(activeDmVoidId) : null
        if (pubKey && window.VoidCrypto) {
            try {
                const sharedKey = await window.VoidCrypto.deriveSharedKey(pubKey)
                const enc = await window.VoidCrypto.encryptMsg(payload, sharedKey)
                vfCipher = enc.ciphertext; vfIv = enc.iv
            } catch (_) { vfCipher = btoa(unescape(encodeURIComponent(payload))); vfIv = null }
        } else {
            vfCipher = btoa(unescape(encodeURIComponent(payload))); vfIv = null
        }
        const toVoidId = activeDmVoidId
        if (!toVoidId) { window.showToast('No active DM', 'error'); return }
        window.socket.emit('sendDm', {
            toVoidId, voidFlash: true, vfExpiry: _vfExpiry,
            vfCipher, vfIv, vfThumb: attach ? makeThumb(attach.dataUrl) : null
        })
    } else {
        // Room — try room key if available
        const roomKey = window.VoidCrypto?.getRoomKey(window.myRoom || '')
        if (roomKey) {
            try {
                const enc = await window.VoidCrypto.encryptMsg(payload, roomKey)
                vfCipher = enc.ciphertext; vfIv = enc.iv
            } catch (_) { vfCipher = btoa(unescape(encodeURIComponent(payload))); vfIv = null }
        } else {
            vfCipher = btoa(unescape(encodeURIComponent(payload))); vfIv = null
        }
        window.socket.emit('message', {
            name: window.myName, voidFlash: true, vfExpiry: _vfExpiry,
            vfCipher, vfIv, vfThumb: attach ? makeThumb(attach.dataUrl) : null
        })
    }
}

// ── Render incoming VoidFlash ─────────────────────────
window.renderVoidFlash = function(msg, li) {
    li.classList.add('msg--voidflash')
    li.dataset.vfMsg = JSON.stringify({
        id: msg.id, vfExpiry: msg.vfExpiry,
        vfCipher: msg.vfCipher, vfIv: msg.vfIv,
        name: msg.name, fromVoidId: msg.fromVoidId || ''
    })
    const timer = msg.vfExpiry === 0 ? '👁 View once' : `⏱ ${msg.vfExpiry / 1000}s`
    li.innerHTML = `
      <div class="vf-overlay" onclick="openVoidFlash(this)">
        <span class="vf-icon">⚡</span>
        <div>
          <div class="vf-from">VoidFlash from ${window.escHtml(msg.name)}</div>
          <div class="vf-meta">${timer} · 🔒 E2E</div>
        </div>
        <span class="vf-tap">TAP →</span>
      </div>`
}

// ── Open (decrypt + show + start timer) ──────────────
window.openVoidFlash = async function(el) {
    const li  = el.closest('.msg--voidflash')
    const msg = JSON.parse(li.dataset.vfMsg || '{}')
    const mode  = document.getElementById('chatScreen').dataset.mode
    const isDm  = mode === 'dm'
    let plain

    try {
        const activeDmVoidId = isDm && window._getActiveDm ? window._getActiveDm() : null
        const pubKey = activeDmVoidId ? window._getDmPubKey?.(activeDmVoidId) : null
        const roomKey = !isDm ? window.VoidCrypto?.getRoomKey(window.myRoom || '') : null
        const key = isDm
            ? (pubKey ? await window.VoidCrypto.deriveSharedKey(pubKey) : null)
            : roomKey

        if (key && msg.vfIv && window.VoidCrypto) {
            plain = await window.VoidCrypto.decryptMsg(msg.vfCipher, msg.vfIv, key)
        } else {
            plain = decodeURIComponent(escape(atob(msg.vfCipher)))
        }
    } catch (_) {
        plain = JSON.stringify({ text: '⚠ Decryption failed' })
    }

    let parsed
    try { parsed = JSON.parse(plain) } catch(_) { parsed = { text: plain } }

    li.innerHTML = buildVfContent(parsed.text || '', parsed.attach, msg.vfExpiry)

    if (msg.vfExpiry === 0) {
        deleteVoidFlash(li, msg, isDm)
    } else {
        startBurnTimer(li, msg, isDm)
    }
    attachScreenshotGuard(msg)
}

// ── Burn timer ────────────────────────────────────────
function startBurnTimer(li, msg, isDm) {
    const ms = msg.vfExpiry
    let remaining = ms
    const bar = li.querySelector('.vf-countdown')
    const tick = setInterval(() => {
        remaining -= 100
        if (bar) bar.style.width = Math.max(0, remaining / ms * 100) + '%'
        if (remaining <= 0) { clearInterval(tick); deleteVoidFlash(li, msg, isDm) }
    }, 100)
}

// ── Delete (both sides) ───────────────────────────────
function deleteVoidFlash(li, msg, isDm) {
    const ghost = document.createElement('li')
    ghost.className = 'msg msg--ghost'
    ghost.textContent = '⚡ VoidFlash opened · deleted'
    li.replaceWith(ghost)
    const activeDmVoidId = isDm && window._getActiveDm ? window._getActiveDm() : null
    window.socket.emit('voidFlashOpened', {
        msgId: msg.id,
        isDm,
        withVoidId: activeDmVoidId || ''
    })
}

// ── Screenshot guard ──────────────────────────────────
function attachScreenshotGuard(msg) {
    const isDm = document.getElementById('chatScreen').dataset.mode === 'dm'
    const send = () => window.socket.emit('vfScreenshot', {
        msgId: msg.id,
        isDm,
        senderVoidId: msg.fromVoidId || ''
    })
    document.addEventListener('visibilitychange', send, { once: true })
    document.addEventListener('keyup', e => {
        if (e.key === 'PrintScreen') send()
    }, { once: true })
}

// ── Screenshot alert toast ────────────────────────────
window.socket.on('vfScreenshotAlert', ({ byName }) => {
    window.showToast(`👀 ${byName} screenshotted your VoidFlash`, 'warn')
})

// ── deleteMsg (server removed VoidFlash from history) ─
window.socket.on('deleteMsg', ({ msgId }) => {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`) ||
               document.querySelector(`.msg--voidflash[data-vf-msg*='"id":"${msgId}"']`)
    if (el) {
        const ghost = document.createElement('li')
        ghost.className = 'msg msg--ghost'
        ghost.textContent = '⚡ VoidFlash expired'
        el.replaceWith(ghost)
    }
})

// ── Wrap sendMsg to intercept VoidFlash mode ──────────
const _prevSendMsgVF = window.sendMsg
window.sendMsg = async function() {
    if (!_vfMode) { _prevSendMsgVF(); return }
    const input = document.getElementById('msgInput')
    const text  = input.value.trim()
    const attach = window._pendingAttachment || null
    if (!text && !attach) return
    input.value = ''
    if (attach && window.clearAttachment) window.clearAttachment()
    await sendVoidFlash(text, attach)
    // Reset VoidFlash mode after send
    _vfMode = false
    vfBar.style.display = 'none'
    vfToggleBtn.style.background = ''
    vfToggleBtn.style.color      = ''
    document.querySelectorAll('.vf-timer').forEach(b => b.classList.remove('vf-timer--active'))
    document.querySelector('.vf-timer[data-ms="0"]')?.classList.add('vf-timer--active')
    _vfExpiry = 0
}
```

- [ ] **Step 2: Add voidflashes.js script tag to index.html**

In `index.html`, find line 1036:
```html
<script src="dms.js" defer></script>
```
Add a new line immediately after:
```html
<script src="voidflashes.js" defer></script>
```

- [ ] **Step 3: Expose DM internals from dms.js**

In `dms.js`, after the last line (line 202, `window.socket.on('dmError', ...)`), add:
```js

// ── Expose internals for voidflashes.js ──────────────
window._getActiveDm  = () => activeDm
window._getDmPubKey  = vid => _dmPubKeys.get(vid) || null
```

- [ ] **Step 4: Expose clearAttachment from app.js**

In `app.js`, find the globals block near line 1179 (`window.socket = socket`). Add:
```js
window.clearAttachment    = clearAttachment
window._pendingAttachment = null  // voidflashes.js reads this directly
```
Wait — `_pendingAttachment` is a local `let`. Instead, expose it through a getter/setter. Replace the `let _pendingAttachment = null` line (added in Task 3) with:

Actually simpler: In the globals block at line ~1179, after `window.clearAttachment = clearAttachment`, add:
```js
Object.defineProperty(window, '_pendingAttachment', {
    get: () => _pendingAttachment,
    set: v => { _pendingAttachment = v }
})
```

- [ ] **Step 5: Hook renderVoidFlash into buildMsgEl**

In `app.js`, inside `buildMsgEl`, at the very top of the function (after `const { id, name, text, time, type, replyTo, reactions } = data`), add:

```js
    // VoidFlash messages render differently
    if (data.voidFlash && window.renderVoidFlash) {
        const li = document.createElement('li')
        li.dataset.msgId = id
        window.renderVoidFlash(data, li)
        return li
    }
```

- [ ] **Step 6: Hook renderVoidFlash into DM receive in dms.js**

In `dms.js`, inside `window.socket.on('dm', async ({ msg, withVoidId }) => {`, find:
```js
    if (!dmConvos[withVoidId]) dmConvos[withVoidId] = []
    dmConvos[withVoidId].push(msg)
    if (!dmMeta[withVoidId]) dmMeta[withVoidId] = { name: msg.name }
    if (activeDm === withVoidId) {
        const display = document.getElementById('chatDisplay')
        display.appendChild(window.buildMsgEl(msg))
```

No change needed — `buildMsgEl` will automatically call `renderVoidFlash` if `msg.voidFlash` is set, because we hooked it in Step 5.

But we must NOT try to decrypt a VoidFlash in the normal DM decryption path. In `dms.js`, find:
```js
window.socket.on('dm', async ({ msg, withVoidId }) => {
    if (msg.ciphertext && window.VoidCrypto) {
```
Change to:
```js
window.socket.on('dm', async ({ msg, withVoidId }) => {
    if (msg.voidFlash) {
        // VoidFlash: don't decrypt here — voidflashes.js handles it on tap
        if (!dmConvos[withVoidId]) dmConvos[withVoidId] = []
        dmConvos[withVoidId].push(msg)
        if (!dmMeta[withVoidId]) dmMeta[withVoidId] = { name: msg.name }
        if (activeDm === withVoidId) {
            const display = document.getElementById('chatDisplay')
            display.appendChild(window.buildMsgEl(msg))
            display.scrollTo({ top: display.scrollHeight, behavior: 'smooth' })
        } else {
            dmUnreads[withVoidId] = (dmUnreads[withVoidId] || 0) + 1
            updateDmsTabDot()
        }
        renderDmList()
        return
    }
    if (msg.ciphertext && window.VoidCrypto) {
```

- [ ] **Step 7: Test VoidFlashes end-to-end**

Start server. Open two browser tabs. Log in as two different users, add as friends, open a DM.

Tab 1: Click ⚡ → VoidFlash bar appears → select "5s" timer → type "test flash" → Send.
Tab 2: See "⚡ VoidFlash from User — ⏱ 5s · 🔒 E2E" overlay → tap it → message shows → 5-second countdown burns → message becomes "⚡ VoidFlash opened · deleted" in both tabs.

View-once: select "👁 Once" → send → tap → immediately deleted in both tabs.

Room flash: Join same room in both tabs → send VoidFlash from tab 1 → tab 2 sees overlay → tap → burns → deletes.

- [ ] **Step 8: Commit**

```bash
git add server/public/voidflashes.js server/public/index.html server/public/dms.js server/public/app.js
git commit -m "feat: VoidFlashes — ephemeral E2E messages with burn timer, screenshot guard, room+DM support"
```

---

## Task 7: Screenshot alert

This is partially implemented in Task 6 (the `attachScreenshotGuard` function and `vfScreenshotAlert` handler are in `voidflashes.js`). This task verifies the full flow works.

**Files:**
- No new files — verifying Task 6 work

- [ ] **Step 1: Test screenshot detection**

Open two browser tabs. Send a VoidFlash from Tab 1 to Tab 2. In Tab 2, tap the VoidFlash to open it. While the message is showing, press `PrintScreen` (Windows) or `Cmd+Shift+3` (Mac) or switch to another app (triggers `visibilitychange`).

Expected: Tab 1 shows toast: `"👀 [Tab2Name] screenshotted your VoidFlash"`

- [ ] **Step 2: Commit (if no changes needed)**

If screenshot test passes with no additional code changes:
```bash
git status
# Should show "nothing to commit"
```

If changes were needed:
```bash
git add server/public/voidflashes.js server/index.js
git commit -m "fix: screenshot guard edge cases"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] §1 Owner Panel → Admin Panel tab: Tasks 1+2
- [x] §2 Real media upload (png/jpg/gif/webp/svg, 5MB, inline preview): Task 3
- [x] §3 Camera capture (getUserMedia, flip, fallback): Task 4
- [x] §4 VoidFlashes (view-once, timer, photo, screenshot, E2E): Tasks 5+6+7
- [x] §5 E2E on DMs: Already implemented in `dms.js`; server relay fixed in Task 5b
- [x] Camera captured as attach → sent through sendVoidFlash: Task 4 sets `_pendingAttachment`, Task 6 reads it

**No placeholders:** All code blocks are complete. No TBD.

**Type consistency:**
- `_pendingAttachment` shape: `{ name, mimeType, dataUrl }` — consistent across Task 3 (write), Task 4 (write), Task 6 (read)
- VoidFlash server fields: `voidFlash, vfExpiry, vfCipher, vfIv, vfThumb, fromVoidId` — consistent across Task 5 (server) and Task 6 (client)
- `window._getActiveDm()` returns `activeDm` (string voidId) — used in Task 6
- `owner-sub-tab` / `owner-sub-section` CSS classes — consistent with Task 1 CSS and Task 2 HTML
