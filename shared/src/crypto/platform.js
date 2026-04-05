import nodeCrypto from "crypto";

export function getCrypto() {
  if (globalThis.crypto?.subtle) return globalThis.crypto;
  return nodeCrypto.webcrypto;
}
