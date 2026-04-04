// ═══════════════════════════════════════════════════════
//  feed.js — VOID v7  ·  Activity Feed + VOIDs
// ═══════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────
let _feedOpen       = false
let _activeVoids    = []
let _feedCards      = []
let _viewerTimer    = null
let _selectedExpiry = 3_600_000

// ── DOM refs ──────────────────────────────────────────
const feedOverlay    = document.getElementById('feedOverlay')
const voidRingsEl    = document.getElementById('voidRings')
const feedGridEl     = document.getElementById('feedGrid')
const feedEmptyEl    = document.getElementById('feedEmpty')
const voidViewerEl   = document.getElementById('voidViewer')
const voidComposerEl = document.getElementById('voidComposer')

// ── Open / Close ──────────────────────────────────────
function openFeed() {
    _feedOpen = true
    feedOverlay.style.display = 'flex'
    window.socket.emit('getFeed')
}

function closeFeed() {
    _feedOpen = false
    feedOverlay.style.display = 'none'
    closeVoidViewer()
    closeComposer()
}

window.openFeed  = openFeed
window.closeFeed = closeFeed

// ── Entry point buttons ───────────────────────────────
document.getElementById('openFeedBtn')?.addEventListener('click', openFeed)
document.getElementById('openFeedBtnM')?.addEventListener('click', openFeed)
document.getElementById('closeFeedBtn')?.addEventListener('click', closeFeed)

// ── Render VOID Rings ─────────────────────────────────
function renderVoidRings(voids) {
    const existing = voidRingsEl.querySelectorAll('.void-ring-wrap:not(:first-child)')
    existing.forEach(el => el.remove())

    voids.forEach(v => {
        const wrap = document.createElement('div')
        wrap.className = 'void-ring-wrap'
        const ringClass = v.type === 'manual' ? 'void-ring--manual'
                        : v.type === 'streak'  ? 'void-ring--streak'
                        : 'void-ring--auto'
        const bgColor  = window.avatarColor ? window.avatarColor(v.name) : '#333'
        const initials = window.initials    ? window.initials(v.name)    : v.name.slice(0, 2).toUpperCase()
        wrap.innerHTML = `
          <button class="void-ring ${ringClass}" data-void-id="${window.escHtml(v.voidId)}">
            <span class="void-ring__av" style="background:${bgColor}">${initials}</span>
          </button>
          <span class="void-ring__name">${window.escHtml(v.name)}</span>`
        wrap.querySelector('button').addEventListener('click', () => openVoidViewer(v))
        voidRingsEl.appendChild(wrap)
    })
}

// ── VOID Viewer ───────────────────────────────────────
function openVoidViewer(v) {
    const body = document.getElementById('voidViewerBody')
    const bar  = document.getElementById('voidViewerBar')
    const msLeft    = Math.max(0, v.expiresAt - Date.now())
    const displaySec = Math.min(Math.ceil(msLeft / 1000), 8)

    const typeLabel = v.type === 'manual' ? 'Manual VOID'
                    : v.type === 'streak'  ? 'Streak VOID'
                    : 'Auto VOID'

    body.innerHTML = `
      <span class="void-viewer__type">${typeLabel}</span>
      <span class="void-viewer__name">${window.escHtml(v.name)}</span>
      <p class="void-viewer__text">${window.escHtml(v.text)}</p>`

    bar.style.setProperty('--void-duration', `${displaySec}s`)
    bar.style.animation = 'none'
    bar.getBoundingClientRect()
    bar.style.animation = ''

    voidViewerEl.style.display = 'flex'
    clearTimeout(_viewerTimer)
    _viewerTimer = setTimeout(closeVoidViewer, displaySec * 1000)
}

function closeVoidViewer() {
    clearTimeout(_viewerTimer)
    voidViewerEl.style.display = 'none'
}

document.getElementById('closeVoidViewer')?.addEventListener('click', closeVoidViewer)
voidViewerEl?.addEventListener('click', e => {
    if (e.target === voidViewerEl) closeVoidViewer()
})

// ── VOID Composer ─────────────────────────────────────
function openComposer() {
    document.getElementById('voidComposerInput').value = ''
    voidComposerEl.style.display = 'block'
}

function closeComposer() {
    voidComposerEl.style.display = 'none'
}

document.getElementById('voidExpiryOpts')?.querySelectorAll('[data-expiry]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#voidExpiryOpts [data-expiry]').forEach(b => b.classList.remove('seg-btn--active'))
        btn.classList.add('seg-btn--active')
        _selectedExpiry = Number(btn.dataset.expiry)
    })
})

document.getElementById('postVoidBtn')?.addEventListener('click', openComposer)
document.getElementById('cancelVoidComposer')?.addEventListener('click', closeComposer)

document.getElementById('submitVoidComposer')?.addEventListener('click', () => {
    const text = document.getElementById('voidComposerInput').value.trim()
    if (!text) return
    window.socket.emit('postVoid', { text, expiresInMs: _selectedExpiry })
    closeComposer()
    window.showToast?.('VOID posted!', 'success')
})

// ── Masonry Card Rendering ────────────────────────────
function renderFeedCards(voids, serverCards) {
    Array.from(feedGridEl.children).forEach(c => {
        if (c.id !== 'feedEmpty') c.remove()
    })

    const items = []

    voids.forEach(v => items.push({ sortKey: v.expiresAt, el: buildMomentCard(v) }))
    serverCards.forEach(s => items.push({ sortKey: s.memberCount * 1000, el: buildServerCard(s) }))

    items.sort((a, b) => b.sortKey - a.sortKey)
    items.forEach(({ el }) => feedGridEl.appendChild(el))

    feedEmptyEl.style.display = items.length ? 'none' : 'block'
}

function buildMomentCard(v) {
    const card = document.createElement('div')
    card.className = 'feed-card feed-card--moment'
    const bgColor  = window.avatarColor ? window.avatarColor(v.name) : '#333'
    const initials = window.initials    ? window.initials(v.name)    : v.name.slice(0, 2).toUpperCase()
    const msLeft   = Math.max(0, v.expiresAt - Date.now())
    const hLeft    = Math.ceil(msLeft / 3_600_000)
    const expiryLabel = hLeft <= 1 ? '< 1h left' : `${hLeft}h left`
    const typeLabel   = v.type === 'streak' ? '🔥 Streak' : v.type === 'auto' ? '⚡ Auto' : '◈ VOID'

    card.innerHTML = `
      <div class="feed-card__meta">
        <div class="feed-card__av" style="background:${bgColor}">${initials}</div>
        <span class="feed-card__name">${window.escHtml(v.name)}</span>
      </div>
      <p class="feed-card__text">${window.escHtml(v.text)}</p>
      <span class="feed-card__pill">${typeLabel}</span>
      <span class="feed-card__pill feed-card__pill--expiry">${expiryLabel}</span>`

    card.addEventListener('click', () => openVoidViewer(v))
    return card
}

function buildServerCard(s) {
    const card = document.createElement('div')
    card.className = 'feed-card feed-card--server'
    card.innerHTML = `
      <div class="feed-card__title">#${window.escHtml(s.room)}</div>
      <div class="feed-card__members">● ${s.memberCount} active</div>
      ${s.lastMsg ? `<div class="feed-card__preview">"${window.escHtml(s.lastMsg)}…"</div>` : ''}`
    return card
}

// ── Socket Events ─────────────────────────────────────
window.socket.on('feedData', ({ voids, cards }) => {
    _activeVoids = voids || []
    _feedCards   = cards || []
    renderVoidRings(_activeVoids)
    renderFeedCards(_activeVoids, _feedCards)
})

window.socket.on('voidPosted', v => {
    _activeVoids = _activeVoids.filter(x => x.voidId !== v.voidId)
    _activeVoids.unshift(v)
    if (_feedOpen) {
        renderVoidRings(_activeVoids)
        renderFeedCards(_activeVoids, _feedCards)
    }
})

window.socket.on('voidAutoPost', v => {
    _activeVoids = _activeVoids.filter(x => x.voidId !== v.voidId)
    _activeVoids.unshift(v)
    if (_feedOpen) {
        renderVoidRings(_activeVoids)
        renderFeedCards(_activeVoids, _feedCards)
    }
    window.showToast?.(`⚡ ${v.name} is active today!`, 'info')
})

window.socket.on('voidExpired', ({ voidId }) => {
    _activeVoids = _activeVoids.filter(v => v.voidId !== voidId)
    const ring = voidRingsEl.querySelector(`[data-void-id="${window.escHtml(voidId)}"]`)
    ring?.closest('.void-ring-wrap')?.remove()
    if (_feedOpen) renderFeedCards(_activeVoids, _feedCards)
})
