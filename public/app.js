// ═══════════════════════════════════════════════════════
//  VOID v4 — BlackCrownTech  ·  app.js
//  Friends · Groups · DMs · Owner · Admin · WebRTC Calls
// ═══════════════════════════════════════════════════════
'use strict'

const socket = io('ws://localhost:3500')
const $  = id => document.getElementById(id)
const $$ = sel => document.querySelectorAll(sel)

// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
let myName     = ''
let myVoidId   = ''
let myRoom     = ''
let amAdmin    = false
let amOwner    = false

// Chat mode: 'none' | 'room' | 'dm' | 'group'
let chatMode   = 'none'
let dmPartner  = null      // { voidId, name }
let activeGroup= null      // group public object
let groupRole  = 'member'  // 'owner'|'admin'|'member'

let replyingTo  = null
let typingUsers = new Map()
let typingTimer = null
let isTyping    = false
let slowSecs    = 0
let lastSentMs  = 0
let currentStatus = 'online'
let roomUserMap   = []     // latest richUsers list
let myFriends     = []     // [{voidId,name,online}]
let myGroups      = []     // group public objects
let friendReqs    = []     // pending incoming requests
let pendingGroupInvite = null  // {groupId,groupName,invitedBy,color}
let dmUnread      = new Map()  // voidId → count
let pendingRoomSwitch = null

// ═══════════════════════════════════════════════════════
//  VOID-ID IDENTITY
// ═══════════════════════════════════════════════════════
const ID_KEY = 'void_identity_v4'
const CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function genVoidId() {
    let id = 'V'
    for (let i = 0; i < 7; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)]
    return id
}
function simHash(str) {
    let h = 5381
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i)
    return (h >>> 0).toString(16).padStart(8, '0')
}
function loadId()    { try { return JSON.parse(localStorage.getItem(ID_KEY)) } catch { return null } }
function saveId(obj) { localStorage.setItem(ID_KEY, JSON.stringify(obj)) }

// ── PIN pad ───────────────────────────────────────────
let pinUnlockBuf = '', pinSetBuf = ''

function attachPinPad(padId, onFill, onSkip) {
    const pad = $(padId); if (!pad) return
    pad.addEventListener('click', e => {
        const k = e.target.closest('.pin-key')?.dataset.k; if (!k) return
        let buf = padId === 'pinPad' ? pinUnlockBuf : pinSetBuf
        if (k === 'del')  buf = buf.slice(0, -1)
        else if (k === 'skip' && onSkip) { if (padId === 'pinSetPad') { pinSetBuf = ''; onSkip() } return }
        else if (k === 'new') { localStorage.removeItem(ID_KEY); location.reload(); return }
        else if (/^\d$/.test(k) && buf.length < 6) buf += k
        padId === 'pinPad' ? (pinUnlockBuf = buf) : (pinSetBuf = buf)
        updateDots(padId === 'pinPad' ? 'pinDots' : 'pinSetDots', buf)
        if (buf.length >= 4 && onFill) onFill(buf)
    })
}

function updateDots(dotsId, buf) {
    $$(` #${dotsId} span`).forEach((d, i) => d.classList.toggle('filled', i < buf.length))
}

function initIdentityScreen() {
    const stored = loadId()
    if (stored?.voidId) {
        myVoidId = stored.voidId
        $('voidIdDisplay').textContent = stored.voidId
        if (stored.pinHash) {
            $('idSetupSection').style.display  = 'none'
            $('pinUnlockSection').style.display = 'block'
            attachPinPad('pinPad', buf => {
                if (simHash(buf) === stored.pinHash) {
                    $('pinUnlockError').style.display  = 'none'
                    $('pinUnlockSection').style.display = 'none'
                    $('idSetupSection').style.display   = 'block'
                    $('nicknameInput').value = stored.nickname || ''
                    attachPinPad('pinSetPad', () => checkEnterBtn(), () => { pinSetBuf=''; $('pinSetHint').textContent='No PIN — skip'; checkEnterBtn() })
                    checkEnterBtn()
                } else { pinUnlockBuf=''; updateDots('pinDots',''); $('pinUnlockError').style.display='block' }
            }, null)
        } else {
            $('nicknameInput').value = stored.nickname || ''
            attachPinPad('pinSetPad', () => checkEnterBtn(), () => { pinSetBuf=''; $('pinSetHint').textContent='No PIN'; checkEnterBtn() })
            checkEnterBtn()
        }
    } else {
        myVoidId = genVoidId()
        $('voidIdDisplay').textContent = myVoidId
        attachPinPad('pinSetPad', () => checkEnterBtn(), () => { pinSetBuf=''; $('pinSetHint').textContent='No PIN — skip'; checkEnterBtn() })
    }
}

$('nicknameInput').addEventListener('input', checkEnterBtn)
function checkEnterBtn() { $('enterVoidBtn').disabled = !$('nicknameInput').value.trim() }

$('regenVoidId').addEventListener('click', () => { myVoidId = genVoidId(); $('voidIdDisplay').textContent = myVoidId })
$('copyVoidId').addEventListener('click',  () => navigator.clipboard.writeText(myVoidId).then(() => toast('VOID ID copied!','success')))

$('enterVoidBtn').addEventListener('click', () => {
    const nick = $('nicknameInput').value.trim(); if (!nick) return
    const pin  = pinSetBuf.length >= 4 ? pinSetBuf : null
    saveId({ voidId: myVoidId, nickname: nick, pinHash: pin ? simHash(pin) : null })
    myName = nick
    showApp()
})

function showApp() {
    $('idScreen').style.display = 'none'
    $('app').style.display      = 'flex'
    $('sideVoidIdVal').textContent = myVoidId
    $('joinAvatar').textContent    = ini(myName)
    $('joinAvatar').style.backgroundColor = avColor(myName)
    $('joinName').textContent  = myName
    $('joinVid').textContent   = `VOID ID: ${myVoidId}`
    $('myVoidIdDisplay2').textContent = myVoidId
    $('settingsVoidId').textContent   = myVoidId
    setProfile(myName, 'online')
    $('sideVoidCopy').onclick = () => navigator.clipboard.writeText(myVoidId).then(() => toast('Copied!','success'))
    $('settingsCopyVoid').onclick = () => navigator.clipboard.writeText(myVoidId).then(() => toast('Copied!','success'))
    socket.emit('authenticate', { voidId: myVoidId, name: myName })
    // Show claim owner button always (user can try)
    $('ownerSideSection').style.display = 'block'
    $('ownerPanelBtn').style.display    = 'none'
}

initIdentityScreen()

// ═══════════════════════════════════════════════════════
//  AVATAR / FORMAT HELPERS
// ═══════════════════════════════════════════════════════
const AV = ['#5b6cf5','#00c8ef','#22c55e','#f59e0b','#ef4444','#a78bfa','#ec4899','#14b8a6','#f97316','#38bdf8']
function avColor(n) { let h=0; for(let i=0;i<n.length;i++) h=n.charCodeAt(i)+((h<<5)-h); return AV[Math.abs(h)%AV.length] }
function ini(n) { return String(n).slice(0,2).toUpperCase() }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

function fmt(raw) {
    let t = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    t = t.replace(/`([^`]+)`/g,'<code>$1</code>')
    t = t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    t = t.replace(/\*(.+?)\*/g,'<em>$1</em>')
    t = t.replace(/~~(.+?)~~/g,'<del>$1</del>')
    t = t.replace(/(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp))(\s|$)/gi,'<a href="$1" target="_blank" rel="noopener"><img src="$1" class="msg-image" loading="lazy" alt="img"></a>$2')
    t = t.replace(/(?<![=">])(https?:\/\/[^\s<>]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>')
    return t
}

// ═══════════════════════════════════════════════════════
//  MESSAGE RENDERING
// ═══════════════════════════════════════════════════════
function buildMsgEl(data, opts = {}) {
    const { id, name, text, time, type, replyTo, reactions } = data
    const li = document.createElement('li')

    if (type === 'system') {
        li.className = 'msg msg--system'
        li.innerHTML = `<span class="msg__system-text">${fmt(text)}</span>`
        return li
    }
    if (type === 'broadcast') {
        li.className = 'msg msg--broadcast'; li.dataset.msgId = id
        li.innerHTML = `<div class="msg__avatar" style="background:${avColor(name)}">${ini(name)}</div>
        <div class="msg__content"><div class="msg__header"><span class="msg__name" style="color:${avColor(name)}">${esc(name)}</span><span class="msg__time">${time}</span></div>
        <div class="msg__text">${fmt(text)}</div></div>`
        return li
    }

    const isMine = name === myName
    li.className = 'msg'; li.dataset.msgId = id

    const replyHtml = replyTo ? `<div class="msg__reply-ref"><span class="msg__reply-author">${esc(replyTo.name)}</span><span class="msg__reply-text">${esc((replyTo.text||'').slice(0,60))}${(replyTo.text||'').length>60?'…':''}</span></div>` : ''
    const rxHtml = reactions ? buildRxHtml(reactions) : ''
    const delBtn = (amAdmin || amOwner) ? `<button class="msg-action-btn msg-action-btn--del" data-action="del" data-mid="${id}" title="Delete">🗑</button>` : ''

    li.innerHTML = `
      <div class="msg__avatar"></div>
      <div class="msg__content">
        ${replyHtml}
        <div class="msg__header">
          <span class="msg__name"></span>
          <span class="msg__time">${time}</span>
          ${isMine?`<span class="msg__status" id="st-${id}">✓</span>`:''}
        </div>
        <div class="msg__text">${fmt(text)}</div>
        <div class="msg__reactions" id="rx-${id}">${rxHtml}</div>
      </div>
      <div class="msg__actions">
        <button class="msg-action-btn" data-action="react" data-mid="${id}" title="React">😊</button>
        <button class="msg-action-btn" data-action="reply" data-mid="${id}" data-name="${esc(name)}" data-text="${esc(text)}" title="Reply">↩</button>
        ${delBtn}
      </div>`
    const av = li.querySelector('.msg__avatar'); av.textContent=ini(name); av.style.backgroundColor=avColor(name)
    const nm = li.querySelector('.msg__name');   nm.textContent=name; nm.style.color=avColor(name)
    return li
}

function buildRxHtml(rx) {
    return Object.entries(rx).filter(([,u])=>u.length).map(([e,u])=>{
        const mine = u.includes(myName)
        return `<button class="reaction-btn${mine?' reaction-btn--active':''}" data-emoji="${esc(e)}" title="${u.map(esc).join(', ')}">${e}<span class="reaction-count">${u.length}</span></button>`
    }).join('')
}

// ═══════════════════════════════════════════════════════
//  EMOJI PICKER
// ═══════════════════════════════════════════════════════
const EMOJIS = {
    'Smileys':  ['😀','😃','😄','😁','😅','🤣','😂','🙂','😊','😇','🥰','😍','😘','😋','😜','🤪','🤔','😐','😏','😒','😔','😢','😭','😤','😠','🤬','🥺','😴'],
    'Gestures': ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👋','👏','🙌','🤝','🙏','💪','✍️','🖕','🤌'],
    'Objects':  ['💬','🔒','🔓','🔑','🛡️','⚔️','🔧','⚙️','💻','📱','🎮','🎧','📡','🚀','💡','🔍','📌','📎','✉️','📣','🎤','🎵'],
    'Symbols':  ['❤️','🧡','💛','💚','💙','💜','🖤','💯','✅','❌','⚠️','🔴','🟡','🟢','🔵','⭐','🌟','⚡','🔥','💥','❓','❗','🆕','🔞'],
    'Food':     ['🍕','🍔','🌮','🍜','🍣','🍩','🍪','🎂','☕','🍺','🧃','🥤','🍷','🥂'],
    'Nature':   ['🐶','🐱','🦋','🔥','💧','🌊','🌙','⭐','🌈','🌸','🍀','🦄','🐉','🌍'],
}

;(function buildPicker() {
    const ep = $('emojiPicker')
    for (const [cat, emojis] of Object.entries(EMOJIS)) {
        const sec = document.createElement('div'); sec.className='emoji-category'
        sec.innerHTML = `<div class="emoji-category__title">${cat}</div>`
        const grid = document.createElement('div'); grid.className='emoji-grid'
        emojis.forEach(e => {
            const b = document.createElement('button'); b.className='emoji-item'; b.textContent=e
            b.addEventListener('click', () => { $('msgInput').value += e; $('msgInput').focus(); ep.style.display='none' })
            grid.appendChild(b)
        })
        sec.appendChild(grid); ep.appendChild(sec)
    }
})()

$('emojiBtn').addEventListener('click', e => { e.stopPropagation(); $('emojiPicker').style.display = $('emojiPicker').style.display==='none'?'block':'none' })
document.addEventListener('click', e => { if (!$('emojiPicker').contains(e.target) && e.target.id!=='emojiBtn') $('emojiPicker').style.display='none' })

// ═══════════════════════════════════════════════════════
//  SEND MESSAGE
// ═══════════════════════════════════════════════════════
function sendMsg() {
    const text = $('msgInput').value.trim(); if (!text || !myName) return

    if (text.startsWith('/') && (amAdmin || amOwner)) { handleSlash(text); $('msgInput').value=''; return }
    if (text.startsWith('/')) { toast('Admin-only commands','error'); $('msgInput').value=''; return }

    // Slow mode
    if (slowSecs > 0 && !amAdmin && !amOwner) {
        const wait = slowSecs - (Date.now()-lastSentMs)/1000
        if (wait > 0) { toast(`⏳ Slow mode — wait ${Math.ceil(wait)}s`,'warn'); return }
    }

    if (chatMode === 'room') {
        socket.emit('message', { name: myName, text, replyTo: replyingTo })
    } else if (chatMode === 'dm' && dmPartner) {
        socket.emit('sendDm', { toVoidId: dmPartner.voidId, text })
    } else if (chatMode === 'group' && activeGroup) {
        socket.emit('groupMsg', { groupId: activeGroup.id, text, replyTo: replyingTo })
    }
    lastSentMs = Date.now(); $('msgInput').value=''; clearReply(); stopTyping(); $('msgInput').focus()
}

$('sendBtn').addEventListener('click', sendMsg)
$('msgInput').addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg()} })

// Typing
function stopTyping() { if(isTyping){isTyping=false;socket.emit('stopActivity')} clearTimeout(typingTimer) }
$('msgInput').addEventListener('input', () => {
    if (!isTyping) { isTyping=true; socket.emit('activity', myName) }
    clearTimeout(typingTimer); typingTimer=setTimeout(stopTyping, 2500)
})

// ── Slash commands ────────────────────────────────────
function handleSlash(text) {
    const p = text.split(/\s+/); const cmd = p[0].slice(1).toLowerCase()
    const t = (p[1]||'').replace('@',''); const rest = p.slice(1).join(' ')
    const m = {
        kick:()=>socket.emit('adminCmd',{cmd:'kick',target:t}),
        ban: ()=>socket.emit('adminCmd',{cmd:'ban', target:t}),
        mute:()=>socket.emit('adminCmd',{cmd:'mute',target:t}),
        tempmute:()=>socket.emit('adminCmd',{cmd:'tempmute',target:t,data:p[2]||'5'}),
        warn:()=>socket.emit('adminCmd',{cmd:'warn',target:t}),
        clearwarns:()=>socket.emit('adminCmd',{cmd:'clearwarns',target:t}),
        promote:()=>socket.emit('adminCmd',{cmd:'promote',target:t}),
        demote: ()=>socket.emit('adminCmd',{cmd:'demote', target:t}),
        clear:  ()=>socket.emit('adminCmd',{cmd:'clear'}),
        lock:   ()=>socket.emit('adminCmd',{cmd:'lock'}),
        unlock: ()=>socket.emit('adminCmd',{cmd:'unlock'}),
        unpin:  ()=>socket.emit('adminCmd',{cmd:'unpin'}),
        broadcast:()=>socket.emit('adminCmd',{cmd:'broadcast',data:rest}),
        pin:    ()=>socket.emit('adminCmd',{cmd:'pin',data:rest}),
        topic:  ()=>socket.emit('adminCmd',{cmd:'settopic',data:rest}),
        welcome:()=>socket.emit('adminCmd',{cmd:'setwelcome',data:rest}),
        filter: ()=>socket.emit('adminCmd',{cmd:'addfilter',data:t}),
        unfilter:()=>socket.emit('adminCmd',{cmd:'remfilter',data:t}),
        slow:   ()=>socket.emit('adminCmd',{cmd:'slowmode',data:p[1]||0}),
        delmsg: ()=>socket.emit('adminCmd',{cmd:'deleteMsg',data:t}),
    }
    if (m[cmd]) m[cmd](); else toast(`Unknown command: /${cmd}`,'error')
}

// ═══════════════════════════════════════════════════════
//  JOIN ROOM
// ═══════════════════════════════════════════════════════
$('formJoin').addEventListener('submit', e => {
    e.preventDefault()
    const room = $('roomInput').value.trim(); const pw = $('roomPassword').value
    if (!room || !myName) return
    $('passwordError').style.display='none'
    socket.emit('enterRoom', { name:myName, room, password:pw, voidId:myVoidId })
})

let roomCheckT = null
$('roomInput').addEventListener('input', () => {
    clearTimeout(roomCheckT)
    roomCheckT = setTimeout(()=>{ const r=$('roomInput').value.trim(); if(r) socket.emit('checkRoom',{room:r}) }, 400)
})

// ═══════════════════════════════════════════════════════
//  CHAT MODE SWITCH
// ═══════════════════════════════════════════════════════
function switchToRoom(room) {
    chatMode = 'room'; myRoom = room; dmPartner = null; activeGroup = null
    $('chatDisplay').innerHTML = ''; clearTyping()
    $('joinOverlay').style.display  = 'none'
    $('chatScreen').style.display   = 'flex'
    $('chPrefix').textContent = '#'
    $('chName').textContent   = room
    $('chBadge').style.display     = 'inline'
    $('dmCallAudio').style.display  = 'none'
    $('dmCallVideo').style.display  = 'none'
    $('groupSettingsBtn').style.display = 'none'
    $('msgInput').placeholder = `Message #${room}`
    $('chatHeader').dataset.mode = 'room'
    $('panelTitle').textContent  = 'Online'
    $('chTopic').textContent = ''
    $('topicBar').style.display = 'none'
    $$('.room-item').forEach(el=>el.classList.toggle('room-item--active', el.dataset.room===room))
    $$('.group-item').forEach(el=>el.classList.remove('group-item--active'))
    $$('.friend-item').forEach(el=>el.classList.remove('friend-item--active'))
}

function switchToDm(voidId, name) {
    chatMode = 'dm'; dmPartner = {voidId, name}; myRoom = ''; activeGroup = null
    $('chatDisplay').innerHTML = ''; clearTyping()
    $('joinOverlay').style.display  = 'none'
    $('chatScreen').style.display   = 'flex'
    $('chPrefix').textContent = '@'
    $('chName').textContent   = name
    $('chBadge').style.display     = 'none'
    $('dmCallAudio').style.display  = 'flex'
    $('dmCallVideo').style.display  = 'flex'
    $('dmCallAudio').onclick = () => startCall(null, name, 'audio', voidId)
    $('dmCallVideo').onclick = () => startCall(null, name, 'video', voidId)
    $('groupSettingsBtn').style.display = 'none'
    $('adminPanelBtn').style.display    = 'none'
    $('msgInput').placeholder = `Message @${name}`
    $('chatHeader').dataset.mode = 'dm'
    $('panelTitle').textContent  = 'Info'
    $('chTopic').textContent = ''
    $('topicBar').style.display = 'none'
    $('chLock').style.display   = 'none'
    $('chAdminBadge').style.display = 'none'
    $('chOwnerBadge').style.display = 'none'
    $$('.room-item').forEach(el=>el.classList.remove('room-item--active'))
    $$('.group-item').forEach(el=>el.classList.remove('group-item--active'))
    $$('.friend-item').forEach(el=>el.classList.toggle('friend-item--active', el.dataset.voidId===voidId))
    // Clear unread
    dmUnread.delete(voidId); renderFriendList()
    // Show DM partner in users panel
    $('usersList').innerHTML = `<li class="user-item">
      <div class="user-item__avatar" style="background:${avColor(name)}">${ini(name)}</div>
      <div class="user-item__info"><span class="user-item__name">${esc(name)}</span>
      <span class="user-item__status status--online">● Direct Message</span></div></li>`
    $('onlineCount').textContent = '1'
    socket.emit('openDm', { withVoidId: voidId })
}

function switchToGroup(group) {
    chatMode = 'group'; activeGroup = group; myRoom = ''; dmPartner = null
    $('chatDisplay').innerHTML = ''; clearTyping()
    $('joinOverlay').style.display  = 'none'
    $('chatScreen').style.display   = 'flex'
    $('chPrefix').textContent = '⬡'
    $('chName').textContent   = group.name
    $('chBadge').style.display     = 'none'
    $('dmCallAudio').style.display  = 'none'
    $('dmCallVideo').style.display  = 'none'
    $('groupSettingsBtn').style.display = 'flex'
    $('msgInput').placeholder = `Message ${group.name}`
    $('chatHeader').dataset.mode = 'group'
    $('panelTitle').textContent  = 'Members'
    if (group.topic) { $('topicBar').style.display='flex'; $('topicText').textContent=group.topic }
    $('chLock').style.display = 'none'
    // Admin / owner badges for group
    const isGroupAdmin = groupRole === 'owner' || groupRole === 'admin'
    $('adminPanelBtn').style.display = isGroupAdmin ? 'flex' : 'none'
    $('chAdminBadge').style.display  = groupRole==='admin'  ? 'inline' : 'none'
    $('chOwnerBadge').style.display  = groupRole==='owner'  ? 'inline' : 'none'
    $$('.room-item').forEach(el=>el.classList.remove('room-item--active'))
    $$('.friend-item').forEach(el=>el.classList.remove('friend-item--active'))
    $$('.group-item').forEach(el=>el.classList.toggle('group-item--active', el.dataset.groupId===group.id))
}

// ═══════════════════════════════════════════════════════
//  MESSAGE AREA INTERACTIONS
// ═══════════════════════════════════════════════════════
$('chatDisplay').addEventListener('click', e => {
    const btn = e.target.closest('.msg-action-btn')
    if (btn) {
        const action=btn.dataset.action; const mid=btn.dataset.mid
        if (action==='reply') setReply(mid, btn.dataset.name, btn.dataset.text)
        else if (action==='react') openRxMenu(btn, mid)
        else if (action==='del') {
            if (chatMode==='room') socket.emit('adminCmd',{cmd:'deleteMsg',data:mid})
            else if (chatMode==='group' && activeGroup) socket.emit('groupAdminCmd',{groupId:activeGroup.id,cmd:'deleteMsg',target:mid})
        }
        return
    }
    const rx = e.target.closest('.reaction-btn')
    if (rx) {
        const li = rx.closest('.msg'); if (!li) return
        if (chatMode==='room')  socket.emit('reaction',{msgId:li.dataset.msgId,emoji:rx.dataset.emoji})
        else if (chatMode==='group' && activeGroup) socket.emit('groupReaction',{groupId:activeGroup.id,msgId:li.dataset.msgId,emoji:rx.dataset.emoji})
    }
})

// ── Reaction quick-menu ───────────────────────────────
let rxMenu = null
function openRxMenu(anchor, msgId) {
    rxMenu?.remove(); rxMenu=null
    const quick=['👍','👎','❤️','😂','😮','😢','🔥','✅']
    rxMenu=document.createElement('div'); rxMenu.className='reaction-menu'
    quick.forEach(emoji=>{
        const b=document.createElement('button'); b.className='reaction-menu__item'; b.textContent=emoji
        b.addEventListener('click',()=>{
            if(chatMode==='room') socket.emit('reaction',{msgId,emoji})
            else if(chatMode==='group'&&activeGroup) socket.emit('groupReaction',{groupId:activeGroup.id,msgId,emoji})
            rxMenu.remove(); rxMenu=null
        })
        rxMenu.appendChild(b)
    })
    document.body.appendChild(rxMenu)
    const r=anchor.getBoundingClientRect()
    rxMenu.style.top=`${r.top-52}px`; rxMenu.style.left=`${Math.max(4,r.left-140)}px`
    setTimeout(()=>document.addEventListener('click',()=>{rxMenu?.remove();rxMenu=null},{once:true}),50)
}

// ── Reply ─────────────────────────────────────────────
function setReply(id,name,text) {
    replyingTo={id,name,text}
    $('replyToName').textContent=name
    $('replyToText').textContent=text.slice(0,80)+(text.length>80?'…':'')
    $('replyPreview').style.display='flex'; $('msgInput').focus()
}
function clearReply() { replyingTo=null; $('replyPreview').style.display='none' }
$('cancelReply').addEventListener('click', clearReply)

// ── Search ────────────────────────────────────────────
$('searchBtn').addEventListener('click',()=>{ const s=$('searchBar'); const show=s.style.display==='none'; s.style.display=show?'flex':'none'; if(show) $('searchInput').focus(); else{$('searchInput').value='';clearSearch()} })
$('searchClose').addEventListener('click',()=>{ $('searchBar').style.display='none'; $('searchInput').value=''; clearSearch() })
$('searchInput').addEventListener('input',()=>{
    const q=$('searchInput').value.toLowerCase().trim()
    $('chatDisplay').querySelectorAll('.msg').forEach(el=>{
        if(!q){el.style.opacity='1';el.classList.remove('msg--highlight');return}
        const hit=(el.querySelector('.msg__text')?.textContent.toLowerCase().includes(q)||el.querySelector('.msg__name')?.textContent.toLowerCase().includes(q))
        el.style.opacity=hit?'1':'0.22'; el.classList.toggle('msg--highlight',hit)
    })
})
function clearSearch() { $('chatDisplay').querySelectorAll('.msg').forEach(el=>{el.style.opacity='1';el.classList.remove('msg--highlight')}) }
function clearTyping() { typingUsers.clear(); $('activityBar').innerHTML='' }

// ── Scroll ────────────────────────────────────────────
function scrollBottom(smooth=false) { const d=$('chatDisplay'); d.scrollTo({top:d.scrollHeight,behavior:smooth?'smooth':'instant'}) }
function appendMsg(data) {
    const el=buildMsgEl(data); $('chatDisplay').appendChild(el)
    const d=$('chatDisplay'); if(d.scrollHeight-d.scrollTop-d.clientHeight<180) scrollBottom(true)
}

// ── Attach ────────────────────────────────────────────
$('attachBtn').addEventListener('click',()=>{ const u=prompt('Paste an image URL:'); if(u?.trim()){$('msgInput').value+=(($('msgInput').value?' ':''))+u.trim();$('msgInput').focus()} })

// ── Toggle users ──────────────────────────────────────
$('toggleUsersBtn').addEventListener('click',()=>$('usersPanel').classList.toggle('users-panel--hidden'))

// ── Pinned / Topic bars ───────────────────────────────
$('pinnedClose').addEventListener('click',()=>$('pinnedBar').style.display='none')

// ═══════════════════════════════════════════════════════
//  RENDER SIDEBAR LISTS
// ═══════════════════════════════════════════════════════
function renderRoomList(rooms) {
    const ul = $('roomList'); ul.innerHTML=''
    if (!rooms.length) { ul.innerHTML='<li class="item-empty">No active channels</li>'; return }
    rooms.forEach(room=>{
        const li=document.createElement('li'); li.className=`room-item${room===myRoom?' room-item--active':''}`; li.dataset.room=room
        li.innerHTML=`<span class="room-hash">#</span><span>${esc(room)}</span>`
        li.addEventListener('click',()=>{ if(room===myRoom&&chatMode==='room') return; pendingRoomSwitch=room; socket.emit('checkRoom',{room}) })
        ul.appendChild(li)
    })
}

function renderGroupList() {
    const ul=$('groupList'); ul.innerHTML=''
    if (!myGroups.length) { ul.innerHTML='<li class="item-empty">No groups yet</li>'; return }
    myGroups.forEach(g=>{
        const li=document.createElement('li'); li.className=`group-item${activeGroup?.id===g.id?' group-item--active':''}`; li.dataset.groupId=g.id
        const myMembership = (window._groupRoles||{})[g.id] || 'member'
        li.innerHTML=`<span class="group-hex" style="color:${g.color}">⬡</span>
          <div class="group-item__info"><span class="group-item__name">${esc(g.name)}</span>
          <span class="group-item__role">${myMembership}</span></div>`
        li.addEventListener('click',()=>joinGroupChat(g))
        ul.appendChild(li)
    })
}

function joinGroupChat(g) {
    socket.emit('joinGroup', { groupId: g.id, password: '' })
}

function renderFriendList() {
    const ul=$('friendList'); ul.innerHTML=''
    if (!myFriends.length) { ul.innerHTML='<li class="item-empty">No friends yet</li>'; return }
    myFriends.forEach(f=>{
        const unread = dmUnread.get(f.voidId)||0
        const li=document.createElement('li')
        li.className=`friend-item${dmPartner?.voidId===f.voidId?' friend-item--active':''}`
        li.dataset.voidId=f.voidId; li.dataset.name=f.name
        const dotClass=f.online?'friend-dot--online':''
        li.innerHTML=`<span class="friend-dot ${dotClass}"></span>
          <span class="friend-name">${esc(f.name)}</span>
          ${unread?`<span class="friend-unread">${unread}</span>`:''}
          <button class="btn-icon friend-dm-btn" title="Message">💬</button>`
        li.addEventListener('click',()=>switchToDm(f.voidId, f.name))
        ul.appendChild(li)
    })
}

// ═══════════════════════════════════════════════════════
//  CREATE / JOIN MODALS
// ═══════════════════════════════════════════════════════
// Channels
$('createRoomBtn').addEventListener('click',()=>$('createRoomModal').style.display='flex')
$('cancelCreate').addEventListener('click', ()=>$('createRoomModal').style.display='none')
$('closeCreateModal').addEventListener('click',()=>$('createRoomModal').style.display='none')
$('createRoomForm').addEventListener('submit',e=>{
    e.preventDefault()
    const room=$('newRoomName').value.trim(); const pw=$('newRoomPassword').value; if(!room) return
    socket.emit('createRoom',{room,password:pw})
    $('createRoomModal').style.display='none'; $('newRoomName').value=''; $('newRoomPassword').value=''
})

// Groups
$('createGroupBtn').addEventListener('click',()=>$('createGroupModal').style.display='flex')
$('cancelCreateGroup').addEventListener('click',()=>$('createGroupModal').style.display='none')
$('closeCreateGroupModal').addEventListener('click',()=>$('createGroupModal').style.display='none')
$('createGroupForm').addEventListener('submit',e=>{
    e.preventDefault()
    const name=$('newGroupName').value.trim(); if(!name) return
    socket.emit('createGroup',{name,desc:$('newGroupDesc').value.trim(),password:$('newGroupPassword').value,isPrivate:$('newGroupPrivate').checked})
    $('createGroupModal').style.display='none'
    $('newGroupName').value=''; $('newGroupDesc').value=''; $('newGroupPassword').value=''; $('newGroupPrivate').checked=false
})

// ── Group Settings Modal ──────────────────────────────
$('groupSettingsBtn').addEventListener('click',()=>openGroupSettings())
$('adminPanelBtn').addEventListener('click',()=>{ if(chatMode==='group') openGroupSettings(); else openAdminPanel() })
$('sideAdminBtn').addEventListener('click', ()=>openAdminPanel())
$('closeGroupSettings').addEventListener('click',()=>$('groupSettingsModal').style.display='none')

function openGroupSettings() {
    if (!activeGroup) return
    $('gSettingsName').textContent=activeGroup.name
    $('groupSettingsModal').style.display='flex'
    socket.emit('joinGroup',{groupId:activeGroup.id}) // refresh members
    // Populate friend invite list
    const fl=$('gFriendInviteList'); fl.innerHTML=''
    if (!myFriends.length) { fl.innerHTML='<p class="item-empty">No friends to invite.</p>'; return }
    myFriends.forEach(f=>{
        const row=document.createElement('div'); row.className='g-friend-row'
        row.innerHTML=`<div class="user-item__avatar" style="background:${avColor(f.name)};width:26px;height:26px;font-size:.62rem;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff">${ini(f.name)}</div>
          <span class="g-friend-row__name">${esc(f.name)}</span>
          <button class="btn-primary" style="padding:4px 10px;font-size:.75rem" data-vid="${f.voidId}">Invite</button>`
        row.querySelector('button').addEventListener('click',()=>{
            socket.emit('inviteToGroup',{groupId:activeGroup.id,toVoidId:f.voidId})
            toast(`Invited ${f.name}`,'success')
        })
        fl.appendChild(row)
    })
}

// Group settings tabs
$$('[data-gtab]').forEach(tab=>{
    tab.addEventListener('click',()=>{
        $$('[data-gtab]').forEach(t=>t.classList.remove('admin-tab--active'))
        $$('[id^="gTab-"]').forEach(p=>p.style.display='none')
        tab.classList.add('admin-tab--active')
        $(`gTab-${tab.dataset.gtab}`).style.display='flex'
    })
})

$('gTopicBtn').addEventListener('click',()=>{ const t=$('gTopicInput').value.trim(); if(!t||!activeGroup) return; socket.emit('groupAdminCmd',{groupId:activeGroup.id,cmd:'setTopic',data:t}); $('gTopicInput').value=''; $('groupSettingsModal').style.display='none' })
$('gDeleteBtn').addEventListener('click',()=>{ if(!activeGroup||!confirm(`Delete group "${activeGroup.name}"?`)) return; socket.emit('groupAdminCmd',{groupId:activeGroup.id,cmd:'delete'}); $('groupSettingsModal').style.display='none' })
$('gTransferBtn').addEventListener('click',()=>{ const t=$('gTransferInput').value.trim(); if(!t||!activeGroup) return; socket.emit('groupAdminCmd',{groupId:activeGroup.id,cmd:'transfer',target:t}); $('gTransferInput').value=''; $('groupSettingsModal').style.display='none' })
$('gInviteBtn').addEventListener('click',()=>{ const v=$('gInviteInput').value.trim().toUpperCase(); if(!v||!activeGroup) return; socket.emit('inviteToGroup',{groupId:activeGroup.id,toVoidId:v}); $('gInviteInput').value=''; toast('Invite sent!','success') })

function populateGroupMembers(members) {
    const list=$('gMemberList'); list.innerHTML=''
    members.forEach(m=>{
        const row=document.createElement('div'); row.className='admin-user-row'
        const isMe=m.name===myName
        row.innerHTML=`<div class="msg__avatar" style="background:${avColor(m.name)};width:28px;height:28px;font-size:.65rem">${ini(m.name)}</div>
          <div class="admin-user-row__name">${esc(m.name)} ${m.role!=='member'?`<span class="admin-user-row__badge badge-admin">${m.role}</span>`:''}</div>
          ${!isMe&&(groupRole==='owner'||groupRole==='admin')?`<div class="admin-user-row__btns">
            ${groupRole==='owner'?`<button class="admin-user-btn" data-gcmd="promote" data-name="${esc(m.name)}">Promote</button>
            <button class="admin-user-btn" data-gcmd="demote"  data-name="${esc(m.name)}">Demote</button>`:''}
            <button class="admin-user-btn admin-user-btn--danger" data-gcmd="kick" data-name="${esc(m.name)}">Kick</button>
          </div>`:''}`
        list.appendChild(row)
    })
    list.addEventListener('click',e=>{
        const b=e.target.closest('[data-gcmd]'); if(!b||!activeGroup) return
        socket.emit('groupAdminCmd',{groupId:activeGroup.id,cmd:b.dataset.gcmd,target:b.dataset.name})
        $('groupSettingsModal').style.display='none'
    })
}

// ── Friend Manager ────────────────────────────────────
$('addFriendBtn').addEventListener('click',()=>$('friendModal').style.display='flex')
$('closeFriendModal').addEventListener('click',()=>$('friendModal').style.display='none')

$$('[data-ftab]').forEach(tab=>{
    tab.addEventListener('click',()=>{
        $$('[data-ftab]').forEach(t=>t.classList.remove('admin-tab--active'))
        $$('[id^="fTab-"]').forEach(p=>p.style.display='none')
        tab.classList.add('admin-tab--active')
        $(`fTab-${tab.dataset.ftab}`).style.display='flex'
        if(tab.dataset.ftab==='requests') renderFriendRequests()
        if(tab.dataset.ftab==='list')     renderFriendManager()
    })
})

$('friendAddInput').addEventListener('input',e=>{ e.target.value=e.target.value.toUpperCase() })
$('friendAddBtn').addEventListener('click',()=>{
    const vid=$('friendAddInput').value.trim().toUpperCase(); if(!vid||vid.length<4) return toast('Enter a valid VOID ID','error')
    socket.emit('sendFriendRequest',{toVoidId:vid}); $('friendAddInput').value=''
})

function renderFriendRequests() {
    const list=$('friendRequestList'); list.innerHTML=''
    if (!friendReqs.length) { list.innerHTML='<p class="item-empty" style="padding:8px 0">No pending requests.</p>'; return }
    friendReqs.forEach(req=>{
        const row=document.createElement('div'); row.className='admin-user-row'
        row.innerHTML=`<div class="msg__avatar" style="background:${avColor(req.fromName)};width:28px;height:28px;font-size:.65rem">${ini(req.fromName)}</div>
          <div class="admin-user-row__name" style="flex:1">${esc(req.fromName)} <span style="font-size:.72rem;color:var(--tx3)">${req.fromVoid}</span></div>
          <div class="admin-user-row__btns">
            <button class="admin-user-btn" data-fr-accept="${req.fromVoid}">Accept</button>
            <button class="admin-user-btn admin-user-btn--danger" data-fr-decline="${req.fromVoid}">Decline</button>
          </div>`
        list.appendChild(row)
    })
    list.addEventListener('click',e=>{
        const a=e.target.dataset.frAccept; const d=e.target.dataset.frDecline
        if(a){ socket.emit('acceptFriendRequest',{fromVoid:a}); friendReqs=friendReqs.filter(r=>r.fromVoid!==a); renderFriendRequests() }
        if(d){ socket.emit('declineFriendRequest',{fromVoid:d}); friendReqs=friendReqs.filter(r=>r.fromVoid!==d); renderFriendRequests() }
    })
}

function renderFriendManager() {
    const list=$('friendManagerList'); list.innerHTML=''
    if (!myFriends.length) { list.innerHTML='<p class="item-empty" style="padding:8px 0">No friends yet.</p>'; return }
    myFriends.forEach(f=>{
        const row=document.createElement('div'); row.className='admin-user-row'
        row.innerHTML=`<div class="user-item__avatar" style="background:${avColor(f.name)};width:28px;height:28px;font-size:.65rem;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff">${ini(f.name)}</div>
          <div class="admin-user-row__name" style="flex:1">${esc(f.name)} <span class="friend-dot ${f.online?'friend-dot--online':''}" style="display:inline-block;margin-left:4px"></span></div>
          <div class="admin-user-row__btns">
            <button class="admin-user-btn" data-dm="${f.voidId}" data-name="${esc(f.name)}">💬 DM</button>
            <button class="admin-user-btn admin-user-btn--danger" data-rm="${f.voidId}">Remove</button>
          </div>`
        list.appendChild(row)
    })
    list.addEventListener('click',e=>{
        const dm=e.target.dataset.dm; const rm=e.target.dataset.rm; const nm=e.target.dataset.name
        if(dm){ $('friendModal').style.display='none'; switchToDm(dm,nm) }
        if(rm){ socket.emit('removeFriend',{targetVoid:rm}); toast('Friend removed','warn') }
    })
}

// ── Settings ──────────────────────────────────────────
$('settingsBtn').addEventListener('click',()=>$('settingsModal').style.display='flex')
$('closeSettings').addEventListener('click',()=>$('settingsModal').style.display='none')
$('statusOptions').addEventListener('click',e=>{
    const btn=e.target.closest('.status-opt'); if(!btn) return
    $$('.status-opt').forEach(b=>b.classList.remove('status-opt--active')); btn.classList.add('status-opt--active')
    currentStatus=btn.dataset.status; socket.emit('updateStatus',currentStatus); updateProfileStatus(currentStatus)
})

// ── Admin Panel ───────────────────────────────────────
function openAdminPanel() {
    if (chatMode==='group' && activeGroup) { openGroupSettings(); return }
    $('adminRoomName').textContent=myRoom; populateAdminUsers(); $('adminModal').style.display='flex'
}
$('closeAdminModal').addEventListener('click',()=>$('adminModal').style.display='none')

$$('[data-tab]').forEach(tab=>{
    tab.addEventListener('click',()=>{
        $$('[data-tab]').forEach(t=>t.classList.remove('admin-tab--active'))
        $$('[id^="adminTab-"]').forEach(p=>p.style.display='none')
        tab.classList.add('admin-tab--active')
        $(`adminTab-${tab.dataset.tab}`).style.display='flex'
    })
})

function populateAdminUsers() {
    const list=$('adminUserList'); list.innerHTML=''
    roomUserMap.forEach(u=>{
        if(u.name===myName) return
        const row=document.createElement('div'); row.className='admin-user-row'
        row.innerHTML=`<div class="msg__avatar" style="background:${avColor(u.name)};width:28px;height:28px;font-size:.65rem">${ini(u.name)}</div>
          <div class="admin-user-row__name">${esc(u.name)}
            ${u.isAdmin?'<span class="admin-user-row__badge badge-admin">admin</span>':''}
            ${u.isMuted?'<span class="admin-user-row__badge badge-muted">muted</span>':''}
            ${u.warns>0?`<span class="warn-badge">⚠${u.warns}</span>`:''}
          </div>
          <div class="admin-user-row__btns">
            <button class="admin-user-btn admin-user-btn--warn" data-cmd="mute"    data-name="${esc(u.name)}">${u.isMuted?'Unmute':'Mute'}</button>
            <button class="admin-user-btn admin-user-btn--warn" data-cmd="warn"    data-name="${esc(u.name)}">⚠ Warn</button>
            <button class="admin-user-btn"                      data-cmd="promote" data-name="${esc(u.name)}">Promote</button>
            <button class="admin-user-btn admin-user-btn--danger" data-cmd="kick"  data-name="${esc(u.name)}">Kick</button>
            <button class="admin-user-btn admin-user-btn--danger" data-cmd="ban"   data-name="${esc(u.name)}">Ban</button>
          </div>`
        list.appendChild(row)
    })
    if (!list.children.length) list.innerHTML='<p class="item-empty" style="padding:8px">No other users in channel.</p>'
    list.onclick=e=>{ const b=e.target.closest('[data-cmd]'); if(b) { socket.emit('adminCmd',{cmd:b.dataset.cmd,target:b.dataset.name}); $('adminModal').style.display='none' } }
}

$('aLockBtn').addEventListener('click',()=>{socket.emit('adminCmd',{cmd:'lock'});$('adminModal').style.display='none'})
$('aUnlockBtn').addEventListener('click',()=>{socket.emit('adminCmd',{cmd:'unlock'});$('adminModal').style.display='none'})
$('aClearBtn').addEventListener('click',()=>{ if(confirm('Clear all chat history?')){socket.emit('adminCmd',{cmd:'clear'});$('adminModal').style.display='none'} })
$('aUnpinBtn').addEventListener('click',()=>{socket.emit('adminCmd',{cmd:'unpin'});$('adminModal').style.display='none'})
$('aPinBtn').addEventListener('click',()=>{ const t=$('aPinInput').value.trim(); if(!t) return; socket.emit('adminCmd',{cmd:'pin',data:t}); $('aPinInput').value=''; $('adminModal').style.display='none' })
$('aBroadcastBtn').addEventListener('click',()=>{ const t=$('aBroadcastInput').value.trim(); if(!t) return; socket.emit('adminCmd',{cmd:'broadcast',data:t}); $('aBroadcastInput').value=''; $('adminModal').style.display='none' })
$('aTopicBtn').addEventListener('click',()=>{ const t=$('aTopicInput').value.trim(); socket.emit('adminCmd',{cmd:'settopic',data:t}); $('aTopicInput').value=''; $('adminModal').style.display='none' })
$('aWelcomeBtn').addEventListener('click',()=>{ const t=$('aWelcomeInput').value.trim(); socket.emit('adminCmd',{cmd:'setwelcome',data:t}); $('aWelcomeInput').value=''; toast('Welcome message saved','success') })
$('aSlowBtn').addEventListener('click',()=>{ const s=parseInt($('aSlowInput').value)||0; socket.emit('adminCmd',{cmd:'slowmode',data:s}); $('adminModal').style.display='none' })
$('aWarnBtn').addEventListener('click',()=>{ const t=$('aWarnInput').value.trim().replace('@',''); if(!t) return; socket.emit('adminCmd',{cmd:'warn',target:t}); $('aWarnInput').value='' })
$('aTempMuteBtn').addEventListener('click',()=>{ const t=$('aTempMuteUser').value.trim().replace('@',''); const m=$('aTempMuteMins').value||5; if(!t) return; socket.emit('adminCmd',{cmd:'tempmute',target:t,data:m}); $('aTempMuteUser').value=''; $('aTempMuteMins').value='' })
$('aFilterAddBtn').addEventListener('click',()=>{ const w=$('aFilterInput').value.trim(); if(!w) return; socket.emit('adminCmd',{cmd:'addfilter',data:w}); toast(`Filter added: ${w}`,'success'); $('aFilterInput').value='' })
$('aFilterRemBtn').addEventListener('click',()=>{ const w=$('aFilterInput').value.trim(); if(!w) return; socket.emit('adminCmd',{cmd:'remfilter',data:w}); toast(`Filter removed: ${w}`,'success'); $('aFilterInput').value='' })
$('aAuditBtn').addEventListener('click',()=>{ socket.emit('adminCmd',{cmd:'auditlog'}); $('auditLogView').style.display='block' })

// ── Right-click context menu on users ─────────────────
$('usersList').addEventListener('contextmenu',e=>{
    e.preventDefault()
    const item=e.target.closest('.user-item'); if(!item) return
    const name=item.dataset.name; const sid=item.dataset.sid; if(!name||name===myName) return
    showCtxMenu(e.clientX, e.clientY, name, sid)
})

function showCtxMenu(x, y, targetName, targetSid) {
    $('voidCtx')?.remove()
    const menu=document.createElement('div'); menu.id='voidCtx'; menu.className='context-menu'
    const items=[
        {icon:'📞',label:'Voice Call', cls:'call', action:()=>startCall(targetSid,targetName,'audio')},
        {icon:'📹',label:'Video Call', cls:'call', action:()=>startCall(targetSid,targetName,'video')},
    ]
    if (amAdmin||amOwner) {
        items.push({divider:true})
        items.push({icon:'⚠️',label:'Warn',    action:()=>socket.emit('adminCmd',{cmd:'warn',   target:targetName})})
        items.push({icon:'🔇',label:'Mute',    action:()=>socket.emit('adminCmd',{cmd:'mute',   target:targetName})})
        items.push({icon:'⏱',label:'Temp Mute 5m',action:()=>socket.emit('adminCmd',{cmd:'tempmute',target:targetName,data:5})})
        items.push({icon:'👢',label:'Kick',    cls:'danger',action:()=>socket.emit('adminCmd',{cmd:'kick',   target:targetName})})
        items.push({icon:'🚫',label:'Ban',     cls:'danger',action:()=>socket.emit('adminCmd',{cmd:'ban',    target:targetName})})
        items.push({icon:'👑',label:'Promote Admin',action:()=>socket.emit('adminCmd',{cmd:'promote',target:targetName})})
    }
    items.forEach(opt=>{
        if(opt.divider){ const d=document.createElement('div');d.className='context-menu__divider';menu.appendChild(d);return }
        const b=document.createElement('button'); b.className=`context-menu__item${opt.cls?' context-menu__item--'+opt.cls:''}`
        b.innerHTML=`<span class="ctx-icon">${opt.icon}</span>${opt.label}`
        b.addEventListener('click',()=>{opt.action();menu.remove()})
        menu.appendChild(b)
    })
    document.body.appendChild(menu)
    menu.style.left=`${Math.min(x,window.innerWidth-200)}px`; menu.style.top=`${Math.min(y,window.innerHeight-menu.scrollHeight-10)}px`
    setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),50)
}

// ── Owner Panel ───────────────────────────────────────
$('ownerPanelBtn').addEventListener('click',()=>openOwnerPanel())
$('claimOwnerBtn').addEventListener('click',()=>$('claimOwnerModal').style.display='flex')
$('closeOwnerModal').addEventListener('click',()=>$('ownerModal').style.display='none')
$('closeClaimOwner').addEventListener('click',()=>$('claimOwnerModal').style.display='none')
$('cancelClaimOwner').addEventListener('click',()=>$('claimOwnerModal').style.display='none')
$('submitClaimOwner').addEventListener('click',()=>{
    const k=$('ownerKeyInput').value; socket.emit('claimOwner',{key:k}); $('ownerKeyInput').value=''; $('claimOwnerModal').style.display='none'
})

$$('[data-otab]').forEach(tab=>{
    tab.addEventListener('click',()=>{
        $$('[data-otab]').forEach(t=>t.classList.remove('admin-tab--active'))
        $$('[id^="oTab-"]').forEach(p=>p.style.display='none')
        tab.classList.add('admin-tab--active'); $(`oTab-${tab.dataset.otab}`).style.display='flex'
        if(tab.dataset.otab==='overview'||tab.dataset.otab==='users'||tab.dataset.otab==='rooms'||tab.dataset.otab==='bans') socket.emit('ownerCmd',{cmd:'stats'})
    })
})

function openOwnerPanel() { $('ownerModal').style.display='flex'; socket.emit('ownerCmd',{cmd:'stats'}) }

$('oMotdBtn').addEventListener('click',()=>{ const t=$('oMotdInput').value.trim(); if(!t) return; socket.emit('ownerCmd',{cmd:'setMOTD',text:t}); $('oMotdInput').value=''; toast('MOTD updated','success') })
$('oAnnounceBtn').addEventListener('click',()=>{ const t=$('oAnnounceInput').value.trim(); if(!t) return; socket.emit('ownerCmd',{cmd:'announce',text:t}); $('oAnnounceInput').value=''; toast('Announced!','success') })
$('oGlobalBanBtn').addEventListener('click',()=>{ const v=$('oGlobalBanInput').value.trim().toUpperCase(); if(!v) return; socket.emit('ownerCmd',{cmd:'globalBan',targetVoid:v}); $('oGlobalBanInput').value='' })
$('oGlobalUnbanBtn').addEventListener('click',()=>{ const v=$('oGlobalUnbanInput').value.trim().toUpperCase(); if(!v) return; socket.emit('ownerCmd',{cmd:'globalUnban',targetVoid:v}); $('oGlobalUnbanInput').value='' })
$('oPromoteBtn').addEventListener('click',()=>{ const v=$('oPromoteInput').value.trim().toUpperCase(); if(!v) return; socket.emit('ownerCmd',{cmd:'promoteOwner',targetVoid:v}); $('oPromoteInput').value='' })
$('oRevokeBtn').addEventListener('click',()=>{ const v=$('oRevokeInput').value.trim().toUpperCase(); if(!v) return; socket.emit('ownerCmd',{cmd:'revokeOwner',targetVoid:v}); $('oRevokeInput').value='' })

// Close modal overlays on outside click
$$('.modal-overlay').forEach(el=>el.addEventListener('click',e=>{if(e.target===el) el.style.display='none'}))

// ═══════════════════════════════════════════════════════
//  WEBRTC CALLS
// ═══════════════════════════════════════════════════════
const ICE={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}
let pc=null, localStream=null, callWith=null, callType='video', callTick=null, callSecs=0, micOn=true, camOn=true, _pendingOffer=null

async function startCall(sid, name, type='video', overrideSid=null) {
    if(pc){toast('Already in a call','warn');return}
    // If calling a friend by voidId, look up their sid
    let targetSid=overrideSid||sid
    if(!targetSid) {toast('User not found','error');return}
    callType=type; callWith={sid:targetSid,name}
    localStream=await getLocalStream(type); if(!localStream) return
    showCallOverlay(name); $('callStatus').textContent='Calling…'
    pc=buildPC(targetSid); localStream.getTracks().forEach(t=>pc.addTrack(t,localStream)); setLocalVid(localStream,type)
    const offer=await pc.createOffer(); await pc.setLocalDescription(offer)
    socket.emit('callOffer',{to:targetSid,offer:pc.localDescription,callType:type})
}

async function acceptCall(from,offer,type) {
    callWith={..._pendingOffer}; callType=type
    $('incomingCall').style.display='none'
    localStream=await getLocalStream(type); if(!localStream) return
    showCallOverlay(callWith.name||from); $('callStatus').textContent='Connecting…'
    pc=buildPC(from); localStream.getTracks().forEach(t=>pc.addTrack(t,localStream)); setLocalVid(localStream,type)
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer=await pc.createAnswer(); await pc.setLocalDescription(answer)
    socket.emit('callAnswer',{to:from,answer:pc.localDescription})
}

function buildPC(sid) {
    const p=new RTCPeerConnection(ICE)
    p.onicecandidate=e=>{if(e.candidate) socket.emit('callIce',{to:sid,candidate:e.candidate})}
    p.ontrack=e=>{
        if(!e.streams[0]) return
        $('remoteVideo').srcObject=e.streams[0]
        const hv=e.streams[0].getVideoTracks().length>0
        $('remoteVideo').style.display=hv?'block':'none'
        $('callRemoteAv').style.display=hv?'none':'flex'
        $('callStatus').style.display='none'; $('callTimer').style.display='inline'
        startCallTick()
    }
    p.onconnectionstatechange=()=>{ if(p.connectionState==='disconnected'||p.connectionState==='failed') endCall() }
    return p
}

async function getLocalStream(type) {
    try { return await navigator.mediaDevices.getUserMedia({audio:true,video:type==='video'}) }
    catch(err){ toast(`Mic/camera: ${err.message}`,'error'); return null }
}

function setLocalVid(stream,type) { const v=$('localVideo'); v.srcObject=stream; v.style.display=type==='video'?'block':'none' }

function showCallOverlay(name) {
    $('callWithName').textContent=name
    const av=$('callRemoteAv'); av.textContent=ini(name); av.style.backgroundColor=avColor(name)
    $('callOverlay').style.display='flex'
}

function endCall() {
    if(callWith) socket.emit('callEnd',{to:callWith.sid})
    pc?.close(); pc=null
    localStream?.getTracks().forEach(t=>t.stop()); localStream=null
    if(callTick){clearInterval(callTick);callTick=null;callSecs=0}
    callWith=null
    $('callOverlay').style.display='none'; $('remoteVideo').srcObject=null; $('localVideo').srcObject=null
    $('callTimer').style.display='none'; $('callStatus').style.display='inline'; $('callStatus').textContent='Calling…'
    micOn=true; camOn=true
    $('ctrlMic').classList.remove('call-ctrl--off'); $('ctrlCam').classList.remove('call-ctrl--off')
    $('ctrlMic').textContent='🎤'; $('ctrlCam').textContent='📹'
}

function startCallTick() {
    if(callTick) return
    callTick=setInterval(()=>{ callSecs++; const m=String(Math.floor(callSecs/60)).padStart(2,'0'); const s=String(callSecs%60).padStart(2,'0'); $('callTimer').textContent=`${m}:${s}` },1000)
}

$('ctrlMic').addEventListener('click',()=>{ micOn=!micOn; localStream?.getAudioTracks().forEach(t=>{t.enabled=micOn}); $('ctrlMic').classList.toggle('call-ctrl--off',!micOn); $('ctrlMic').textContent=micOn?'🎤':'🔇' })
$('ctrlCam').addEventListener('click',()=>{ camOn=!camOn; localStream?.getVideoTracks().forEach(t=>{t.enabled=camOn}); $('ctrlCam').classList.toggle('call-ctrl--off',!camOn); $('ctrlCam').textContent=camOn?'📹':'📷' })
$('ctrlScreen').addEventListener('click',async()=>{
    try {
        const ss=await navigator.mediaDevices.getDisplayMedia({video:true})
        const st=ss.getVideoTracks()[0]; const sender=pc?.getSenders().find(s=>s.track?.kind==='video')
        if(sender) await sender.replaceTrack(st); $('localVideo').srcObject=ss
        st.onended=()=>{ const cam=localStream?.getVideoTracks()[0]; if(cam&&sender){sender.replaceTrack(cam);$('localVideo').srcObject=localStream} }
        toast('Screen sharing','success')
    } catch(err){toast(`Screen share: ${err.message}`,'error')}
})
$('ctrlHangup').addEventListener('click',endCall)
$('acceptCall').addEventListener('click',()=>{ if(_pendingOffer){acceptCall(_pendingOffer.sid,_pendingOffer.offer,_pendingOffer.callType);_pendingOffer=null} })
$('rejectCall').addEventListener('click',()=>{ if(_pendingOffer){socket.emit('callReject',{to:_pendingOffer.sid});_pendingOffer=null} $('incomingCall').style.display='none' })

// Group invite buttons
$('acceptGroupInviteBtn').addEventListener('click',()=>{
    if(!pendingGroupInvite) return
    socket.emit('joinGroup',{groupId:pendingGroupInvite.groupId,password:''})
    $('groupInvitePopup').style.display='none'; pendingGroupInvite=null
})
$('declineGroupInviteBtn').addEventListener('click',()=>{
    if(pendingGroupInvite) socket.emit('declineGroupInvite',{groupId:pendingGroupInvite.groupId})
    $('groupInvitePopup').style.display='none'; pendingGroupInvite=null
})

// ═══════════════════════════════════════════════════════
//  SOCKET EVENTS
// ═══════════════════════════════════════════════════════

socket.on('motd', ({text})=>{
    if(!text) return
    const bar=document.createElement('div'); bar.className='motd-bar'
    bar.innerHTML=`<span>📢 ${esc(text)}</span><button class="motd-bar__close">✕</button>`
    bar.querySelector('button').addEventListener('click',()=>bar.remove())
    document.body.prepend(bar); setTimeout(()=>bar.remove(),10000)
})

socket.on('joinSuccess',({name,room,isAdmin})=>{
    switchToRoom(room)
    myName=name; setProfile(name,currentStatus); setAdminUI(isAdmin)
    $('chLock').style.display='none'
})

socket.on('adminStatus',({isAdmin})=>setAdminUI(isAdmin))
socket.on('ownerStatus',({isOwner})=>setOwnerUI(isOwner))

socket.on('joinError',({type,message})=>{
    if(type==='wrongPassword'){$('passwordGroup').style.display='block';$('passwordError').textContent=message;$('passwordError').style.display='block'}
    else toast(message,'error')
})

socket.on('roomInfo',({room,hasPassword,isLocked})=>{
    if(room===$('roomInput').value.trim()) $('passwordGroup').style.display=hasPassword?'block':'none'
    if(pendingRoomSwitch===room&&myName){
        if(isLocked){toast('Channel is locked','warn');pendingRoomSwitch=null;return}
        if(hasPassword){ const pw=prompt(`#${room} is password protected:`); if(pw===null){pendingRoomSwitch=null;return}; socket.emit('enterRoom',{name:myName,room,password:pw,voidId:myVoidId}) }
        else socket.emit('enterRoom',{name:myName,room,password:'',voidId:myVoidId})
        pendingRoomSwitch=null
    }
})

socket.on('roomCreated',({room})=>socket.emit('enterRoom',{name:myName,room,password:'',voidId:myVoidId}))

socket.on('history',messages=>{ messages.forEach(m=>$('chatDisplay').appendChild(buildMsgEl(m))); if(messages.length){const s=document.createElement('li');s.className='msg--separator';s.innerHTML='<span>─ history ─</span>';$('chatDisplay').appendChild(s)} scrollBottom() })

socket.on('message',data=>{ appendMsg(data); if(chatMode!=='room') toast(`#${myRoom}: ${data.name}: ${(data.text||'').slice(0,30)}`,'info') })

socket.on('delivered',({msgId})=>{ const el=$(`st-${msgId}`); if(el){el.textContent='✓✓';el.className='msg__status msg__status--delivered'} })

socket.on('reaction',({msgId,reactions})=>{ const el=$(`rx-${msgId}`); if(el) el.innerHTML=buildRxHtml(reactions) })

socket.on('activity',({name,sid})=>{typingUsers.set(sid,name);updateTypingBar()})
socket.on('stopActivity',({sid})=>{typingUsers.delete(sid);updateTypingBar()})

socket.on('chatCleared',()=>{$('chatDisplay').innerHTML='';toast('Chat cleared by admin','warn')})
socket.on('roomLocked',({locked})=>{$('chLock').style.display=locked?'inline':'none';toast(locked?'🔒 Channel locked':'🔓 Channel unlocked','warn')})
socket.on('pinnedMsg',msg=>{if(!msg){$('pinnedBar').style.display='none';return} $('pinnedText').textContent=msg.text;$('pinnedBar').style.display='flex'})
socket.on('roomTopic',({topic})=>{ $('chTopic').textContent=topic?' · '+topic:''; if(topic){$('topicBar').style.display='flex';$('topicText').textContent=topic}else{$('topicBar').style.display='none'} })
socket.on('slowMode',({seconds})=>{slowSecs=seconds;toast(seconds?`🐌 Slow mode: ${seconds}s`:'Slow mode off',seconds?'warn':'success')})
socket.on('muteStatus',({muted,minutes})=>toast(muted?`🔇 You were muted${minutes?` for ${minutes} min`:''}`:' You were unmuted',muted?'warn':'success'))
socket.on('warned',({count,by})=>{ toast(`⚠ You were warned by ${by} (${count}/3). 3 = auto-kick.`,'warn') })
socket.on('msgDeleted',({msgId})=>{ const el=$('chatDisplay').querySelector(`[data-msg-id="${msgId}"]`)||[...$('chatDisplay').querySelectorAll('.msg')].find(el=>el.dataset.msgId===msgId); if(el) el.remove() })
socket.on('adminError',({message})=>toast(message,'error'))
socket.on('adminSuccess',({message})=>toast(message,'success'))
socket.on('kicked',({reason})=>{ chatMode='none'; myRoom=''; $('chatScreen').style.display='none'; $('joinOverlay').style.display='flex'; setAdminUI(false); toast(reason||'You were removed','error') })
socket.on('globalBanned',({message})=>{ document.body.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#09090c;color:#ef4444;font-family:monospace;font-size:1.2rem;flex-direction:column;gap:12px"><span style="font-size:3rem">🚫</span><strong>Globally Banned</strong><span style="color:#6b7490;font-size:.9rem">${esc(message)}</span></div>` })

socket.on('userList',({users})=>{
    roomUserMap=users; $('onlineCount').textContent=users.length
    if(chatMode!=='room') return
    $('usersList').innerHTML=''
    users.forEach(u=>{
        const li=document.createElement('li'); li.className='user-item'; li.dataset.name=u.name; li.dataset.sid=u.id
        const callBtns=u.name!==myName?`<div class="user-item__call-btns"><button class="btn-icon" title="Voice call" onclick="window.startCall('${u.id}','${esc(u.name)}','audio')">📞</button><button class="btn-icon" title="Video call" onclick="window.startCall('${u.id}','${esc(u.name)}','video')">📹</button></div>`:''
        li.innerHTML=`<div class="user-item__avatar" style="background:${avColor(u.name)}">${ini(u.name)}</div>
          <div class="user-item__info">
            <span class="user-item__name${u.name===myName?' user-item__name--me':''}${u.isAdmin?' user-item__name--admin':''}">${esc(u.name)}${u.isMuted?' <span style="font-size:.65rem;color:var(--red)">🔇</span>':''}${u.warns>0?` <span class="warn-badge">⚠${u.warns}</span>`:''}</span>
            <span class="user-item__status status--${u.status||'online'}">${statusLbl(u.status)}</span>
          </div>${callBtns}`
        $('usersList').appendChild(li)
    })
    if($('adminModal').style.display!=='none') populateAdminUsers()
})

socket.on('roomList',({rooms})=>renderRoomList(rooms))

// ── DM events ─────────────────────────────────────────
socket.on('dmHistory',({withVoidId,messages})=>{ messages.forEach(m=>$('chatDisplay').appendChild(buildMsgEl(m))); scrollBottom() })
socket.on('dm',({msg,withVoidId})=>{
    if(chatMode==='dm'&&dmPartner?.voidId===withVoidId){ appendMsg(msg) }
    else {
        const current=dmUnread.get(withVoidId)||0; dmUnread.set(withVoidId,current+1)
        renderFriendList()
        const fn=myFriends.find(f=>f.voidId===withVoidId)?.name||withVoidId
        toast(`💬 ${fn}: ${(msg.text||'').slice(0,40)}`,'info')
    }
})
socket.on('dmError',({message})=>toast(message,'error'))
socket.on('dmNotification',({fromName,preview})=>{ if(chatMode!=='dm'||dmPartner?.voidId!==undefined) toast(`💬 ${fromName}: ${preview}`,'info') })

// ── Friend events ─────────────────────────────────────
socket.on('friendList',({friends})=>{ myFriends=friends; renderFriendList() })
socket.on('friendRequest',({fromVoid,fromName})=>{
    friendReqs.push({fromVoid,fromName,time:Date.now()})
    $('friendReqDot').style.display='flex'; $('reqTabDot').style.display='flex'
    toast(`👋 ${fromName} sent you a friend request!`,'info')
})
socket.on('pendingFriendRequests',reqs=>{
    friendReqs=reqs
    if(reqs.length){ $('friendReqDot').style.display='flex'; $('reqTabDot').style.display='flex' }
})
socket.on('friendAccepted',({voidId,name})=>toast(`✅ ${name} accepted your friend request!`,'success'))
socket.on('friendOnline', ({voidId,name})=>{ const f=myFriends.find(f=>f.voidId===voidId); if(f){f.online=true;renderFriendList()} })
socket.on('friendOffline',({voidId})=>{ const f=myFriends.find(f=>f.voidId===voidId); if(f){f.online=false;renderFriendList()} })
socket.on('friendSuccess',({message})=>toast(message,'success'))
socket.on('friendError',({message})=>toast(message,'error'))

// ── Group events ──────────────────────────────────────
socket.on('groupList',({groups})=>{ myGroups=groups; renderGroupList() })
socket.on('groupCreated',({group})=>{ myGroups.push(group); renderGroupList(); joinGroupChat(group) })
socket.on('groupJoined',({group,history,members})=>{
    activeGroup=group
    groupRole=(group.ownerVid===myVoidId)?'owner':((window._groupRoles||{})[group.id]||'member')
    if(!window._groupRoles) window._groupRoles={}
    switchToGroup(group)
    history.forEach(m=>$('chatDisplay').appendChild(buildMsgEl(m)))
    if(history.length){const s=document.createElement('li');s.className='msg--separator';s.innerHTML='<span>─ history ─</span>';$('chatDisplay').appendChild(s)}
    scrollBottom()
    if(members) { populateGroupMembers(members); renderGroupUserPanel(members) }
})
socket.on('groupMsg',msg=>{
    if(chatMode==='group'&&activeGroup) appendMsg(msg)
    else { const g=myGroups.find(g=>g.id===activeGroup?.id); toast(`⬡ ${g?.name||'Group'}: ${msg.name}: ${(msg.text||'').slice(0,30)}`,'info') }
})
socket.on('groupDelivered',({msgId})=>{ const el=$(`st-${msgId}`); if(el){el.textContent='✓✓';el.className='msg__status msg__status--delivered'} })
socket.on('groupReaction',({groupId,msgId,reactions})=>{ const el=$(`rx-${msgId}`); if(el) el.innerHTML=buildRxHtml(reactions) })
socket.on('groupMemberList',({groupId,members})=>{ if(activeGroup?.id===groupId){ populateGroupMembers(members); renderGroupUserPanel(members) } })
socket.on('groupTopic',({groupId,topic})=>{ if(activeGroup?.id===groupId){ activeGroup.topic=topic; if(topic){$('topicBar').style.display='flex';$('topicText').textContent=topic; $('chTopic').textContent=' · '+topic}else{$('topicBar').style.display='none';$('chTopic').textContent=''} } })
socket.on('groupLeft',({groupId})=>{ myGroups=myGroups.filter(g=>g.id!==groupId); renderGroupList(); if(activeGroup?.id===groupId){activeGroup=null;chatMode='none';$('chatScreen').style.display='none';$('joinOverlay').style.display='flex'} })
socket.on('groupDeleted',({groupId,groupName})=>{ myGroups=myGroups.filter(g=>g.id!==groupId); renderGroupList(); if(activeGroup?.id===groupId){activeGroup=null;chatMode='none';$('chatScreen').style.display='none';$('joinOverlay').style.display='flex';toast(`Group "${groupName}" was deleted`,'warn')} })
socket.on('groupKicked',({groupId,groupName})=>{ myGroups=myGroups.filter(g=>g.id!==groupId); renderGroupList(); if(activeGroup?.id===groupId){activeGroup=null;chatMode='none';$('chatScreen').style.display='none';$('joinOverlay').style.display='flex';toast(`Kicked from group "${groupName}"`,'error')} })
socket.on('groupAdminStatus',({groupId,isAdmin})=>{ if(activeGroup?.id===groupId){groupRole=isAdmin?'admin':'member';$('chAdminBadge').style.display=isAdmin?'inline':'none'} })
socket.on('groupOwnerStatus',({groupId})=>{ if(activeGroup?.id===groupId){groupRole='owner';$('chOwnerBadge').style.display='inline';$('chAdminBadge').style.display='none';if(!window._groupRoles) window._groupRoles={};window._groupRoles[groupId]='owner'} })
socket.on('groupSuccess',({message})=>toast(message,'success'))
socket.on('groupError',({message})=>toast(message,'error'))
socket.on('groupInvite',({groupId,groupName,invitedBy,color})=>{
    pendingGroupInvite={groupId,groupName,invitedBy,color}
    $('gInviteColor').style.backgroundColor=color
    $('gInviteName').textContent=groupName; $('gInviteBy').textContent=`Invited by ${invitedBy}`
    $('groupInvitePopup').style.display='flex'
})

// ── Owner events ──────────────────────────────────────
socket.on('ownerSuccess',({message})=>toast(message,'success'))
socket.on('ownerError',({message})=>toast(message,'error'))
socket.on('serverStats',({users,rooms,groups,owners,globalBans,motd,allUsers})=>{
    // Overview
    $('ownerStats').innerHTML=`
      <div class="owner-stat-card"><div class="owner-stat-card__val">${users}</div><div class="owner-stat-card__lbl">Online Users</div></div>
      <div class="owner-stat-card"><div class="owner-stat-card__val">${rooms.length}</div><div class="owner-stat-card__lbl">Active Channels</div></div>
      <div class="owner-stat-card"><div class="owner-stat-card__val">${groups}</div><div class="owner-stat-card__lbl">Groups</div></div>
      <div class="owner-stat-card"><div class="owner-stat-card__val">${owners.length}</div><div class="owner-stat-card__lbl">Owners</div></div>
      <div class="owner-stat-card"><div class="owner-stat-card__val">${globalBans.length}</div><div class="owner-stat-card__lbl">Global Bans</div></div>
      <div class="owner-stat-card"><div class="owner-stat-card__val" style="font-size:.9rem;color:var(--tx1)">${esc(motd.slice(0,30))}…</div><div class="owner-stat-card__lbl">MOTD</div></div>`
    // All users tab
    const ul=$('ownerUserList'); ul.innerHTML=''
    allUsers.forEach(u=>{
        const row=document.createElement('div'); row.className='admin-user-row'
        row.innerHTML=`<div class="msg__avatar" style="background:${avColor(u.name)};width:28px;height:28px;font-size:.65rem">${ini(u.name)}</div>
          <div class="admin-user-row__name" style="flex:1">${esc(u.name)}<br><span style="font-size:.7rem;color:var(--tx3)">${esc(u.voidId)} · #${esc(u.room)}</span></div>
          <span class="user-item__status status--${u.status}">${statusLbl(u.status)}</span>`
        ul.appendChild(row)
    })
    // Rooms tab
    const rl=$('ownerRoomList'); rl.innerHTML=''
    rooms.forEach(r=>{
        const row=document.createElement('div'); row.className='owner-room-row'
        row.innerHTML=`<div class="owner-room-row__info">#${esc(r.name)}</div>
          <div class="owner-room-row__count">${r.count} user${r.count!==1?'s':''}</div>
          <button class="admin-user-btn admin-user-btn--danger" style="font-size:.72rem" data-delroom="${esc(r.name)}">Delete</button>`
        rl.appendChild(row)
    })
    rl.addEventListener('click',e=>{ const d=e.target.dataset.delroom; if(d&&confirm(`Delete channel #${d}?`)) socket.emit('ownerCmd',{cmd:'deleteRoom',room:d}) })
    // Bans tab
    const bl=$('ownerBanList'); bl.innerHTML=''
    if(!globalBans.length) bl.innerHTML='<p class="item-empty">No global bans.</p>'
    globalBans.forEach(vid=>{
        const row=document.createElement('div'); row.className='admin-user-row'
        row.innerHTML=`<span style="font-family:monospace;color:var(--red);flex:1">${esc(vid)}</span>
          <button class="admin-user-btn" data-unban="${esc(vid)}">Unban</button>`
        bl.appendChild(row)
    })
    bl.addEventListener('click',e=>{ const v=e.target.dataset.unban; if(v) socket.emit('ownerCmd',{cmd:'globalUnban',targetVoid:v}) })
})

socket.on('auditLog',({logs})=>{
    const el=$('auditLogView'); el.innerHTML=''
    if(!logs.length){el.innerHTML='<p class="item-empty" style="padding:8px">No actions logged yet.</p>';return}
    logs.forEach(l=>{
        const row=document.createElement('div'); row.className='audit-row'
        row.innerHTML=`<span class="audit-action">${esc(l.action)}</span><span>${esc(l.by)}</span><span>${esc(l.target)}</span><span class="audit-time">${esc(l.time)}</span>`
        el.appendChild(row)
    })
})

// ── WebRTC socket ─────────────────────────────────────
socket.on('callOffer',({from,fromName,offer,callType:type})=>{
    if(pc){socket.emit('callBusy',{to:from});return}
    _pendingOffer={sid:from,name:fromName,offer,callType:type}; callWith={sid:from,name:fromName}
    const av=$('incomingAv'); av.textContent=ini(fromName); av.style.backgroundColor=avColor(fromName)
    $('incomingName').textContent=fromName; $('incomingType').textContent=type==='video'?'📹 Video call':'📞 Voice call'
    $('incomingCall').style.display='flex'
})
socket.on('callAnswer',async({answer})=>{ if(!pc) return; await pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(()=>{}) })
socket.on('callIce',async({candidate})=>{ if(!pc) return; await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(()=>{}) })
socket.on('callReject',()=>{ endCall(); toast(`${callWith?.name||'User'} declined`,'warn') })
socket.on('callEnd',()=>endCall())
socket.on('callBusy',()=>{ toast(`${callWith?.name||'User'} is busy`,'warn'); endCall() })

// ═══════════════════════════════════════════════════════
//  UI UTILITIES
// ═══════════════════════════════════════════════════════
function setProfile(name,status) {
    $('profileName').textContent=name; $('profileAvatar').textContent=ini(name); $('profileAvatar').style.backgroundColor=avColor(name); updateProfileStatus(status)
}
function updateProfileStatus(s) {
    const l={online:'● Online',idle:'● Idle',dnd:'● Do Not Disturb'}
    $('profileStatus').textContent=l[s]||'● Online'; $('profileStatus').className=`profile-status status--${s}`
}
function setAdminUI(isAdmin) {
    amAdmin=isAdmin
    if(chatMode==='room'){
        $('adminPanelBtn').style.display=isAdmin?'flex':'none'
        $('chAdminBadge').style.display=isAdmin?'inline':'none'
        $('adminSideSection').style.display=isAdmin?'block':'none'
    }
}
function setOwnerUI(isOwner) {
    amOwner=isOwner
    $('chOwnerBadge').style.display=isOwner?'inline':'none'
    $('ownerPanelBtn').style.display=isOwner?'flex':'none'
    $('claimOwnerBtn').style.display=isOwner?'none':'flex'
    $('ownerRoomBtn').style.display=isOwner?'flex':'none'
    $('ownerSideSection').style.display='block'
    if(isOwner) toast('⭐ You are now Server Owner','success')
}
function updateTypingBar() {
    const names=[...typingUsers.values()]
    if(!names.length){$('activityBar').innerHTML='';return}
    const who=names.length===1?names[0]:names.length<=3?names.join(', '):'Several people'
    $('activityBar').innerHTML=`<span><span class="typing-dots"><span></span><span></span><span></span></span> ${esc(who)} ${names.length===1?'is':'are'} typing…</span>`
}
function renderGroupUserPanel(members) {
    $('usersList').innerHTML=''; $('onlineCount').textContent=members.length
    members.forEach(m=>{
        const li=document.createElement('li'); li.className='user-item'; li.dataset.name=m.name
        li.innerHTML=`<div class="user-item__avatar" style="background:${avColor(m.name)}">${ini(m.name)}</div>
          <div class="user-item__info">
            <span class="user-item__name${m.name===myName?' user-item__name--me':''}">${esc(m.name)}${m.role!=='member'?` <span style="font-size:.65rem;color:var(--ylw)">${m.role==='owner'?'⭐':'👑'}</span>`:''}</span>
            <span class="user-item__status status--online">● ${m.role}</span>
          </div>`
        $('usersList').appendChild(li)
    })
}
function statusLbl(s) { return {online:'● Online',idle:'● Idle',dnd:'● DND'}[s]||'● Online' }
function toast(msg,type='info') {
    const t=document.createElement('div'); t.className=`toast toast--${type}`; t.textContent=msg
    document.body.appendChild(t)
    requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add('toast--visible')))
    setTimeout(()=>{ t.classList.remove('toast--visible'); setTimeout(()=>t.remove(),300) },3200)
}

// Expose to global for onclick attrs
window.startCall = startCall
