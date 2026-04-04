// ═══════════════════════════════════════════════════════
//  feed.js — VOID v7  ·  Activity Feed + VOIDs + FlashVoids
//  Loaded after app.js
// ═══════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────
let _feedOpen       = false
let _activeVoids    = []
let _feedCards      = []
let _feedFlashes    = []
let _viewerTimer    = null
let _selectedExpiry = 3_600_000
let _voidAttach     = null
let _flashAttach    = null
let _flashExpiry    = 0

const MAX_FEED_BYTES = 5_242_880  // 5 MB

// ── DOM refs ──────────────────────────────────────────
const feedOverlay     = document.getElementById('feedOverlay')
const voidRingsEl     = document.getElementById('voidRings')
const feedGridEl      = document.getElementById('feedGrid')
const feedEmptyEl     = document.getElementById('feedEmpty')
const voidViewerEl    = document.getElementById('voidViewer')
const flashViewerEl   = document.getElementById('flashViewer')
const voidComposerEl  = document.getElementById('voidComposer')
const flashComposerEl = document.getElementById('flashComposer')

// ── Open / Close Feed ─────────────────────────────────
function openFeed() {
    _feedOpen = true
    feedOverlay.style.display = 'flex'
    window.socket.emit('getFeed')
}

function closeFeed() {
    _feedOpen = false
    feedOverlay.style.display = 'none'
    closeVoidViewer()
    closeFlashViewer()
    closeComposer()
    closeFlashComposer()
}

window.openFeed  = openFeed
window.closeFeed = closeFeed

// ── Entry point buttons ───────────────────────────────
document.getElementById('openFeedBtn')?.addEventListener('click', openFeed)
document.getElementById('openFeedBtnM')?.addEventListener('click', openFeed)
document.getElementById('closeFeedBtn')?.addEventListener('click', closeFeed)

// ── Render VOID Rings ─────────────────────────────────
function renderVoidRings(voids) {
    // Remove only dynamic rings (not the static My VOID + FlashVoid buttons)
    voidRingsEl.querySelectorAll('.void-ring-wrap:not(.void-ring-wrap--static)')
        .forEach(el => el.remove())

    // Flash rings first (appear right after static buttons)
    _feedFlashes.forEach(f => {
        const wrap = document.createElement('div')
        wrap.className = 'void-ring-wrap'
        const thumbHtml = f.vfThumb
            ? `<img src="${window.escHtml(f.vfThumb)}" class="void-ring__flash-thumb" alt="">`
            : `<span class="void-ring__av void-ring__av--flash">⚡</span>`
        wrap.innerHTML = `
          <button class="void-ring void-ring--flash" data-flash-id="${window.escHtml(f.flashId)}">
            ${thumbHtml}
          </button>
          <span class="void-ring__name">${window.escHtml(f.name)}</span>`
        wrap.querySelector('button').addEventListener('click', () => openFlashViewer(f))
        voidRingsEl.appendChild(wrap)
    })

    // VOID rings
    voids.forEach(v => {
        const wrap = document.createElement('div')
        wrap.className = 'void-ring-wrap'
        const ringClass = v.type === 'manual' ? 'void-ring--manual'
                        : v.type === 'streak'  ? 'void-ring--streak'
                        : 'void-ring--auto'
        const bgColor  = window.avatarColor ? window.avatarColor(v.name) : '#333'
        const initials = window.initials    ? window.initials(v.name)    : v.name.slice(0, 2).toUpperCase()
        const avHtml   = v.attach?.mimeType?.startsWith('image/')
            ? `<img src="${window.escHtml(v.attach.dataUrl)}" class="void-ring__flash-thumb" alt="">`
            : `<span class="void-ring__av" style="background:${bgColor}">${initials}</span>`
        wrap.innerHTML = `
          <button class="void-ring ${ringClass}" data-void-id="${window.escHtml(v.voidId)}">
            ${avHtml}
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
    const msLeft     = Math.max(0, v.expiresAt - Date.now())
    const displaySec = Math.min(Math.ceil(msLeft / 1000), 8)

    const typeLabel = v.type === 'manual' ? 'Manual VOID'
                    : v.type === 'streak'  ? 'Streak VOID'
                    : 'Auto VOID'

    const imgHtml = v.attach?.mimeType?.startsWith('image/')
        ? `<img src="${window.escHtml(v.attach.dataUrl)}" class="void-viewer__media" alt=""
             onclick="window.openLightbox && window.openLightbox(this.src)">`
        : ''

    body.innerHTML = `
      <span class="void-viewer__type">${typeLabel}</span>
      <span class="void-viewer__name">${window.escHtml(v.name)}</span>
      ${imgHtml}
      ${v.text ? `<p class="void-viewer__text">${window.escHtml(v.text)}</p>` : ''}`

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

// ── Flash Viewer ──────────────────────────────────────
let _flashBurnTimer = null
let _flashBurnInterval = null

function openFlashViewer(flash) {
    const body    = document.getElementById('flashViewerBody')
    const bar     = document.getElementById('flashViewerBar')
    const burning = document.getElementById('flashViewerBurning')

    const imgHtml = flash.attach?.mimeType?.startsWith('image/')
        ? `<img src="${window.escHtml(flash.attach.dataUrl)}" class="void-viewer__media" alt="">`
        : ''
    const textHtml = flash.text ? `<p class="void-viewer__text">${window.escHtml(flash.text)}</p>` : ''

    body.innerHTML = `
      <span class="void-viewer__type">⚡ FlashVoid from ${window.escHtml(flash.name)}</span>
      ${imgHtml}
      ${textHtml}`

    flashViewerEl.style.display = 'flex'

    if (flash.vfExpiry === 0) {
        // View-once: show for 3s then delete
        burning.style.display = 'block'
        burning.textContent = '🔥 View once — deleting after you close…'
        bar.style.setProperty('--void-duration', '3s')
        bar.style.animation = 'none'; bar.getBoundingClientRect(); bar.style.animation = ''
        _flashBurnTimer = setTimeout(() => deleteFlash(flash), 3000)
    } else {
        // Timed: countdown then delete
        burning.style.display = 'block'
        burning.textContent = '🔥 Burning…'
        const ms = flash.vfExpiry
        let remaining = ms
        bar.style.setProperty('--void-duration', `${ms / 1000}s`)
        bar.style.animation = 'none'; bar.getBoundingClientRect(); bar.style.animation = ''
        _flashBurnInterval = setInterval(() => {
            remaining -= 100
            if (remaining <= 0) {
                clearInterval(_flashBurnInterval)
                deleteFlash(flash)
            }
        }, 100)
    }
}

function deleteFlash(flash) {
    clearTimeout(_flashBurnTimer)
    clearInterval(_flashBurnInterval)
    closeFlashViewer()
    window.socket.emit('feedFlashOpened', { flashId: flash.flashId })
}

function closeFlashViewer() {
    clearTimeout(_flashBurnTimer)
    clearInterval(_flashBurnInterval)
    flashViewerEl.style.display = 'none'
}

document.getElementById('closeFlashViewer')?.addEventListener('click', closeFlashViewer)
flashViewerEl?.addEventListener('click', e => {
    if (e.target === flashViewerEl) closeFlashViewer()
})

// ── VOID Composer ─────────────────────────────────────
function openComposer() {
    document.getElementById('voidComposerInput').value = ''
    clearVoidAttach()
    voidComposerEl.style.display = 'block'
}

function closeComposer() {
    voidComposerEl.style.display = 'none'
    clearVoidAttach()
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

// VOID media attach
const voidMediaPicker = document.getElementById('voidMediaPicker')
document.getElementById('voidMediaBtn')?.addEventListener('click', () => voidMediaPicker?.click())
document.getElementById('voidMediaRemove')?.addEventListener('click', clearVoidAttach)

voidMediaPicker?.addEventListener('change', () => {
    const file = voidMediaPicker.files[0]; if (!file) return
    voidMediaPicker.value = ''
    if (file.size > MAX_FEED_BYTES) { window.showToast?.('Image too large — max 5 MB', 'error'); return }
    const reader = new FileReader()
    reader.onload = ev => {
        _voidAttach = { name: file.name, mimeType: file.type || 'image/jpeg', dataUrl: ev.target.result }
        document.getElementById('voidMediaImg').src = ev.target.result
        document.getElementById('voidMediaPreview').style.display = 'flex'
    }
    reader.readAsDataURL(file)
})

function clearVoidAttach() {
    _voidAttach = null
    const prev = document.getElementById('voidMediaPreview')
    if (prev) prev.style.display = 'none'
    const img = document.getElementById('voidMediaImg')
    if (img) img.src = ''
}

document.getElementById('submitVoidComposer')?.addEventListener('click', () => {
    const text = document.getElementById('voidComposerInput').value.trim()
    if (!text && !_voidAttach) return
    window.socket.emit('postVoid', { text, attach: _voidAttach, expiresInMs: _selectedExpiry })
    closeComposer()
    window.showToast?.('VOID posted!', 'success')
})

// ── FlashVoid Composer ────────────────────────────────
function openFlashComposer() {
    document.getElementById('flashComposerInput').value = ''
    clearFlashAttach()
    // Reset timer
    document.querySelectorAll('#flashTimerOpts .vf-timer').forEach(b => b.classList.remove('vf-timer--active'))
    document.querySelector('#flashTimerOpts .vf-timer[data-fms="0"]')?.classList.add('vf-timer--active')
    _flashExpiry = 0
    flashComposerEl.style.display = 'block'
}

function closeFlashComposer() {
    flashComposerEl.style.display = 'none'
    clearFlashAttach()
}

document.getElementById('postFlashBtn')?.addEventListener('click', openFlashComposer)
document.getElementById('cancelFlashComposer')?.addEventListener('click', closeFlashComposer)

// Flash timer chips
document.querySelectorAll('#flashTimerOpts .vf-timer').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#flashTimerOpts .vf-timer').forEach(b => b.classList.remove('vf-timer--active'))
        btn.classList.add('vf-timer--active')
        _flashExpiry = parseInt(btn.dataset.fms) || 0
    })
})

// Flash media attach
const flashMediaPicker = document.getElementById('flashMediaPicker')
document.getElementById('flashMediaBtn')?.addEventListener('click', () => flashMediaPicker?.click())
document.getElementById('flashMediaRemove')?.addEventListener('click', clearFlashAttach)

flashMediaPicker?.addEventListener('change', () => {
    const file = flashMediaPicker.files[0]; if (!file) return
    flashMediaPicker.value = ''
    if (file.size > MAX_FEED_BYTES) { window.showToast?.('Image too large — max 5 MB', 'error'); return }
    const reader = new FileReader()
    reader.onload = ev => {
        _flashAttach = { name: file.name, mimeType: file.type || 'image/jpeg', dataUrl: ev.target.result }
        document.getElementById('flashMediaImg').src = ev.target.result
        document.getElementById('flashMediaPreview').style.display = 'flex'
        // Generate 32px thumb for ring preview
        makeFlashThumb(ev.target.result).then(t => { _flashAttach.thumb = t })
    }
    reader.readAsDataURL(file)
})

function clearFlashAttach() {
    _flashAttach = null
    const prev = document.getElementById('flashMediaPreview')
    if (prev) prev.style.display = 'none'
    const img = document.getElementById('flashMediaImg')
    if (img) img.src = ''
}

function makeFlashThumb(dataUrl) {
    return new Promise(resolve => {
        try {
            const c = document.createElement('canvas')
            c.width = 48; c.height = 48
            const img = new Image()
            img.onload = () => {
                try { c.getContext('2d').drawImage(img, 0, 0, 48, 48) } catch (_) {}
                resolve(c.toDataURL('image/jpeg', 0.5))
            }
            img.onerror = () => resolve(null)
            img.src = dataUrl
        } catch (_) { resolve(null) }
    })
}

document.getElementById('submitFlashComposer')?.addEventListener('click', async () => {
    const text = document.getElementById('flashComposerInput').value.trim()
    if (!text && !_flashAttach) { window.showToast?.('Add a caption or image', 'warn'); return }
    const vfThumb = _flashAttach ? (_flashAttach.thumb || await makeFlashThumb(_flashAttach.dataUrl)) : null
    window.socket.emit('postFeedFlash', {
        text,
        attach: _flashAttach ? { name: _flashAttach.name, mimeType: _flashAttach.mimeType, dataUrl: _flashAttach.dataUrl } : null,
        vfExpiry: _flashExpiry,
        vfThumb
    })
    closeFlashComposer()
    window.showToast?.('⚡ FlashVoid sent!', 'success')
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

    const imgHtml = v.attach?.mimeType?.startsWith('image/')
        ? `<img src="${window.escHtml(v.attach.dataUrl)}" class="feed-card__img" alt=""
             onclick="window.openLightbox && window.openLightbox(this.src)">`
        : ''

    card.innerHTML = `
      <div class="feed-card__meta">
        <div class="feed-card__av" style="background:${bgColor}">${initials}</div>
        <span class="feed-card__name">${window.escHtml(v.name)}</span>
      </div>
      ${imgHtml}
      ${v.text ? `<p class="feed-card__text">${window.escHtml(v.text)}</p>` : ''}
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
window.socket.on('feedData', ({ voids, cards, flashes }) => {
    _activeVoids  = voids   || []
    _feedCards    = cards   || []
    _feedFlashes  = flashes || []
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
    if (_feedOpen) {
        renderVoidRings(_activeVoids)
        renderFeedCards(_activeVoids, _feedCards)
    }
})

window.socket.on('feedFlashPosted', flash => {
    _feedFlashes = _feedFlashes.filter(f => f.flashId !== flash.flashId)
    _feedFlashes.unshift(flash)
    if (_feedOpen) renderVoidRings(_activeVoids)
    window.showToast?.(`⚡ ${window.escHtml(flash.name)} posted a FlashVoid`, 'info')
})

window.socket.on('feedFlashExpired', ({ flashId }) => {
    _feedFlashes = _feedFlashes.filter(f => f.flashId !== flashId)
    if (_feedOpen) renderVoidRings(_activeVoids)
})
