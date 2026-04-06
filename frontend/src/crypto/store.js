const KEYS_STORAGE = "void.identity.keys";
const BUNDLE_STORAGE = "void.identity.bundle";
const SESSION_PREFIX = "void.session.";

export function saveIdentityState(state) {
  localStorage.setItem(KEYS_STORAGE, JSON.stringify(state));
}

export function loadIdentityState() {
  const raw = localStorage.getItem(KEYS_STORAGE);
  return raw ? JSON.parse(raw) : null;
}

export function saveBundle(bundle) {
  localStorage.setItem(BUNDLE_STORAGE, JSON.stringify(bundle));
}

export function loadBundle() {
  const raw = localStorage.getItem(BUNDLE_STORAGE);
  return raw ? JSON.parse(raw) : null;
}

export function saveSession(peerAlias, session) {
  localStorage.setItem(SESSION_PREFIX + peerAlias, JSON.stringify(session));
}

export function loadSession(peerAlias) {
  const raw = localStorage.getItem(SESSION_PREFIX + peerAlias);
  return raw ? JSON.parse(raw) : null;
}
