import express from 'express'
import { Server } from "socket.io"
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3500
const ADMIN = "Admin"

const app = express()

app.use(express.static(path.join(__dirname, "public")))

const expressServer = app.listen(PORT, () => {
    console.log(`listening on port ${PORT}`)
})

// state 
const UsersState = {
    users: [],
    setUsers: function (newUsersArray) {
        this.users = newUsersArray
    }
}

<<<<<<< Updated upstream
const io = new Server(expressServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5500", "http://127.0.0.1:5500"]
    }
=======
// ═══════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════
// MOD_CMDS — the only adminCmd actions a Mod is allowed to run
const MOD_CMDS = new Set(['warn','clearwarns','tempmute','kick','deleteMsg'])

const Admin = {
    admins: new Map(), mods: new Map(),  // room → Set<sid>
    muted:  new Map(), banned: new Map(),
    locked: new Set(), pinned: new Map(), tempMutes: new Map(),
    wordFilter: new Map(), // room → Set<word>
    warnings: new Map(),   // room → Map<sid → count>

    isAdmin(room,sid)   { return !!this.admins.get(room)?.has(sid) },
    makeAdmin(room,sid) {
        if(!this.admins.has(room)) this.admins.set(room,new Set())
        this.admins.get(room).add(sid)
        this.remMod(room,sid) // admin > mod — can't hold both
    },
    remAdmin(room,sid)  { this.admins.get(room)?.delete(sid) },

    isMod(room,sid)   { return !!this.mods.get(room)?.has(sid) },
    makeMod(room,sid) {
        if(!this.mods.has(room)) this.mods.set(room,new Set())
        this.mods.get(room).add(sid)
        this.remAdmin(room,sid) // mod < admin — strip admin if present
    },
    remMod(room,sid)  { this.mods.get(room)?.delete(sid) },

    // convenience: is this sid any kind of staff?
    isStaff(room,sid) { return this.isAdmin(room,sid) || this.isMod(room,sid) },

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
const Owner = {
    owners:    new Set(),
    globalBans:new Set(),
    motd: 'Welcome to VOID — private secure messaging by BlackCrownTech.',
    isOwner(vid){ return this.owners.has(vid) },
    add(vid)    { this.owners.add(vid) },
    remove(vid) { this.owners.delete(vid) },
    globalBan(vid)  { this.globalBans.add(vid) },
    globalUnban(vid){ this.globalBans.delete(vid) },
    isBanned(vid)   { return this.globalBans.has(vid) }
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
//  HELPERS
// ═══════════════════════════════════════════════════════
function richUsers(room){
    return Users.inRoom(room).map(u=>({
        ...u,
        isAdmin:  Admin.isAdmin(room,u.id),
        isMod:    Admin.isMod(room,u.id),
        isMuted:  Admin.isMuted(room,u.id),
        warns:    Admin.warnCount(room,u.id)
    }))
}

// ═══════════════════════════════════════════════════════
//  SOCKET.IO
// ═══════════════════════════════════════════════════════
const io = new Server(srv, {
    cors:{ origin: process.env.NODE_ENV==='production'?false:['http://localhost:5500','http://127.0.0.1:5500'] }
>>>>>>> Stashed changes
})

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

    // Upon connection - only to user 
    socket.emit('message', buildMsg(ADMIN, "Welcome to Chat App!"))

    socket.on('enterRoom', ({ name, room }) => {

        // leave previous room 
        const prevRoom = getUser(socket.id)?.room

        if (prevRoom) {
            socket.leave(prevRoom)
            io.to(prevRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`))
        }

        const user = activateUser(socket.id, name, room)

        // Cannot update previous room users list until after the state update in activate user 
        if (prevRoom) {
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }

        // join room 
        socket.join(user.room)

        // To user who joined 
        socket.emit('message', buildMsg(ADMIN, `You have joined the ${user.room} chat room`))

        // To everyone else 
        socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has joined the room`))

        // Update user list for room 
        io.to(user.room).emit('userList', {
            users: getUsersInRoom(user.room)
        })

        // Update rooms list for everyone 
        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })
    })

    // When user disconnects - to all others 
    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        userLeavesApp(socket.id)

<<<<<<< Updated upstream
        if (user) {
            io.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has left the room`))
=======
        const prev=Users.get(socket.id)?.room
        if(prev){ socket.leave(prev); io.to(prev).emit('message',buildMsg(SYS,`${name} left the channel.`,null,'system')); Admin.remAdmin(prev,socket.id); Admin.remMod(prev,socket.id); io.to(prev).emit('userList',{users:richUsers(prev)}) }
>>>>>>> Stashed changes

            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })

<<<<<<< Updated upstream
            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
=======
        const isAdmin=Admin.isAdmin(room,socket.id)
        const isMod  =Admin.isMod(room,socket.id)
        socket.emit('joinSuccess',{name,room,isAdmin,isMod})
        socket.emit('history',Rooms.history(room))
        const pin=Admin.getPin(room); if(pin) socket.emit('pinnedMsg',pin)
        const welcome=Rooms.map.get(room)?.welcome; if(welcome) socket.emit('message',buildMsg(SYS,welcome,null,'system'))
        const topic=Rooms.map.get(room)?.topic; if(topic) socket.emit('roomTopic',{topic})

        socket.emit('message',buildMsg(SYS,`You joined #${room}`,null,'system'))
        socket.broadcast.to(room).emit('message',buildMsg(SYS,`${name} joined #${room}`,null,'system'))
        io.to(room).emit('userList',{users:richUsers(room)})
        io.emit('roomList',{rooms:Users.rooms()})
        if(isAdmin) socket.emit('adminStatus',{isAdmin:true})
        if(isMod)   socket.emit('modStatus',{isMod:true})
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
            Admin.remMod(user.room,socket.id)
        if(Admin.isAdmin(user.room,socket.id)){
                Admin.remAdmin(user.room,socket.id)
                const next=Users.inRoom(user.room)[0]
                if(next){ Admin.makeAdmin(user.room,next.id); io.to(next.id).emit('adminStatus',{isAdmin:true}); io.to(user.room).emit('message',buildMsg(SYS,`${next.name} is now channel admin.`,null,'system')) }
            }
            io.to(user.room).emit('message',buildMsg(SYS,`${user.name} left #${user.room}`,null,'system'))
            io.to(user.room).emit('userList',{users:richUsers(user.room)})
            io.emit('roomList',{rooms:Users.rooms()})
>>>>>>> Stashed changes
        }

        console.log(`User ${socket.id} disconnected`)
    })

<<<<<<< Updated upstream
    // Listening for a message event 
    socket.on('message', ({ name, text }) => {
        const room = getUser(socket.id)?.room
        if (room) {
            io.to(room).emit('message', buildMsg(name, text))
=======
    // ── Chat message ─────────────────────────────────────
    socket.on('message',({name,text,replyTo})=>{
        const user=Users.get(socket.id); if(!user) return
        if(Admin.isMuted(user.room,socket.id)) return socket.emit('joinError',{type:'muted',message:'You are muted.'})
        const filtered=Admin.filterText(user.room,text)
        const msg=buildMsg(name,filtered,replyTo,'user')
        Rooms.addMsg(user.room,msg)
        io.to(user.room).emit('message',msg)
        socket.emit('delivered',{msgId:msg.id})
    })

    socket.on('reaction',({msgId,emoji})=>{ const u=Users.get(socket.id); if(!u) return; const rx=Rooms.react(u.room,msgId,emoji,u.name); io.to(u.room).emit('reaction',{msgId,reactions:rx}) })
    socket.on('activity',name=>{ const r=Users.get(socket.id)?.room; if(r) socket.broadcast.to(r).emit('activity',{name,sid:socket.id}) })
    socket.on('stopActivity',()=>{ const r=Users.get(socket.id)?.room; if(r) socket.broadcast.to(r).emit('stopActivity',{sid:socket.id}) })
    socket.on('updateStatus',status=>{ const u=Users.get(socket.id); if(!u) return; u.status=status; io.to(u.room).emit('userList',{users:richUsers(u.room)}) })

    // ── Admin Commands ───────────────────────────────────
    socket.on('adminCmd',({cmd,target,data})=>{
        const user=Users.get(socket.id); if(!user) return
        const vid=socket.data?.voidId
        const isOwner=Owner.isOwner(vid)
        const isAdmin=Admin.isAdmin(user.room,socket.id)||isOwner
        const isMod  =Admin.isMod(user.room,socket.id)
        if(!isAdmin&&!isMod) return socket.emit('adminError',{message:'Permission denied — Staff only.'})
        if(isMod&&!isAdmin&&!MOD_CMDS.has(cmd)) return socket.emit('adminError',{message:`Mods cannot use /${cmd}. Allowed: ${[...MOD_CMDS].join(', ')}`})
        const room=user.room
        const sys=msg=>io.to(room).emit('message',buildMsg(SYS,msg,null,'system'))
        const err=msg=>socket.emit('adminError',{message:msg})
        Audit.add(room,cmd,user.name,target||data||'')

        switch(cmd){
            case 'kick': case 'ban':{
                const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`)
                if(t.id===socket.id) return err('Cannot target yourself.')
                // Mods cannot ban; also cannot kick admins/owners
                if(cmd==='ban'&&isMod&&!isAdmin) return err('Mods cannot ban users.')
                if(isMod&&Admin.isAdmin(room,t.id)) return err('Mods cannot kick admins.')
                if(cmd==='ban'&&t.voidId) Admin.ban(room,t.voidId)
                io.to(t.id).emit('kicked',{reason:cmd==='ban'?'You have been banned.':'Kicked by admin.'})
                const ts=io.sockets.sockets.get(t.id); if(ts) ts.leave(room); Users.remove(t.id)
                sys(`${t.name} was ${cmd==='ban'?'banned':'kicked'} by ${user.name}.`)
                io.to(room).emit('userList',{users:richUsers(room)}); io.emit('roomList',{rooms:Users.rooms()}); break
            }
            case 'mute':{ const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`); const nm=Admin.toggleMute(room,t.id); io.to(t.id).emit('muteStatus',{muted:nm}); sys(`${t.name} was ${nm?'muted':'unmuted'} by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break }
            case 'tempmute':{ const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`); const mins=parseInt(data)||5; Admin.tempMute(room,t.id,mins,io); sys(`${t.name} temp-muted for ${mins}min by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break }
            case 'warn':{
                const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`)
                // Mods cannot warn admins
                if(isMod&&Admin.isAdmin(room,t.id)) return err('Mods cannot warn admins.')
                const count=Admin.warn(room,t.id)
                io.to(t.id).emit('warned',{room,count,by:user.name})
                sys(`⚠ ${t.name} warned by ${user.name} (${count}/3).`)
                if(count>=3){ io.to(t.id).emit('kicked',{reason:'Auto-kicked: 3 warnings reached.'}); const ts=io.sockets.sockets.get(t.id); if(ts) ts.leave(room); Users.remove(t.id); io.to(room).emit('userList',{users:richUsers(room)}); io.emit('roomList',{rooms:Users.rooms()}); sys(`${t.name} auto-kicked after 3 warnings.`) }
                else io.to(room).emit('userList',{users:richUsers(room)})
                break
            }
            case 'clearwarns':{ const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`); Admin.clearWarns(room,t.id); sys(`${t.name}'s warnings cleared by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break }
            case 'promote':{
                if(!isAdmin) return err('Only Admins/Owners can promote.')
                const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`)
                Admin.makeAdmin(room,t.id); io.to(t.id).emit('adminStatus',{isAdmin:true}); io.to(t.id).emit('modStatus',{isMod:false})
                sys(`${t.name} promoted to Admin by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break
            }
            case 'demote':{
                if(!isAdmin) return err('Only Admins/Owners can demote.')
                const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`)
                Admin.remAdmin(room,t.id); Admin.remMod(room,t.id)
                io.to(t.id).emit('adminStatus',{isAdmin:false}); io.to(t.id).emit('modStatus',{isMod:false})
                sys(`${t.name} demoted to Member by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break
            }
            case 'makemod':{
                if(!isAdmin) return err('Only Admins/Owners can assign Moderators.')
                const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`)
                if(Admin.isAdmin(room,t.id)) return err('Cannot make an Admin into a Mod. Demote first.')
                Admin.makeMod(room,t.id); io.to(t.id).emit('modStatus',{isMod:true})
                sys(`${t.name} was made Moderator by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break
            }
            case 'removemod':{
                if(!isAdmin) return err('Only Admins/Owners can remove Moderators.')
                const t=Users.byName(room,target); if(!t) return err(`"${target}" not found.`)
                Admin.remMod(room,t.id); io.to(t.id).emit('modStatus',{isMod:false})
                sys(`${t.name} removed from Moderators by ${user.name}.`); io.to(room).emit('userList',{users:richUsers(room)}); break
            }
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
>>>>>>> Stashed changes
        }
    })

    // Listen for activity 
    socket.on('activity', (name) => {
        const room = getUser(socket.id)?.room
        if (room) {
            socket.broadcast.to(room).emit('activity', name)
        }
    })
})

function buildMsg(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date())
    }
}

// User functions 
function activateUser(id, name, room) {
    const user = { id, name, room }
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id !== id),
        user
    ])
    return user
}

function userLeavesApp(id) {
    UsersState.setUsers(
        UsersState.users.filter(user => user.id !== id)
    )
}

function getUser(id) {
    return UsersState.users.find(user => user.id === id)
}

function getUsersInRoom(room) {
    return UsersState.users.filter(user => user.room === room)
}

function getAllActiveRooms() {
    return Array.from(new Set(UsersState.users.map(user => user.room)))
}