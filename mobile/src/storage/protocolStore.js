import { secureDelete, secureGetJson, secureSetJson } from "./secureStore";

const IDENTITY_KEY = "void.identity.privateState";
const BUNDLE_KEY = "void.identity.bundle";
const SESSION_PREFIX = "void.session.";

export async function saveIdentityState(state) {
  await secureSetJson(IDENTITY_KEY, state);
}

export async function loadIdentityState() {
  return secureGetJson(IDENTITY_KEY);
}

export async function saveBundle(bundle) {
  await secureSetJson(BUNDLE_KEY, bundle);
}

export async function loadBundle() {
  return secureGetJson(BUNDLE_KEY);
}

export async function saveSession(peerAlias, session) {
  await secureSetJson(`${SESSION_PREFIX}${peerAlias}`, session);
}

export async function loadSession(peerAlias) {
  return secureGetJson(`${SESSION_PREFIX}${peerAlias}`);
}

export async function deleteSession(peerAlias) {
  await secureDelete(`${SESSION_PREFIX}${peerAlias}`);
}
