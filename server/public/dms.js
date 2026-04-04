// ═══════════════════════════════════════════════════════
//  dms.js — VOID v5  ·  Direct Messages module
// ═══════════════════════════════════════════════════════

let activeDm  = null   // voidId of open DM
let dmConvos  = {}     // voidId → [messages]
let dmUnreads = {}     // voidId → count
let dmMeta    = {}     // voidId → { name }

const _dmPubKeys  = new Map()   // voidId → base64 public key
const _dmKeyQueue = new Map()   // voidId → [pending text strings] — queued while key loads

function _fetchPubKey(vid) {
    if (_dmPubKeys.has(vid)) return
    window.socket.emit('getPublicKey', { voidId: vid })
}

const dmListEl  = document.getElementById('dmList')
const dmsTabDot = document.getElementById('dmsTabDot')

// ── Expose openDmWith for friends module ──────────────────
window.openDmWith = function(vid, name) {
    if (!dmMeta[vid]) dmMeta[vid] = { name }
    // Switch to DMs tab
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('sidebar-tab--active'))
    document.querySelectorAll('.sidebar__panel').forEach(p => p.style.display = 'none')
    document.querySelector('[data-panel="dms"]').classList.add('sidebar-tab--active')
    document.getElementById('panel-dms').style.display = 'flex'
    openDm(vid, name)
}

function openDm(vid, name) {
    activeDm = vid
    _fetchPubKey(vid)
    dmUnreads[vid] = 0
    renderDmList()
    updateDmsTabDot()

    const chatScreen  = document.getElementById('chatScreen')
    const joinOverlay = document.getElementById('joinOverlay')
    joinOverlay.style.display  = 'none'
    chatScreen.style.display   = 'flex'
    if (window.showChat) window.showChat()
    chatScreen.dataset.mode    = 'dm'

    // Header
    document.querySelector('.ch-hash').style.display      = 'none'
    document.getElementById('chAdminBadge').style.display  = 'none'
    document.getElementById('chLock').style.display        = 'none'
    document.getElementById('currentRoom').textContent     = name

    const e2eBadge = document.getElementById('e2eBadge')
    if (e2eBadge) e2eBadge.style.display = 'inline'
    document.getElementById('msgInput').placeholder = `Message ${name}`

    const display = document.getElementById('chatDisplay')
    display.innerHTML = ''
    if (dmConvos[vid]?.length) {
        dmConvos[vid].forEach(m => display.appendChild(window.buildMsgEl(m)))
        display.scrollTo({ top: display.scrollHeight })
    } else {
        window.socket.emit('openDm', { withVoidId: vid })
    }
}

function renderDmList() {
    const vids = Object.keys(dmMeta)
    dmListEl.innerHTML = ''
    if (!vids.length) {
        dmListEl.innerHTML = '<li class="item-empty">No DMs yet — add friends first</li>'
        return
    }
    vids.forEach(vid => {
        const meta   = dmMeta[vid]
        const msgs   = dmConvos[vid] || []
        const last   = msgs[msgs.length - 1]
        const unread = dmUnreads[vid] || 0
        const li = document.createElement('li')
        li.className = `friend-item${activeDm === vid ? ' friend-item--active' : ''}`
        li.innerHTML = `
          <div class="msg__avatar" style="background:${window.avatarColor(meta.name)};width:30px;height:30px;font-size:.7rem;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">${window.initials(meta.name)}</div>
          <div style="flex:1;overflow:hidden">
            <div style="font-size:.84rem;font-weight:600">${window.escHtml(meta.name)}</div>
            <div style="font-size:.72rem;color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${last ? window.escHtml((last.text || '').slice(0, 40)) : 'No messages yet'}</div>
          </div>
          ${unread ? `<span class="friend-unread">${unread}</span>` : ''}`
        li.addEventListener('click', () => openDm(vid, meta.name))
        dmListEl.appendChild(li)
    })
}

function updateDmsTabDot() {
    const total = Object.values(dmUnreads).reduce((a, b) => a + b, 0)
    const show = total > 0
    if (dmsTabDot) dmsTabDot.style.display = show ? 'inline-flex' : 'none'
    const dmsTabDotM = document.getElementById('dmsTabDotM')
    if (dmsTabDotM) dmsTabDotM.style.display = show ? 'inline-flex' : 'none'
}

// ── Override sendMsg for DM mode ──────────────────────────
const _prevSendMsg = window.sendMsg
window.sendMsg = async function() {
    const mode = document.getElementById('chatScreen').dataset.mode
    if (mode === 'dm' && activeDm) {
        const text = document.getElementById('msgInput').value.trim()
        if (!text) return
        document.getElementById('msgInput').value = ''

        const pubKey = _dmPubKeys.get(activeDm)
        if (pubKey && window.VoidCrypto) {
            try {
                const sharedKey = await window.VoidCrypto.deriveSharedKey(pubKey)
                const { ciphertext, iv } = await window.VoidCrypto.encryptMsg(text, sharedKey)
                window.socket.emit('sendDm', { toVoidId: activeDm, ciphertext, iv })
            } catch (_) {
                window.socket.emit('sendDm', { toVoidId: activeDm, text })
            }
        } else {
            if (!_dmKeyQueue.has(activeDm)) _dmKeyQueue.set(activeDm, [])
            _dmKeyQueue.get(activeDm).push(text)
            window.socket.emit('getPublicKey', { voidId: activeDm })
        }
        return
    }
    _prevSendMsg()
}

// ── Socket events ─────────────────────────────────────────
window.socket.on('publicKey', async ({ voidId, publicKey }) => {
    if (!publicKey) return
    _dmPubKeys.set(voidId, publicKey)
    const queue = _dmKeyQueue.get(voidId) || []
    _dmKeyQueue.delete(voidId)
    if (queue.length && window.VoidCrypto) {
        const sharedKey = await window.VoidCrypto.deriveSharedKey(publicKey)
        for (const text of queue) {
            const { ciphertext, iv } = await window.VoidCrypto.encryptMsg(text, sharedKey)
            window.socket.emit('sendDm', { toVoidId: voidId, ciphertext, iv })
        }
    }
})

window.socket.on('dmHistory', async ({ withVoidId, messages }) => {
    const pubKey = _dmPubKeys.get(withVoidId)
    if (pubKey && window.VoidCrypto) {
        const sharedKey = await window.VoidCrypto.deriveSharedKey(pubKey)
        for (const m of messages) {
            if (m.ciphertext) {
                try { m.text = await window.VoidCrypto.decryptMsg(m.ciphertext, m.iv, sharedKey); m.e2e = true }
                catch (_) { m.text = '⚠ [Decryption failed]' }
            }
        }
    }
    dmConvos[withVoidId] = messages
    if (activeDm === withVoidId) {
        const display = document.getElementById('chatDisplay')
        display.innerHTML = ''
        messages.forEach(m => display.appendChild(window.buildMsgEl(m)))
        display.scrollTo({ top: display.scrollHeight })
    }
})

window.socket.on('dm', async ({ msg, withVoidId }) => {
    if (msg.ciphertext && window.VoidCrypto) {
        const pubKey = _dmPubKeys.get(withVoidId)
        if (pubKey) {
            try {
                const sharedKey = await window.VoidCrypto.deriveSharedKey(pubKey)
                msg.text = await window.VoidCrypto.decryptMsg(msg.ciphertext, msg.iv, sharedKey)
                msg.e2e = true
            } catch (_) { msg.text = '⚠ [Decryption failed]'; msg.e2eErr = true }
        } else {
            msg.text = '⚠ [Encrypted — key unavailable]'
            msg.e2eWarn = true
        }
    }
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
})

window.socket.on('dmNotification', ({ fromVoidId, fromName, preview }) => {
    if (!dmMeta[fromVoidId]) dmMeta[fromVoidId] = { name: fromName }
    if (activeDm !== fromVoidId) {
        window.showToast(`💬 ${fromName}: ${preview}`, 'info')
        dmUnreads[fromVoidId] = (dmUnreads[fromVoidId] || 0) + 1
        updateDmsTabDot()
        renderDmList()
    }
})

window.socket.on('dmError', ({ message }) => window.showToast(message, 'error'))
