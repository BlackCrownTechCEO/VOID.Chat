// ═══════════════════════════════════════════════════════
//  settings.js — VOID v6  ·  User settings + UI
// ═══════════════════════════════════════════════════════

const SETTINGS_KEY = 'voidSettings'
const DEFAULTS = {
    theme: 'dark', accent: '#00e5ff', fontSize: 'medium', density: 'cozy',
    soundMessages: true, soundDms: true, desktopNotifs: false, dmBadge: true,
    privacyDm: 'friends', privacyFriendReq: 'everyone',
    readReceipts: true, onlineStatus: 'everyone'
}

let _s = { ...DEFAULTS }

function load()  { try { Object.assign(_s, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) } catch (_) {} }
function save()  { localStorage.setItem(SETTINGS_KEY, JSON.stringify(_s)) }
function get(k)  { return _s[k] }
function set(k, v) { _s[k] = v; save(); apply() }

function apply() {
    const r = document.documentElement
    // Accent
    r.style.setProperty('--acc', _s.accent)
    // Derive acc2 (complementary color)
    const acc2map = { '#00e5ff':'#7b2fff','#7b2fff':'#ff2d78','#ff2d78':'#7b2fff','#22c55e':'#00e5ff','#f59e0b':'#ff2d78','#e4e6eb':'#7b2fff' }
    r.style.setProperty('--acc2', acc2map[_s.accent] || '#7b2fff')
    // Font size
    const fsMap = { small: '.82rem', medium: '.9rem', large: '1rem' }
    r.style.setProperty('--font-size', fsMap[_s.fontSize] || '.9rem')
    // Theme
    document.body.classList.remove('theme-darker', 'theme-amoled')
    if (_s.theme === 'darker') document.body.classList.add('theme-darker')
    if (_s.theme === 'amoled') document.body.classList.add('theme-amoled')
    // Density
    document.body.classList.toggle('density-compact', _s.density === 'compact')
}

// ── Wire settings modal UI ────────────────────────────────
function wireUI() {
    // Nav tabs
    document.querySelectorAll('.settings-nav-item[data-stab]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('settings-nav-item--active'))
            document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none')
            btn.classList.add('settings-nav-item--active')
            const panel = document.getElementById(`sTab-${btn.dataset.stab}`)
            if (panel) panel.style.display = 'block'
            if (btn.dataset.stab === 'security') _populateSecurity()
        })
    })

    // Theme
    document.getElementById('themeOpts')?.querySelectorAll('[data-theme]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('seg-btn--active'))
            btn.classList.add('seg-btn--active')
            set('theme', btn.dataset.theme)
        })
    })

    // Accent
    document.getElementById('accentOpts')?.querySelectorAll('[data-accent]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-accent]').forEach(b => b.classList.remove('swatch--active'))
            btn.classList.add('swatch--active')
            set('accent', btn.dataset.accent)
        })
    })

    // Font size
    document.getElementById('fontSizeOpts')?.querySelectorAll('[data-fs]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-fs]').forEach(b => b.classList.remove('seg-btn--active'))
            btn.classList.add('seg-btn--active')
            set('fontSize', btn.dataset.fs)
        })
    })

    // Density
    document.getElementById('densityOpts')?.querySelectorAll('[data-density]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-density]').forEach(b => b.classList.remove('seg-btn--active'))
            btn.classList.add('seg-btn--active')
            set('density', btn.dataset.density)
        })
    })

    // Toggles
    const toggleIds  = ['sndMessages','sndDms','dmBadge','readReceipts']
    const toggleKeys = { sndMessages:'soundMessages', sndDms:'soundDms', dmBadge:'dmBadge', readReceipts:'readReceipts' }
    toggleIds.forEach(id => {
        const el = document.getElementById(id); if (!el) return
        el.addEventListener('change', () => set(toggleKeys[id], el.checked))
    })

    // Selects
    const selectIds  = ['privDm','privFriendReq','onlineStatus']
    const selectKeys = { privDm:'privacyDm', privFriendReq:'privacyFriendReq', onlineStatus:'onlineStatus' }
    selectIds.forEach(id => {
        const el = document.getElementById(id); if (!el) return
        el.addEventListener('change', () => set(selectKeys[id], el.value))
    })

    // Desktop notifs
    document.getElementById('reqNotifBtn')?.addEventListener('click', () => {
        Notification.requestPermission().then(p => {
            set('desktopNotifs', p === 'granted')
            window.showToast?.(p === 'granted' ? 'Notifications enabled' : 'Permission denied', p === 'granted' ? 'success' : 'error')
        })
    })

    // Security
    document.getElementById('copyPubKeyBtn')?.addEventListener('click', () => {
        const key = document.getElementById('myPubKeyDisplay')?.textContent
        if (key) navigator.clipboard.writeText(key).then(() => window.showToast?.('Public key copied', 'success'))
    })
    document.getElementById('regenKeyBtn')?.addEventListener('click', async () => {
        if (!confirm('Regenerate your E2E key pair?\n\nExisting encrypted DMs will become unreadable.')) return
        await window.VoidCrypto?.regenerate()
        window.socket?.emit('publishKey', { publicKey: window.VoidCrypto?.getPublicKeyB64() })
        _populateSecurity()
        window.showToast?.('Key pair regenerated', 'success')
    })

    // Account — save name
    document.getElementById('saveNameBtn')?.addEventListener('click', () => {
        const name = document.getElementById('settingsNameInput')?.value.trim()
        if (name && window.socket) { window.socket.emit('updateName', { name }); window.showToast?.('Name updated', 'success') }
    })

    // Copy VOID ID
    document.getElementById('settingsCopyVoid')?.addEventListener('click', () => {
        const vid = document.getElementById('settingsVoidId')?.textContent
        if (vid) navigator.clipboard.writeText(vid).then(() => window.showToast?.('VOID ID copied', 'success'))
    })

    // Clear data
    document.getElementById('clearDataBtn')?.addEventListener('click', () => {
        if (!confirm('Clear ALL data and reset your identity?\n\nThis cannot be undone.')) return
        localStorage.clear(); location.reload()
    })
}

function _populateSecurity() {
    const el = document.getElementById('myPubKeyDisplay')
    if (el && window.VoidCrypto) {
        const k = window.VoidCrypto.getPublicKeyB64()
        el.textContent = k ? k.slice(0, 48) + '…' : 'Not available'
    }
    const si = document.getElementById('sessionInfo')
    if (si) si.textContent = `${window.myVoidId || '—'} · session active`
}

// ── Populate UI from loaded settings ─────────────────────
function _syncUI() {
    document.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('seg-btn--active', b.dataset.theme === _s.theme))
    document.querySelectorAll('[data-accent]').forEach(b => b.classList.toggle('swatch--active', b.dataset.accent === _s.accent))
    document.querySelectorAll('[data-fs]').forEach(b => b.classList.toggle('seg-btn--active', b.dataset.fs === _s.fontSize))
    document.querySelectorAll('[data-density]').forEach(b => b.classList.toggle('seg-btn--active', b.dataset.density === _s.density))
    const ids = { sndMessages:'soundMessages', sndDms:'soundDms', dmBadge:'dmBadge', readReceipts:'readReceipts' }
    Object.entries(ids).forEach(([id, k]) => { const el=document.getElementById(id); if(el) el.checked=_s[k] })
    const sels = { privDm:'privacyDm', privFriendReq:'privacyFriendReq', onlineStatus:'onlineStatus' }
    Object.entries(sels).forEach(([id, k]) => { const el=document.getElementById(id); if(el) el.value=_s[k] })
}

// ── Populate account info when settings modal opens ───────
document.getElementById('settingsBtn')?.addEventListener('click', () => {
    const vid  = window.myVoidId || '—'
    const name = window.myName   || '—'
    const el  = document.getElementById('settingsVoidId');    if (el) el.textContent = vid
    const ni  = document.getElementById('settingsNameInput'); if (ni) ni.value = name
    const av  = document.getElementById('settingsAvatar');    if (av) { av.textContent = window.initials?.(name) || '?'; av.style.background = window.avatarColor?.(name) || '#333' }
    const an  = document.getElementById('settingsAccountName'); if (an) an.textContent = name
    const avid = document.getElementById('settingsAccountVid'); if (avid) avid.textContent = vid
    _syncUI()
})

// ── Boot ─────────────────────────────────────────────────
load()
apply()
document.addEventListener('DOMContentLoaded', () => { wireUI() })
window.voidSettings = { get, set, apply }
