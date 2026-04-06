import { getCrypto } from "./platform.js";
import { base64ToBytes, bytesToBase64 } from "./base64.js";
import { deriveRootAndChains } from "./kdf.js";
import { importPublicAgreementKey, importPublicSigningKey, verifySignedPrekey } from "./keys.js";

async function deriveEcdh(privateKey, publicKey) {
  const crypto = getCrypto();
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  return new Uint8Array(bits);
}

async function generateEphemeralAgreement() {
  const crypto = getCrypto();
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
}

async function exportEphemeralPublic(keypairOrKey) {
  const crypto = getCrypto();
  const pubKey = keypairOrKey.publicKey ?? keypairOrKey;
  const raw = await crypto.subtle.exportKey("raw", pubKey);
  return bytesToBase64(new Uint8Array(raw));
}

export async function initiateSession({ identityKeys, remoteBundle }) {
  const signingPublic = await importPublicSigningKey(remoteBundle.identitySigningPublic);
  const valid = await verifySignedPrekey(signingPublic, remoteBundle.signedPrekeyPublic, remoteBundle.signedPrekeySignature);
  if (!valid) throw new Error("Invalid signed prekey signature");

  const remoteIdentityAgreement = await importPublicAgreementKey(remoteBundle.identityAgreementPublic);
  const remoteSignedPrekey = await importPublicAgreementKey(remoteBundle.signedPrekeyPublic);
  const remoteOneTimePrekey = await importPublicAgreementKey(remoteBundle.oneTimePrekeyPublic);
  const ephemeral = await generateEphemeralAgreement();

  const dh1 = await deriveEcdh(identityKeys.agreement.privateKey, remoteSignedPrekey);
  const dh2 = await deriveEcdh(ephemeral.privateKey, remoteIdentityAgreement);
  const dh3 = await deriveEcdh(ephemeral.privateKey, remoteSignedPrekey);
  const dh4 = await deriveEcdh(ephemeral.privateKey, remoteOneTimePrekey);

  const master = new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4]);
  const { rootKey, sendChainKey, recvChainKey } = await deriveRootAndChains(master);

  return {
    header: {
      senderIdentityAgreementPublic: await exportEphemeralPublic(identityKeys.agreement),
      senderEphemeralPublic: await exportEphemeralPublic(ephemeral)
    },
    session: {
      role: "initiator",
      rootKey: bytesToBase64(rootKey),
      sendChainKey: bytesToBase64(sendChainKey),
      recvChainKey: bytesToBase64(recvChainKey),
      sendCounter: 0,
      recvCounter: 0
    }
  };
}

export async function receiveSession({ identityPrivateState, senderHeader, senderIdentityPublic }) {
  const senderIdentityAgreement = await importPublicAgreementKey(senderIdentityPublic);
  const senderEphemeral = await importPublicAgreementKey(senderHeader.senderEphemeralPublic);

  const dh1 = await deriveEcdh(identityPrivateState.signedPrekey.privateKey, senderIdentityAgreement);
  const dh2 = await deriveEcdh(identityPrivateState.agreement.privateKey, senderEphemeral);
  const dh3 = await deriveEcdh(identityPrivateState.signedPrekey.privateKey, senderEphemeral);
  const dh4 = await deriveEcdh(identityPrivateState.oneTimePrekey.privateKey, senderEphemeral);

  const master = new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4]);
  const { rootKey, sendChainKey, recvChainKey } = await deriveRootAndChains(master);

  return {
    role: "responder",
    rootKey: bytesToBase64(rootKey),
    sendChainKey: bytesToBase64(recvChainKey),
    recvChainKey: bytesToBase64(sendChainKey),
    sendCounter: 0,
    recvCounter: 0
  };
}
