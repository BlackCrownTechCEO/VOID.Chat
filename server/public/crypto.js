// ═══════════════════════════════════════════════════════
//  crypto.js — VOID v6  ·  WebCrypto E2E encryption
// ═══════════════════════════════════════════════════════
;(async () => {

const KEY_STORE = 'voidE2EKey'

let _privKey   = null   // CryptoKey (ECDH private, non-extractable)
let _pubKeyB64 = null   // base64 public key (shared with server)
const _sharedKeys = new Map()  // voidId → CryptoKey (AES-GCM)
const _roomKeys   = new Map()  // roomId  → CryptoKey (AES-GCM)

// ── Helpers ──────────────────────────────────────────────
function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))) }
function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)) }

// ── Key pair: generate or restore from localStorage ──────
async function init() {
    const stored = localStorage.getItem(KEY_STORE)
    if (stored) {
        try {
            const { pub, priv } = JSON.parse(stored)
            const pair = await crypto.subtle.importKey(
                'jwk', priv,
                { name: 'ECDH', namedCurve: 'P-256' },
                false, ['deriveKey']
            )
            _privKey   = pair
            _pubKeyB64 = pub
            return
        } catch (_) { /* fall through to regenerate */ }
    }
    await regenerate()
}

async function regenerate() {
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true, ['deriveKey']
    )
    _privKey = pair.privateKey
    const pubJwk  = await crypto.subtle.exportKey('jwk', pair.publicKey)
    const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    _pubKeyB64 = btoa(JSON.stringify(pubJwk))
    localStorage.setItem(KEY_STORE, JSON.stringify({ pub: _pubKeyB64, priv: privJwk }))
    _sharedKeys.clear()
    _roomKeys.clear()
}

function getPublicKeyB64() { return _pubKeyB64 }

// ── Derive shared AES-GCM key from their ECDH public key ─
async function deriveSharedKey(theirPubB64) {
    if (_sharedKeys.has(theirPubB64)) return _sharedKeys.get(theirPubB64)
    const theirJwk = JSON.parse(atob(theirPubB64))
    const theirKey = await crypto.subtle.importKey(
        'jwk', theirJwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        false, []
    )
    const shared = await crypto.subtle.deriveKey(
        { name: 'ECDH', public: theirKey },
        _privKey,
        { name: 'AES-GCM', length: 256 },
        false, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    )
    _sharedKeys.set(theirPubB64, shared)
    return shared
}

// ── AES-GCM encrypt / decrypt ────────────────────────────
async function encryptMsg(text, key) {
    const iv  = crypto.getRandomValues(new Uint8Array(12))
    const enc = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(text)
    )
    return { ciphertext: b64(enc), iv: b64(iv) }
}

async function decryptMsg(ciphertext, iv, key) {
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(iv) },
        key,
        unb64(ciphertext)
    )
    return new TextDecoder().decode(plain)
}

// ── Room key: generate, wrap (for distribution), unwrap ──
async function generateRoomKey() {
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

async function wrapRoomKey(roomKey, sharedKey) {
    const iv  = crypto.getRandomValues(new Uint8Array(12))
    const raw = await crypto.subtle.exportKey('raw', roomKey)
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, raw)
    return b64(iv) + '.' + b64(wrapped)
}

async function unwrapRoomKey(packet, sharedKey) {
    const [ivB64, wrappedB64] = packet.split('.')
    const raw = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(ivB64) },
        sharedKey,
        unb64(wrappedB64)
    )
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function setRoomKey(roomId, key)  { _roomKeys.set(roomId, key) }
function getRoomKey(roomId)       { return _roomKeys.get(roomId) || null }
function clearRoomKey(roomId)     { _roomKeys.delete(roomId) }

// ── Expose ───────────────────────────────────────────────
window.VoidCrypto = {
    init, regenerate,
    getPublicKeyB64,
    deriveSharedKey,
    encryptMsg, decryptMsg,
    generateRoomKey, wrapRoomKey, unwrapRoomKey,
    setRoomKey, getRoomKey, clearRoomKey
}

})()
