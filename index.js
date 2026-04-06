import express from 'express'
import { createServer } from 'http'
import { Server } from "socket.io"
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const PORT       = process.env.PORT || 3500
const SYS        = "System"
const MAX_HIST   = 100
const OWNER_KEY  = process.env.VOID_OWNER_KEY || 'VOID-OWNER-2024'

const app = express()
app.use(express.static(path.join(__dirname, "public")))

// ─── Health / readiness (omega spec §12) ────────────────
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }))
app.get('/readyz',  (_req, res) => res.json({ status: 'ready' }))

const srv = createServer(app)

if (!process.env.VERCEL) {
    // Never log the owner key value — omega §12 / §3.4
    srv.listen(PORT, () => console.log(`\x1b[36m[VOID]\x1b[0m Server on :${PORT}`))
}

export default app

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex') }
function uid()  { return crypto.randomUUID() }
function gid()  { return crypto.randomUUID().slice(0,8).toUpperCase() }
function ts()   { return new Intl.DateTimeFormat('default',{hour:'numeric',minute:'numeric'}).format(new Date()) }

function buildMsg(name, text, replyTo=null, type='user', extra={}) {
    return { id:uid(), name, text, replyTo, type, ...extra, time:ts() }
}

// ═══════════════════════════════════════════════════════
//  VOID-ID → SOCKET MAPPING  (online presence)
// ═══════════════════════════════════════════════════════
const VoidSockets = {
    map:   new Map(), // voidId → socketId
    names: new Map(), // voidId → name
    set(vid,sid,name){ this.map.set(vid,sid); if(name) this.names.set(vid,name) },
    del(vid)         { this.map.delete(vid) },
    sid(vid)         { return this.map.get(vid) },
    online(vid)      { return this.map.has(vid) },
    name(vid)        { return this.names.get(vid)||'Unknown' }
}

// ═══════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════
const Users = {
    list: [],
    get(id)    { return this.list.find(u=>u.id===id) },
    byName(room,name){ return this.list.find(u=>u.room===room&&u.name.toLowerCase()===name.toLowerCase()) },
    inRoom(room){ return this.list.filter(u=>u.room===room) },
    rooms()     { return [...new Set(this.list.map(u=>u.room))] },
    add(user)   { this.list=[...this.list.filter(u=>u.id!==user.id),user] },
    remove(id)  { this.list=this.list.filter(u=>u.id!==id) }
}

// ═══════════════════════════════════════════════════════
//  ROOMS
// ═══════════════════════════════════════════════════════
const Rooms = {
    map: new Map(),
    ensure(name){
        if(!this.map.has(name)) this.map.set(name,{password:null,messages:[],reactions:new Map(),topic:'',welcome:''})
        return this.map.get(name)
    },
    hasPw(name){ return this.map.has(name)&&!!this.map.get(name).password },
    setPw(name,pw){ this.ensure(name).password=pw?sha(pw):null },
    checkPw(name,pw){ if(!this.map.has(name))return true; const r=this.map.get(name); return !r.password||r.password===sha(pw||'') },
    addMsg(name,msg){
        const r=this.ensure(name); r.messages.push(msg)
        if(r.messages.length>MAX_HIST) r.messages.shift()
    },
    delMsg(name,msgId){ const r=this.map.get(name); if(r) r.messages=r.messages.filter(m=>m.id!==msgId) },
    clearMsgs(name){ if(this.map.has(name)) this.map.get(name).messages=[] },
    history(name){ return this.map.has(name)?this.map.get(name).messages:[] },
    react(roomName,msgId,emoji,username){
        const r=this.ensure(roomName)
        if(!r.reactions.has(msgId)) r.reactions.set(msgId,{})
        const rx=r.reactions.get(msgId)
        if(!rx[emoji]) rx[emoji]=new Set()
        rx[emoji].has(username)?rx[emoji].delete(username):rx[emoji].add(username)
        if(!rx[emoji].size) delete rx[emoji]
        const out={}; for(const [e,s] of Object.entries(rx)) out[e]=[...s]; return out
    }
}

// ═══════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════
const Admin = {
    admins: new Map(), muted:  new Map(), banned: new Map(),
    locked: new Set(), pinned: new Map(), tempMutes: new Map(),
    wordFilter: new Map(), // room → Set<word>
    warnings: new Map(),   // room → Map<sid → count>

    isAdmin(room,sid)   { return !!this.admins.get(room)?.has(sid) },
    makeAdmin(room,sid) { if(!this.admins.has(room)) this.admins.set(room,new Set()); this.admins.get(room).add(sid) },
    remAdmin(room,sid)  { this.admins.get(room)?.delete(sid) },

    isMuted(room,sid)   { return !!this.muted.get(room)?.has(sid) },
    toggleMute(room,sid){
        if(!this.muted.has(room)) this.muted.set(room,new Set())
        const s=this.muted.get(room); const now=!s.has(sid); now?s.add(sid):s.delete(sid); return now
    },
    setMuted(room,sid,v){ if(!this.muted.has(room)) this.muted.set(room,new Set()); v?this.muted.get(room).add(sid):this.muted.get(room).delete(sid) },

    isBanned(room,vid)  { return !!this.banned.get(room)?.has(vid) },
    ban(room,vid)       { if(!this.banned.has(room)) this.banned.set(room,new Set()); this.banned.get(room).add(vid) },

    isLocked(room)      { return this.locked.has(room) },
    lock(room)          { this.locked.add(room) },
    unlock(room)        { this.locked.delete(room) },

    pin(room,msg)       { this.pinned.set(room,msg) },
    unpin(room)         { this.pinned.delete(room) },
    getPin(room)        { return this.pinned.get(room)||null },

    warn(room,sid)      {
        if(!this.warnings.has(room)) this.warnings.set(room,new Map())
        const m=this.warnings.get(room); const c=(m.get(sid)||0)+1; m.set(sid,c); return c
    },
    warnCount(room,sid) { return this.warnings.get(room)?.get(sid)||0 },
    clearWarns(room,sid){ this.warnings.get(room)?.delete(sid) },

    nsfwRooms: new Set(),
    setNsfw(room,v){ v ? this.nsfwRooms.add(room) : this.nsfwRooms.delete(room) },
    isNsfw(room){ return this.nsfwRooms.has(room) },

    addFilter(room,word){ if(!this.wordFilter.has(room)) this.wordFilter.set(room,new Set()); this.wordFilter.get(room).add(word.toLowerCase()) },
    remFilter(room,word){ this.wordFilter.get(room)?.delete(word.toLowerCase()) },
    filterText(room,text){
        const words=this.wordFilter.get(room); if(!words?.size) return text
        let t=text; words.forEach(w=>{t=t.replace(new RegExp(`\\b${w}\\b`,'gi'),'█'.repeat(w.length))}); return t
    },

    tempMute(room,sid,mins,io_){
        const key=`${room}:${sid}`
        if(this.tempMutes.has(key)) clearTimeout(this.tempMutes.get(key))
        this.setMuted(room,sid,true)
        io_.to(sid).emit('muteStatus',{muted:true,minutes:mins})
        const t=setTimeout(()=>{
            this.setMuted(room,sid,false)
            io_.to(sid).emit('muteStatus',{muted:false})
            io_.to(room).emit('userList',{users:richUsers(room)})
            this.tempMutes.delete(key)
        }, mins*60000)
        this.tempMutes.set(key,t)
    }
}

// ═══════════════════════════════════════════════════════
//  AUDIT LOG
// ═══════════════════════════════════════════════════════
const Audit = {
    logs: new Map(),
    add(room,action,by,target=''){
        if(!this.logs.has(room)) this.logs.set(room,[])
        const l=this.logs.get(room)
        l.unshift({action,by,target,time:ts()})
        if(l.length>100) l.pop()
    },
    get(room){ return (this.logs.get(room)||[]).slice(0,50) }
}

// ═══════════════════════════════════════════════════════
//  OWNER  (System Admin)
// ═══════════════════════════════════════════════════════
const hwBans   = new Map()  // fingerprint → { fp, voidId, name, bannedAt }

const Owner = {
    owners:    new Set(),
    globalBans: new Map(), // voidId → { name, reason, bannedAt }
    motd: 'Welcome to VOID — private secure messaging by BlackCrownTech.',
    isOwner(vid){ return this.owners.has(vid) },
    add(vid)    { this.owners.add(vid) },
    remove(vid) { this.owners.delete(vid) },
    globalBan(vid, name='', reason='') { this.globalBans.set(vid, { name, reason, bannedAt: new Date().toISOString() }) },
    globalUnban(vid){ this.globalBans.delete(vid) },
    isBanned(vid)   { return this.globalBans.has(vid) },
    getBanList()    { return [...this.globalBans.entries()].map(([voidId,d])=>({voidId,...d})) }
}

// ═══════════════════════════════════════════════════════
//  SERVER-WIDE STATE  (Owner Panel features)
// ═══════════════════════════════════════════════════════
let maintenanceMode = false
const globalFilters = new Set()
const globalAuditLog = []   // [{ action, by, target, time, type }]
let statHistory    = []     // rolling 60-min: [{ ts, users, msgs }]
let statMsgCount   = 0
const rateLimitMap = new Map()  // socketId → [timestamps]
const serverConfig = {
    serverName: 'VOID', maxUsers: 0, welcomeMsg: '',
    defaultChannel: 'general', allowGuestNames: true, registrationOpen: true
}
const announceQueue = []    // [{ text, sendAt, pinned }]

function roomListPayload() {
    return { rooms: Users.rooms().map(r => ({ name: r, isNsfw: Admin.isNsfw(r) })) }
}

function addGlobalAudit(action, by, target='', type='info') {
    const entry = { action, by, target, time: ts(), type }
    globalAuditLog.unshift(entry)
    if (globalAuditLog.length > 500) globalAuditLog.pop()
}

function checkFloodLimit(socketId, limit=10, windowMs=5000) {
    const now = Date.now()
    const times = (rateLimitMap.get(socketId) || []).filter(t => now - t < windowMs)
    times.push(now); rateLimitMap.set(socketId, times)
    return times.length <= limit
}

function applyGlobalFilter(text) {
    let t = text
    globalFilters.forEach(w => { t = t.replace(new RegExp(`\\b${w}\\b`, 'gi'), '█'.repeat(w.length)) })
    return t
}

// ═══════════════════════════════════════════════════════
//  FRIENDS
// ═══════════════════════════════════════════════════════
const Friends = {
    friends:  new Map(), // voidId → Map<voidId → {name}>
    requests: new Map(), // receiverVoid → Map<senderVoid → {name,time}>
    blocked:  new Map(), // voidId → Set<voidId>

    sendReq(fromVid,fromName,toVid){
        if(!this.requests.has(toVid)) this.requests.set(toVid,new Map())
        this.requests.get(toVid).set(fromVid,{name:fromName,time:Date.now()})
    },
    acceptReq(fromVid,toVid,toName){
        const req=this.requests.get(toVid); if(!req?.has(fromVid)) return false
        const {name:fromName}=req.get(fromVid); req.delete(fromVid)
        if(!this.friends.has(fromVid)) this.friends.set(fromVid,new Map())
        if(!this.friends.has(toVid))   this.friends.set(toVid,new Map())
        this.friends.get(fromVid).set(toVid,{name:toName})
        this.friends.get(toVid).set(fromVid,{name:fromName})
        return true
    },
    declineReq(fromVid,toVid){ this.requests.get(toVid)?.delete(fromVid) },
    removeFriend(a,b){ this.friends.get(a)?.delete(b); this.friends.get(b)?.delete(a) },
    areFriends(a,b){ return !!this.friends.get(a)?.has(b) },
    getFriends(vid){ return [...(this.friends.get(vid)||new Map()).entries()].map(([v,d])=>({voidId:v,name:d.name})) },
    getPendingReqs(vid){ return [...(this.requests.get(vid)||new Map()).entries()].map(([fv,d])=>({fromVoid:fv,fromName:d.name,time:d.time})) },
    block(from,target){ if(!this.blocked.has(from)) this.blocked.set(from,new Set()); this.blocked.get(from).add(target); this.removeFriend(from,target) },
    unblock(from,target){ this.blocked.get(from)?.delete(target) },
    isBlocked(from,target){ return !!this.blocked.get(from)?.has(target) }
}

// ═══════════════════════════════════════════════════════
//  DMs
// ═══════════════════════════════════════════════════════
const DMs = {
    convos: new Map(),
    key(a,b){ return [a,b].sort().join('::') },
    addMsg(a,b,msg){
        const k=this.key(a,b)
        if(!this.convos.has(k)) this.convos.set(k,[])
        const c=this.convos.get(k); c.push(msg); if(c.length>MAX_HIST) c.shift()
    },
    delMsg(a,b,msgId){ const k=this.key(a,b); const c=this.convos.get(k); if(c) this.convos.set(k,c.filter(m=>m.id!==msgId)) },
    history(a,b){ return this.convos.get(this.key(a,b))||[] }
}

// ═══════════════════════════════════════════════════════
//  GROUPS
// ═══════════════════════════════════════════════════════
const Groups = {
    map: new Map(),
    create(name,desc,ownerVid,ownerName,pw,isPrivate){
        const g={
            id: gid(), name, desc, ownerVid,
            color: ['#5b6cf5','#22c55e','#f59e0b','#ef4444','#a78bfa','#00d4ff'][Math.floor(Math.random()*6)],
            password: pw?sha(pw):null, isPrivate,
            members: new Map(), // voidId → {name,role:'owner'|'admin'|'member',joinedAt}
            messages: [], reactions: new Map(),
            invites: new Set(), topic:'',
            createdAt: new Date().toISOString()
        }
        g.members.set(ownerVid,{name:ownerName,role:'owner',joinedAt:Date.now()})
        this.map.set(g.id,g); return g
    },
    get(id){ return this.map.get(id) },
    forMember(vid){ return [...this.map.values()].filter(g=>g.members.has(vid)) },
    pub(g){ return {id:g.id,name:g.name,desc:g.desc,color:g.color,ownerVid:g.ownerVid,isPrivate:g.isPrivate,memberCount:g.members.size,topic:g.topic,createdAt:g.createdAt} },
    memberList(g){ return [...g.members.entries()].map(([vid,m])=>({voidId:vid,name:m.name,role:m.role})) },
    roomId(g){ return `grp:${g.id}` },
    react(gid,msgId,emoji,username){
        const g=this.map.get(gid); if(!g) return {}
        if(!g.reactions.has(msgId)) g.reactions.set(msgId,{})
        const rx=g.reactions.get(msgId)
        if(!rx[emoji]) rx[emoji]=new Set()
        rx[emoji].has(username)?rx[emoji].delete(username):rx[emoji].add(username)
        if(!rx[emoji].size) delete rx[emoji]
        const out={}; for(const [e,s] of Object.entries(rx)) out[e]=[...s]; return out
    }
}

// ═══════════════════════════════════════════════════════
//  SERVERS  (Communities: Server → Groups → Rooms)
// ═══════════════════════════════════════════════════════
const Servers = {
    map: new Map(),
    create(name, desc, ownerVid, ownerName, pw){
        const s={
            id:gid(), name, desc, ownerVid,
            password: pw?sha(pw):null,
            members: new Map(), // voidId → {name,role}
            groups:  new Map(), // groupId → {id,name,rooms:Map<roomId→{id,name,messages[]}>}
            createdAt: new Date().toISOString()
        }
        s.members.set(ownerVid,{name:ownerName,role:'owner'})
        this.map.set(s.id,s); return s
    },
    get(id){ return this.map.get(id) },
    forMember(vid){ return [...this.map.values()].filter(s=>s.members.has(vid)) },
    pub(s){ return {id:s.id,name:s.name,desc:s.desc,ownerVid:s.ownerVid,memberCount:s.members.size,groupCount:s.groups.size,createdAt:s.createdAt} },
    pubFull(s){
        const groups=[...s.groups.values()].map(g=>({
            id:g.id, name:g.name,
            rooms:[...g.rooms.values()].map(r=>({id:r.id,name:r.name}))
        }))
        return {...this.pub(s),groups}
    },
    roomKey(sid,rid){ return `srv:${sid}:${rid}` }
}

// ═══════════════════════════════════════════════════════
//  E2E KEY RELAY  (server never decrypts — just stores/relays)
// ═══════════════════════════════════════════════════════
const publicKeys  = new Map()  // voidId → base64 ECDH public key
const roomKeyPkts = new Map()  // roomKey(sid,rid) → Map<voidId, wrappedKey>

// ── VOID Feed ────────────────────────────────────────
const voids        = new Map()  // voidId → { voidId, fromVoidId, name, text, attach, type, expiresAt }
const feedFlashes  = new Map()  // flashId → { flashId, fromVoidId, name, text, attach, vfExpiry, vfThumb, postedAt }
const userDailyAct = new Map()  // voidId → { lastMsgDay }

function mkVoidId() { return `vd_${uid().slice(0, 12)}` }

setInterval(() => {
    const now = Date.now()
    for (const [vid, v] of voids) {
        if (v.expiresAt < now) {
            voids.delete(vid)
            io.emit('voidExpired', { voidId: vid })
        }
    }
}, 60_000)

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function richUsers(room){
    return Users.inRoom(room).map(u=>({...u,isAdmin:Admin.isAdmin(room,u.id),isMuted:Admin.isMuted(room,u.id),warns:Admin.warnCount(room,u.id)}))
}

// ═══════════════════════════════════════════════════════
//  SOCKET.IO
// ═══════════════════════════════════════════════════════
const io = new Server(srv, {
    maxHttpBufferSize: 8e6,  // 8 MB — covers 5 MB file after base64 expansion (~6.7 MB)
    cors:{ origin: process.env.NODE_ENV==='production'?false:['http://localhost:5500','http://127.0.0.1:5500'] }
})

io.on('connection', socket => {
    // ── E2EE alias room subscription ───────────────────────
    socket.on('joinAliasRoom', ({ alias }) => {
        if (alias && typeof alias === 'string') socket.join(`alias:${alias}`)
    })

    socket.emit('message',buildMsg(SYS,'Welcome to VOID — private messaging by BlackCrownTech.',null,'system'))

    // ── Authenticate (called as soon as identity is set) ─
    socket.on('authenticate', ({voidId,name,fp})=>{
        if(!voidId||!name) return
        if(fp && hwBans.has(fp)){ socket.emit('globalBanned',{message:'You are hardware banned from VOID.'}); socket.disconnect(); return }
        if(fp) socket.data.fp = fp
        if(Owner.isBanned(voidId)){ socket.emit('globalBanned',{message:'You are globally banned from VOID.'}); socket.disconnect(); return }
        if(maintenanceMode&&!Owner.isOwner(voidId)){ socket.emit('maintenanceLock',{message:'Server is under maintenance. Please try again later.'}); socket.disconnect(); return }
        if(!serverConfig.registrationOpen&&!VoidSockets.online(voidId)){ socket.emit('globalBanned',{message:'Registration is currently closed.'}); socket.disconnect(); return }
        if(serverConfig.maxUsers>0&&io.sockets.size>serverConfig.maxUsers&&!Owner.isOwner(voidId)){ socket.emit('globalBanned',{message:'Server is full.'}); socket.disconnect(); return }
        socket.data.voidId=voidId; socket.data.name=name
        VoidSockets.set(voidId,socket.id,name)
        socket.emit('motd',{text:Owner.motd})
        if(Owner.isOwner(voidId)) socket.emit('ownerStatus',{isOwner:true})
        const reqs=Friends.getPendingReqs(voidId)
        if(reqs.length) socket.emit('pendingFriendRequests',reqs)
        const friends=Friends.getFriends(voidId).map(f=>({...f,online:VoidSockets.online(f.voidId)}))
        socket.emit('friendList',{friends})
        const groups=Groups.forMember(voidId).map(g=>Groups.pub(g))
        socket.emit('groupList',{groups})
        // Rejoin group socket.io rooms
        Groups.forMember(voidId).forEach(g=>socket.join(Groups.roomId(g)))
        // Rejoin server rooms + emit serverList
        Servers.forMember(voidId).forEach(s=>{
            socket.join(`srv:${s.id}`)
            s.groups.forEach(g=>g.rooms.forEach(r=>socket.join(Servers.roomKey(s.id,r.id))))
        })
        socket.emit('serverList',{servers:Servers.forMember(voidId).map(s=>Servers.pubFull(s))})
        // Send back their public key if we have it (reconnect case)
        if (publicKeys.has(voidId)) socket.emit('publicKey', { voidId, publicKey: publicKeys.get(voidId), isSelf: true })
        // Notify friends you're online
        Friends.getFriends(voidId).forEach(({voidId:fv})=>{
            const fs=VoidSockets.sid(fv); if(fs) io.to(fs).emit('friendOnline',{voidId,name})
        })
    })

    // ── Enter room ───────────────────────────────────────
    socket.on('enterRoom', ({name,room,password,voidId})=>{
        if(!name?.trim()||!room?.trim()) return
        if(voidId&&Admin.isBanned(room,voidId)) return socket.emit('joinError',{type:'banned',message:'You are banned from this channel.'})
        if(!Rooms.checkPw(room,password))  return socket.emit('joinError',{type:'wrongPassword',message:'Incorrect room password.'})
        if(Admin.isLocked(room)&&Users.inRoom(room).length>0) return socket.emit('joinError',{type:'locked',message:'Channel is locked.'})

        const prev=Users.get(socket.id)?.room
        if(prev){ socket.leave(prev); io.to(prev).emit('message',buildMsg(SYS,`${name} left the channel.`,null,'system')); Admin.remAdmin(prev,socket.id); io.to(prev).emit('userList',{users:richUsers(prev)}) }

        const user={id:socket.id,name,room,voidId:voidId||null,status:'online'}
        Users.add(user); socket.join(room)
        if(Users.inRoom(room).length===1) Admin.makeAdmin(room,socket.id)

        const isAdmin=Admin.isAdmin(room,socket.id)
        socket.emit('joinSuccess',{name,room,isAdmin,isNsfw:Admin.isNsfw(room)})
        socket.emit('history',Rooms.history(room))
        const pin=Admin.getPin(room); if(pin) socket.emit('pinnedMsg',pin)
        const welcome=Rooms.map.get(room)?.welcome; if(welcome) socket.emit('message',buildMsg(SYS,welcome,null,'system'))
        const topic=Rooms.map.get(room)?.topic; if(topic) socket.emit('roomTopic',{topic})

        socket.emit('message',buildMsg(SYS,`You joined #${room}`,null,'system'))
        socket.broadcast.to(room).emit('message',buildMsg(SYS,`${name} joined #${room}`,null,'system'))
        io.to(room).emit('userList',{users:richUsers(room)})
        io.emit('roomList',roomListPayload())
        if(isAdmin) socket.emit('adminStatus',{isAdmin:true})
    })

    socket.on('createRoom',({room,password})=>{
        if(!room?.trim()) return
        Rooms.ensure(room); if(password) Rooms.setPw(room,password)
        socket.emit('roomCreated',{room,hasPassword:!!password})
    })

    socket.on('checkRoom',({room})=>{
        socket.emit('roomInfo',{room,hasPassword:Rooms.hasPw(room),isLocked:Admin.isLocked(room)})
    })

    // ── Disconnect ───────────────────────────────────────
    socket.on('disconnect',()=>{
        const user=Users.get(socket.id); const voidId=socket.data?.voidId
        Users.remove(socket.id)
        if(voidId){ VoidSockets.del(voidId); Friends.getFriends(voidId).forEach(({voidId:fv})=>{ const fs=VoidSockets.sid(fv); if(fs) io.to(fs).emit('friendOffline',{voidId}) }) }
        if(user){
            if(Admin.isAdmin(user.room,socket.id)){
                Admin.remAdmin(user.room,socket.id)
                const next=Users.inRoom(user.room)[0]
                if(next){ Admin.makeAdmin(user.room,next.id); io.to(next.id).emit('adminStatus',{isAdmin:true}); io.to(user.room).emit('message',buildMsg(SYS,`${next.name} is now channel admin.`,null,'system')) }
            }
            io.to(user.room).emit('message',buildMsg(SYS,`${user.name} left #${user.room}`,null,'system'))
            io.to(user.room).emit('userList',{users:richUsers(user.room)})
            io.emit('roomList',roomListPayload())
        }
        rateLimitMap.delete(socket.id)
        console.log(`\x1b[90m[VOID]\x1b[0m - ${socket.id}`)
    })

    // ── Chat message ─────────────────────────────────────
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

    socket.on('reaction',({msgId,emoji})=>{ const u=Users.get(socket.id); if(!u) return; const rx=Rooms.react(u.room,msgId,emoji,u.name); io.to(u.room).emit('reaction',{msgId,reactions:rx}) })
    socket.on('activity',name=>{ const r=Users.get(socket.id)?.room; if(r) socket.broadcast.to(r).emit('activity',{name,sid:socket.id}) })
    socket.on('stopActivity',()=>{ const r=Users.get(socket.id)?.room; if(r) socket.broadcast.to(r).emit('stopActivity',{sid:socket.id}) })
    socket.on('updateStatus',status=>{ const u=Users.get(socket.id); if(!u) return; u.status=status; io.to(u.room).emit('userList',{users:richUsers(u.room)}) })

    // ── Admin Commands ───────────────────────────────────
    socket.on('adminCmd',({cmd,target,data})=>{
        const user=Users.get(socket.id); if(!user) return
        if(!Admin.isAdmin(user.room,socket.id)&&!Owner.isOwner(socket.data?.voidId)) return socket.emit('adminError',{message:'Permission denied.'})
        const room=user.room
        const sys=msg=>io.to(room).emit('message',buildMsg(SYS,msg,null,'system'))
        const err=msg=>socket.emit('adminError',{message:msg})
        Audit.add(room,cmd,user.name,target||data||'')

        switch(cmd){
            case 'kick': case 'ban':{
                const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`)
                if(t.id===socket.id) return err('Cannot target yourself.')
                if(cmd==='ban'&&t.voidId) Admin.ban(room,t.voidId)
                io.to(t.id).emit('kicked',{reason:cmd==='ban'?'You have been banned.':'Kicked by admin.'})
                const ts=io.sockets.sockets.get(t.id); if(ts) ts.leave(room); Users.remove(t.id)
                sys(`${t.name} was ${cmd==='ban'?'banned':'kicked'} by ${user.name}.`)
                io.to(room).emit('userList',{users:richUsers(room)}); io.emit('roomList',roomListPayload()); break
            }
            case 'mute':{ const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`); const nm=Admin.toggleMute(room,t.id); io.to(t.id).emit('muteStatus',{muted:nm}); sys(`${t.name} was ${nm?'muted':'unmuted'} by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break }
            case 'tempmute':{ const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`); const mins=parseInt(data)||5; Admin.tempMute(room,t.id,mins,io); sys(`${t.name} temp-muted for ${mins}min by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break }
            case 'warn':{
                const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`)
                const count=Admin.warn(room,t.id)
                io.to(t.id).emit('warned',{room,count,by:user.name})
                sys(`⚠ ${t.name} warned by ${user.name} (${count}/3).`)
                if(count>=3){ io.to(t.id).emit('kicked',{reason:'Auto-kicked: 3 warnings reached.'}); const ts=io.sockets.sockets.get(t.id); if(ts) ts.leave(room); Users.remove(t.id); io.to(room).emit('userList',{users:richUsers(room)}); io.emit('roomList',roomListPayload()); sys(`${t.name} auto-kicked after 3 warnings.`) }
                else io.to(room).emit('userList',{users:richUsers(room)})
                break
            }
            case 'clearwarns':{ const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`); Admin.clearWarns(room,t.id); sys(`${t.name}'s warnings cleared by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break }
            case 'promote':{ const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`); Admin.makeAdmin(room,t.id); io.to(t.id).emit('adminStatus',{isAdmin:true}); sys(`${t.name} promoted to admin by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break }
            case 'demote':{ const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`); Admin.remAdmin(room,t.id); io.to(t.id).emit('adminStatus',{isAdmin:false}); sys(`${t.name} demoted by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break }
            case 'clear': Rooms.clearMsgs(room); io.to(room).emit('chatCleared'); sys(`Chat cleared by ${user.name}.`); break
            case 'lock':   Admin.lock(room);   io.to(room).emit('roomLocked',{locked:true});  sys(`#${room} locked by ${user.name}.`);   break
            case 'unlock': Admin.unlock(room); io.to(room).emit('roomLocked',{locked:false}); sys(`#${room} unlocked by ${user.name}.`); break
            case 'pin':    { const m=buildMsg('📌 Pinned',data,null,'pinned'); Admin.pin(room,m); io.to(room).emit('pinnedMsg',m); sys(`${user.name} pinned a message.`); break }
            case 'unpin':  Admin.unpin(room); io.to(room).emit('pinnedMsg',null); sys(`${user.name} unpinned the message.`); break
            case 'broadcast':{ io.to(room).emit('message',buildMsg(`📢 ${user.name}`,data,null,'broadcast')); break }
            case 'slowmode':{ const s=Math.max(0,parseInt(data)||0); io.to(room).emit('slowMode',{seconds:s}); sys(s?`Slow mode: ${s}s by ${user.name}.`:`Slow mode disabled by ${user.name}.`); break }
            case 'deleteMsg':{ const msgId=data; Rooms.delMsg(room,msgId); io.to(room).emit('msgDeleted',{msgId}); break }
            case 'settopic':{ const r=Rooms.ensure(room); r.topic=data||''; io.to(room).emit('roomTopic',{topic:r.topic}); sys(`Topic set by ${user.name}: ${r.topic||'(cleared)'}`); break }
            case 'setwelcome':{ const r=Rooms.ensure(room); r.welcome=data||''; socket.emit('adminSuccess',{message:'Welcome message updated.'}); break }
            case 'addfilter':{ Admin.addFilter(room,(data||'').trim()); sys(`Word filter updated by ${user.name}.`); break }
            case 'remfilter':{ Admin.remFilter(room,(data||'').trim()); sys(`Word filter updated by ${user.name}.`); break }
            case 'auditlog':{ socket.emit('auditLog',{logs:Audit.get(room)}); break }
            case 'setNsfw':{
                const v = data === true || data === 'true'
                Admin.setNsfw(room, v)
                io.to(room).emit('nsfwStatus',{room,isNsfw:v})
                io.emit('roomList',roomListPayload())
                sys(`#${room} ${v?'marked as NSFW 🔞':'cleared NSFW flag'} by ${user.name}.`)
                break
            }
            case 'hwban':{
                const t=Users.byName(room,target)||Users.inRoom(room).find(u=>u.voidId===target)
                if(!t) return err(`"${target}" not found.`)
                if(t.id===socket.id) return err('Cannot target yourself.')
                const ts=io.sockets.sockets.get(t.id)
                const fp=ts?.data?.fp
                if(fp) hwBans.set(fp,{fp,voidId:t.voidId,name:t.name,bannedAt:Date.now()})
                Owner.globalBan(t.voidId,t.name,'Hardware banned')
                io.to(t.id).emit('globalBanned',{message:'You are hardware banned from VOID.'})
                if(ts) ts.disconnect(true)
                Audit.add(room,'hwban',user.name,t.name)
                sys(`${t.name} was hardware banned by ${user.name}.`)
                break
            }
        }
    })

    // ── Owner Commands ───────────────────────────────────
    socket.on('claimOwner',({key})=>{
        if(key!==OWNER_KEY) return socket.emit('ownerError',{message:'Invalid owner key.'})
        const vid=socket.data?.voidId; if(!vid) return
        Owner.add(vid); socket.emit('ownerStatus',{isOwner:true})
        socket.emit('message',buildMsg(SYS,'⭐ You are now Server Owner.',null,'system'))
    })

    socket.on('ownerCmd',({cmd,...args})=>{
        const vid=socket.data?.voidId
        if(!Owner.isOwner(vid)) return socket.emit('ownerError',{message:'Owner access required.'})
        switch(cmd){
            case 'setMOTD': Owner.motd=args.text||''; io.emit('motd',{text:Owner.motd}); addGlobalAudit('setMOTD',vid,'','info'); break
            case 'announce':{
                const target=args.target||'all', pinned=!!args.pinned, text=args.text||''
                const msg=buildMsg('📢 SERVER',text,null,'broadcast')
                if(target==='all') io.emit('message',msg)
                else { const r=target; io.to(r).emit('message',msg) }
                if(pinned){ io.emit('systemBroadcast',{msg:{id:msg.id,text,type:'system',pinned:true,ts:Date.now()}}) }
                addGlobalAudit('announce',vid,text.slice(0,60),'info'); break
            }
            case 'scheduleAnnounce':{
                if(args.text&&args.sendAt){ announceQueue.push({text:args.text,sendAt:args.sendAt,pinned:!!args.pinned}); socket.emit('ownerSuccess',{message:'Announcement scheduled.'}) } break
            }
            case 'cancelScheduled':{ announceQueue.splice(0); socket.emit('ownerSuccess',{message:'Announce queue cleared.'}); break }
            case 'globalBan':{
                const banName=VoidSockets.name(args.targetVoid)||'—'
                Owner.globalBan(args.targetVoid, banName, args.reason||'')
                const sid=VoidSockets.sid(args.targetVoid)
                if(sid){ io.to(sid).emit('globalBanned',{message:'You have been globally banned.'}); const s=io.sockets.sockets.get(sid); if(s) s.disconnect(true) }
                addGlobalAudit('globalBan',vid,args.targetVoid,'danger')
                socket.emit('ownerSuccess',{message:`Globally banned: ${args.targetVoid}`})
                socket.emit('banList',{bans:Owner.getBanList()}); break
            }
            case 'globalUnban':
                Owner.globalUnban(args.targetVoid)
                addGlobalAudit('globalUnban',vid,args.targetVoid,'info')
                socket.emit('ownerSuccess',{message:`Unbanned: ${args.targetVoid}`})
                socket.emit('banList',{bans:Owner.getBanList()}); break
            case 'getBans': socket.emit('banList',{bans:Owner.getBanList()}); break
            case 'getFilters': socket.emit('filterList',{words:[...globalFilters]}); break
            case 'addFilter':{
                const w=(args.word||'').toLowerCase().trim()
                if(w){ globalFilters.add(w); addGlobalAudit('addFilter',vid,w,'info') }
                socket.emit('filterList',{words:[...globalFilters]}); break
            }
            case 'removeFilter':{
                globalFilters.delete((args.word||'').toLowerCase())
                socket.emit('filterList',{words:[...globalFilters]}); break
            }
            case 'setMaintenance':
                maintenanceMode=!!args.enabled
                socket.emit('ownerSuccess',{message:`Maintenance mode ${maintenanceMode?'ON':'OFF'}`})
                addGlobalAudit(maintenanceMode?'maintenanceOn':'maintenanceOff',vid,'','warn'); break
            case 'getConfig': socket.emit('serverConfig',{config:{...serverConfig}}); break
            case 'setConfig':
                if(args.config&&typeof args.config==='object'){
                    const allowed=['serverName','maxUsers','welcomeMsg','defaultChannel','allowGuestNames','registrationOpen']
                    allowed.forEach(k=>{ if(k in args.config) serverConfig[k]=args.config[k] })
                }
                socket.emit('ownerSuccess',{message:'Settings saved.'})
                addGlobalAudit('configUpdate',vid,'','info'); break
            case 'deleteRoom':{
                const room=args.room; Users.inRoom(room).forEach(u=>{ io.to(u.id).emit('kicked',{reason:'Channel deleted by Server Owner.'}); Users.remove(u.id) })
                Rooms.map.delete(room); io.emit('roomList',roomListPayload())
                addGlobalAudit('deleteRoom',vid,room,'warn'); break
            }
            case 'promoteOwner':{
                Owner.add(args.targetVoid); const sid=VoidSockets.sid(args.targetVoid)
                if(sid){ io.to(sid).emit('ownerStatus',{isOwner:true}); io.to(sid).emit('message',buildMsg(SYS,'⭐ You were promoted to Server Owner.',null,'system')) }
                addGlobalAudit('promoteOwner',vid,args.targetVoid,'warn')
                socket.emit('ownerSuccess',{message:`Promoted ${args.targetVoid} to Owner.`}); break
            }
            case 'revokeOwner': Owner.remove(args.targetVoid); addGlobalAudit('revokeOwner',vid,args.targetVoid,'warn'); socket.emit('ownerSuccess',{message:`Revoked owner from ${args.targetVoid}.`}); break
            case 'transferOwnership':{
                const target=(args.targetVoid||'').toUpperCase(); if(!target) break
                Owner.add(target); Owner.remove(vid)
                const tSid=VoidSockets.sid(target)
                if(tSid){ io.to(tSid).emit('ownerStatus',{isOwner:true}); io.to(tSid).emit('message',buildMsg(SYS,'⭐ You are now Server Owner.',null,'system')) }
                socket.emit('ownerStatus',{isOwner:false})
                addGlobalAudit('transferOwnership',vid,target,'danger')
                socket.emit('ownerSuccess',{message:`Ownership transferred to ${target}`}); break
            }
            case 'getAuditLog': socket.emit('ownerAuditLog',{entries:globalAuditLog.slice(0,200)}); break
            case 'stats': case 'getStats':{
                socket.emit('serverStats',{
                    users: io.sockets.size,
                    rooms: Users.rooms().map(r=>({name:r,count:Users.inRoom(r).length})),
                    groups: Groups.map.size,
                    owners: [...Owner.owners],
                    globalBans: Owner.getBanList().length,
                    motd: Owner.motd,
                    allUsers: Users.list.map(u=>({name:u.name,room:u.room,voidId:u.voidId||'—',status:u.status})),
                    statHistory, maintenanceMode
                }); break
            }
        }
    })

    // ── Friends ──────────────────────────────────────────
    socket.on('sendFriendRequest',({toVoidId})=>{
        const vid=socket.data?.voidId; const name=socket.data?.name; if(!vid||!name) return
        if(vid===toVoidId) return socket.emit('friendError',{message:"Can't add yourself."})
        if(Friends.areFriends(vid,toVoidId)) return socket.emit('friendError',{message:'Already friends.'})
        if(Friends.isBlocked(toVoidId,vid)) return socket.emit('friendError',{message:'Cannot send request.'})
        Friends.sendReq(vid,name,toVoidId)
        const toSid=VoidSockets.sid(toVoidId)
        if(toSid) io.to(toSid).emit('friendRequest',{fromVoid:vid,fromName:name})
        socket.emit('friendSuccess',{message:`Friend request sent to ${toVoidId}`})
    })

    socket.on('acceptFriendRequest',({fromVoid})=>{
        const vid=socket.data?.voidId; const name=socket.data?.name; if(!vid||!name) return
        if(!Friends.acceptReq(fromVoid,vid,name)) return socket.emit('friendError',{message:'Request not found.'})
        const friends=Friends.getFriends(vid).map(f=>({...f,online:VoidSockets.online(f.voidId)}))
        socket.emit('friendList',{friends})
        const fromSid=VoidSockets.sid(fromVoid)
        if(fromSid){
            const theirFriends=Friends.getFriends(fromVoid).map(f=>({...f,online:VoidSockets.online(f.voidId)}))
            io.to(fromSid).emit('friendList',{friends:theirFriends})
            io.to(fromSid).emit('friendAccepted',{voidId:vid,name})
        }
    })

    socket.on('declineFriendRequest',({fromVoid})=>{ const vid=socket.data?.voidId; if(!vid) return; Friends.declineReq(fromVoid,vid) })

    socket.on('removeFriend',({targetVoid})=>{
        const vid=socket.data?.voidId; if(!vid) return
        Friends.removeFriend(vid,targetVoid)
        socket.emit('friendList',{friends:Friends.getFriends(vid).map(f=>({...f,online:VoidSockets.online(f.voidId)}))})
        const ts=VoidSockets.sid(targetVoid); if(ts) io.to(ts).emit('friendList',{friends:Friends.getFriends(targetVoid).map(f=>({...f,online:VoidSockets.online(f.voidId)}))})
    })

    socket.on('blockUser',({targetVoid})=>{ const vid=socket.data?.voidId; if(!vid) return; Friends.block(vid,targetVoid); socket.emit('friendList',{friends:Friends.getFriends(vid).map(f=>({...f,online:VoidSockets.online(f.voidId)}))}) })

    // ── DMs ──────────────────────────────────────────────
    socket.on('openDm',({withVoidId})=>{
        const vid=socket.data?.voidId; if(!vid) return
        if(!Friends.areFriends(vid,withVoidId)) return socket.emit('dmError',{message:'You must be friends first.'})
        socket.emit('dmHistory',{withVoidId,messages:DMs.history(vid,withVoidId)})
    })

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

    // ── VoidFlash opened (delete from history for both sides) ──
    socket.on('voidFlashOpened',({msgId,isDm,withVoidId})=>{
        if(isDm){
            const vid=socket.data?.voidId; if(!vid||!withVoidId) return
            DMs.delMsg(vid,withVoidId,msgId)
            const toSid=VoidSockets.sid(withVoidId||'')
            if(toSid) io.to(toSid).emit('deleteMsg',{msgId})
        } else {
            const u=Users.get(socket.id); if(!u) return
            Rooms.delMsg(u.room,msgId)
            io.to(u.room).emit('deleteMsg',{msgId})
        }
    })

    // ── VoidFlash screenshot alert ────────────────────────────
    socket.on('vfScreenshot',({msgId,isDm,senderVoidId})=>{
        if(!socket.data?.voidId) return
        const screenshotterName = socket.data?.name || Users.get(socket.id)?.name || 'Someone'
        const senderSid=VoidSockets.sid(senderVoidId||'')
        if(senderSid) io.to(senderSid).emit('vfScreenshotAlert',{byName:screenshotterName,msgId})
    })

    // ── Groups ───────────────────────────────────────────
    socket.on('createGroup',({name,desc,password,isPrivate})=>{
        const vid=socket.data?.voidId; const uname=socket.data?.name; if(!vid||!uname||!name?.trim()) return
        const g=Groups.create(name,desc||'',vid,uname,password,!!isPrivate)
        socket.join(Groups.roomId(g))
        socket.emit('groupCreated',{group:Groups.pub(g)})
        socket.emit('groupList',{groups:Groups.forMember(vid).map(g=>Groups.pub(g))})
    })

    socket.on('joinGroup',({groupId,password})=>{
        const vid=socket.data?.voidId; const uname=socket.data?.name; const g=Groups.get(groupId); if(!g||!vid||!uname) return socket.emit('groupError',{message:'Group not found.'})
        if(g.isPrivate&&!g.invites.has(vid)&&!g.members.has(vid)) return socket.emit('groupError',{message:'This group is invite-only.'})
        if(g.password&&sha(password||'')!==g.password) return socket.emit('groupError',{message:'Wrong password.'})
        if(!g.members.has(vid)) g.members.set(vid,{name:uname,role:'member',joinedAt:Date.now()})
        g.invites.delete(vid)
        socket.join(Groups.roomId(g))
        socket.emit('groupJoined',{group:Groups.pub(g),history:g.messages,members:Groups.memberList(g)})
        socket.emit('groupList',{groups:Groups.forMember(vid).map(g=>Groups.pub(g))})
        io.to(Groups.roomId(g)).emit('groupMsg',buildMsg(SYS,`${uname} joined the group.`,null,'system'))
        io.to(Groups.roomId(g)).emit('groupMemberList',{groupId:g.id,members:Groups.memberList(g)})
    })

    socket.on('inviteToGroup',({groupId,toVoidId})=>{
        const vid=socket.data?.voidId; const g=Groups.get(groupId); if(!g||!vid) return
        const role=g.members.get(vid)?.role; if(role!=='owner'&&role!=='admin') return socket.emit('groupError',{message:'No permission.'})
        if(g.members.has(toVoidId)) return socket.emit('groupError',{message:'User is already a member.'})
        g.invites.add(toVoidId)
        const toSid=VoidSockets.sid(toVoidId)
        if(toSid) io.to(toSid).emit('groupInvite',{groupId:g.id,groupName:g.name,invitedBy:socket.data.name,color:g.color})
        socket.emit('groupSuccess',{message:`Invite sent to ${VoidSockets.name(toVoidId)}.`})
    })

    socket.on('declineGroupInvite',({groupId})=>{ const vid=socket.data?.voidId; const g=Groups.get(groupId); if(g) g.invites.delete(vid) })

    socket.on('leaveGroup',({groupId})=>{
        const vid=socket.data?.voidId; const uname=socket.data?.name; const g=Groups.get(groupId); if(!g||!vid) return
        g.members.delete(vid); socket.leave(Groups.roomId(g))
        io.to(Groups.roomId(g)).emit('groupMsg',buildMsg(SYS,`${uname} left the group.`,null,'system'))
        io.to(Groups.roomId(g)).emit('groupMemberList',{groupId:g.id,members:Groups.memberList(g)})
        socket.emit('groupLeft',{groupId}); socket.emit('groupList',{groups:Groups.forMember(vid).map(g=>Groups.pub(g))})
        if(g.ownerVid===vid&&g.members.size>0){
            const [nextVid,nextData]=[...g.members.entries()][0]; nextData.role='owner'; g.ownerVid=nextVid
            const ns=VoidSockets.sid(nextVid); if(ns) io.to(ns).emit('groupOwnerStatus',{groupId,isOwner:true})
            io.to(Groups.roomId(g)).emit('groupMsg',buildMsg(SYS,`${nextData.name} is now the group owner.`,null,'system'))
        }
        if(g.members.size===0) Groups.map.delete(groupId)
    })

    socket.on('groupMsg',({groupId,text,replyTo})=>{
        const vid=socket.data?.voidId; const uname=socket.data?.name; const g=Groups.get(groupId); if(!g||!vid) return
        if(!g.members.has(vid)) return
        const msg=buildMsg(uname,text,replyTo,'user'); g.messages.push(msg); if(g.messages.length>MAX_HIST) g.messages.shift()
        io.to(Groups.roomId(g)).emit('groupMsg',{groupId:g.id,msg}); socket.emit('groupDelivered',{msgId:msg.id,groupId})
    })

    socket.on('groupHistory',({groupId})=>{
        const vid=socket.data?.voidId; const g=Groups.get(groupId); if(!g||!vid) return
        if(!g.members.has(vid)) return
        socket.emit('groupHistoryData',{groupId,history:g.messages})
    })

    socket.on('groupReaction',({groupId,msgId,emoji})=>{ const vid=socket.data?.voidId; const uname=socket.data?.name; const g=Groups.get(groupId); if(!g||!g.members.has(vid)) return; const rx=Groups.react(groupId,msgId,emoji,uname); io.to(Groups.roomId(g)).emit('groupReaction',{groupId,msgId,reactions:rx}) })

    socket.on('groupAdminCmd',({groupId,cmd,target,data})=>{
        const vid=socket.data?.voidId; const g=Groups.get(groupId); if(!g||!vid) return
        const role=g.members.get(vid)?.role; if(role!=='owner'&&role!=='admin') return socket.emit('groupError',{message:'No permission.'})
        switch(cmd){
            case 'kick':{
                const entry=[...g.members.entries()].find(([,m])=>m.name.toLowerCase()===target.toLowerCase()); if(!entry) return
                const [tvid,tm]=entry; if(tvid===g.ownerVid) return
                g.members.delete(tvid); const ts=VoidSockets.sid(tvid); if(ts){ const s=io.sockets.sockets.get(ts); if(s) s.leave(Groups.roomId(g)); io.to(ts).emit('groupKicked',{groupId,groupName:g.name}) }
                io.to(Groups.roomId(g)).emit('groupMsg',buildMsg(SYS,`${tm.name} was kicked.`,null,'system'))
                io.to(Groups.roomId(g)).emit('groupMemberList',{groupId,members:Groups.memberList(g)}); break
            }
            case 'promote':{ if(role!=='owner') return; const entry=[...g.members.entries()].find(([,m])=>m.name.toLowerCase()===target.toLowerCase()); if(!entry) return; const [tvid,tm]=entry; tm.role='admin'; const ts=VoidSockets.sid(tvid); if(ts) io.to(ts).emit('groupAdminStatus',{groupId,isAdmin:true}); io.to(Groups.roomId(g)).emit('groupMsg',buildMsg(SYS,`${tm.name} promoted to group admin.`,null,'system')); io.to(Groups.roomId(g)).emit('groupMemberList',{groupId,members:Groups.memberList(g)}); break }
            case 'demote':{  if(role!=='owner') return; const entry=[...g.members.entries()].find(([,m])=>m.name.toLowerCase()===target.toLowerCase()); if(!entry) return; const [tvid,tm]=entry; tm.role='member'; io.to(Groups.roomId(g)).emit('groupMsg',buildMsg(SYS,`${tm.name} demoted to member.`,null,'system')); io.to(Groups.roomId(g)).emit('groupMemberList',{groupId,members:Groups.memberList(g)}); break }
            case 'transfer':{ if(role!=='owner') return; const entry=[...g.members.entries()].find(([,m])=>m.name.toLowerCase()===target.toLowerCase()); if(!entry) return; const [tvid,tm]=entry; g.members.get(vid).role='admin'; tm.role='owner'; g.ownerVid=tvid; const ts=VoidSockets.sid(tvid); if(ts) io.to(ts).emit('groupOwnerStatus',{groupId,isOwner:true}); io.to(Groups.roomId(g)).emit('groupMsg',buildMsg(SYS,`Ownership transferred to ${tm.name}.`,null,'system')); io.to(Groups.roomId(g)).emit('groupMemberList',{groupId,members:Groups.memberList(g)}); break }
            case 'setTopic':{ g.topic=data||''; io.to(Groups.roomId(g)).emit('groupTopic',{groupId,topic:g.topic}); io.to(Groups.roomId(g)).emit('groupMsg',buildMsg(SYS,`Topic: ${g.topic||'(cleared)'}`,null,'system')); break }
            case 'delete':{ if(role!=='owner') return; io.to(Groups.roomId(g)).emit('groupDeleted',{groupId,groupName:g.name}); Groups.map.delete(groupId); break }
        }
    })

    // ── WebRTC Signaling ──────────────────────────────────
    socket.on('callOffer', ({to,offer,callType})=>{ const c=Users.get(socket.id); if(!c) return; io.to(to).emit('callOffer',{from:socket.id,fromName:c.name,offer,callType}) })
    socket.on('callAnswer', ({to,answer})=>   io.to(to).emit('callAnswer', {from:socket.id,answer}))
    socket.on('callIce',    ({to,candidate})=> io.to(to).emit('callIce',   {from:socket.id,candidate}))
    socket.on('callReject', ({to})=>           io.to(to).emit('callReject',{from:socket.id}))
    socket.on('callEnd',    ({to})=>           io.to(to).emit('callEnd',   {from:socket.id}))
    socket.on('callBusy',   ({to})=>           io.to(to).emit('callBusy',  {from:socket.id}))

    // ── Servers ───────────────────────────────────────────
    socket.on('createServer',({name,desc,password})=>{
        const vid=socket.data?.voidId; const uname=socket.data?.name; if(!vid||!uname||!name?.trim()) return
        const s=Servers.create(name,desc||'',vid,uname,password)
        socket.join(`srv:${s.id}`)
        socket.emit('serverCreated',{server:Servers.pubFull(s)})
        socket.emit('serverList',{servers:Servers.forMember(vid).map(s=>Servers.pubFull(s))})
    })
    socket.on('joinServer',({serverId,password})=>{
        const vid=socket.data?.voidId; const uname=socket.data?.name; const s=Servers.get(serverId)
        if(!s||!vid||!uname) return socket.emit('serverError',{message:'Server not found.'})
        if(s.password&&sha(password||'')!==s.password) return socket.emit('serverError',{message:'Wrong password.'})
        if(!s.members.has(vid)) s.members.set(vid,{name:uname,role:'member'})
        socket.join(`srv:${s.id}`)
        socket.emit('serverJoined',{server:Servers.pubFull(s)})
        socket.emit('serverList',{servers:Servers.forMember(vid).map(s=>Servers.pubFull(s))})
    })
    socket.on('leaveServer',({serverId})=>{
        const vid=socket.data?.voidId; const s=Servers.get(serverId); if(!s||!vid) return
        s.members.delete(vid); socket.leave(`srv:${s.id}`)
        socket.emit('serverLeft',{serverId})
        socket.emit('serverList',{servers:Servers.forMember(vid).map(s=>Servers.pubFull(s))})
        if(s.members.size===0) Servers.map.delete(serverId)
    })
    socket.on('createServerGroup',({serverId,name})=>{
        const vid=socket.data?.voidId; const s=Servers.get(serverId); if(!s||!vid||!name?.trim()) return
        const role=s.members.get(vid)?.role
        if(role!=='owner'&&role!=='admin') return socket.emit('serverError',{message:'No permission.'})
        const g={id:gid(),name,rooms:new Map()}
        s.groups.set(g.id,g)
        io.to(`srv:${s.id}`).emit('serverUpdated',{server:Servers.pubFull(s)})
    })
    socket.on('createServerRoom',({serverId,groupId,name})=>{
        const vid=socket.data?.voidId; const s=Servers.get(serverId); if(!s||!vid||!name?.trim()) return
        const role=s.members.get(vid)?.role
        if(role!=='owner'&&role!=='admin') return socket.emit('serverError',{message:'No permission.'})
        const g=s.groups.get(groupId); if(!g) return
        const r={id:gid(),name,messages:[]}
        g.rooms.set(r.id,r)
        io.to(`srv:${s.id}`).emit('serverUpdated',{server:Servers.pubFull(s)})
    })
    socket.on('enterServerRoom',({serverId,roomId})=>{
        const vid=socket.data?.voidId; const s=Servers.get(serverId); if(!s||!vid) return
        if(!s.members.has(vid)) return socket.emit('serverError',{message:'Not a member.'})
        let room=null; s.groups.forEach(g=>{ if(g.rooms.has(roomId)) room=g.rooms.get(roomId) })
        if(!room) return socket.emit('serverError',{message:'Room not found.'})
        socket.join(Servers.roomKey(serverId,roomId))
        socket.emit('serverRoomJoined',{serverId,roomId,history:room.messages.slice(-MAX_HIST)})
    })
    socket.on('serverMsg',({serverId,roomId,text,replyTo})=>{
        const vid=socket.data?.voidId; const uname=socket.data?.name; const s=Servers.get(serverId)
        if(!s||!vid||!uname||!s.members.has(vid)) return
        let room=null; s.groups.forEach(g=>{ if(g.rooms.has(roomId)) room=g.rooms.get(roomId) })
        if(!room) return
        const msg=buildMsg(uname,text,replyTo,'user')
        room.messages.push(msg); if(room.messages.length>MAX_HIST) room.messages.shift()
        io.to(Servers.roomKey(serverId,roomId)).emit('serverMsg',{serverId,roomId,msg})
        socket.emit('serverDelivered',{msgId:msg.id,serverId,roomId})
    })

    // ── E2E Key relay ────────────────────────────────────────
    socket.on('publishKey', ({ publicKey }) => {
        const vid = socket.data?.voidId; if (!vid || !publicKey) return
        publicKeys.set(vid, publicKey)
    })

    socket.on('getPublicKey', ({ voidId }) => {
        socket.emit('publicKey', { voidId, publicKey: publicKeys.get(voidId) || null })
    })

    // ── VOID Feed ─────────────────────────────────────
    socket.on('postVoid', ({ text, attach, expiresInMs }) => {
        const vid = socket.data?.voidId
        if (!vid || (!text?.trim() && !attach)) return
        if (attach) {
            const sz = (attach.dataUrl?.length || 0) * 0.75
            if (sz > 5_242_880) { socket.emit('err', { msg: 'Image too large — max 5 MB' }); return }
            if (!attach.mimeType?.startsWith('image/')) { socket.emit('err', { msg: 'Only images allowed in VOIDs' }); return }
        }
        const maxMs = 86_400_000 // 24h hard cap
        const entry = {
            voidId:     mkVoidId(),
            fromVoidId: vid,
            name:       socket.data?.name || VoidSockets.name(vid),
            text:       (text || '').trim().slice(0, 280),
            attach:     attach || null,
            type:       'manual',
            expiresAt:  Date.now() + Math.max(0, Math.min(Number(expiresInMs) || 3_600_000, maxMs))
        }
        voids.set(entry.voidId, entry)
        io.emit('voidPosted', entry)
    })

    socket.on('postFeedFlash', ({ text, attach, vfExpiry, vfThumb }) => {
        const vid = socket.data?.voidId
        if (!vid || (!text?.trim() && !attach)) return
        if (attach) {
            const sz = (attach.dataUrl?.length || 0) * 0.75
            if (sz > 5_242_880) { socket.emit('err', { msg: 'Image too large — max 5 MB' }); return }
        }
        const flashId = mkVoidId()
        const entry = {
            flashId,
            fromVoidId: vid,
            name:       socket.data?.name || '',
            text:       (text || '').trim().slice(0, 280),
            attach:     attach || null,
            vfExpiry:   Math.min(Number(vfExpiry) || 0, 30_000),
            vfThumb:    vfThumb || null,
            postedAt:   Date.now()
        }
        feedFlashes.set(flashId, entry)
        io.emit('feedFlashPosted', entry)
        // Auto-expire after 24h
        setTimeout(() => {
            if (feedFlashes.delete(flashId)) io.emit('feedFlashExpired', { flashId })
        }, 86_400_000)
    })

    socket.on('feedFlashOpened', ({ flashId }) => {
        const flash = feedFlashes.get(flashId)
        if (!flash) return
        if (flash.vfExpiry === 0) {
            feedFlashes.delete(flashId)
            io.emit('feedFlashExpired', { flashId })
        }
    })

    socket.on('deleteVoid', ({ voidId }) => {
        const vid = socket.data?.voidId; if (!vid) return
        const v = voids.get(voidId)
        if (!v || v.fromVoidId !== vid) return
        voids.delete(voidId)
        io.emit('voidExpired', { voidId })
    })

    socket.on('deleteFeedFlash', ({ flashId }) => {
        const vid = socket.data?.voidId; if (!vid) return
        const f = feedFlashes.get(flashId)
        if (!f || f.fromVoidId !== vid) return
        feedFlashes.delete(flashId)
        io.emit('feedFlashExpired', { flashId })
    })

    socket.on('getFeed', () => {
        const now = Date.now()
        const activeVoids   = [...voids.values()].filter(v => v.expiresAt > now)
        const activeFlashes = [...feedFlashes.values()]

        // Server spotlight cards from active rooms
        const spotlights = []
        for (const room of Users.rooms()) {
            const members = Users.inRoom(room)
            if (members.length < 1) continue
            const hist = Rooms.history(room)
            const last = hist[hist.length - 1]
            spotlights.push({
                type:        'server',
                room,
                memberCount: members.length,
                lastMsg:     last ? (last.text || '').slice(0, 60) : ''
            })
        }

        socket.emit('feedData', { voids: activeVoids, cards: spotlights, flashes: activeFlashes })
    })

    socket.on('roomKeyPacket', ({ serverId, roomId, toVoidId, wrappedKey }) => {
        const vid = socket.data?.voidId
        const s = Servers.get(serverId); if (!s || !s.members.has(vid)) return
        const k = Servers.roomKey(serverId, roomId)
        if (!roomKeyPkts.has(k)) roomKeyPkts.set(k, new Map())
        roomKeyPkts.get(k).set(toVoidId, wrappedKey)
        const toSid = VoidSockets.sid(toVoidId)
        if (toSid) io.to(toSid).emit('roomKeyPacket', { serverId, roomId, wrappedKey })
    })

    socket.on('getRoomKey', ({ serverId, roomId }) => {
        const vid = socket.data?.voidId; if (!vid) return
        const k   = Servers.roomKey(serverId, roomId)
        const wrapped = roomKeyPkts.get(k)?.get(vid)
        if (wrapped) socket.emit('roomKeyPacket', { serverId, roomId, wrappedKey: wrapped })
    })

})

// ── Rolling stats (every 60s) ─────────────────────────
setInterval(()=>{
    statHistory.push({ts:Date.now(),users:io.sockets.size,msgs:statMsgCount})
    statMsgCount=0
    if(statHistory.length>60) statHistory.shift()
}, 60_000)

// ── Scheduled announce queue (every 10s) ──────────────
setInterval(()=>{
    const now=Date.now()
    for(let i=announceQueue.length-1;i>=0;i--){
        const a=announceQueue[i]
        if(a.sendAt<=now){
            io.emit('message',buildMsg('📢 SERVER',a.text,null,'broadcast'))
            if(a.pinned) io.emit('systemBroadcast',{msg:{text:a.text,type:'system',pinned:true,ts:now}})
            announceQueue.splice(i,1)
        }
    }
}, 10_000)
