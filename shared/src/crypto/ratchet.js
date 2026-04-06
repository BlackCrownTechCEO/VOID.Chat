import { getCrypto } from "./platform.js";
import { advanceChain } from "./kdf.js";
import { base64ToBytes, bytesToBase64, utf8ToBytes, bytesToUtf8 } from "./base64.js";

async function importAesKey(rawBytes) {
  const crypto = getCrypto();
  return crypto.subtle.importKey(
    "raw",
    rawBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptWithSession(session, plaintext) {
  const crypto = getCrypto();
  const chain = await advanceChain(base64ToBytes(session.sendChainKey));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await importAesKey(chain.messageKey.slice(0, 32));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    utf8ToBytes(plaintext)
  );

  const nextSession = {
    ...session,
    sendChainKey: bytesToBase64(chain.nextChainKey),
    sendCounter: session.sendCounter + 1
  };

  return {
    envelope: {
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      iv: bytesToBase64(iv),
      counter: nextSession.sendCounter
    },
    session: nextSession
  };
}

export async function decryptWithSession(session, envelope) {
  const crypto = getCrypto();
  const chain = await advanceChain(base64ToBytes(session.recvChainKey));
  const aesKey = await importAesKey(chain.messageKey.slice(0, 32));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    aesKey,
    base64ToBytes(envelope.ciphertext)
  );

  const nextSession = {
    ...session,
    recvChainKey: bytesToBase64(chain.nextChainKey),
    recvCounter: session.recvCounter + 1
  };

  return {
    plaintext: bytesToUtf8(new Uint8Array(plaintext)),
    session: nextSession
  };
}
