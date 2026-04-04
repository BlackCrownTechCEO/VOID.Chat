// ═══════════════════════════════════════════════════════
//  servers.js — VOID v5  ·  Servers module + Owner Panel
// ═══════════════════════════════════════════════════════

let serverList       = []
let activeServer     = null
let activeServerRoom = { serverId: null, roomId: null }

const _srvPubKeys = new Map()  // voidId → base64 public key

async function _distributeRoomKey(serverId, roomId, memberVoids) {
    if (!window.VoidCrypto) return
    let roomKey = window.VoidCrypto.getRoomKey(roomId)
    if (!roomKey) { roomKey = await window.VoidCrypto.generateRoomKey(); window.VoidCrypto.setRoomKey(roomId, roomKey) }
    for (const vid of memberVoids) {
        const pub = _srvPubKeys.get(vid)
        if (!pub) { window.socket.emit('getPublicKey', { voidId: vid }); continue }
        const sharedKey  = await window.VoidCrypto.deriveSharedKey(pub)
        const wrappedKey = await window.VoidCrypto.wrapRoomKey(roomKey, sharedKey)
        window.socket.emit('roomKeyPacket', { serverId, roomId, toVoidId: vid, wrappedKey })
    }
}

const serverListEl    = document.getElementById('serverList')
const createServerBtn = document.getElementById('createServerBtn')

// ── Render ────────────────────────────────────────────────
function renderServerList() {
    serverListEl.innerHTML = ''
    if (!serverList.length) { serverListEl.innerHTML = '<li class="item-empty">No servers yet</li>'; return }

    serverList.forEach(s => {
        const li = document.createElement('li')
        li.className = 'server-item'
        const isOwnerOrAdmin = s.ownerVid === window.myVoidId
        const expanded = activeServer === s.id

        let groupsHtml = ''
        if (expanded && s.groups) {
            groupsHtml = s.groups.map(g => `
              <div class="server-group">
                <div class="server-group__header">
                  <span class="server-group__name">${window.escHtml(g.name)}</span>
                  ${isOwnerOrAdmin ? `<button class="btn-icon" data-action="add-room" data-server="${window.escHtml(s.id)}" data-group="${window.escHtml(g.id)}" title="Add room">＋</button>` : ''}
                </div>
                <ul class="server-group__rooms">
                  ${g.rooms.map(r => `
                    <li class="server-room-item${activeServerRoom.roomId === r.id ? ' server-room-item--active' : ''}"
                        data-server="${window.escHtml(s.id)}" data-room="${window.escHtml(r.id)}" data-name="${window.escHtml(r.name)}">
                      <span class="room-hash">#</span>${window.escHtml(r.name)}
                    </li>`).join('')}
                  ${g.rooms.length === 0 ? '<li class="item-empty" style="padding:3px 10px;font-size:.72rem">No rooms yet</li>' : ''}
                </ul>
              </div>`).join('') || '<span class="item-empty" style="padding:4px 10px;font-size:.72rem">No categories yet</span>'
        }

        li.innerHTML = `
          <div class="server-header" data-server="${window.escHtml(s.id)}">
            <div class="msg__avatar" style="background:${window.avatarColor(s.name)};width:28px;height:28px;font-size:.65rem;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${window.initials(s.name)}</div>
            <div class="server-header__info">
              <span class="server-name">${window.escHtml(s.name)}</span>
              <div class="server-id-row">
                <span class="server-id-chip">${window.escHtml(s.id)}</span>
                <button class="btn-icon server-id-copy" data-id="${window.escHtml(s.id)}" title="Copy Server ID">📋</button>
              </div>
            </div>
            <span style="font-size:.68rem;color:var(--tx3);flex-shrink:0">${s.memberCount}m</span>
            ${isOwnerOrAdmin ? `<button class="btn-icon" data-action="add-group" data-server="${window.escHtml(s.id)}" title="Add category">＋</button>` : ''}
          </div>
          ${expanded ? `<div class="server-groups">${groupsHtml}</div>` : ''}`

        serverListEl.appendChild(li)
    })

    // Header click — expand/collapse
    serverListEl.querySelectorAll('.server-header').forEach(h => {
        h.addEventListener('click', e => {
            if (e.target.closest('.btn-icon')) return
            activeServer = activeServer === h.dataset.server ? null : h.dataset.server
            renderServerList()
        })
    })

    // Room click
    serverListEl.querySelectorAll('.server-room-item').forEach(r => {
        r.addEventListener('click', () => {
            const s = serverList.find(s => s.id === r.dataset.server); if (!s) return
            enterServerRoom(r.dataset.server, r.dataset.room, s.name, r.dataset.name)
        })
    })

    // Add group
    serverListEl.querySelectorAll('[data-action="add-group"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation()
            const name = prompt('Category name:')
            if (name?.trim()) window.socket.emit('createServerGroup', { serverId: btn.dataset.server, name: name.trim() })
        })
    })

    // Add room
    serverListEl.querySelectorAll('[data-action="add-room"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation()
            const name = prompt('Room name:')
            if (name?.trim()) window.socket.emit('createServerRoom', { serverId: btn.dataset.server, groupId: btn.dataset.group, name: name.trim() })
        })
    })

    // Copy Server ID
    serverListEl.querySelectorAll('.server-id-copy').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation()
            navigator.clipboard.writeText(btn.dataset.id).then(() => {
                window.showToast('Server ID copied!', 'ok')
            }).catch(() => {
                window.showToast(btn.dataset.id, 'ok')
            })
        })
    })
}

function enterServerRoom(serverId, roomId, serverName, roomName) {
    activeServerRoom = { serverId, roomId }
    renderServerList()

    const chatScreen  = document.getElementById('chatScreen')
    const joinOverlay = document.getElementById('joinOverlay')
    joinOverlay.style.display  = 'none'
    chatScreen.style.display   = 'flex'
    if (window.showChat) window.showChat()
    chatScreen.dataset.mode    = 'server-room'

    document.querySelector('.ch-hash').style.display       = 'inline'
    document.getElementById('chAdminBadge').style.display   = 'none'
    document.getElementById('chLock').style.display         = 'none'
    document.getElementById('currentRoom').textContent      = `${serverName} › ${roomName}`
    const e2eBadge = document.getElementById('e2eBadge'); if (e2eBadge) e2eBadge.style.display = 'none'
    document.getElementById('msgInput').placeholder         = `Message #${roomName}`

    window.socket.emit('enterServerRoom', { serverId, roomId })
    window.socket.emit('getRoomKey', { serverId, roomId })
}

// ── Modals ────────────────────────────────────────────────
createServerBtn.addEventListener('click', () => document.getElementById('serverActionModal').style.display = 'flex')
document.getElementById('closeServerModal').addEventListener('click', () => document.getElementById('serverActionModal').style.display = 'none')

document.getElementById('serverModalTabs').addEventListener('click', e => {
    const tab = e.target.closest('.admin-tab'); if (!tab) return
    document.querySelectorAll('#serverModalTabs .admin-tab').forEach(t => t.classList.remove('admin-tab--active'))
    document.getElementById('serverTab-create').style.display = 'none'
    document.getElementById('serverTab-join').style.display   = 'none'
    tab.classList.add('admin-tab--active')
    document.getElementById(`serverTab-${tab.dataset.stab}`).style.display = 'flex'
})

document.getElementById('createServerForm').addEventListener('submit', e => {
    e.preventDefault()
    const name     = document.getElementById('serverNameInput').value.trim()
    const desc     = document.getElementById('serverDescInput').value.trim()
    const password = document.getElementById('serverPasswordInput').value
    if (!name) return
    window.socket.emit('createServer', { name, desc, password })
    document.getElementById('serverActionModal').style.display = 'none'
    document.getElementById('createServerForm').reset()
})

document.getElementById('joinServerForm').addEventListener('submit', e => {
    e.preventDefault()
    const serverId = document.getElementById('joinServerIdInput').value.trim().toUpperCase()
    const password = document.getElementById('joinServerPasswordInput').value
    if (!serverId) return
    const btn   = e.target.querySelector('button[type=submit]')
    const errEl = document.getElementById('joinServerError')
    btn.disabled = true; btn.textContent = 'Joining…'
    if (errEl) errEl.style.display = 'none'
    window.socket.emit('joinServer', { serverId, password })
})

// ── sendMsg override ──────────────────────────────────────
const _prevSendMsgS = window.sendMsg
window.sendMsg = async function() {
    const mode = document.getElementById('chatScreen').dataset.mode
    if (mode === 'server-room' && activeServerRoom.serverId) {
        const text = document.getElementById('msgInput').value.trim(); if (!text) return
        document.getElementById('msgInput').value = ''
        const roomKey = window.VoidCrypto?.getRoomKey(activeServerRoom.roomId)
        if (roomKey && window.VoidCrypto) {
            try {
                const { ciphertext, iv } = await window.VoidCrypto.encryptMsg(text, roomKey)
                window.socket.emit('serverMsg', { serverId: activeServerRoom.serverId, roomId: activeServerRoom.roomId, ciphertext, iv })
                return
            } catch (_) { /* fall through to plaintext */ }
        }
        window.socket.emit('serverMsg', { serverId: activeServerRoom.serverId, roomId: activeServerRoom.roomId, text })
        return
    }
    _prevSendMsgS()
}

// ── Socket events ─────────────────────────────────────────
window.socket.on('serverList',    ({ servers }) => { serverList = servers; renderServerList() })
window.socket.on('serverUpdated', ({ server }) => {
    const idx = serverList.findIndex(s => s.id === server.id)
    if (idx >= 0) serverList[idx] = server; else serverList.push(server)
    renderServerList()
})
window.socket.on('serverCreated', ({ server }) => {
    serverList.push(server); activeServer = server.id; renderServerList()
    window.showToast(`Server created — ID: ${server.id}`, 'success')
})
window.socket.on('serverJoined', ({ server }) => {
    document.getElementById('serverActionModal').style.display = 'none'
    document.getElementById('joinServerForm').reset()
    const _jsBtn = document.querySelector('#joinServerForm button[type=submit]')
    if (_jsBtn) { _jsBtn.disabled = false; _jsBtn.textContent = 'Join Server' }
    const idx = serverList.findIndex(s => s.id === server.id)
    if (idx >= 0) serverList[idx] = server; else serverList.push(server)
    activeServer = server.id; renderServerList()
    window.showToast(`Joined server "${server.name}"`, 'success')
})
window.socket.on('serverLeft', ({ serverId }) => {
    serverList = serverList.filter(s => s.id !== serverId)
    if (activeServer === serverId) activeServer = null
    if (activeServerRoom.serverId === serverId) {
        activeServerRoom = { serverId: null, roomId: null }
        document.getElementById('chatScreen').style.display = 'none'
        document.getElementById('joinOverlay').style.display = 'flex'
    }
    renderServerList()
})
window.socket.on('publicKey', async ({ voidId, publicKey, isSelf }) => {
    if (!publicKey || isSelf) return
    _srvPubKeys.set(voidId, publicKey)
})

window.socket.on('roomKeyPacket', async ({ serverId, roomId, wrappedKey }) => {
    if (!window.VoidCrypto) return
    for (const [, pub] of _srvPubKeys) {
        try {
            const sharedKey = await window.VoidCrypto.deriveSharedKey(pub)
            const roomKey   = await window.VoidCrypto.unwrapRoomKey(wrappedKey, sharedKey)
            window.VoidCrypto.setRoomKey(roomId, roomKey)
            return
        } catch (_) { continue }
    }
})

window.socket.on('serverRoomJoined', async ({ history }) => {
    const display = document.getElementById('chatDisplay')
    display.innerHTML = ''
    const roomKey = window.VoidCrypto?.getRoomKey(activeServerRoom.roomId)
    for (const m of (history || [])) {
        if (m.ciphertext && roomKey) {
            try { m.text = await window.VoidCrypto.decryptMsg(m.ciphertext, m.iv, roomKey); m.e2e = true }
            catch (_) { m.text = '⚠ [Decryption failed]' }
        }
        display.appendChild(window.buildMsgEl(m))
    }
    display.scrollTo({ top: display.scrollHeight })
})
window.socket.on('serverMsg', async ({ serverId, roomId, msg }) => {
    if (msg.ciphertext && window.VoidCrypto) {
        const roomKey = window.VoidCrypto.getRoomKey(roomId)
        if (roomKey) {
            try { msg.text = await window.VoidCrypto.decryptMsg(msg.ciphertext, msg.iv, roomKey); msg.e2e = true }
            catch (_) { msg.text = '⚠ [Decryption failed]' }
        } else { msg.text = '⚠ [Encrypted — key pending]' }
    }
    if (activeServerRoom.serverId === serverId && activeServerRoom.roomId === roomId) {
        const display = document.getElementById('chatDisplay')
        display.appendChild(window.buildMsgEl(msg))
        const near = display.scrollHeight - display.scrollTop - display.clientHeight < 160
        if (near) display.scrollTo({ top: display.scrollHeight, behavior: 'smooth' })
    }
})
window.socket.on('serverDelivered', ({ msgId }) => {
    const el = document.getElementById(`st-${msgId}`)
    if (el) { el.textContent = '✓✓'; el.className = 'msg__status msg__status--delivered' }
})
window.socket.on('serverError', ({ message }) => {
    const errEl = document.getElementById('joinServerError')
    const btn   = document.querySelector('#joinServerForm button[type=submit]')
    if (errEl) { errEl.textContent = message; errEl.style.display = 'block' }
    if (btn)   { btn.disabled = false; btn.textContent = 'Join Server' }
    window.showToast(message, 'error')
})

// ══════════════════════════════════════════════════════════
//  OWNER PANEL
// ══════════════════════════════════════════════════════════
let allUsersCache = []
let ownerAuditCache = []
let currentMaintenance = false

// ── Open / close ──────────────────────────────────────────
// ── Owner Panel — lives inside Admin Panel as the ⭐ Owner tab ──
function openOwnerTab() {
    const adminModal = document.getElementById('adminModal')
    if (adminModal.style.display === 'none') {
        // Show the modal directly without flashing the Users tab first
        const roomNameEl = document.getElementById('adminRoomName')
        if (roomNameEl) roomNameEl.textContent = window.myRoom || ''
        adminModal.style.display = 'flex'
    }
    document.querySelectorAll('#adminModal .admin-nav-item').forEach(i => i.classList.remove('admin-nav-item--active'))
    document.querySelectorAll('#adminModal .admin-section').forEach(s => s.style.display = 'none')
    const ownerNavItem = document.getElementById('ownerNavItem')
    if (ownerNavItem) ownerNavItem.classList.add('admin-nav-item--active')
    const ownerSection = document.getElementById('adminTab-owner')
    if (ownerSection) ownerSection.style.display = 'flex'
    window.socket.emit('ownerCmd', { cmd: 'getStats' })
}

document.getElementById('ownerPanelBtn').addEventListener('click', openOwnerTab)

// Also emit stats when the ⭐ Owner nav item is clicked directly inside the admin panel
// (the generic admin tab handler handles the tab switch; this adds the data fetch)
document.getElementById('ownerNavItem')?.addEventListener('click', () => {
    window.socket.emit('ownerCmd', { cmd: 'getStats' })
})

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

// ── MOTD ──────────────────────────────────────────────────
document.getElementById('ownerMotdBtn').addEventListener('click', () => {
    const text = document.getElementById('ownerMotdInput').value.trim()
    window.socket.emit('ownerCmd', { cmd: 'setMOTD', text })
    window.showToast('MOTD updated', 'success')
})

// ── Announce ──────────────────────────────────────────────
document.getElementById('ownerAnnounceBtn').addEventListener('click', () => {
    const text   = document.getElementById('ownerAnnounceInput').value.trim(); if (!text) return
    const target = document.getElementById('ownerAnnounceTarget').value
    const pinned = document.getElementById('ownerAnnouncePinned').checked
    window.socket.emit('ownerCmd', { cmd: 'announce', text, target, pinned })
    document.getElementById('ownerAnnounceInput').value = ''
    window.showToast('Announced', 'success')
})
document.getElementById('ownerScheduleBtn').addEventListener('click', () => {
    const text    = document.getElementById('ownerAnnounceInput').value.trim(); if (!text) return
    const timeVal = document.getElementById('ownerAnnounceTime').value
    if (!timeVal) { window.showToast('Pick a date/time first', 'error'); return }
    const sendAt = new Date(timeVal).getTime()
    const pinned = document.getElementById('ownerAnnouncePinned').checked
    window.socket.emit('ownerCmd', { cmd: 'scheduleAnnounce', text, sendAt, pinned })
    document.getElementById('ownerAnnounceInput').value = ''
    document.getElementById('ownerAnnounceTime').value = ''
})

// ── Bans ──────────────────────────────────────────────────
document.getElementById('ownerGlobalBanBtn').addEventListener('click', () => {
    const vid    = document.getElementById('ownerBanInput').value.trim().toUpperCase(); if (!vid) return
    const reason = document.getElementById('ownerBanReason').value.trim()
    window.socket.emit('ownerCmd', { cmd: 'globalBan', targetVoid: vid, reason })
    document.getElementById('ownerBanInput').value = ''
    document.getElementById('ownerBanReason').value = ''
})
document.getElementById('ownerGlobalUnbanBtn').addEventListener('click', () => {
    const vid = document.getElementById('ownerBanInput').value.trim().toUpperCase(); if (!vid) return
    window.socket.emit('ownerCmd', { cmd: 'globalUnban', targetVoid: vid })
    document.getElementById('ownerBanInput').value = ''
})
document.getElementById('ownerBanSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    const el = document.getElementById('ownerBanList')
    el.querySelectorAll('.owner-ban-row').forEach(row => {
        row.style.display = row.dataset.vid.toLowerCase().includes(q) || row.dataset.name.toLowerCase().includes(q) ? '' : 'none'
    })
})

function renderBanList(bans) {
    const el = document.getElementById('ownerBanList')
    el.innerHTML = !bans.length ? '<p style="color:var(--tx3);font-size:.78rem;padding:8px">No globally banned users.</p>' :
        bans.map(b => `
          <div class="owner-ban-row" data-vid="${window.escHtml(b.voidId)}" data-name="${window.escHtml(b.name||'')}">
            <div class="msg__avatar" style="background:var(--red);width:24px;height:24px;font-size:.55rem;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">🚫</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:.8rem;font-weight:600">${window.escHtml(b.voidId)} <span style="color:var(--tx3);font-weight:400">${window.escHtml(b.name||'')}</span></div>
              <div style="font-size:.7rem;color:var(--tx3)">${window.escHtml(b.reason||'—')} · ${b.bannedAt ? new Date(b.bannedAt).toLocaleDateString() : ''}</div>
            </div>
            <button class="admin-user-btn admin-user-btn--secondary" data-unbanvoid="${window.escHtml(b.voidId)}">Unban</button>
          </div>`).join('')
    el.querySelectorAll('[data-unbanvoid]').forEach(btn =>
        btn.addEventListener('click', () => window.socket.emit('ownerCmd', { cmd: 'globalUnban', targetVoid: btn.dataset.unbanvoid })))
}

// ── Stats + Sparkline ─────────────────────────────────────
document.getElementById('ownerUserSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    renderUserList(allUsersCache.filter(u => u.name.toLowerCase().includes(q) || u.voidId.toLowerCase().includes(q)))
})

function sparklineSVG(data, w=280, h=36) {
    if (!data || data.length < 2) return '<span style="color:var(--tx3);font-size:.72rem">Not enough data yet (refreshes every 60s)</span>'
    const vals = data.map(d => d.users)
    const max = Math.max(...vals, 1)
    const pts = vals.map((v, i) => {
        const x = (i / (vals.length - 1)) * w
        const y = h - Math.round((v / max) * h)
        return `${x},${y}`
    }).join(' ')
    return `<div style="font-size:.7rem;color:var(--tx3);margin-bottom:2px">Users last ${data.length} min (peak: ${max})</div>
    <svg width="${w}" height="${h}" style="display:block;overflow:visible">
      <polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="${(vals.length-1)/(vals.length-1)*w}" cy="${h - Math.round((vals[vals.length-1]/max)*h)}" r="3" fill="var(--acc)"/>
    </svg>`
}

function renderUserList(users) {
    const el = document.getElementById('ownerUserList')
    el.innerHTML = (users || []).map(u => `
      <div class="admin-user-row">
        <div class="msg__avatar" style="background:${window.avatarColor(u.name)};width:26px;height:26px;font-size:.6rem;border-radius:50%;display:flex;align-items:center;justify-content:center">${window.initials(u.name)}</div>
        <div class="admin-user-row__name">${window.escHtml(u.name)} <span style="color:var(--tx3);font-size:.7rem">#${window.escHtml(u.room||'')}</span></div>
        <div class="admin-user-row__btns">
          <button class="admin-user-btn admin-user-btn--danger" data-banvoid="${window.escHtml(u.voidId)}">Ban</button>
        </div>
      </div>`).join('')
    el.querySelectorAll('[data-banvoid]').forEach(btn =>
        btn.addEventListener('click', () => window.socket.emit('ownerCmd', { cmd: 'globalBan', targetVoid: btn.dataset.banvoid })))
}

// ── Filters (chips) ───────────────────────────────────────
document.getElementById('ownerFilterAddBtn').addEventListener('click', () => {
    const word = document.getElementById('ownerFilterInput').value.trim().toLowerCase()
    if (!word) return
    window.socket.emit('ownerCmd', { cmd: 'addFilter', word })
    document.getElementById('ownerFilterInput').value = ''
})
document.getElementById('ownerFilterInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('ownerFilterAddBtn').click() }
})

function renderFilterChips(words) {
    const el = document.getElementById('ownerFilterChips')
    el.innerHTML = !words.length ? '<span style="color:var(--tx3);font-size:.78rem">No filters active</span>' :
        words.map(w => `<span class="filter-chip">${window.escHtml(w)}<button data-word="${window.escHtml(w)}" title="Remove">✕</button></span>`).join('')
    el.querySelectorAll('[data-word]').forEach(btn =>
        btn.addEventListener('click', () => window.socket.emit('ownerCmd', { cmd: 'removeFilter', word: btn.dataset.word })))
}

// ── Settings ──────────────────────────────────────────────
document.getElementById('ownerSaveConfigBtn').addEventListener('click', () => {
    window.socket.emit('ownerCmd', { cmd: 'setConfig', config: {
        serverName:       document.getElementById('cfgServerName').value.trim() || 'VOID',
        maxUsers:         parseInt(document.getElementById('cfgMaxUsers').value) || 0,
        defaultChannel:   document.getElementById('cfgDefaultChannel').value.trim() || 'general',
        welcomeMsg:       document.getElementById('cfgWelcomeMsg').value.trim(),
        allowGuestNames:  document.getElementById('cfgAllowGuestNames').checked,
        registrationOpen: document.getElementById('cfgRegistrationOpen').checked
    }})
    const maint = document.getElementById('cfgMaintenance').checked
    if (maint !== currentMaintenance) window.socket.emit('ownerCmd', { cmd: 'setMaintenance', enabled: maint })
})

// ── Audit log ─────────────────────────────────────────────
document.getElementById('ownerAuditRefreshBtn').addEventListener('click', () =>
    window.socket.emit('ownerCmd', { cmd: 'getAuditLog' }))

function applyAuditFilters() {
    const type = document.getElementById('ownerAuditFilter').value
    const q    = document.getElementById('ownerAuditSearch').value.toLowerCase()
    document.getElementById('ownerAuditLog').querySelectorAll('.audit-entry').forEach(row => {
        const match = (!type || row.dataset.type === type) && (!q || row.textContent.toLowerCase().includes(q))
        row.style.display = match ? '' : 'none'
    })
}
document.getElementById('ownerAuditFilter').addEventListener('change', applyAuditFilters)
document.getElementById('ownerAuditSearch').addEventListener('input', applyAuditFilters)

const typeColors = { danger: 'var(--red)', warn: 'var(--acc)', info: 'var(--tx2)' }
function renderAuditEntry(entry) {
    const div = document.createElement('div')
    div.className = 'audit-entry'
    div.dataset.type = entry.action
    div.innerHTML = `<span style="color:var(--tx3);font-size:.7rem">${window.escHtml(entry.time)}</span>
      <span class="audit-badge" style="background:${typeColors[entry.type]||'var(--tx2)'}22;color:${typeColors[entry.type]||'var(--tx2)'}">${window.escHtml(entry.action)}</span>
      <span style="font-size:.78rem">${window.escHtml(entry.by)}</span>
      ${entry.target ? `→ <span style="font-size:.78rem;color:var(--acc)">${window.escHtml(entry.target)}</span>` : ''}`
    return div
}

// ── Transfer ownership ────────────────────────────────────
document.getElementById('ownerTransferBtn').addEventListener('click', () => {
    const vid = document.getElementById('ownerTransferInput').value.trim().toUpperCase()
    if (!vid) return
    if (!confirm(`Transfer server ownership to ${vid}?\n\nThis will permanently remove YOUR owner status. This cannot be undone.`)) return
    window.socket.emit('ownerCmd', { cmd: 'transferOwnership', targetVoid: vid })
    document.getElementById('ownerTransferInput').value = ''
    document.getElementById('adminModal').style.display = 'none'
})

// ── Socket events ─────────────────────────────────────────
window.socket.on('serverStats', ({ users, rooms, groups, motd, allUsers, statHistory, maintenanceMode }) => {
    allUsersCache = allUsers || []
    currentMaintenance = !!maintenanceMode

    document.getElementById('ownerMotdInput').value = motd || ''
    document.getElementById('ownerStatsCards').innerHTML = `
      <div class="owner-stat-card"><div class="owner-stat-card__val">${users}</div><div class="owner-stat-card__lbl">Online</div></div>
      <div class="owner-stat-card"><div class="owner-stat-card__val">${rooms.length}</div><div class="owner-stat-card__lbl">Channels</div></div>
      <div class="owner-stat-card"><div class="owner-stat-card__val">${groups}</div><div class="owner-stat-card__lbl">Groups</div></div>`
    document.getElementById('ownerSparkline').innerHTML = sparklineSVG(statHistory)

    document.getElementById('ownerRoomList').innerHTML = rooms.map(r => `
      <div class="owner-room-row">
        <div class="owner-room-row__info">#${window.escHtml(r.name)}</div>
        <div class="owner-room-row__count">${r.count} users</div>
        <button class="btn-icon" data-room="${window.escHtml(r.name)}" title="Delete">🗑</button>
      </div>`).join('')
    document.getElementById('ownerRoomList').querySelectorAll('[data-room]').forEach(btn =>
        btn.addEventListener('click', () => window.socket.emit('ownerCmd', { cmd: 'deleteRoom', room: btn.dataset.room })))

    renderUserList(allUsersCache)

    // Populate room select in Announce tab
    const sel = document.getElementById('ownerAnnounceTarget')
    sel.innerHTML = '<option value="all">All Rooms</option>' +
        rooms.map(r => `<option value="${window.escHtml(r.name)}">#${window.escHtml(r.name)}</option>`).join('')
})

window.socket.on('banList', ({ bans }) => renderBanList(bans))

window.socket.on('filterList', ({ words }) => renderFilterChips(words))

window.socket.on('serverConfig', ({ config }) => {
    currentMaintenance = !!config.maintenanceMode
    document.getElementById('cfgServerName').value      = config.serverName || ''
    document.getElementById('cfgMaxUsers').value        = config.maxUsers || 0
    document.getElementById('cfgDefaultChannel').value  = config.defaultChannel || 'general'
    document.getElementById('cfgWelcomeMsg').value      = config.welcomeMsg || ''
    document.getElementById('cfgAllowGuestNames').checked  = !!config.allowGuestNames
    document.getElementById('cfgRegistrationOpen').checked = !!config.registrationOpen
    document.getElementById('cfgMaintenance').checked      = !!config.maintenanceMode
})

window.socket.on('ownerAuditLog', ({ entries }) => {
    ownerAuditCache = entries || []
    const el = document.getElementById('ownerAuditLog')
    el.innerHTML = ''
    if (!entries.length) { el.innerHTML = '<p style="color:var(--tx3);font-size:.78rem;padding:8px">No audit entries yet.</p>'; return }
    entries.forEach(e => el.appendChild(renderAuditEntry(e)))
    applyAuditFilters()
})

window.socket.on('ownerAuditEntry', ({ entry }) => {
    const el = document.getElementById('ownerAuditLog')
    if (el && document.getElementById('ownerSub-audit')?.classList.contains('owner-sub-section--active')) {
        el.insertBefore(renderAuditEntry(entry), el.firstChild)
    }
})

window.socket.on('ownerError',   ({ message }) => window.showToast(message, 'error'))
window.socket.on('ownerSuccess', ({ message }) => window.showToast(message, 'success'))

window.socket.on('maintenanceLock', ({ message }) => {
    document.body.innerHTML = `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg1);flex-direction:column;gap:16px">
      <div style="font-size:2rem">🔧</div>
      <h2 style="color:var(--tx1)">Server Maintenance</h2>
      <p style="color:var(--tx2)">${window.escHtml(message)}</p>
    </div>`
})
