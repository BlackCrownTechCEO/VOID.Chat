import { getCrypto } from "./platform.js";

function normalize(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input);
}

export async function hkdf(ikm, salt, info, length = 32) {
  const crypto = getCrypto();
  const ikmKey = await crypto.subtle.importKey("raw", normalize(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: normalize(salt), info: normalize(info) },
    ikmKey,
    length * 8
  );
  return new Uint8Array(bits);
}

export async function deriveRootAndChains(sharedSecret) {
  const zero = new Uint8Array(32);
  const expanded = await hkdf(sharedSecret, zero, new TextEncoder().encode("VOID_X3DH_ROOT"), 96);
  return {
    rootKey: expanded.slice(0, 32),
    sendChainKey: expanded.slice(32, 64),
    recvChainKey: expanded.slice(64, 96)
  };
}

export async function advanceChain(chainKey) {
  const next = await hkdf(chainKey, new Uint8Array(32), new TextEncoder().encode("VOID_CHAIN_NEXT"), 64);
  return {
    nextChainKey: next.slice(0, 32),
    messageKey: next.slice(32, 64)
  };
}
