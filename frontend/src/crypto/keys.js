import { getCrypto } from "./platform.js";
import { bytesToBase64, base64ToBytes } from "./base64.js";

export async function generateIdentity() {
  const crypto = getCrypto();
  const agreement = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const signing = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const signedPrekey = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const oneTimePrekey = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { agreement, signing, signedPrekey, oneTimePrekey };
}

export async function exportPublicKey(key) {
  const crypto = getCrypto();
  const raw = await crypto.subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importPublicAgreementKey(base64) {
  const crypto = getCrypto();
  return crypto.subtle.importKey("raw", base64ToBytes(base64), { name: "ECDH", namedCurve: "P-256" }, true, []);
}

export async function importPublicSigningKey(base64) {
  const crypto = getCrypto();
  return crypto.subtle.importKey("raw", base64ToBytes(base64), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
}

export async function exportPrivateKeyJwk(key) {
  const crypto = getCrypto();
  return crypto.subtle.exportKey("jwk", key);
}

export async function importPrivateAgreementJwk(jwk) {
  const crypto = getCrypto();
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
}

export async function importPrivateSigningJwk(jwk) {
  const crypto = getCrypto();
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
}

export async function signSignedPrekey(signingPrivateKey, signedPrekeyPublicBase64) {
  const crypto = getCrypto();
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingPrivateKey,
    base64ToBytes(signedPrekeyPublicBase64)
  );
  return bytesToBase64(new Uint8Array(signature));
}

export async function verifySignedPrekey(signingPublicKey, signedPrekeyPublicBase64, signatureBase64) {
  const crypto = getCrypto();
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    signingPublicKey,
    base64ToBytes(signatureBase64),
    base64ToBytes(signedPrekeyPublicBase64)
  );
}

export async function exportIdentityBundle(keys) {
  const identityAgreementPublic = await exportPublicKey(keys.agreement.publicKey);
  const identitySigningPublic = await exportPublicKey(keys.signing.publicKey);
  const signedPrekeyPublic = await exportPublicKey(keys.signedPrekey.publicKey);
  const oneTimePrekeyPublic = await exportPublicKey(keys.oneTimePrekey.publicKey);
  const signedPrekeySignature = await signSignedPrekey(keys.signing.privateKey, signedPrekeyPublic);
  return { identityAgreementPublic, identitySigningPublic, signedPrekeyPublic, signedPrekeySignature, oneTimePrekeyPublic };
}

export async function exportIdentityPrivateState(keys) {
  return {
    agreementPrivateJwk: await exportPrivateKeyJwk(keys.agreement.privateKey),
    signingPrivateJwk: await exportPrivateKeyJwk(keys.signing.privateKey),
    signedPrekeyPrivateJwk: await exportPrivateKeyJwk(keys.signedPrekey.privateKey),
    oneTimePrekeyPrivateJwk: await exportPrivateKeyJwk(keys.oneTimePrekey.privateKey)
  };
}

export async function importIdentityPrivateState(state) {
  const crypto = getCrypto();
  const agreementPrivateKey = await importPrivateAgreementJwk(state.agreementPrivateJwk);
  const signingPrivateKey = await importPrivateSigningJwk(state.signingPrivateJwk);
  const signedPrekeyPrivateKey = await importPrivateAgreementJwk(state.signedPrekeyPrivateJwk);
  const oneTimePrekeyPrivateKey = await importPrivateAgreementJwk(state.oneTimePrekeyPrivateJwk);
  const agreementPublicKey = await crypto.subtle.importKey(
    "jwk",
    { ...state.agreementPrivateJwk, key_ops: [], d: undefined },
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  ).catch(() => null);
  return {
    agreement: { privateKey: agreementPrivateKey, publicKey: agreementPublicKey },
    signing: { privateKey: signingPrivateKey, publicKey: null },
    signedPrekey: { privateKey: signedPrekeyPrivateKey, publicKey: null },
    oneTimePrekey: { privateKey: oneTimePrekeyPrivateKey, publicKey: null }
  };
}
