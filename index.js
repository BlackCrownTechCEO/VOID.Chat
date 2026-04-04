import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const PORT    = process.env.PORT || 3500
const SYS     = 'System'
const MAX_HIST = 100

// ── Helpers ──────────────────────────────────────────────
let _gid = 0
const gid = () => `g${++_gid}${Date.now().toString(36)}`
const sha = s  => createHash('sha256').update(s).digest('hex')
const ts  = () => new Intl.DateTimeFormat('default', {
    hour: 'numeric', minute: 'numeric', second: 'numeric'
}).format(new Date())

function buildMsg(name, text, replyTo = null, type = 'user') {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name, text, replyTo, type, time: ts()
    }
}

// ── Express ───────────────────────────────────────────────
const app = express()
app.use(express.static(path.join(__dirname, 'public')))

// ═══════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════
const Users = {
    map: new Map(),
    get(sid)           { return this.map.get(sid) },
    set(sid, data)     { this.map.set(sid, data) },
    remove(sid)        { this.map.delete(sid) },
    inRoom(room)       { return [...this.map.values()].filter(u => u.room === room) },
    rooms()            { return [...new Set([...this.map.values()].map(u => u.room))] },
    byName(room, name) { return [...this.map.values()].find(u => u.room === room && u.name.toLowerCase() === name.toLowerCase()) }
}

// ═══════════════════════════════════════════════════════
//  ROOMS
// ═══════════════════════════════════════════════════════
const Rooms = {
    map: new Map(),
    ensure(room) {
        if (!this.map.has(room)) this.map.set(room, { messages: [], reactions: new Map(), password: null, welcome: '', topic: '' })
        return this.map.get(room)
    },
    history(room)         { return (this.map.get(room)?.messages || []).slice(-MAX_HIST) },
    addMsg(room, msg)     { const r = this.ensure(room); r.messages.push(msg); if (r.messages.length > MAX_HIST) r.messages.shift() },
    delMsg(room, msgId)   { const r = this.map.get(room); if (r) r.messages = r.messages.filter(m => m.id !== msgId) },
    clearMsgs(room)       { const r = this.map.get(room); if (r) r.messages = [] },
    react(room, msgId, emoji, username) {
        const r = this.map.get(room); if (!r) return {}
        if (!r.reactions.has(msgId)) r.reactions.set(msgId, {})
        const rx = r.reactions.get(msgId)
        if (!rx[emoji]) rx[emoji] = new Set()
        rx[emoji].has(username) ? rx[emoji].delete(username) : rx[emoji].add(username)
        if (!rx[emoji].size) delete rx[emoji]
        const out = {}; for (const [e, s] of Object.entries(rx)) out[e] = [...s]; return out
    },
    setPw(room, pw)    { this.ensure(room).password = sha(pw) },
    hasPw(room)        { return !!this.map.get(room)?.password },
    checkPw(room, pw)  { const r = this.map.get(room); return !r?.password || r.password === sha(pw) }
}

// ═══════════════════════════════════════════════════════
//  VOID SOCKETS  (voidId ↔ socket.id)
// ═══════════════════════════════════════════════════════
const VoidSockets = {
    map: new Map(),
    set(vid, sid) { this.map.set(vid, sid) },
    del(vid)      { this.map.delete(vid) },
    sid(vid)      { return this.map.get(vid) }
}

// ═══════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════
const MOD_CMDS = new Set(['warn', 'clearwarns', 'tempmute', 'kick', 'deleteMsg'])

const Admin = {
    admins: new Map(), mods: new Map(),
    muted:  new Map(), banned: new Map(),
    locked: new Set(), pinned: new Map(), tempMutes: new Map(),
    wordFilter: new Map(),
    warnings: new Map(),

    isAdmin(room, sid)   { return !!this.admins.get(room)?.has(sid) },
    makeAdmin(room, sid) {
        if (!this.admins.has(room)) this.admins.set(room, new Set())
        this.admins.get(room).add(sid)
        this.remMod(room, sid)
    },
    remAdmin(room, sid)  { this.admins.get(room)?.delete(sid) },
    isMod(room, sid)     { return !!this.mods.get(room)?.has(sid) },
    makeMod(room, sid)   {
        if (!this.mods.has(room)) this.mods.set(room, new Set())
        this.mods.get(room).add(sid)
        this.remAdmin(room, sid)
    },
    remMod(room, sid)    { this.mods.get(room)?.delete(sid) },
    isStaff(room, sid)   { return this.isAdmin(room, sid) || this.isMod(room, sid) },
    isMuted(room, sid)   { return !!this.muted.get(room)?.has(sid) },
    toggleMute(room, sid) {
        if (!this.muted.has(room)) this.muted.set(room, new Set())
        const s = this.muted.get(room); const now = !s.has(sid); now ? s.add(sid) : s.delete(sid); return now
    },
    setMuted(room, sid, v) { if (!this.muted.has(room)) this.muted.set(room, new Set()); v ? this.muted.get(room).add(sid) : this.muted.get(room).delete(sid) },
    isBanned(room, vid)  { return !!this.banned.get(room)?.has(vid) },
    ban(room, vid)       { if (!this.banned.has(room)) this.banned.set(room, new Set()); this.banned.get(room).add(vid) },
    isLocked(room)       { return this.locked.has(room) },
    lock(room)           { this.locked.add(room) },
    unlock(room)         { this.locked.delete(room) },
    pin(room, msg)       { this.pinned.set(room, msg) },
    unpin(room)          { this.pinned.delete(room) },
    getPin(room)         { return this.pinned.get(room) || null },
    warn(room, sid) {
        if (!this.warnings.has(room)) this.warnings.set(room, new Map())
        const m = this.warnings.get(room); const c = (m.get(sid) || 0) + 1; m.set(sid, c); return c
    },
    warnCount(room, sid) { return this.warnings.get(room)?.get(sid) || 0 },
    clearWarns(room, sid) { this.warnings.get(room)?.delete(sid) },
    addFilter(room, word) { if (!this.wordFilter.has(room)) this.wordFilter.set(room, new Set()); this.wordFilter.get(room).add(word.toLowerCase()) },
    remFilter(room, word) { this.wordFilter.get(room)?.delete(word.toLowerCase()) },
    filterText(room, text) {
        const words = this.wordFilter.get(room); if (!words?.size) return text
        let t = text; words.forEach(w => { t = t.replace(new RegExp(`\\b${w}\\b`, 'gi'), '█'.repeat(w.length)) }); return t
    },
    tempMute(room, sid, mins, io_) {
        const key = `${room}:${sid}`
        if (this.tempMutes.has(key)) clearTimeout(this.tempMutes.get(key))
        this.setMuted(room, sid, true)
        io_.to(sid).emit('muteStatus', { muted: true, minutes: mins })
        const t = setTimeout(() => {
            this.setMuted(room, sid, false)
            io_.to(sid).emit('muteStatus', { muted: false })
            io_.to(room).emit('userList', { users: richUsers(room) })
            this.tempMutes.delete(key)
        }, mins * 60000)
        this.tempMutes.set(key, t)
    }
}

// ═══════════════════════════════════════════════════════
//  AUDIT LOG
// ═══════════════════════════════════════════════════════
const Audit = {
    logs: new Map(),
    add(room, action, by, target = '') {
        if (!this.logs.has(room)) this.logs.set(room, [])
        const l = this.logs.get(room)
        l.unshift({ action, by, target, time: ts() })
        if (l.length > 100) l.pop()
    },
    get(room) { return (this.logs.get(room) || []).slice(0, 50) }
}

// ═══════════════════════════════════════════════════════
//  OWNER  (System Admin)
// ═══════════════════════════════════════════════════════
const Owner = {
    owners:     new Set(),
    globalBans: new Set(),
    motd: 'Welcome to VOID — private secure messaging by BlackCrownTech.',
    isOwner(vid)     { return this.owners.has(vid) },
    add(vid)         { this.owners.add(vid) },
    remove(vid)      { this.owners.delete(vid) },
    globalBan(vid)   { this.globalBans.add(vid) },
    globalUnban(vid) { this.globalBans.delete(vid) },
    isBanned(vid)    { return this.globalBans.has(vid) }
}

// ═══════════════════════════════════════════════════════
//  FRIENDS
// ═══════════════════════════════════════════════════════
const Friends = {
    friends:  new Map(),
    requests: new Map(),
    blocked:  new Map(),

    sendReq(fromVid, fromName, toVid) {
        if (!this.requests.has(toVid)) this.requests.set(toVid, new Map())
        this.requests.get(toVid).set(fromVid, { name: fromName, time: Date.now() })
    },
    acceptReq(fromVid, toVid, toName) {
        const req = this.requests.get(toVid); if (!req?.has(fromVid)) return false
        const { name: fromName } = req.get(fromVid); req.delete(fromVid)
        if (!this.friends.has(fromVid)) this.friends.set(fromVid, new Map())
        if (!this.friends.has(toVid))   this.friends.set(toVid,   new Map())
        this.friends.get(fromVid).set(toVid, { name: toName })
        this.friends.get(toVid).set(fromVid, { name: fromName })
        return true
    },
    declineReq(fromVid, toVid)  { this.requests.get(toVid)?.delete(fromVid) },
    removeFriend(a, b)          { this.friends.get(a)?.delete(b); this.friends.get(b)?.delete(a) },
    areFriends(a, b)            { return !!this.friends.get(a)?.has(b) },
    getFriends(vid)             { return [...(this.friends.get(vid) || new Map()).entries()].map(([v, d]) => ({ voidId: v, name: d.name })) },
    getPendingReqs(vid)         { return [...(this.requests.get(vid) || new Map()).entries()].map(([fv, d]) => ({ fromVoid: fv, fromName: d.name, time: d.time })) },
    block(from, target)         { if (!this.blocked.has(from)) this.blocked.set(from, new Set()); this.blocked.get(from).add(target); this.removeFriend(from, target) },
    unblock(from, target)       { this.blocked.get(from)?.delete(target) },
    isBlocked(from, target)     { return !!this.blocked.get(from)?.has(target) }
}

// ═══════════════════════════════════════════════════════
//  DMs
// ═══════════════════════════════════════════════════════
const DMs = {
    convos: new Map(),
    key(a, b) { return [a, b].sort().join('::') },
    addMsg(a, b, msg) {
        const k = this.key(a, b)
        if (!this.convos.has(k)) this.convos.set(k, [])
        const c = this.convos.get(k); c.push(msg); if (c.length > MAX_HIST) c.shift()
    },
    history(a, b) { return this.convos.get(this.key(a, b)) || [] }
}

// ═══════════════════════════════════════════════════════
//  GROUPS
// ═══════════════════════════════════════════════════════
const Groups = {
    map: new Map(),
    create(name, desc, ownerVid, ownerName, pw, isPrivate) {
        const g = {
            id: gid(), name, desc, ownerVid,
            color: ['#5b6cf5', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#00d4ff'][Math.floor(Math.random() * 6)],
            password: pw ? sha(pw) : null, isPrivate,
            members: new Map(),
            messages: [], reactions: new Map(),
            invites: new Set(), topic: '',
            createdAt: new Date().toISOString()
        }
        g.members.set(ownerVid, { name: ownerName, role: 'owner', joinedAt: Date.now() })
        this.map.set(g.id, g); return g
    },
    get(id)          { return this.map.get(id) },
    forMember(vid)   { return [...this.map.values()].filter(g => g.members.has(vid)) },
    pub(g)           { return { id: g.id, name: g.name, desc: g.desc, color: g.color, ownerVid: g.ownerVid, isPrivate: g.isPrivate, memberCount: g.members.size, topic: g.topic, createdAt: g.createdAt } },
    memberList(g)    { return [...g.members.entries()].map(([vid, m]) => ({ voidId: vid, name: m.name, role: m.role })) },
    roomId(g)        { return `grp:${g.id}` },
    react(groupId, msgId, emoji, username) {
        const g = this.map.get(groupId); if (!g) return {}
        if (!g.reactions.has(msgId)) g.reactions.set(msgId, {})
        const rx = g.reactions.get(msgId)
        if (!rx[emoji]) rx[emoji] = new Set()
        rx[emoji].has(username) ? rx[emoji].delete(username) : rx[emoji].add(username)
        if (!rx[emoji].size) delete rx[emoji]
        const out = {}; for (const [e, s] of Object.entries(rx)) out[e] = [...s]; return out
    }
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function richUsers(room) {
    return Users.inRoom(room).map(u => ({
        ...u,
        isAdmin: Admin.isAdmin(room, u.id),
        isMod:   Admin.isMod(room, u.id),
        isMuted: Admin.isMuted(room, u.id),
        warns:   Admin.warnCount(room, u.id)
    }))
}

// ═══════════════════════════════════════════════════════
//  SERVER
// ═══════════════════════════════════════════════════════
const httpServer = createServer(app)

const io = new Server(httpServer, {
    cors: {
        origin: process.env.NODE_ENV === 'production'
            ? false
            : ['http://localhost:5500', 'http://127.0.0.1:5500']
    }
})

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

    // ── Enter Room ───────────────────────────────────────
    socket.on('enterRoom', ({ name, room, password, voidId }) => {
        if (Admin.isLocked(room) && !Admin.isAdmin(room, socket.id)) {
            return socket.emit('joinError', { type: 'locked', message: 'Room is locked.' })
        }
        if (voidId && Admin.isBanned(room, voidId)) {
            return socket.emit('joinError', { type: 'banned', message: 'You are banned from this room.' })
        }
        if (voidId && Owner.isBanned(voidId)) {
            return socket.emit('joinError', { type: 'globalBan', message: 'You are globally banned.' })
        }
        if (Rooms.hasPw(room) && !Rooms.checkPw(room, password || '')) {
            return socket.emit('joinError', { type: 'badPassword', message: 'Incorrect room password.' })
        }

        const prev = Users.get(socket.id)?.room
        if (prev) {
            socket.leave(prev)
            io.to(prev).emit('message', buildMsg(SYS, `${name} left the channel.`, null, 'system'))
            Admin.remAdmin(prev, socket.id)
            Admin.remMod(prev, socket.id)
            io.to(prev).emit('userList', { users: richUsers(prev) })
        }

        if (voidId) {
            socket.data.voidId = voidId
            VoidSockets.set(voidId, socket.id)
        }

        Users.set(socket.id, { id: socket.id, name, room, status: 'online', voidId: voidId || null })
        socket.join(room)

        const isAdmin = Admin.isAdmin(room, socket.id)
        const isMod   = Admin.isMod(room, socket.id)

        socket.emit('joinSuccess', { name, room, isAdmin, isMod })
        socket.emit('history', Rooms.history(room))

        const pin     = Admin.getPin(room);           if (pin)     socket.emit('pinnedMsg', pin)
        const welcome = Rooms.map.get(room)?.welcome; if (welcome) socket.emit('message', buildMsg(SYS, welcome, null, 'system'))
        const topic   = Rooms.map.get(room)?.topic;   if (topic)   socket.emit('roomTopic', { topic })

        socket.emit('message', buildMsg(SYS, `You joined #${room}`, null, 'system'))
        socket.broadcast.to(room).emit('message', buildMsg(SYS, `${name} joined #${room}`, null, 'system'))
        io.to(room).emit('userList', { users: richUsers(room) })
        io.emit('roomList', { rooms: Users.rooms() })
        if (isAdmin) socket.emit('adminStatus', { isAdmin: true })
        if (isMod)   socket.emit('modStatus',   { isMod:   true })
    })

    socket.on('createRoom', ({ room, password }) => {
        if (!room?.trim()) return
        Rooms.ensure(room)
        if (password) Rooms.setPw(room, password)
        socket.emit('roomCreated', { room, hasPassword: !!password })
    })

    socket.on('checkRoom', ({ room }) => {
        socket.emit('roomInfo', { room, hasPassword: Rooms.hasPw(room), isLocked: Admin.isLocked(room) })
    })

    // ── Disconnect ───────────────────────────────────────
    socket.on('disconnect', () => {
        const user   = Users.get(socket.id)
        const voidId = socket.data?.voidId
        Users.remove(socket.id)

        if (voidId) {
            VoidSockets.del(voidId)
            Friends.getFriends(voidId).forEach(({ voidId: fv }) => {
                const fs = VoidSockets.sid(fv)
                if (fs) io.to(fs).emit('friendOffline', { voidId })
            })
        }

        if (user) {
            Admin.remMod(user.room, socket.id)
            if (Admin.isAdmin(user.room, socket.id)) {
                Admin.remAdmin(user.room, socket.id)
                const next = Users.inRoom(user.room)[0]
                if (next) {
                    Admin.makeAdmin(user.room, next.id)
                    io.to(next.id).emit('adminStatus', { isAdmin: true })
                    io.to(user.room).emit('message', buildMsg(SYS, `${next.name} is now channel admin.`, null, 'system'))
                }
            }
            io.to(user.room).emit('message', buildMsg(SYS, `${user.name} left #${user.room}`, null, 'system'))
            io.to(user.room).emit('userList', { users: richUsers(user.room) })
            io.emit('roomList', { rooms: Users.rooms() })
        }

        console.log(`User ${socket.id} disconnected`)
    })

    // ── Chat Message ─────────────────────────────────────
    socket.on('message', ({ name, text, replyTo }) => {
        const user = Users.get(socket.id); if (!user) return
        if (Admin.isMuted(user.room, socket.id)) return socket.emit('joinError', { type: 'muted', message: 'You are muted.' })
        const filtered = Admin.filterText(user.room, text)
        const msg = buildMsg(name, filtered, replyTo, 'user')
        Rooms.addMsg(user.room, msg)
        io.to(user.room).emit('message', msg)
        socket.emit('delivered', { msgId: msg.id })
    })

    socket.on('reaction', ({ msgId, emoji }) => {
        const u = Users.get(socket.id); if (!u) return
        const rx = Rooms.react(u.room, msgId, emoji, u.name)
        io.to(u.room).emit('reaction', { msgId, reactions: rx })
    })

    socket.on('activity', name => {
        const r = Users.get(socket.id)?.room
        if (r) socket.broadcast.to(r).emit('activity', { name, sid: socket.id })
    })

    socket.on('stopActivity', () => {
        const r = Users.get(socket.id)?.room
        if (r) socket.broadcast.to(r).emit('stopActivity', { sid: socket.id })
    })

    socket.on('updateStatus', status => {
        const u = Users.get(socket.id); if (!u) return
        u.status = status
        io.to(u.room).emit('userList', { users: richUsers(u.room) })
    })

    // ── Friends ──────────────────────────────────────────
    socket.on('sendFriendReq', ({ toVoid, fromName }) => {
        const fromVid = socket.data?.voidId; if (!fromVid) return
        Friends.sendReq(fromVid, fromName, toVoid)
        const fs = VoidSockets.sid(toVoid)
        if (fs) io.to(fs).emit('friendRequest', { fromVoid: fromVid, fromName })
    })

    socket.on('acceptFriendReq', ({ fromVoid, myName }) => {
        const myVid = socket.data?.voidId; if (!myVid) return
        if (Friends.acceptReq(fromVoid, myVid, myName)) {
            const fs = VoidSockets.sid(fromVoid)
            if (fs) io.to(fs).emit('friendAccepted', { voidId: myVid, name: myName })
            socket.emit('friendsList', { friends: Friends.getFriends(myVid) })
        }
    })

    socket.on('declineFriendReq', ({ fromVoid }) => {
        const myVid = socket.data?.voidId; if (!myVid) return
        Friends.declineReq(fromVoid, myVid)
    })

    socket.on('getFriends', () => {
        const vid = socket.data?.voidId; if (!vid) return
        socket.emit('friendsList',     { friends:  Friends.getFriends(vid) })
        socket.emit('pendingRequests', { requests: Friends.getPendingReqs(vid) })
    })

    // ── DMs ──────────────────────────────────────────────
    socket.on('sendDM', ({ toVoid, text }) => {
        const fromVid = socket.data?.voidId; if (!fromVid) return
        if (Friends.isBlocked(toVoid, fromVid)) return
        const u = Users.get(socket.id)
        const msg = buildMsg(u?.name || fromVid, text, null, 'dm')
        DMs.addMsg(fromVid, toVoid, msg)
        socket.emit('dmMessage', { withVoid: toVoid, msg })
        const fs = VoidSockets.sid(toVoid)
        if (fs) io.to(fs).emit('dmMessage', { withVoid: fromVid, msg })
    })

    socket.on('getDMHistory', ({ withVoid }) => {
        const vid = socket.data?.voidId; if (!vid) return
        socket.emit('dmHistory', { withVoid, messages: DMs.history(vid, withVoid) })
    })

    // ── Groups ───────────────────────────────────────────
    socket.on('createGroup', ({ name, desc, password, isPrivate }) => {
        const vid = socket.data?.voidId; if (!vid) return
        const u = Users.get(socket.id)
        const g = Groups.create(name, desc || '', vid, u?.name || vid, password, !!isPrivate)
        socket.join(Groups.roomId(g))
        socket.emit('groupCreated', Groups.pub(g))
        if (!isPrivate) io.emit('groupList', { groups: [...Groups.map.values()].filter(g => !g.isPrivate).map(g => Groups.pub(g)) })
    })

    socket.on('joinGroup', ({ groupId, password }) => {
        const vid = socket.data?.voidId; if (!vid) return
        const g = Groups.get(groupId)
        if (!g) return socket.emit('groupError', { message: 'Group not found.' })
        if (g.password && g.password !== sha(password || '')) return socket.emit('groupError', { message: 'Wrong password.' })
        const u = Users.get(socket.id)
        g.members.set(vid, { name: u?.name || vid, role: 'member', joinedAt: Date.now() })
        socket.join(Groups.roomId(g))
        socket.emit('groupJoined', { group: Groups.pub(g), history: g.messages.slice(-MAX_HIST), members: Groups.memberList(g) })
        io.to(Groups.roomId(g)).emit('groupMembers', { groupId: g.id, members: Groups.memberList(g) })
    })

    socket.on('groupMessage', ({ groupId, text }) => {
        const vid = socket.data?.voidId; if (!vid) return
        const g = Groups.get(groupId)
        if (!g || !g.members.has(vid)) return
        const u = Users.get(socket.id)
        const msg = buildMsg(u?.name || vid, text, null, 'user')
        g.messages.push(msg); if (g.messages.length > MAX_HIST) g.messages.shift()
        io.to(Groups.roomId(g)).emit('groupMessage', { groupId, msg })
    })

    socket.on('listGroups', () => {
        socket.emit('groupList', { groups: [...Groups.map.values()].filter(g => !g.isPrivate).map(g => Groups.pub(g)) })
    })

    // ── Admin Commands ───────────────────────────────────
    socket.on('adminCmd', ({ cmd, target, data }) => {
        const user = Users.get(socket.id); if (!user) return
        const vid     = socket.data?.voidId
        const isOwner = Owner.isOwner(vid)
        const isAdmin = Admin.isAdmin(user.room, socket.id) || isOwner
        const isMod   = Admin.isMod(user.room, socket.id)
        if (!isAdmin && !isMod) return socket.emit('adminError', { message: 'Permission denied — Staff only.' })
        if (isMod && !isAdmin && !MOD_CMDS.has(cmd)) return socket.emit('adminError', { message: `Mods cannot use /${cmd}. Allowed: ${[...MOD_CMDS].join(', ')}` })
        const room = user.room
        const sys  = msg => io.to(room).emit('message', buildMsg(SYS, msg, null, 'system'))
        const err  = msg => socket.emit('adminError', { message: msg })
        Audit.add(room, cmd, user.name, target || data || '')

        switch (cmd) {
            case 'kick': case 'ban': {
                const t = Users.byName(room, target); if (!t) return err(`"${target}" not found.`)
                if (t.id === socket.id) return err('Cannot target yourself.')
                if (cmd === 'ban' && isMod && !isAdmin) return err('Mods cannot ban users.')
                if (isMod && Admin.isAdmin(room, t.id)) return err('Mods cannot kick admins.')
                if (cmd === 'ban' && t.voidId) Admin.ban(room, t.voidId)
                io.to(t.id).emit('kicked', { reason: cmd === 'ban' ? 'You have been banned.' : 'Kicked by admin.' })
                const tSock = io.sockets.sockets.get(t.id); if (tSock) tSock.leave(room)
                Users.remove(t.id)
                sys(`${t.name} was ${cmd === 'ban' ? 'banned' : 'kicked'} by ${user.name}.`)
                io.to(room).emit('userList', { users: richUsers(room) }); io.emit('roomList', { rooms: Users.rooms() }); break
            }
            case 'mute': { const t = Users.byName(room, target); if (!t) return err(`"${target}" not found.`); const nm = Admin.toggleMute(room, t.id); io.to(t.id).emit('muteStatus', { muted: nm }); sys(`${t.name} was ${nm ? 'muted' : 'unmuted'} by ${user.name}.`); io.to(room).emit('userList', { users: richUsers(room) }); break }
            case 'tempmute': { const t = Users.byName(room, target); if (!t) return err(`"${target}" not found.`); const mins = parseInt(data) || 5; Admin.tempMute(room, t.id, mins, io); sys(`${t.name} temp-muted for ${mins}min by ${user.name}.`); io.to(room).emit('userList', { users: richUsers(room) }); break }
            case 'warn': {
                const t = Users.byName(room, target); if (!t) return err(`"${target}" not found.`)
                if (isMod && Admin.isAdmin(room, t.id)) return err('Mods cannot warn admins.')
                const count = Admin.warn(room, t.id)
                io.to(t.id).emit('warned', { room, count, by: user.name })
                sys(`⚠ ${t.name} warned by ${user.name} (${count}/3).`)
                if (count >= 3) {
                    io.to(t.id).emit('kicked', { reason: 'Auto-kicked: 3 warnings reached.' })
                    const tSock = io.sockets.sockets.get(t.id); if (tSock) tSock.leave(room)
                    Users.remove(t.id)
                    io.to(room).emit('userList', { users: richUsers(room) }); io.emit('roomList', { rooms: Users.rooms() })
                    sys(`${t.name} auto-kicked after 3 warnings.`)
                } else io.to(room).emit('userList', { users: richUsers(room) })
                break
            }
            case 'clearwarns':  { const t = Users.byName(room, target); if (!t) return err(`"${target}" not found.`); Admin.clearWarns(room, t.id); sys(`${t.name}'s warnings cleared by ${user.name}.`); io.to(room).emit('userList', { users: richUsers(room) }); break }
            case 'promote': {
                if (!isAdmin) return err('Only Admins/Owners can promote.')
                const t = Users.byName(room, target); if (!t) return err(`"${target}" not found.`)
                Admin.makeAdmin(room, t.id); io.to(t.id).emit('adminStatus', { isAdmin: true }); io.to(t.id).emit('modStatus', { isMod: false })
                sys(`${t.name} promoted to Admin by ${user.name}.`); io.to(room).emit('userList', { users: richUsers(room) }); break
            }
            case 'demote': {
                if (!isAdmin) return err('Only Admins/Owners can demote.')
                const t = Users.byName(room, target); if (!t) return err(`"${target}" not found.`)
                Admin.remAdmin(room, t.id); Admin.remMod(room, t.id)
                io.to(t.id).emit('adminStatus', { isAdmin: false }); io.to(t.id).emit('modStatus', { isMod: false })
                sys(`${t.name} demoted to Member by ${user.name}.`); io.to(room).emit('userList', { users: richUsers(room) }); break
            }
            case 'makemod': {
                if (!isAdmin) return err('Only Admins/Owners can assign Moderators.')
                const t = Users.byName(room, target); if (!t) return err(`"${target}" not found.`)
                if (Admin.isAdmin(room, t.id)) return err('Cannot make an Admin into a Mod. Demote first.')
                Admin.makeMod(room, t.id); io.to(t.id).emit('modStatus', { isMod: true })
                sys(`${t.name} was made Moderator by ${user.name}.`); io.to(room).emit('userList', { users: richUsers(room) }); break
            }
            case 'removemod': {
                if (!isAdmin) return err('Only Admins/Owners can remove Moderators.')
                const t = Users.byName(room, target); if (!t) return err(`"${target}" not found.`)
                Admin.remMod(room, t.id); io.to(t.id).emit('modStatus', { isMod: false })
                sys(`${t.name} removed from Moderators by ${user.name}.`); io.to(room).emit('userList', { users: richUsers(room) }); break
            }
            case 'clear':      Rooms.clearMsgs(room); io.to(room).emit('chatCleared'); sys(`Chat cleared by ${user.name}.`); break
            case 'lock':       Admin.lock(room);   io.to(room).emit('roomLocked', { locked: true  }); sys(`#${room} locked by ${user.name}.`);   break
            case 'unlock':     Admin.unlock(room); io.to(room).emit('roomLocked', { locked: false }); sys(`#${room} unlocked by ${user.name}.`); break
            case 'pin':        { const m = buildMsg('📌 Pinned', data, null, 'pinned'); Admin.pin(room, m); io.to(room).emit('pinnedMsg', m); sys(`${user.name} pinned a message.`); break }
            case 'unpin':      Admin.unpin(room); io.to(room).emit('pinnedMsg', null); sys(`${user.name} unpinned the message.`); break
            case 'broadcast':  io.to(room).emit('message', buildMsg(`📢 ${user.name}`, data, null, 'broadcast')); break
            case 'slowmode':   { const s = Math.max(0, parseInt(data) || 0); io.to(room).emit('slowMode', { seconds: s }); sys(s ? `Slow mode: ${s}s by ${user.name}.` : `Slow mode disabled by ${user.name}.`); break }
            case 'deleteMsg':  Rooms.delMsg(room, data); io.to(room).emit('msgDeleted', { msgId: data }); break
            case 'settopic':   { const r = Rooms.ensure(room); r.topic = data || ''; io.to(room).emit('roomTopic', { topic: r.topic }); sys(`Topic set by ${user.name}: ${r.topic || '(cleared)'}`); break }
            case 'setwelcome': { const r = Rooms.ensure(room); r.welcome = data || ''; socket.emit('adminSuccess', { message: 'Welcome message updated.' }); break }
            case 'addfilter':  Admin.addFilter(room, (data || '').trim()); sys(`Word filter updated by ${user.name}.`); break
            case 'remfilter':  Admin.remFilter(room, (data || '').trim()); sys(`Word filter updated by ${user.name}.`); break
            case 'auditlog':   socket.emit('auditLog', { logs: Audit.get(room) }); break
        }
    })
})

// ═══════════════════════════════════════════════════════
//  START / EXPORT
// ═══════════════════════════════════════════════════════
if (!process.env.VERCEL) {
    httpServer.listen(PORT, () => console.log(`VOID server listening on port ${PORT}`))
}

export default app
