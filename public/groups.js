// ═══════════════════════════════════════════════════════
//  groups.js — VOID v5  ·  Groups module
// ═══════════════════════════════════════════════════════

let groupList     = []    // [pubGroup]
let activeGroup   = null  // group id
let groupMessages = {}    // groupId → [messages]

const groupListEl    = document.getElementById('groupList')
const createGroupBtn = document.getElementById('createGroupBtn')

// ── Render ────────────────────────────────────────────────
function renderGroupList() {
    groupListEl.innerHTML = ''
    if (!groupList.length) { groupListEl.innerHTML = '<li class="item-empty">No groups yet</li>'; return }
    groupList.forEach(g => {
        const li = document.createElement('li')
        li.className = `group-item${activeGroup === g.id ? ' group-item--active' : ''}`
        li.dataset.groupId = g.id
        li.innerHTML = `
          <span class="group-hex" style="color:${g.color}">⬡</span>
          <div class="group-item__info">
            <span class="group-item__name">${window.escHtml(g.name)}</span>
            <span class="group-item__role">${g.memberCount} members</span>
          </div>`
        li.addEventListener('click', () => enterGroupChat(g))
        groupListEl.appendChild(li)
    })
}

function enterGroupChat(g) {
    activeGroup = g.id
    renderGroupList()

    const chatScreen  = document.getElementById('chatScreen')
    const joinOverlay = document.getElementById('joinOverlay')
    joinOverlay.style.display  = 'none'
    chatScreen.style.display   = 'flex'
    if (window.showChat) window.showChat()
    chatScreen.dataset.mode    = 'group'

    document.querySelector('.ch-hash').style.display       = 'inline'
    document.getElementById('chAdminBadge').style.display   = 'none'
    document.getElementById('chLock').style.display         = 'none'
    document.getElementById('currentRoom').textContent      = g.name
    const e2eBadge = document.getElementById('e2eBadge'); if (e2eBadge) e2eBadge.style.display = 'none'
    document.getElementById('msgInput').placeholder         = `Message ${g.name}`

    const display = document.getElementById('chatDisplay')
    display.innerHTML = ''
    if (groupMessages[g.id]?.length) {
        groupMessages[g.id].forEach(m => display.appendChild(window.buildMsgEl(m)))
        display.scrollTo({ top: display.scrollHeight })
    } else {
        window.socket.emit('groupHistory', { groupId: g.id })
    }
}

// ── Modal tabs ────────────────────────────────────────────
createGroupBtn.addEventListener('click', () => {
    document.getElementById('groupActionModal').style.display = 'flex'
})
document.getElementById('closeGroupModal').addEventListener('click', () =>
    document.getElementById('groupActionModal').style.display = 'none')

document.getElementById('groupModalTabs').addEventListener('click', e => {
    const tab = e.target.closest('.admin-tab'); if (!tab) return
    document.querySelectorAll('#groupModalTabs .admin-tab').forEach(t => t.classList.remove('admin-tab--active'))
    document.getElementById('groupTab-create').style.display = 'none'
    document.getElementById('groupTab-join').style.display   = 'none'
    tab.classList.add('admin-tab--active')
    document.getElementById(`groupTab-${tab.dataset.gtab}`).style.display = 'flex'
})

document.getElementById('createGroupForm').addEventListener('submit', e => {
    e.preventDefault()
    const name      = document.getElementById('groupNameInput').value.trim()
    const desc      = document.getElementById('groupDescInput').value.trim()
    const password  = document.getElementById('groupPasswordInput').value
    const isPrivate = document.getElementById('groupPrivateCheck').checked
    if (!name) return
    window.socket.emit('createGroup', { name, desc, password, isPrivate })
    document.getElementById('groupActionModal').style.display = 'none'
    document.getElementById('createGroupForm').reset()
})

document.getElementById('joinGroupForm').addEventListener('submit', e => {
    e.preventDefault()
    const groupId  = document.getElementById('joinGroupIdInput').value.trim().toUpperCase()
    const password = document.getElementById('joinGroupPasswordInput').value
    if (!groupId) return
    const btn   = e.target.querySelector('button[type=submit]')
    const errEl = document.getElementById('joinGroupError')
    btn.disabled = true; btn.textContent = 'Joining…'
    if (errEl) errEl.style.display = 'none'
    window.socket.emit('joinGroup', { groupId, password })
})

// ── sendMsg override ──────────────────────────────────────
const _prevSendMsgG = window.sendMsg
window.sendMsg = function() {
    const mode = document.getElementById('chatScreen').dataset.mode
    if (mode === 'group' && activeGroup) {
        const text = document.getElementById('msgInput').value.trim(); if (!text) return
        window.socket.emit('groupMsg', { groupId: activeGroup, text })
        document.getElementById('msgInput').value = ''
        return
    }
    _prevSendMsgG()
}

// ── Socket events ─────────────────────────────────────────
window.socket.on('groupList', ({ groups }) => { groupList = groups; renderGroupList() })

window.socket.on('groupCreated', ({ group }) => {
    window.showToast(`Group "${group.name}" created — ID: ${group.id}`, 'success')
})

window.socket.on('groupJoined', ({ group, history, members }) => {
    document.getElementById('groupActionModal').style.display = 'none'
    document.getElementById('joinGroupForm').reset()
    const _jgBtn = document.querySelector('#joinGroupForm button[type=submit]')
    if (_jgBtn) { _jgBtn.disabled = false; _jgBtn.textContent = 'Join Group' }
    groupMessages[group.id] = history
    const idx = groupList.findIndex(g => g.id === group.id)
    if (idx >= 0) groupList[idx] = group; else groupList.push(group)
    renderGroupList()
    enterGroupChat(group)
    const display = document.getElementById('chatDisplay')
    display.innerHTML = ''
    history.forEach(m => display.appendChild(window.buildMsgEl(m)))
    display.scrollTo({ top: display.scrollHeight })
    window.showToast(`Joined group "${group.name}"`, 'success')
})

window.socket.on('groupHistoryData', ({ groupId, history }) => {
    groupMessages[groupId] = history
    if (activeGroup === groupId) {
        const display = document.getElementById('chatDisplay')
        display.innerHTML = ''
        history.forEach(m => display.appendChild(window.buildMsgEl(m)))
        display.scrollTo({ top: display.scrollHeight })
    }
})

window.socket.on('groupMsg', ({ groupId, msg }) => {
    if (!groupMessages[groupId]) groupMessages[groupId] = []
    groupMessages[groupId].push(msg)
    if (activeGroup === groupId && document.getElementById('chatScreen').dataset.mode === 'group') {
        const display = document.getElementById('chatDisplay')
        display.appendChild(window.buildMsgEl(msg))
        const near = display.scrollHeight - display.scrollTop - display.clientHeight < 160
        if (near) display.scrollTo({ top: display.scrollHeight, behavior: 'smooth' })
    }
})

window.socket.on('groupReaction', ({ groupId, msgId, reactions }) => {
    const el = document.getElementById(`rx-${msgId}`); if (el) el.innerHTML = window.buildRxHtml(reactions)
})

window.socket.on('groupDelivered', ({ msgId }) => {
    const el = document.getElementById(`st-${msgId}`)
    if (el) { el.textContent = '✓✓'; el.className = 'msg__status msg__status--delivered' }
})

window.socket.on('groupKicked', ({ groupId, groupName }) => {
    groupList = groupList.filter(g => g.id !== groupId)
    if (activeGroup === groupId) {
        activeGroup = null
        document.getElementById('chatScreen').style.display = 'none'
        document.getElementById('joinOverlay').style.display = 'flex'
    }
    renderGroupList()
    window.showToast(`Kicked from "${groupName}"`, 'error')
})

window.socket.on('groupDeleted', ({ groupId, groupName }) => {
    groupList = groupList.filter(g => g.id !== groupId)
    if (activeGroup === groupId) {
        activeGroup = null
        document.getElementById('chatScreen').style.display = 'none'
        document.getElementById('joinOverlay').style.display = 'flex'
    }
    renderGroupList()
    window.showToast(`Group "${groupName}" deleted`, 'warn')
})

window.socket.on('groupLeft', ({ groupId }) => {
    groupList = groupList.filter(g => g.id !== groupId)
    if (activeGroup === groupId) {
        activeGroup = null
        document.getElementById('chatScreen').style.display = 'none'
        document.getElementById('joinOverlay').style.display = 'flex'
    }
    renderGroupList()
})

window.socket.on('groupInvite', ({ groupId, groupName, invitedBy }) => {
    window.showToast(`Invite to "${groupName}" from ${invitedBy}`, 'info')
    if (confirm(`Accept invite to group "${groupName}" from ${invitedBy}?`)) {
        window.socket.emit('joinGroup', { groupId, password: '' })
    } else {
        window.socket.emit('declineGroupInvite', { groupId })
    }
})

window.socket.on('groupError', ({ message }) => {
    const errEl = document.getElementById('joinGroupError')
    const btn   = document.querySelector('#joinGroupForm button[type=submit]')
    if (errEl) { errEl.textContent = message; errEl.style.display = 'block' }
    if (btn)   { btn.disabled = false; btn.textContent = 'Join Group' }
    window.showToast(message, 'error')
})
window.socket.on('groupSuccess', ({ message }) => window.showToast(message, 'success'))
