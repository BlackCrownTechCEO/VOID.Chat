// ═══════════════════════════════════════════════════════
//  friends.js — VOID v5  ·  Friends module
// ═══════════════════════════════════════════════════════

let friendList      = []
let pendingRequests = []

const friendsListEl  = document.getElementById('friendsList')
const pendingListEl  = document.getElementById('pendingList')
const pendingReqsSec = document.getElementById('pendingReqsSection')
const pendingCountEl = document.getElementById('pendingCount')
const friendsTabDot  = document.getElementById('friendsTabDot')

// ── Render ────────────────────────────────────────────────
function renderFriends() {
    friendsListEl.innerHTML = ''
    if (!friendList.length) {
        friendsListEl.innerHTML = '<li class="item-empty">No friends yet</li>'
        return
    }
    const sorted = [...friendList].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0))
    sorted.forEach(f => {
        const li = document.createElement('li')
        li.className = 'friend-item'
        li.dataset.void = f.voidId
        li.innerHTML = `
          <span class="friend-dot${f.online ? ' friend-dot--online' : ''}"></span>
          <div class="msg__avatar" style="background:${window.avatarColor(f.name)};width:26px;height:26px;font-size:.64rem;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${window.initials(f.name)}</div>
          <span class="friend-name">${window.escHtml(f.name)}</span>
          <button class="btn-icon friend-dm-btn" data-void="${window.escHtml(f.voidId)}" data-name="${window.escHtml(f.name)}" title="Send DM">💬</button>`
        friendsListEl.appendChild(li)
    })
}

function renderPending() {
    if (!pendingRequests.length) {
        pendingReqsSec.style.display = 'none'
        friendsTabDot.style.display  = 'none'
        return
    }
    pendingReqsSec.style.display = 'block'
    pendingCountEl.textContent   = pendingRequests.length
    friendsTabDot.style.display  = 'inline-flex'
    pendingListEl.innerHTML = ''
    pendingRequests.forEach(r => {
        const li = document.createElement('li')
        li.className = 'friend-item'
        li.innerHTML = `
          <div class="msg__avatar" style="background:${window.avatarColor(r.fromName)};width:26px;height:26px;font-size:.64rem;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${window.initials(r.fromName)}</div>
          <span class="friend-name">${window.escHtml(r.fromName)}</span>
          <button class="btn-icon" data-action="accept" data-void="${window.escHtml(r.fromVoid)}" title="Accept" style="color:var(--grn)">✓</button>
          <button class="btn-icon" data-action="decline" data-void="${window.escHtml(r.fromVoid)}" title="Decline" style="color:var(--red)">✕</button>`
        pendingListEl.appendChild(li)
    })
}

// ── Pending actions ───────────────────────────────────────
pendingListEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const fromVoid = btn.dataset.void
    window.socket.emit(btn.dataset.action === 'accept' ? 'acceptFriendRequest' : 'declineFriendRequest', { fromVoid })
    pendingRequests = pendingRequests.filter(r => r.fromVoid !== fromVoid)
    renderPending()
})

// ── DM button ─────────────────────────────────────────────
friendsListEl.addEventListener('click', e => {
    const btn = e.target.closest('.friend-dm-btn')
    if (!btn) return
    window.openDmWith(btn.dataset.void, btn.dataset.name)
})

// ── Right-click context ───────────────────────────────────
friendsListEl.addEventListener('contextmenu', e => {
    e.preventDefault()
    const item = e.target.closest('.friend-item')
    if (!item?.dataset.void) return
    const vid  = item.dataset.void
    const name = friendList.find(f => f.voidId === vid)?.name || vid
    document.getElementById('voidFriendCtx')?.remove()
    const menu = document.createElement('div')
    menu.id = 'voidFriendCtx'; menu.className = 'context-menu'
    ;[
        { icon:'💬', label:'Send DM', action: () => window.openDmWith(vid, name) },
        { divider: true },
        { icon:'🚫', label:'Remove Friend', cls:'danger', action: () => { window.socket.emit('removeFriend', { targetVoid: vid }); friendList = friendList.filter(f => f.voidId !== vid); renderFriends() } },
        { icon:'⛔', label:'Block',          cls:'danger', action: () => { window.socket.emit('blockUser',   { targetVoid: vid }); friendList = friendList.filter(f => f.voidId !== vid); renderFriends() } },
    ].forEach(opt => {
        if (opt.divider) { const d = document.createElement('div'); d.className = 'context-menu__divider'; menu.appendChild(d); return }
        const b = document.createElement('button')
        b.className = `context-menu__item${opt.cls ? ' context-menu__item--' + opt.cls : ''}`
        b.innerHTML = `<span class="ctx-icon">${opt.icon}</span>${opt.label}`
        b.addEventListener('click', () => { opt.action(); menu.remove() })
        menu.appendChild(b)
    })
    document.body.appendChild(menu)
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 190)}px`
    menu.style.top  = `${Math.min(e.clientY, window.innerHeight - menu.scrollHeight - 10)}px`
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 50)
})

// ── Add Friend modal ──────────────────────────────────────
document.getElementById('addFriendBtn').addEventListener('click', () => {
    document.getElementById('addFriendModal').style.display = 'flex'
    document.getElementById('addFriendInput').focus()
})
document.getElementById('closeAddFriendModal').addEventListener('click', () =>
    document.getElementById('addFriendModal').style.display = 'none')
document.getElementById('cancelAddFriend').addEventListener('click', () =>
    document.getElementById('addFriendModal').style.display = 'none')

document.getElementById('addFriendForm').addEventListener('submit', e => {
    e.preventDefault()
    const toVoidId = document.getElementById('addFriendInput').value.trim().toUpperCase()
    if (!toVoidId) return
    window.socket.emit('sendFriendRequest', { toVoidId })
    document.getElementById('addFriendInput').value = ''
    document.getElementById('addFriendModal').style.display = 'none'
})

// ── Socket events ─────────────────────────────────────────
window.socket.on('friendList', ({ friends }) => {
    friendList = friends; renderFriends()
})
window.socket.on('pendingFriendRequests', reqs => {
    pendingRequests = reqs; renderPending()
})
window.socket.on('friendRequest', ({ fromVoid, fromName }) => {
    pendingRequests.push({ fromVoid, fromName, time: Date.now() })
    renderPending()
    window.showToast(`Friend request from ${fromName}`, 'info')
})
window.socket.on('friendOnline', ({ voidId }) => {
    const f = friendList.find(f => f.voidId === voidId); if (f) { f.online = true; renderFriends() }
})
window.socket.on('friendOffline', ({ voidId }) => {
    const f = friendList.find(f => f.voidId === voidId); if (f) { f.online = false; renderFriends() }
})
window.socket.on('friendAccepted', ({ name }) => {
    window.showToast(`${name} accepted your friend request`, 'success')
})
window.socket.on('friendError',   ({ message }) => window.showToast(message, 'error'))
window.socket.on('friendSuccess', ({ message }) => window.showToast(message, 'success'))
