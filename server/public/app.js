// ═══════════════════════════════════════════════════════
//  VOID v3 — BlackCrownTech  ·  app.js
//  Features: Threema-ID login · admin · WebRTC calls
// ═══════════════════════════════════════════════════════

const socket = io('ws://localhost:3500')

// ─── DOM refs ────────────────────────────────────────────
const $ = id => document.getElementById(id)

// Identity
const idScreen        = $('idScreen')
const voidIdDisplay   = $('voidIdDisplay')
const nicknameInput   = $('nicknameInput')
const enterVoidBtn    = $('enterVoidBtn')
const pinUnlockSec    = $('pinUnlockSection')
const idSetupSec      = $('idSetupSection')
const pinUnlockError  = $('pinUnlockError')
const pinSetHint      = $('pinSetHint')

// App
const appEl           = $('app')
const joinOverlay     = $('joinOverlay')
const chatScreen      = $('chatScreen')
const joinAvatar      = $('joinAvatar')
const joinNameEl      = $('joinName')
const joinVidEl       = $('joinVid')
const roomInput       = $('roomInput')
const roomPassword    = $('roomPassword')
const passwordGroup   = $('passwordGroup')
const passwordError   = $('passwordError')
const msgInput        = $('msgInput')
const chatDisplay     = $('chatDisplay')
const activityBar     = $('activityBar')
const usersList       = $('usersList')
const roomListEl      = $('roomList')
const onlineCountEl   = $('onlineCount')
const currentRoomEl   = $('currentRoom')
const chLock          = $('chLock')
const chAdminBadge    = $('chAdminBadge')
const adminPanelBtn   = $('adminPanelBtn')
const pinnedBar       = $('pinnedBar')
const pinnedText      = $('pinnedText')
const replyPreview    = $('replyPreview')
const replyToNameEl   = $('replyToName')
const replyToTextEl   = $('replyToText')
const emojiPicker     = $('emojiPicker')
const searchBar       = $('searchBar')
const searchInput     = $('searchInput')
const profileAvatar   = $('profileAvatar')
const profileName     = $('profileName')
const profileStatus   = $('profileStatus')
const sideVoidIdVal   = $('sideVoidIdVal')
const adminSideSection= $('adminSideSection')
const slowBar         = $('slowBar')
const slowCountdown   = $('slowCountdown')

// ─── State ───────────────────────────────────────────────
let myName       = ''
let myRoom       = ''
let myVoidId     = ''
let amAdmin      = false
let replyingTo   = null
let typingUsers  = new Map()
let typingTimer  = null
let isTyping     = false
let currentStatus= 'online'
let pendingRoomSwitch = null
let slowSecs     = 0
let slowRemain   = 0
let slowInterval = null
let lastSentMs   = 0
let roomUserMap  = []   // latest users for this room (includes socket ids)

// PIN entry state
let pinUnlockBuf = ''
let pinSetBuf    = ''

// ═══════════════════════════════════════════════════════
//  VOID ID  —  Threema-style anonymous identity
// ═══════════════════════════════════════════════════════
const ID_KEY = 'void_identity'
const CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function genVoidId() {
    let id = 'V'
    for (let i = 0; i < 7; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)]
    return id
}

function sha256(str) {
    // Simple non-crypto hash for PIN (browser-side, for UX only)
    let h = 5381
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i)
    return (h >>> 0).toString(16).padStart(8, '0')
}

function loadIdentity() { try { return JSON.parse(localStorage.getItem(ID_KEY)) || null } catch { return null } }
function saveIdentity(obj) { localStorage.setItem(ID_KEY, JSON.stringify(obj)) }

function initIdentityScreen() {
    const stored = loadIdentity()

    if (stored?.voidId) {
        myVoidId = stored.voidId
        voidIdDisplay.textContent = stored.voidId

        if (stored.pinHash) {
            // Show PIN unlock
            idSetupSec.style.display   = 'none'
            pinUnlockSec.style.display = 'block'
            attachPinPad('pinPad', 6, updateUnlockDots, buf => attemptUnlock(buf, stored))
        } else {
            // No PIN — go to setup with prefilled nickname
            nicknameInput.value = stored.nickname || ''
            checkEnterBtn()
        }
    } else {
        // New user
        myVoidId = genVoidId()
        voidIdDisplay.textContent = myVoidId
        attachPinPad('pinSetPad', 6, updateSetDots, null)
    }
}

function attemptUnlock(buf, stored) {
    if (sha256(buf) === stored.pinHash) {
        pinUnlockError.style.display = 'none'
        pinUnlockSec.style.display   = 'none'
        idSetupSec.style.display     = 'block'
        nicknameInput.value = stored.nickname || ''
        attachPinPad('pinSetPad', 6, updateSetDots, null)
        checkEnterBtn()
    } else {
        pinUnlockError.style.display = 'block'
        pinUnlockBuf = ''
        updateUnlockDots('')
    }
}

// PIN pad builder
function attachPinPad(padId, maxLen, updateDots, onComplete) {
    const pad = $(padId)
    if (!padId || !pad) return
    let buf = padId === 'pinPad' ? pinUnlockBuf : pinSetBuf

    pad.addEventListener('click', e => {
        const key = e.target.closest('.pin-key')?.dataset.k
        if (!key) return

        if (key === 'del') {
            buf = buf.slice(0, -1)
        } else if (key === 'skip' && padId === 'pinSetPad') {
            pinSetBuf = ''
            pinSetHint.textContent = 'No PIN — identity unlocked by default'
            updateSetDots('')
            checkEnterBtn()
            return
        } else if (key === 'new') {
            // Use new identity
            localStorage.removeItem(ID_KEY)
            location.reload()
            return
        } else if (key.match(/^\d$/)) {
            if (buf.length < maxLen) buf += key
        }

        if (padId === 'pinPad') {
            pinUnlockBuf = buf
            updateDots(buf)
            if (buf.length >= 4 && onComplete) onComplete(buf)
        } else {
            pinSetBuf = buf
            updateDots(buf)
            if (buf.length >= 4) {
                pinSetHint.textContent = `PIN set: ${buf.length} digits`
                checkEnterBtn()
            } else {
                pinSetHint.textContent = `Enter 4–6 digits or skip`
            }
        }
    })
}

function updateUnlockDots(buf) {
    const dots = $('pinDots').querySelectorAll('span')
    dots.forEach((d, i) => d.classList.toggle('filled', i < buf.length))
}

function updateSetDots(buf) {
    const dots = $('pinSetDots').querySelectorAll('span')
    dots.forEach((d, i) => d.classList.toggle('filled', i < buf.length))
}

nicknameInput.addEventListener('input', checkEnterBtn)
function checkEnterBtn() {
    enterVoidBtn.disabled = !nicknameInput.value.trim()
}

$('regenVoidId').addEventListener('click', () => {
    myVoidId = genVoidId()
    voidIdDisplay.textContent = myVoidId
})

$('copyVoidId').addEventListener('click', () => {
    navigator.clipboard.writeText(myVoidId).then(() => showToast('VOID ID copied!', 'success'))
})

enterVoidBtn.addEventListener('click', () => {
    const nick = nicknameInput.value.trim()
    if (!nick) return
    const pin  = pinSetBuf.length >= 4 ? pinSetBuf : null
    saveIdentity({ voidId: myVoidId, nickname: nick, pinHash: pin ? sha256(pin) : null })
    myName = nick
    window.myVoidId = myVoidId
    window.myName   = myName
    window.sendMsg  = sendMsg
    showApp()
})

function showApp() {
    // Init E2E crypto
    if (window.VoidCrypto) {
        window.VoidCrypto.init().then(() => {
            socket.emit('publishKey', { publicKey: window.VoidCrypto.getPublicKeyB64() })
        })
    }
    idScreen.style.display = 'none'
    appEl.style.display    = 'flex'
    window.myVoidId = myVoidId
    window.myName   = myName
    // Pre-fill sidebar / join card with identity
    sideVoidIdVal.textContent = myVoidId
    $('sideVoidCopy').onclick = () => navigator.clipboard.writeText(myVoidId).then(() => showToast('VOID ID copied!', 'success'))
    joinAvatar.textContent    = initials(myName)
    joinAvatar.style.backgroundColor = avatarColor(myName)
    joinNameEl.textContent    = myName
    joinVidEl.textContent     = `VOID ID: ${myVoidId}`
    setProfile(myName, 'online')
    $('settingsVoidId').textContent = myVoidId
    $('settingsCopyVoid').onclick = () => navigator.clipboard.writeText(myVoidId).then(() => showToast('VOID ID copied!', 'success'))
    socket.emit('authenticate', { voidId: myVoidId, name: myName })
}

// ─── Init ─────────────────────────────────────────────────
initIdentityScreen()

// ═══════════════════════════════════════════════════════
//  AVATAR / FORMAT HELPERS
// ═══════════════════════════════════════════════════════
const AV_COLORS = ['#5b6cf5','#00c8ef','#22c55e','#f59e0b','#ef4444','#a78bfa','#ec4899','#14b8a6','#f97316','#38bdf8']

function avatarColor(name) {
    let h = 0
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
    return AV_COLORS[Math.abs(h) % AV_COLORS.length]
}

function initials(name) { return String(name).slice(0, 2).toUpperCase() }

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatText(raw) {
    let t = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>')
    t = t.replace(/~~(.+?)~~/g, '<del>$1</del>')
    t = t.replace(/(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp))(\s|$)/gi,
        '<a href="$1" target="_blank" rel="noopener"><img src="$1" class="msg-image" loading="lazy" alt="img"></a>$2')
    t = t.replace(/(?<![=">])(https?:\/\/[^\s<>]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    return t
}

// ═══════════════════════════════════════════════════════
//  MESSAGE RENDERING
// ═══════════════════════════════════════════════════════
function buildAttachHtml(attach) {
    if (!attach?.dataUrl) return ''
    if (attach.mimeType?.startsWith('image/')) {
        // data-src avoids JSON.stringify double-quotes breaking the onclick attribute
        return `<img src="${escHtml(attach.dataUrl)}" class="msg-image msg-image--upload"
          alt="${escHtml(attach.name)}" loading="lazy"
          data-src="${escHtml(attach.dataUrl)}"
          onclick="openLightbox(this.dataset.src)">`
    }
    return `<a class="msg-file-link" href="${escHtml(attach.dataUrl)}"
      download="${escHtml(attach.name)}">${escHtml(attach.name)}</a>`
}

function buildMsgEl(data) {
    const { id, name, text, time, type, replyTo, reactions } = data
    const isMine = name === myName
    const li = document.createElement('li')

    // VoidFlash messages render differently
    if (data.voidFlash && window.renderVoidFlash) {
        li.dataset.msgId = id
        window.renderVoidFlash(data, li)
        return li
    }

    if (type === 'system') {
        li.className = 'msg msg--system'
        li.innerHTML = `<span class="msg__system-text">${formatText(text)}</span>`
        return li
    }
    if (type === 'broadcast') {
        li.className = 'msg msg--broadcast'
        li.dataset.msgId = id
        li.innerHTML = `
        <div class="msg__avatar" style="background:${avatarColor(name)}">${initials(name)}</div>
        <div class="msg__content">
          <div class="msg__header">
            <span class="msg__name" style="color:${avatarColor(name)}">${escHtml(name)}</span>
            <span class="msg__time">${time}</span>
          </div>
          <div class="msg__text">${formatText(text)}</div>
        </div>`
        return li
    }

    li.className = 'msg'
    li.dataset.msgId = id

    const replyHtml = replyTo ? `
        <div class="msg__reply-ref">
          <span class="msg__reply-author">${escHtml(replyTo.name)}</span>
          <span class="msg__reply-text">${escHtml((replyTo.text||'').slice(0,60))}${(replyTo.text||'').length>60?'…':''}</span>
        </div>` : ''

    const rxHtml = reactions ? buildRxHtml(reactions) : ''

    li.innerHTML = `
      <div class="msg__avatar"></div>
      <div class="msg__content">
        ${replyHtml}
        <div class="msg__header">
          <span class="msg__name"></span>
          <span class="msg__time">${time}</span>
          ${data.e2e ? '<span class="msg__e2e" title="End-to-end encrypted">🔒</span>' : ''}
          ${data.e2eWarn ? '<span class="msg__e2e msg__e2e--warn" title="Unencrypted">⚠</span>' : ''}
          ${isMine ? `<span class="msg__status" id="st-${id}">✓</span>` : ''}
        </div>
        <div class="msg__text">${formatText(text || '')}</div>
        ${data.attach ? buildAttachHtml(data.attach) : ''}
        <div class="msg__reactions" id="rx-${id}">${rxHtml}</div>
      </div>
      <div class="msg__actions">
        <button class="msg-action-btn" data-action="react" data-mid="${id}" title="React">😊</button>
        <button class="msg-action-btn" data-action="reply" data-mid="${id}"
          data-name="${escHtml(name)}" data-text="${escHtml(text)}" title="Reply">↩</button>
      </div>`

    const av = li.querySelector('.msg__avatar')
    av.textContent = initials(name)
    av.style.backgroundColor = avatarColor(name)

    const nm = li.querySelector('.msg__name')
    nm.textContent = name
    nm.style.color = avatarColor(name)

    return li
}

function buildRxHtml(reactions) {
    return Object.entries(reactions)
        .filter(([,users]) => users.length)
        .map(([emoji, users]) => {
            const mine = users.includes(myName)
            return `<button class="reaction-btn${mine?' reaction-btn--active':''}"
              data-emoji="${escHtml(emoji)}" title="${users.map(escHtml).join(', ')}">
              ${emoji}<span class="reaction-count">${users.length}</span></button>`
        }).join('')
}

// ═══════════════════════════════════════════════════════
//  EMOJI PICKER
// ═══════════════════════════════════════════════════════
const EMOJIS = {
    'Smileys':  ['😀','😃','😄','😁','😅','🤣','😂','🙂','😊','😇','🥰','😍','😘','😋','😜','🤪','🤔','😐','😏','😒','😔','😢','😭','😤','😠','😡','🤬','🥺'],
    'Gestures': ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👋','👏','🙌','🤝','🙏','💪','✍️'],
    'Objects':  ['💬','🔒','🔓','🔑','🛡️','⚔️','🔧','⚙️','💻','📱','🎮','🎧','📡','🚀','🛸','💡','🔍','📌','📎','✉️','📣','🎤'],
    'Symbols':  ['❤️','🧡','💛','💚','💙','💜','🖤','💯','✅','❌','⚠️','🔴','🟡','🟢','🔵','⭐','🌟','⚡','🔥','💥','❓','❗'],
    'Food':     ['🍕','🍔','🌮','🍜','🍣','🍩','🍪','🎂','☕','🍺','🧃','🥤'],
    'Nature':   ['🐶','🐱','🦋','🔥','💧','🌊','🌙','⭐','🌈','🌸','🍀','🦄'],
}

;(function buildEmojiPicker() {
    for (const [cat, emojis] of Object.entries(EMOJIS)) {
        const sec  = document.createElement('div')
        sec.className = 'emoji-category'
        sec.innerHTML = `<div class="emoji-category__title">${cat}</div>`
        const grid = document.createElement('div')
        grid.className = 'emoji-grid'
        emojis.forEach(e => {
            const btn = document.createElement('button')
            btn.className = 'emoji-item'; btn.textContent = e
            btn.addEventListener('click', () => { msgInput.value += e; msgInput.focus(); emojiPicker.style.display = 'none' })
            grid.appendChild(btn)
        })
        sec.appendChild(grid)
        emojiPicker.appendChild(sec)
    }
})()

$('emojiBtn').addEventListener('click', e => {
    e.stopPropagation()
    emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none'
})
document.addEventListener('click', e => {
    if (!emojiPicker.contains(e.target) && e.target.id !== 'emojiBtn')
        emojiPicker.style.display = 'none'
})

// ═══════════════════════════════════════════════════════
//  SEND MESSAGE + SLASH COMMANDS
// ═══════════════════════════════════════════════════════
function sendMsg() {
    const text = msgInput.value.trim()
    if ((!text && !_pendingAttachment) || !myName || !myRoom) return

    // Slash command
    if (text.startsWith('/')) {
        if (amAdmin) { handleSlash(text); msgInput.value = ''; return }
        else { showToast('Admin only commands', 'error'); msgInput.value = ''; return }
    }

    // Slow-mode check
    if (slowSecs > 0 && !amAdmin) {
        const elapsed = (Date.now() - lastSentMs) / 1000
        if (elapsed < slowSecs) {
            showToast(`⏳ Slow mode — wait ${Math.ceil(slowSecs - elapsed)}s`, 'warn')
            return
        }
    }

    const payload = { name: myName, text, replyTo: replyingTo }
    if (_pendingAttachment) { payload.attach = _pendingAttachment; clearAttachment() }
    socket.emit('message', payload)
    lastSentMs = Date.now()
    msgInput.value = ''
    clearReply()
    stopTyping()
    msgInput.focus()
}

function handleSlash(text) {
    const parts = text.split(/\s+/)
    const cmd   = parts[0].slice(1).toLowerCase()
    const target = (parts[1] || '').replace('@', '')
    const rest   = parts.slice(1).join(' ')

    const map = {
        kick: () => socket.emit('adminCmd', { cmd: 'kick',      target }),
        mute: () => socket.emit('adminCmd', { cmd: 'mute',      target }),
        ban:  () => socket.emit('adminCmd', { cmd: 'ban',       target }),
        promote: () => socket.emit('adminCmd', { cmd: 'promote', target }),
        clear:   () => socket.emit('adminCmd', { cmd: 'clear' }),
        lock:    () => socket.emit('adminCmd', { cmd: 'lock' }),
        unlock:  () => socket.emit('adminCmd', { cmd: 'unlock' }),
        unpin:   () => socket.emit('adminCmd', { cmd: 'unpin' }),
        broadcast: () => socket.emit('adminCmd', { cmd: 'broadcast', data: rest }),
        pin:     () => socket.emit('adminCmd', { cmd: 'pin',      data: rest }),
        slow:      () => socket.emit('adminCmd', { cmd: 'slowmode',  data: parts[1] || 0 }),
        clearwarns:() => socket.emit('adminCmd', { cmd: 'clearwarns', target }),
        warn:      () => socket.emit('adminCmd', { cmd: 'warn',       target }),
        tempmute:  () => socket.emit('adminCmd', { cmd: 'tempmute',   target, data: parts[2] || 5 }),
        demote:    () => socket.emit('adminCmd', { cmd: 'demote',     target }),
        makemod:   () => socket.emit('adminCmd', { cmd: 'makemod',    target }),
        removemod: () => socket.emit('adminCmd', { cmd: 'removemod',  target }),
        settopic:  () => socket.emit('adminCmd', { cmd: 'settopic',   data: rest }),
        setwelcome:() => socket.emit('adminCmd', { cmd: 'setwelcome', data: rest }),
        addfilter: () => socket.emit('adminCmd', { cmd: 'addfilter',  data: rest }),
        remfilter: () => socket.emit('adminCmd', { cmd: 'remfilter',  data: rest }),
        auditlog:  () => socket.emit('adminCmd', { cmd: 'auditlog' }),
        delmsg:    () => socket.emit('adminCmd', { cmd: 'deleteMsg',  data: parts[1] }),
    }
    if (map[cmd]) map[cmd]()
    else showToast(`Unknown command: /${cmd}`, 'error')
}

$('sendBtn').addEventListener('click', () => window.sendMsg())
msgInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMsg() } })

// Expose sendMsg early so feature modules can wrap it at load time
window.sendMsg = sendMsg

// ── Typing ─────────────────────────────────────────────
function stopTyping() {
    if (isTyping) { isTyping = false; socket.emit('stopActivity') }
    clearTimeout(typingTimer)
}
msgInput.addEventListener('input', () => {
    if (!isTyping) { isTyping = true; socket.emit('activity', myName) }
    clearTimeout(typingTimer)
    typingTimer = setTimeout(stopTyping, 2500)
})

// ═══════════════════════════════════════════════════════
//  JOIN / AUTH FLOW
// ═══════════════════════════════════════════════════════
$('formJoin').addEventListener('submit', e => {
    e.preventDefault()
    const room = roomInput.value.trim()
    const pw   = roomPassword.value
    if (!room || !myName) return
    passwordError.style.display = 'none'
    socket.emit('enterRoom', { name: myName, room, password: pw, voidId: myVoidId })
})

let roomCheckTimer = null
roomInput.addEventListener('input', () => {
    clearTimeout(roomCheckTimer)
    roomCheckTimer = setTimeout(() => {
        const r = roomInput.value.trim()
        if (r) socket.emit('checkRoom', { room: r })
    }, 400)
})

// ── Message area interactions ──────────────────────────
chatDisplay.addEventListener('click', e => {
    const btn = e.target.closest('.msg-action-btn')
    if (btn) {
        if (btn.dataset.action === 'reply') setReply(btn.dataset.mid, btn.dataset.name, btn.dataset.text)
        else if (btn.dataset.action === 'react') openRxMenu(btn, btn.dataset.mid)
        return
    }
    const rx = e.target.closest('.reaction-btn')
    if (rx) {
        const li = rx.closest('.msg')
        if (li) socket.emit('reaction', { msgId: li.dataset.msgId, emoji: rx.dataset.emoji })
    }
})

// ── Reaction quick-menu ───────────────────────────────
let rxMenu = null
function openRxMenu(anchor, msgId) {
    if (rxMenu) { rxMenu.remove(); rxMenu = null }
    const quick = ['👍','👎','❤️','😂','😮','😢','🔥','✅']
    rxMenu = document.createElement('div')
    rxMenu.className = 'reaction-menu'
    quick.forEach(emoji => {
        const b = document.createElement('button')
        b.className = 'reaction-menu__item'; b.textContent = emoji
        b.addEventListener('click', () => { socket.emit('reaction', { msgId, emoji }); rxMenu.remove(); rxMenu = null })
        rxMenu.appendChild(b)
    })
    document.body.appendChild(rxMenu)
    const r = anchor.getBoundingClientRect()
    rxMenu.style.top  = `${r.top - 52}px`
    rxMenu.style.left = `${Math.max(4, r.left - 140)}px`
    setTimeout(() => document.addEventListener('click', () => { if (rxMenu) { rxMenu.remove(); rxMenu = null } }, { once: true }), 50)
}

// ── Reply ─────────────────────────────────────────────
function setReply(id, name, text) {
    replyingTo = { id, name, text }
    replyToNameEl.textContent = name
    replyToTextEl.textContent = text.slice(0, 80) + (text.length > 80 ? '…' : '')
    replyPreview.style.display = 'flex'
    msgInput.focus()
}
function clearReply() { replyingTo = null; replyPreview.style.display = 'none' }
$('cancelReply').addEventListener('click', clearReply)

// ── Search ────────────────────────────────────────────
$('searchBtn').addEventListener('click', () => {
    const show = searchBar.style.display === 'none'
    searchBar.style.display = show ? 'flex' : 'none'
    if (show) searchInput.focus(); else { searchInput.value = ''; clearSearch() }
})
$('searchClose').addEventListener('click', () => { searchBar.style.display = 'none'; searchInput.value = ''; clearSearch() })
searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim()
    chatDisplay.querySelectorAll('.msg').forEach(el => {
        if (!q) { el.style.opacity = '1'; el.classList.remove('msg--highlight'); return }
        const hit = (el.querySelector('.msg__text')?.textContent.toLowerCase().includes(q) ||
                     el.querySelector('.msg__name')?.textContent.toLowerCase().includes(q))
        el.style.opacity = hit ? '1' : '0.22'
        el.classList.toggle('msg--highlight', hit)
    })
})
function clearSearch() {
    chatDisplay.querySelectorAll('.msg').forEach(el => { el.style.opacity = '1'; el.classList.remove('msg--highlight') })
}

// ── Attach menu ───────────────────────────────────────
let _pendingAttachment = null
const attachMenu   = $('attachMenu')
const filePickerImg = $('filePickerImage')
const filePickerAny = $('filePickerAny')
const MAX_ATTACH_BYTES = 5_242_880  // 5 MB

$('attachBtn').addEventListener('click', e => {
    e.stopPropagation()
    attachMenu.style.display = attachMenu.style.display === 'none' ? 'flex' : 'none'
})
document.addEventListener('click', e => {
    if (attachMenu.style.display === 'none') return
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
    reader.onerror = () => showToast('Could not read file', 'error')
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

// ── Lightbox ──────────────────────────────────────────
window.openLightbox = function(src) {
    $('lightboxImg').src = src
    $('lightboxOverlay').classList.add('open')
}
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $('lightboxOverlay').classList.remove('open')
})

// ── Toggle users ──────────────────────────────────────
$('toggleUsersBtn').addEventListener('click', () => $('usersPanel').classList.toggle('users-panel--hidden'))

// ── Pinned bar ────────────────────────────────────────
$('pinnedClose').addEventListener('click', () => { pinnedBar.style.display = 'none' })

// ═══════════════════════════════════════════════════════
//  ADMIN UI
// ═══════════════════════════════════════════════════════
function setAdminUI(isAdmin) {
    amAdmin = isAdmin
    adminPanelBtn.style.display   = isAdmin ? 'flex' : 'none'
    chAdminBadge.style.display    = isAdmin ? 'inline' : 'none'
    adminSideSection.style.display= isAdmin ? 'block' : 'none'
}

// Open admin panel
function openAdminPanel() {
    $('adminRoomName').textContent = myRoom
    $('adminModal').querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('admin-nav-item--active'))
    $('adminModal').querySelector('[data-anav="users"]').classList.add('admin-nav-item--active')
    $('adminModal').querySelectorAll('.admin-section').forEach(s => s.style.display = 'none')
    $('adminTab-users').style.display = 'flex'
    populateAdminUsers()
    $('adminModal').style.display = 'flex'
}

adminPanelBtn.addEventListener('click', openAdminPanel)
$('sideAdminBtn').addEventListener('click', openAdminPanel)
$('closeAdminModal').addEventListener('click', () => $('adminModal').style.display = 'none')

// Admin tabs (scoped to admin modal only)
$('adminModal').querySelectorAll('.admin-nav-item').forEach(item => {
    item.addEventListener('click', () => {
        $('adminModal').querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('admin-nav-item--active'))
        $('adminModal').querySelectorAll('.admin-section').forEach(s => s.style.display = 'none')
        item.classList.add('admin-nav-item--active')
        $(`adminTab-${item.dataset.anav}`).style.display = 'flex'
    })
})

$('adminCmdSearch')?.addEventListener('input', function() {
    const q = this.value.toLowerCase()
    $('adminCmdList').querySelectorAll('.cmd-row').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? 'flex' : 'none'
    })
})

function populateAdminUsers() {
    const list = $('adminUserList')
    list.innerHTML = ''
    roomUserMap.forEach(user => {
        if (user.name === myName) return
        const row = document.createElement('div')
        row.className = 'admin-user-row'
        row.innerHTML = `
          <div class="msg__avatar" style="background:${avatarColor(user.name)};width:28px;height:28px;font-size:.65rem">${initials(user.name)}</div>
          <div class="admin-user-row__name">${escHtml(user.name)}
            ${user.isAdmin ? '<span class="admin-user-row__badge badge-admin">admin</span>' : ''}
            ${user.isMuted ? '<span class="admin-user-row__badge badge-muted">muted</span>' : ''}
          </div>
          <div class="admin-user-row__btns">
            <button class="admin-user-btn admin-user-btn--warn" data-cmd="mute" data-name="${escHtml(user.name)}">${user.isMuted ? 'Unmute' : 'Mute'}</button>
            <button class="admin-user-btn" data-cmd="promote" data-name="${escHtml(user.name)}">Promote</button>
            <button class="admin-user-btn admin-user-btn--danger" data-cmd="kick" data-name="${escHtml(user.name)}">Kick</button>
            <button class="admin-user-btn admin-user-btn--danger" data-cmd="ban"  data-name="${escHtml(user.name)}">Ban</button>
          </div>`
        list.appendChild(row)
    })
    if (!list.children.length) list.innerHTML = '<p style="color:var(--tx3);font-size:.82rem;padding:8px 0">No other users in channel.</p>'
}

$('adminUserList').addEventListener('click', e => {
    const btn = e.target.closest('[data-cmd]')
    if (!btn) return
    socket.emit('adminCmd', { cmd: btn.dataset.cmd, target: btn.dataset.name })
    $('adminModal').style.display = 'none'
})

$('aLockBtn').addEventListener('click', () => { socket.emit('adminCmd', { cmd:'lock'   }); $('adminModal').style.display='none' })
$('aUnlockBtn').addEventListener('click',() => { socket.emit('adminCmd', { cmd:'unlock' }); $('adminModal').style.display='none' })
$('aClearBtn').addEventListener('click', () => { if (confirm('Clear all chat history?')) { socket.emit('adminCmd', { cmd:'clear' }); $('adminModal').style.display='none' } })
$('aUnpinBtn').addEventListener('click', () => { socket.emit('adminCmd', { cmd:'unpin' }); $('adminModal').style.display='none' })

$('aPinBtn').addEventListener('click', () => {
    const txt = $('aPinInput').value.trim()
    if (!txt) return
    socket.emit('adminCmd', { cmd:'pin', data: txt })
    $('aPinInput').value = ''
    $('adminModal').style.display = 'none'
})
$('aBroadcastBtn').addEventListener('click', () => {
    const txt = $('aBroadcastInput').value.trim()
    if (!txt) return
    socket.emit('adminCmd', { cmd:'broadcast', data: txt })
    $('aBroadcastInput').value = ''
    $('adminModal').style.display = 'none'
})
$('aSlowBtn').addEventListener('click', () => {
    const s = parseInt($('aSlowInput').value) || 0
    socket.emit('adminCmd', { cmd:'slowmode', data: s })
    $('adminModal').style.display = 'none'
})

// Right-click context menu on user items
usersList.addEventListener('contextmenu', e => {
    e.preventDefault()
    const item = e.target.closest('.user-item')
    if (!item) return
    const name = item.dataset.name
    const sid  = item.dataset.sid
    if (!name) return
    showContextMenu(e.clientX, e.clientY, name, sid)
})

function showContextMenu(x, y, targetName, targetSid) {
    document.getElementById('voidCtx')?.remove()
    const menu = document.createElement('div')
    menu.id = 'voidCtx'; menu.className = 'context-menu'

    const isSelf = targetName === myName

    const items = [
        { icon:'📞', label:'Voice Call',  cls:'call', action:() => startCall(targetSid, targetName, 'audio') },
        { icon:'📹', label:'Video Call',  cls:'call', action:() => startCall(targetSid, targetName, 'video') },
    ]
    if (amAdmin && !isSelf) {
        items.push({ divider: true })
        items.push({ icon:'🔇', label:'Mute / Unmute', action:() => socket.emit('adminCmd',{ cmd:'mute',    target:targetName }) })
        items.push({ icon:'👢', label:'Kick',          cls:'danger', action:() => socket.emit('adminCmd',{ cmd:'kick',    target:targetName }) })
        items.push({ icon:'🚫', label:'Ban',           cls:'danger', action:() => socket.emit('adminCmd',{ cmd:'ban',     target:targetName }) })
        items.push({ icon:'👑', label:'Promote Admin', action:() => socket.emit('adminCmd',{ cmd:'promote', target:targetName }) })
    }

    items.forEach(opt => {
        if (opt.divider) { const d = document.createElement('div'); d.className = 'context-menu__divider'; menu.appendChild(d); return }
        const btn = document.createElement('button')
        btn.className = `context-menu__item${opt.cls ? ' context-menu__item--'+opt.cls : ''}`
        btn.innerHTML = `<span class="ctx-icon">${opt.icon}</span>${opt.label}`
        btn.addEventListener('click', () => { opt.action(); menu.remove() })
        menu.appendChild(btn)
    })

    document.body.appendChild(menu)
    menu.style.left = `${Math.min(x, window.innerWidth - 190)}px`
    menu.style.top  = `${Math.min(y, window.innerHeight - menu.scrollHeight - 10)}px`
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 50)
}

// ═══════════════════════════════════════════════════════
//  CREATE / SETTINGS MODALS
// ═══════════════════════════════════════════════════════
$('createRoomBtn').addEventListener('click', () => $('createRoomModal').style.display = 'flex')
$('cancelCreate').addEventListener('click',  () => $('createRoomModal').style.display = 'none')
$('closeCreateModal').addEventListener('click',() => $('createRoomModal').style.display = 'none')
$('createRoomForm').addEventListener('submit', e => {
    e.preventDefault()
    const room = $('newRoomName').value.trim()
    const pw   = $('newRoomPassword').value
    if (!room) return
    socket.emit('createRoom', { room, password: pw })
    $('createRoomModal').style.display = 'none'
    $('newRoomName').value = ''; $('newRoomPassword').value = ''
})

$('settingsBtn').addEventListener('click', () => $('settingsModal').style.display = 'flex')
$('closeSettings').addEventListener('click', () => $('settingsModal').style.display = 'none')

$('statusOptions').addEventListener('click', e => {
    const btn = e.target.closest('.status-opt')
    if (!btn) return
    document.querySelectorAll('.status-opt').forEach(b => b.classList.remove('status-opt--active'))
    btn.classList.add('status-opt--active')
    currentStatus = btn.dataset.status
    socket.emit('updateStatus', currentStatus)
    updateProfileStatus(currentStatus)
})

document.querySelectorAll('.modal-overlay').forEach(el =>
    el.addEventListener('click', e => { if (e.target === el) el.style.display = 'none' }))

// Room list click
roomListEl.addEventListener('click', e => {
    const item = e.target.closest('.room-item')
    if (!item?.dataset.room) return
    const room = item.dataset.room
    if (room === myRoom) return
    if (!myName) return
    pendingRoomSwitch = room
    socket.emit('checkRoom', { room })
})

// ═══════════════════════════════════════════════════════
//  WebRTC CALLS
// ═══════════════════════════════════════════════════════
const ICE = { iceServers: [
    { urls:'stun:stun.l.google.com:19302' },
    { urls:'stun:stun1.l.google.com:19302' }
]}

let pc          = null   // RTCPeerConnection
let localStream = null
let callWith    = null   // { sid, name }
let callType    = 'video'
let callTick    = null
let callSecs    = 0
let micOn       = true
let camOn       = true
let _pendingOffer = null

async function startCall(sid, name, type = 'video') {
    if (pc) { showToast('Already in a call', 'warn'); return }
    callType = type; callWith = { sid, name }
    localStream = await getLocalStream(type)
    if (!localStream) return
    showCallOverlay(name)
    $('callStatus').textContent = 'Calling…'
    pc = buildPC(sid)
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream))
    setLocalVid(localStream, type)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit('callOffer', { to: sid, offer: pc.localDescription, callType: type })
}

async function acceptCall(from, offer, type) {
    callType = type
    callWith = { ..._pendingOffer }
    $('incomingCall').style.display = 'none'
    localStream = await getLocalStream(type)
    if (!localStream) return
    showCallOverlay(callWith.name || from)
    $('callStatus').textContent = 'Connecting…'
    pc = buildPC(from)
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream))
    setLocalVid(localStream, type)
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket.emit('callAnswer', { to: from, answer: pc.localDescription })
}

function buildPC(targetSid) {
    const peer = new RTCPeerConnection(ICE)

    peer.onicecandidate = e => { if (e.candidate) socket.emit('callIce', { to: targetSid, candidate: e.candidate }) }

    peer.ontrack = e => {
        if (!e.streams[0]) return
        const vid = $('remoteVideo')
        const av  = $('callRemoteAv')
        vid.srcObject = e.streams[0]
        const hasVid = e.streams[0].getVideoTracks().length > 0
        vid.style.display = hasVid ? 'block' : 'none'
        av.style.display  = hasVid ? 'none'  : 'flex'
        $('callStatus').style.display = 'none'
        $('callTimer').style.display  = 'inline'
        startCallTick()
    }

    peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') endCall()
    }

    return peer
}

async function getLocalStream(type) {
    try {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' })
    } catch (err) {
        showToast(`Mic/camera error: ${err.message}`, 'error')
        return null
    }
}

function setLocalVid(stream, type) {
    const vid = $('localVideo')
    vid.srcObject = stream
    vid.style.display = type === 'video' ? 'block' : 'none'
}

function showCallOverlay(name) {
    $('callWithName').textContent = name
    const av = $('callRemoteAv')
    av.textContent = initials(name)
    av.style.backgroundColor = avatarColor(name)
    $('callOverlay').style.display = 'flex'
}

function endCall() {
    if (callWith) socket.emit('callEnd', { to: callWith.sid })
    if (pc) { pc.close(); pc = null }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null }
    if (callTick) { clearInterval(callTick); callTick = null; callSecs = 0 }
    callWith = null
    $('callOverlay').style.display   = 'none'
    $('remoteVideo').srcObject       = null
    $('localVideo').srcObject        = null
    $('callTimer').style.display     = 'none'
    $('callStatus').style.display    = 'inline'
    $('callStatus').textContent      = 'Calling…'
    micOn = true; camOn = true
    $('ctrlMic').classList.remove('call-ctrl--off')
    $('ctrlCam').classList.remove('call-ctrl--off')
    $('ctrlMic').textContent = '🎤'
    $('ctrlCam').textContent = '📹'
}

function startCallTick() {
    if (callTick) return
    callTick = setInterval(() => {
        callSecs++
        const m = String(Math.floor(callSecs/60)).padStart(2,'0')
        const s = String(callSecs%60).padStart(2,'0')
        $('callTimer').textContent = `${m}:${s}`
    }, 1000)
}

// Call controls
$('ctrlMic').addEventListener('click', () => {
    micOn = !micOn
    localStream?.getAudioTracks().forEach(t => { t.enabled = micOn })
    $('ctrlMic').classList.toggle('call-ctrl--off', !micOn)
    $('ctrlMic').textContent = micOn ? '🎤' : '🔇'
})

$('ctrlCam').addEventListener('click', () => {
    camOn = !camOn
    localStream?.getVideoTracks().forEach(t => { t.enabled = camOn })
    $('ctrlCam').classList.toggle('call-ctrl--off', !camOn)
    $('ctrlCam').textContent = camOn ? '📹' : '📷'
})

$('ctrlScreen').addEventListener('click', async () => {
    try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true })
        const st = ss.getVideoTracks()[0]
        const sender = pc?.getSenders().find(s => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(st)
        $('localVideo').srcObject = ss
        st.onended = () => {
            const cam = localStream?.getVideoTracks()[0]
            if (cam && sender) { sender.replaceTrack(cam); $('localVideo').srcObject = localStream }
        }
        showToast('Screen sharing started', 'success')
    } catch (err) {
        showToast(`Screen share failed: ${err.message}`, 'error')
    }
})

$('ctrlHangup').addEventListener('click', endCall)

$('acceptCall').addEventListener('click', () => {
    if (_pendingOffer) {
        acceptCall(_pendingOffer.sid, _pendingOffer.offer, _pendingOffer.callType)
        _pendingOffer = null
    }
})

$('rejectCall').addEventListener('click', () => {
    if (_pendingOffer) { socket.emit('callReject', { to: _pendingOffer.sid }); _pendingOffer = null }
    $('incomingCall').style.display = 'none'
})

// ═══════════════════════════════════════════════════════
//  SOCKET EVENTS
// ═══════════════════════════════════════════════════════

socket.on('joinSuccess', ({ name, room, isAdmin }) => {
    myName = name; myRoom = room
    chatDisplay.innerHTML = ''
    typingUsers.clear(); activityBar.innerHTML = ''
    joinOverlay.style.display  = 'none'
    chatScreen.style.display   = 'flex'
    if (window.showChat) window.showChat()
    currentRoomEl.textContent  = room
    msgInput.placeholder       = `Message #${room}`
    setProfile(name, currentStatus)
    setAdminUI(isAdmin)
    chLock.style.display = 'none'
    chatScreen.dataset.mode = 'channel'
    const _e2e = document.getElementById('e2eBadge'); if (_e2e) _e2e.style.display = 'none'
    document.querySelector('.ch-hash').style.display = 'inline'
    document.querySelectorAll('.room-item').forEach(el =>
        el.classList.toggle('room-item--active', el.dataset.room === room))
})

socket.on('adminStatus', ({ isAdmin }) => setAdminUI(isAdmin))

socket.on('joinError', ({ type, message }) => {
    if (type === 'wrongPassword') {
        passwordError.textContent = message
        passwordError.style.display = 'block'
        roomPassword.focus()
    } else if (type === 'rateLimit') {
        showToast(message, 'warn')
    } else {
        showToast(message, 'error')
    }
})

socket.on('roomInfo', ({ room, hasPassword, isLocked }) => {
    if (room === roomInput.value.trim()) {
        passwordGroup.style.display = hasPassword ? 'block' : 'none'
        if (passwordError.style.display !== 'block') passwordError.style.display = 'none'
    }
    if (pendingRoomSwitch === room && myName) {
        if (isLocked) { showToast('Channel is locked', 'warn'); pendingRoomSwitch = null; return }
        if (hasPassword) {
            const pw = prompt(`#${room} is password protected:`)
            if (pw === null) { pendingRoomSwitch = null; return }
            socket.emit('enterRoom', { name: myName, room, password: pw, voidId: myVoidId })
        } else {
            socket.emit('enterRoom', { name: myName, room, password: '', voidId: myVoidId })
        }
        pendingRoomSwitch = null
    }
})

socket.on('roomCreated', ({ room }) => {
    socket.emit('enterRoom', { name: myName || 'Guest', room, password: '', voidId: myVoidId })
})

socket.on('history', messages => {
    chatDisplay.innerHTML = ''
    messages.forEach(m => chatDisplay.appendChild(buildMsgEl(m)))
    if (messages.length) {
        const sep = document.createElement('li')
        sep.className = 'msg--separator'
        sep.innerHTML = '<span>─ message history ─</span>'
        chatDisplay.appendChild(sep)
    }
    scrollBottom()
})

socket.on('message', data => {
    activityBar.innerHTML = ''
    chatDisplay.appendChild(buildMsgEl(data))
    const near = chatDisplay.scrollHeight - chatDisplay.scrollTop - chatDisplay.clientHeight < 160
    if (near) scrollBottom(true)
})

socket.on('delivered', ({ msgId }) => {
    const el = $(`st-${msgId}`)
    if (el) { el.textContent = '✓✓'; el.className = 'msg__status msg__status--delivered' }
})

socket.on('reaction', ({ msgId, reactions }) => {
    const el = $(`rx-${msgId}`)
    if (el) el.innerHTML = buildRxHtml(reactions)
})

socket.on('activity', ({ name, sid }) => { typingUsers.set(sid, name); updateTypingBar() })
socket.on('stopActivity', ({ sid }) => { typingUsers.delete(sid); updateTypingBar() })

socket.on('chatCleared', () => { chatDisplay.innerHTML = ''; showToast('Chat cleared by admin', 'warn') })

socket.on('roomLocked', ({ locked }) => {
    chLock.style.display = locked ? 'inline' : 'none'
    showToast(locked ? '🔒 Channel locked' : '🔓 Channel unlocked', 'warn')
})

socket.on('pinnedMsg', msg => {
    if (!msg) { pinnedBar.style.display = 'none'; return }
    pinnedText.textContent  = msg.text
    pinnedBar.style.display = 'flex'
})

socket.on('slowMode', ({ seconds }) => {
    slowSecs = seconds
    if (seconds > 0) showToast(`🐌 Slow mode: ${seconds}s`, 'warn')
    else showToast('Slow mode disabled', 'success')
})

socket.on('muteStatus', ({ muted }) => {
    showToast(muted ? '🔇 You were muted' : '🔊 You were unmuted', muted ? 'warn' : 'success')
})

socket.on('kicked', ({ reason }) => {
    myRoom = ''
    chatScreen.style.display  = 'none'
    joinOverlay.style.display = 'flex'
    setAdminUI(false)
    showToast(reason || 'You were removed', 'error')
})

socket.on('adminError', ({ message }) => showToast(message, 'error'))

socket.on('userList', ({ users }) => {
    roomUserMap = users
    onlineCountEl.textContent = users.length
    usersList.innerHTML = ''
    users.forEach(user => {
        const li = document.createElement('li')
        li.className = 'user-item'
        li.dataset.name = user.name
        li.dataset.sid  = user.id
        const callBtns = user.name !== myName ? `
          <div class="user-item__call-btns">
            <button class="btn-icon" title="Voice call" onclick="startCall('${user.id}','${escHtml(user.name)}','audio')">📞</button>
            <button class="btn-icon" title="Video call" onclick="startCall('${user.id}','${escHtml(user.name)}','video')">📹</button>
          </div>` : ''
        li.innerHTML = `
          <div class="user-item__avatar" style="background:${avatarColor(user.name)}">${initials(user.name)}</div>
          <div class="user-item__info">
            <span class="user-item__name${user.name===myName?' user-item__name--me':''}${user.isAdmin?' user-item__name--admin':''}${user.isMuted?' user-item__name--muted':''}">${escHtml(user.name)}</span>
            <span class="user-item__status status--${user.status||'online'}">${statusLabel(user.status)}</span>
          </div>
          ${callBtns}`
        usersList.appendChild(li)
    })
    // Refresh admin panel if open
    if ($('adminModal').style.display !== 'none') populateAdminUsers()
})

socket.on('roomList', ({ rooms }) => {
    roomListEl.innerHTML = ''
    if (!rooms.length) { roomListEl.innerHTML = '<li class="room-item--empty">No active channels</li>'; return }
    rooms.forEach(room => {
        const li = document.createElement('li')
        li.className = `room-item${room===myRoom?' room-item--active':''}`
        li.dataset.room = room
        li.innerHTML = `<span class="room-hash">#</span><span>${escHtml(room)}</span>`
        roomListEl.appendChild(li)
    })
})

// ── WebRTC socket events ──────────────────────────────
socket.on('callOffer', ({ from, fromName, offer, callType: type }) => {
    if (pc) { socket.emit('callBusy', { to: from }); return }
    _pendingOffer = { sid: from, name: fromName, offer, callType: type }
    callWith      = { sid: from, name: fromName }
    const av = $('incomingAv')
    av.textContent = initials(fromName)
    av.style.backgroundColor = avatarColor(fromName)
    $('incomingName').textContent = fromName
    $('incomingType').textContent = type === 'video' ? '📹 Video call' : '📞 Voice call'
    $('incomingCall').style.display = 'flex'
})

socket.on('callAnswer', async ({ answer }) => {
    if (!pc) return
    await pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {})
})

socket.on('callIce', async ({ candidate }) => {
    if (!pc) return
    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
})

socket.on('callReject', () => {
    endCall()
    showToast(`${callWith?.name || 'User'} declined the call`, 'warn')
})
socket.on('callEnd',  () => endCall())
socket.on('callBusy', () => { showToast(`${callWith?.name || 'User'} is busy`, 'warn'); endCall() })

// ═══════════════════════════════════════════════════════
//  UI UTILITIES
// ═══════════════════════════════════════════════════════
function scrollBottom(smooth = false) {
    chatDisplay.scrollTo({ top: chatDisplay.scrollHeight, behavior: smooth ? 'smooth' : 'instant' })
}

function setProfile(name, status) {
    profileName.textContent = name
    profileAvatar.textContent = initials(name)
    profileAvatar.style.backgroundColor = avatarColor(name)
    updateProfileStatus(status)
}

function updateProfileStatus(status) {
    const labels = { online:'● Online', idle:'● Idle', dnd:'● Do Not Disturb' }
    profileStatus.textContent = labels[status] || '● Online'
    profileStatus.className   = `profile-status status--${status}`
}

function updateTypingBar() {
    const names = [...typingUsers.values()]
    if (!names.length) { activityBar.innerHTML = ''; return }
    const who  = names.length === 1 ? names[0] : names.length <= 3 ? names.join(', ') : 'Several people'
    const verb = names.length === 1 ? 'is' : 'are'
    activityBar.innerHTML =
        `<span><span class="typing-dots"><span></span><span></span><span></span></span> ${escHtml(who)} ${verb} typing…</span>`
}

function statusLabel(s) {
    return { online:'● Online', idle:'● Idle', dnd:'● DND' }[s] || '● Online'
}

function showToast(msg, type = 'info') {
    const t = document.createElement('div')
    t.className = `toast toast--${type}`
    t.textContent = msg
    document.body.appendChild(t)
    requestAnimationFrame(() => { requestAnimationFrame(() => t.classList.add('toast--visible')) })
    setTimeout(() => {
        t.classList.remove('toast--visible')
        setTimeout(() => t.remove(), 300)
    }, 3200)
}

// Expose startCall globally (used in onclick attributes)
window.startCall = startCall

// ── Expose globals for feature modules ───────────────────
window.socket      = socket
window.openAdminPanel = openAdminPanel
window.showToast   = showToast
window.clearAttachment = clearAttachment
Object.defineProperty(window, '_pendingAttachment', {
    get: () => _pendingAttachment,
    set: v => { _pendingAttachment = v }
})
Object.defineProperty(window, 'myRoom', { get: () => myRoom })
window.avatarColor = avatarColor
window.initials    = initials
window.escHtml     = escHtml
window.formatText  = formatText
window.buildMsgEl  = buildMsgEl
window.buildRxHtml = buildRxHtml
window.amOwner     = false

// ═══════════════════════════════════════════════════════
//  RESPONSIVE LAYOUT
// ═══════════════════════════════════════════════════════
function initLayout() {
    document.body.dataset.layout = window.innerWidth < 768 ? 'mobile' : 'desktop'
}
window.addEventListener('resize', initLayout)
initLayout()

window.showChat = function() {
    if (document.body.dataset.layout === 'mobile') {
        document.querySelector('.sidebar').style.transform = 'translateX(-100%)'
        const cw = document.querySelector('.chat-wrap')
        if (cw) cw.style.transform = 'translateX(0)'
    }
}
window.showSidebar = function() {
    document.querySelector('.sidebar').style.transform = ''
    const cw = document.querySelector('.chat-wrap')
    if (cw) cw.style.transform = ''
}

const backBtn = document.getElementById('backBtn')
if (backBtn) backBtn.addEventListener('click', window.showSidebar)

// ── Sidebar tab switching ─────────────────────────────────
document.getElementById('sidebarTabs').addEventListener('click', e => {
    const tab = e.target.closest('.sidebar-tab')
    if (!tab) return
    const panel = tab.dataset.panel
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('sidebar-tab--active'))
    document.querySelectorAll('.sidebar__panel').forEach(p => p.style.display = 'none')
    tab.classList.add('sidebar-tab--active')
    document.getElementById(`panel-${panel}`).style.display = 'flex'
    // Sync mobile tab bar
    document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('tab-item--active', t.dataset.panel === panel))
})

// Mobile bottom tab bar — mirrors sidebar panel switching
document.getElementById('tabBar')?.addEventListener('click', e => {
    const tab = e.target.closest('.tab-item'); if (!tab) return
    const panel = tab.dataset.panel
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('tab-item--active'))
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('sidebar-tab--active'))
    document.querySelectorAll('.sidebar__panel').forEach(p => p.style.display = 'none')
    tab.classList.add('tab-item--active')
    document.querySelector(`.sidebar-tab[data-panel="${panel}"]`)?.classList.add('sidebar-tab--active')
    const panelEl = document.getElementById(`panel-${panel}`)
    if (panelEl) panelEl.style.display = 'flex'
})

// ══════════════════════════════════════════════════════════
//  TASK 2: MOTD · globalBanned · warned · ownerStatus
//           Mod Tools buttons · Audit Log
// ══════════════════════════════════════════════════════════

// ── MOTD ─────────────────────────────────────────────────
socket.on('motd', ({ text }) => {
    let bar = document.getElementById('motdBar')
    if (!bar) {
        bar = document.createElement('div')
        bar.id = 'motdBar'; bar.className = 'motd-bar'
        bar.innerHTML = `<span class="motd-bar__icon">📢</span><span id="motdText"></span><button class="motd-bar__close" id="motdClose">✕</button>`
        document.body.prepend(bar)
        document.getElementById('motdClose').addEventListener('click', () => bar.remove())
    }
    document.getElementById('motdText').textContent = text
    bar.style.display = 'flex'
})

// ── Global ban ────────────────────────────────────────────
socket.on('globalBanned', ({ message }) => {
    document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#09090c;flex-direction:column;gap:16px;color:#ef4444;font-family:system-ui">
      <div style="font-size:3rem">⛔</div>
      <div style="font-size:1.2rem;font-weight:700">Globally Banned</div>
      <div style="color:#6b7490;font-size:.9rem">${escHtml(message)}</div>
    </div>`
    socket.disconnect()
})

// ── Warned ────────────────────────────────────────────────
socket.on('warned', ({ count, by }) => {
    showToast(`⚠ Warning ${count}/3 issued by ${by}`, 'warn')
    const li = document.createElement('li')
    li.className = 'msg msg--warn'
    li.innerHTML = `<div class="msg__content"><div class="msg__text">⚠ You have been warned by <strong>${escHtml(by)}</strong>. Warnings: ${count}/3</div></div>`
    chatDisplay.appendChild(li)
    chatDisplay.scrollTo({ top: chatDisplay.scrollHeight, behavior: 'smooth' })
})

// ── ownerStatus ───────────────────────────────────────────
socket.on('ownerStatus', ({ isOwner }) => {
    window.amOwner = isOwner
    $('ownerPanelBtn').style.display  = isOwner ? 'block' : 'none'
    $('claimOwnerBtn').style.display  = isOwner ? 'none'  : 'block'
    const ownerNavItem = $('ownerNavItem')
    if (ownerNavItem) ownerNavItem.style.display = isOwner ? 'flex' : 'none'
})

// ── adminSuccess ──────────────────────────────────────────
socket.on('adminSuccess', ({ message }) => showToast(message, 'success'))

// ── msgDeleted ────────────────────────────────────────────
socket.on('msgDeleted', ({ msgId }) => {
    document.querySelector(`[data-msg-id="${msgId}"]`)?.remove()
})

// ── Audit log handler ─────────────────────────────────────
socket.on('auditLog', ({ logs }) => {
    const el = $('auditLogContent')
    if (!el) return
    if (!logs?.length) {
        el.innerHTML = '<p style="color:var(--tx3);font-size:.8rem">No audit entries yet.</p>'
        return
    }
    el.innerHTML = logs.map(l => {
        const type = l.action === 'ban'  ? 'ban'
                   : l.action === 'kick' ? 'kick'
                   : l.action === 'join' ? 'join'
                   : l.action === 'mute' ? 'mod'
                   : l.action === 'warn' ? 'mod'
                   : 'mod'
        return `<div class="audit-entry audit-entry--${type}">
            <span class="audit-entry__time">${escHtml(l.time || '')}</span>
            <span class="audit-entry__text"><strong>${escHtml(l.by||'')}</strong> → ${escHtml(l.action||'')}${l.target ? ` <em>${escHtml(l.target)}</em>` : ''}</span>
        </div>`
    }).join('')
})

// ── roomTopic handler ─────────────────────────────────────
socket.on('roomTopic', ({ topic }) => {
    const bar = $('topicBar'); if (!bar) return
    if (!topic) { bar.style.display = 'none'; return }
    bar.innerHTML = `<span style="color:var(--acc)">📌</span><span>${escHtml(topic)}</span>`
    bar.style.display = 'flex'
})

// ── Mod Tools button wiring ───────────────────────────────
$('aWarnBtn').addEventListener('click', () => {
    const t = $('aWarnInput').value.trim().replace('@',''); if (!t) return
    socket.emit('adminCmd', { cmd:'warn', target:t }); $('aWarnInput').value=''
    $('adminModal').style.display='none'
})
$('aTempMuteBtn').addEventListener('click', () => {
    const t = $('aTempMuteUser').value.trim().replace('@','')
    const m = $('aTempMuteMins').value || 5; if (!t) return
    socket.emit('adminCmd', { cmd:'tempmute', target:t, data:m })
    $('adminModal').style.display='none'
})
$('aMakeModBtn').addEventListener('click', () => {
    const t = $('aMakeModInput').value.trim().replace('@',''); if (!t) return
    socket.emit('adminCmd', { cmd:'makemod', target:t }); $('aMakeModInput').value=''
    $('adminModal').style.display='none'
})
$('aRemoveModBtn').addEventListener('click', () => {
    const t = $('aMakeModInput').value.trim().replace('@',''); if (!t) return
    socket.emit('adminCmd', { cmd:'removemod', target:t }); $('aMakeModInput').value=''
    $('adminModal').style.display='none'
})
$('aTopicBtn').addEventListener('click', () => {
    const d = $('aTopicInput').value.trim()
    socket.emit('adminCmd', { cmd:'settopic', data:d }); $('aTopicInput').value=''
    $('adminModal').style.display='none'
})
$('aAddFilterBtn').addEventListener('click', () => {
    const d = $('aFilterInput').value.trim(); if (!d) return
    socket.emit('adminCmd', { cmd:'addfilter', data:d }); $('aFilterInput').value=''
    $('adminModal').style.display='none'
})
$('aRemFilterBtn').addEventListener('click', () => {
    const d = $('aFilterInput').value.trim(); if (!d) return
    socket.emit('adminCmd', { cmd:'remfilter', data:d }); $('aFilterInput').value=''
    $('adminModal').style.display='none'
})
$('aAuditRefreshBtn').addEventListener('click', () => socket.emit('adminCmd', { cmd:'auditlog' }))

// ── Claim owner modal wiring ──────────────────────────────
$('claimOwnerBtn').addEventListener('click', () => {
    $('claimOwnerModal').style.display = 'flex'
    $('ownerKeyInput').focus()
})
$('closeClaimOwner').addEventListener('click', () => $('claimOwnerModal').style.display = 'none')
$('cancelClaimOwner').addEventListener('click', () => $('claimOwnerModal').style.display = 'none')
$('submitClaimOwner').addEventListener('click', () => {
    const key = $('ownerKeyInput').value.trim(); if (!key) return
    socket.emit('claimOwner', { key })
    $('claimOwnerModal').style.display = 'none'
    $('ownerKeyInput').value = ''
})
