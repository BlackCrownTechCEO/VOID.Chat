import {
  generateIdentity,
  exportIdentityBundle,
  exportIdentityPrivateState,
  importIdentityPrivateState,
  initiateSession,
  receiveSession,
  encryptWithSession,
  decryptWithSession
} from "@void/shared";
import { loadBundle, loadIdentityState, saveBundle, saveIdentityState, loadSession, saveSession } from "./store.js";

export async function ensureIdentity() {
  let privateState = loadIdentityState();
  let bundle = loadBundle();

  if (!privateState || !bundle) {
    const keys = await generateIdentity();
    bundle = await exportIdentityBundle(keys);
    privateState = await exportIdentityPrivateState(keys);
    saveIdentityState(privateState);
    saveBundle(bundle);
  }

  return { privateState, bundle };
}

export async function registerBundle(apiUrl, alias) {
  const { bundle } = await ensureIdentity();
  await fetch(`${apiUrl}/api/keys/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias, bundle })
  });
  return bundle;
}

export async function createEncryptedOutgoing(apiUrl, fromAlias, toAlias, plaintext) {
  const { privateState } = await ensureIdentity();
  const identityPrivateState = await importIdentityPrivateState(privateState);
  let session = loadSession(toAlias);
  let header = null;

  if (!session) {
    const res = await fetch(`${apiUrl}/api/keys/${encodeURIComponent(toAlias)}`);
    if (!res.ok) throw new Error("Peer alias is not registered");
    const remote = await res.json();
    const init = await initiateSession({
      identityKeys: identityPrivateState,
      remoteBundle: remote.bundle
    });
    session = init.session;
    header = {
      ...init.header,
      senderIdentityPublic: remote.bundle.identityAgreementPublic,
      mode: "prekey"
    };
  } else {
    header = { mode: "session" };
  }

  const encrypted = await encryptWithSession(session, plaintext);
  saveSession(toAlias, encrypted.session);

  return {
    header,
    envelope: encrypted.envelope
  };
}

export async function decryptIncoming(fromAlias, payload) {
  const { privateState } = await ensureIdentity();
  const identityPrivateState = await importIdentityPrivateState(privateState);
  let session = loadSession(fromAlias);

  if (!session) {
    if (payload.header?.mode !== "prekey" || !payload.senderBundle?.identityAgreementPublic) {
      throw new Error("Missing session and bootstrap data");
    }

    session = await receiveSession({
      identityPrivateState,
      senderHeader: payload.header,
      senderIdentityPublic: payload.senderBundle.identityAgreementPublic
    });
  }

  const decrypted = await decryptWithSession(session, payload.envelope);
  saveSession(fromAlias, decrypted.session);
  return decrypted.plaintext;
}
