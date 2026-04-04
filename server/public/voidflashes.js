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
    return new Promise(resolve => {
        try {
            const c = document.createElement('canvas')
            c.width = 32; c.height = 32
            const img = new Image()
            img.onload = () => {
                try { c.getContext('2d').drawImage(img, 0, 0, 32, 32) } catch (_) {}
                resolve(c.toDataURL('image/jpeg', 0.5))
            }
            img.onerror = () => resolve(null)
            img.src = dataUrl
        } catch (_) { resolve(null) }
    })
}

function buildVfContent(text, attach, vfExpiry) {
    const imgHtml = attach?.mimeType?.startsWith('image/')
        ? `<img src="${window.escHtml(attach.dataUrl)}" class="vf-image"
            data-src="${window.escHtml(attach.dataUrl)}"
            onclick="window.openLightbox(this.dataset.src)">`
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
    const mode  = document.getElementById('chatScreen').dataset.mode
    const isDm  = mode === 'dm'
    const payload = JSON.stringify(attach ? { text, attach } : { text })

    let vfCipher, vfIv

    if (isDm) {
        // Guard early — no point doing crypto if there's no active DM
        const activeDmVoidId = window._getActiveDm?.()
        if (!activeDmVoidId) { window.showToast('No active DM', 'error'); return }

        const pubKey = window._getDmPubKey?.(activeDmVoidId)
        if (pubKey && window.VoidCrypto) {
            try {
                const sharedKey = await window.VoidCrypto.deriveSharedKey(pubKey)
                const enc = await window.VoidCrypto.encryptMsg(payload, sharedKey)
                vfCipher = enc.ciphertext; vfIv = enc.iv
            } catch (_) { vfCipher = btoa(unescape(encodeURIComponent(payload))); vfIv = null }
        } else {
            vfCipher = btoa(unescape(encodeURIComponent(payload))); vfIv = null
        }
        window.socket.emit('sendDm', {
            toVoidId: activeDmVoidId, voidFlash: true, vfExpiry: _vfExpiry,
            vfCipher, vfIv, vfThumb: attach ? await makeThumb(attach.dataUrl) : null
        })
    } else {
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
            vfCipher, vfIv, vfThumb: attach ? await makeThumb(attach.dataUrl) : null
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
    if (!li) return
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

    const cleanupGuard = attachScreenshotGuard(msg)
    if (msg.vfExpiry === 0) {
        deleteVoidFlash(li, msg, isDm, cleanupGuard)
    } else {
        startBurnTimer(li, msg, isDm, cleanupGuard)
    }
}

// ── Burn timer ────────────────────────────────────────
function startBurnTimer(li, msg, isDm, cleanupGuard) {
    const ms = msg.vfExpiry
    let remaining = ms
    const bar = li.querySelector('.vf-countdown')
    const tick = setInterval(() => {
        remaining -= 100
        if (bar) bar.style.width = Math.max(0, remaining / ms * 100) + '%'
        if (remaining <= 0) { clearInterval(tick); deleteVoidFlash(li, msg, isDm, cleanupGuard) }
    }, 100)
}

// ── Delete (both sides) ───────────────────────────────
function deleteVoidFlash(li, msg, isDm, cleanupGuard) {
    if (cleanupGuard) cleanupGuard()
    if (!li.isConnected) return
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
// Returns a cleanup function that removes the listeners (called on delete)
function attachScreenshotGuard(msg) {
    const isDm = document.getElementById('chatScreen').dataset.mode === 'dm'
    const send = () => window.socket.emit('vfScreenshot', {
        msgId: msg.id,
        isDm,
        senderVoidId: msg.fromVoidId || ''
    })
    const onVisibility = () => send()
    const onKeyup = e => { if (e.key === 'PrintScreen') send() }
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('keyup', onKeyup)
    return () => {
        document.removeEventListener('visibilitychange', onVisibility)
        document.removeEventListener('keyup', onKeyup)
    }
}

// ── Screenshot alert toast ────────────────────────────
window.socket.on('vfScreenshotAlert', ({ byName }) => {
    window.showToast(`👀 ${byName} screenshotted your VoidFlash`, 'warn')
})

// ── deleteMsg (server removed VoidFlash from history) ─
window.socket.on('deleteMsg', ({ msgId }) => {
    // First try fast path via data-msg-id attribute
    let el = document.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`)
    // Fallback: scan VoidFlash elements for matching id in dataset
    if (!el) {
        document.querySelectorAll('.msg--voidflash').forEach(candidate => {
            try {
                if (JSON.parse(candidate.dataset.vfMsg || '{}').id === msgId) el = candidate
            } catch (_) {}
        })
    }
    if (el && el.isConnected) {
        const ghost = document.createElement('li')
        ghost.className = 'msg msg--ghost'
        ghost.textContent = '⚡ VoidFlash expired'
        el.replaceWith(ghost)
    }
})

// ── Wrap sendMsg to intercept VoidFlash mode ──────────
const _prevSendMsgVF = window.sendMsg
window.sendMsg = async function() {
    if (!_vfMode) { await _prevSendMsgVF(); return }
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
