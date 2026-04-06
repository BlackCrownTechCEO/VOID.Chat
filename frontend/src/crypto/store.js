const KEYS_STORAGE  = "void.identity.keys";
const BUNDLE_STORAGE = "void.identity.bundle";
const SESSION_PREFIX = "void.session.";

export function saveIdentityState(state)  { localStorage.setItem(KEYS_STORAGE, JSON.stringify(state)); }
export function loadIdentityState()        { const r = localStorage.getItem(KEYS_STORAGE);  return r ? JSON.parse(r) : null; }
export function saveBundle(bundle)         { localStorage.setItem(BUNDLE_STORAGE, JSON.stringify(bundle)); }
export function loadBundle()               { const r = localStorage.getItem(BUNDLE_STORAGE); return r ? JSON.parse(r) : null; }
export function saveSession(peer, session) { localStorage.setItem(SESSION_PREFIX + peer, JSON.stringify(session)); }
export function loadSession(peer)          { const r = localStorage.getItem(SESSION_PREFIX + peer); return r ? JSON.parse(r) : null; }
