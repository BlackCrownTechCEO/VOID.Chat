const socket = io('ws://localhost:3500')

const msgInput = document.querySelector('#message')
const nameInput = document.querySelector('#name')
const chatRoom = document.querySelector('#room')
const activity = document.querySelector('.activity')
const usersList = document.querySelector('.user-list')
const roomList = document.querySelector('.room-list')
const chatDisplay = document.querySelector('.chat-display')

function sendMessage(e) {
    e.preventDefault()
    if (nameInput.value && msgInput.value && chatRoom.value) {
        socket.emit('message', {
            name: nameInput.value,
            text: msgInput.value
        })
        msgInput.value = ""
    }
    msgInput.focus()
}

function enterRoom(e) {
    e.preventDefault()
    if (nameInput.value && chatRoom.value) {
        socket.emit('enterRoom', {
            name: nameInput.value,
            room: chatRoom.value
        })
    }
}

document.querySelector('.form-msg')
    .addEventListener('submit', sendMessage)

document.querySelector('.form-join')
    .addEventListener('submit', enterRoom)

msgInput.addEventListener('keypress', () => {
    socket.emit('activity', nameInput.value)
})

// Listen for messages 
socket.on("message", (data) => {
    activity.textContent = ""
    const { name, text, time } = data
    const li = document.createElement('li')
    li.className = 'post'
    if (name === nameInput.value) li.className = 'post post--left'
    if (name !== nameInput.value && name !== 'Admin') li.className = 'post post--right'
    if (name !== 'Admin') {
        li.innerHTML = `<div class="post__header ${name === nameInput.value
            ? 'post__header--user'
            : 'post__header--reply'
            }">
        <span class="post__header--name">${name}</span> 
        <span class="post__header--time">${time}</span> 
        </div>
        <div class="post__text">${text}</div>`
    } else {
        li.innerHTML = `<div class="post__text">${text}</div>`
    }
    document.querySelector('.chat-display').appendChild(li)

    chatDisplay.scrollTop = chatDisplay.scrollHeight
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
>>>>>>> Stashed changes
})
$('ctrlHangup').addEventListener('click',endCall)
$('acceptCall').addEventListener('click',()=>{ if(_pendingOffer){acceptCall(_pendingOffer.sid,_pendingOffer.offer,_pendingOffer.callType);_pendingOffer=null} })
$('rejectCall').addEventListener('click',()=>{ if(_pendingOffer){socket.emit('callReject',{to:_pendingOffer.sid});_pendingOffer=null} $('incomingCall').style.display='none' })

<<<<<<< Updated upstream
let activityTimer
socket.on("activity", (name) => {
    activity.textContent = `${name} is typing...`

    // Clear after 3 seconds 
    clearTimeout(activityTimer)
    activityTimer = setTimeout(() => {
        activity.textContent = ""
    }, 3000)
})

socket.on('userList', ({ users }) => {
    showUsers(users)
})

socket.on('roomList', ({ rooms }) => {
    showRooms(rooms)
})

function showUsers(users) {
    usersList.textContent = ''
    if (users) {
        usersList.innerHTML = `<em>Users in ${chatRoom.value}:</em>`
        users.forEach((user, i) => {
            usersList.textContent += ` ${user.name}`
            if (users.length > 1 && i !== users.length - 1) {
                usersList.textContent += ","
            }
        })
    }
}

function showRooms(rooms) {
    roomList.textContent = ''
    if (rooms) {
        roomList.innerHTML = '<em>Active Rooms:</em>'
        rooms.forEach((room, i) => {
            roomList.textContent += ` ${room}`
            if (rooms.length > 1 && i !== rooms.length - 1) {
                roomList.textContent += ","
            }
        })
    }
}
=======
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
>>>>>>> Stashed changes
