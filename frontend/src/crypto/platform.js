export function getCrypto() {
  if (globalThis.crypto?.subtle) return globalThis.crypto;
  throw new Error("Web Crypto API not available");
}
