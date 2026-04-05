// ═══════════════════════════════════════════════════════
//  sw.js — VOID Service Worker  ·  PWA offline shell
// ═══════════════════════════════════════════════════════

const CACHE  = 'void-v12'
const STATIC = [
    '/',
    '/style.css',
    '/app.js',
    '/auth.js',
    '/crypto.js',
    '/settings.js',
    '/dms.js',
    '/voidflashes.js',
    '/friends.js',
    '/groups.js',
    '/servers.js',
    '/feed.js',
    '/manifest.json'
]

// ── Install: pre-cache static shell ──────────────────
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(STATIC))
            .then(() => self.skipWaiting())
    )
})

// ── Activate: purge old caches ────────────────────────
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    )
})

// ── Fetch: network-first, fallback to cache ───────────
self.addEventListener('fetch', e => {
    // Never intercept Socket.IO / WebSocket requests
    if (e.request.url.includes('/socket.io')) return

    // Network-first for navigation (HTML)
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request)
                .catch(() => caches.match('/'))
        )
        return
    }

    // Cache-first for static assets
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached
            return fetch(e.request).then(res => {
                // Cache successful GET responses for static assets
                if (res.ok && e.request.method === 'GET') {
                    const clone = res.clone()
                    caches.open(CACHE).then(c => c.put(e.request, clone))
                }
                return res
            })
        })
    )
})
