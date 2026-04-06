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
import {
  loadBundle,
  loadIdentityState,
  saveBundle,
  saveIdentityState,
  loadSession,
  saveSession
} from "../storage/protocolStore";

export async function ensureIdentity() {
  let privateState = await loadIdentityState();
  let bundle = await loadBundle();

  if (!privateState || !bundle) {
    const keys = await generateIdentity();
    bundle = await exportIdentityBundle(keys);
    privateState = await exportIdentityPrivateState(keys);
    await saveIdentityState(privateState);
    await saveBundle(bundle);
  }

  return { privateState, bundle };
}

export async function registerBundle(apiUrl, alias) {
  const { bundle } = await ensureIdentity();
  const res = await fetch(`${apiUrl}/api/keys/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias, bundle })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Bundle registration failed" }));
    throw new Error(data.error || "Bundle registration failed");
  }

  return bundle;
}

export async function createEncryptedOutgoing(apiUrl, fromAlias, toAlias, plaintext) {
  const { privateState, bundle } = await ensureIdentity();
  const identityPrivateState = await importIdentityPrivateState(privateState);
  let session = await loadSession(toAlias);
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
      mode: "prekey"
    };
  } else {
    header = { mode: "session" };
  }

  const encrypted = await encryptWithSession(session, plaintext);
  await saveSession(toAlias, encrypted.session);

  return {
    header,
    senderBundle: bundle,
    envelope: encrypted.envelope
  };
}

export async function decryptIncoming(fromAlias, payload) {
  const { privateState } = await ensureIdentity();
  const identityPrivateState = await importIdentityPrivateState(privateState);
  let session = await loadSession(fromAlias);

  if (!session) {
    if (payload.header?.mode !== "prekey" || !payload.senderBundle?.identityAgreementPublic) {
      throw new Error("Missing bootstrap data");
    }

    session = await receiveSession({
      identityPrivateState,
      senderHeader: payload.header,
      senderIdentityPublic: payload.senderBundle.identityAgreementPublic
    });
  }

  const decrypted = await decryptWithSession(session, payload.envelope);
  await saveSession(fromAlias, decrypted.session);
  return decrypted.plaintext;
}
