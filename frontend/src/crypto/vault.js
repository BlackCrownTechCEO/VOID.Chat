// E2EE Vault — passphrase-derived AES-256-GCM channel encryption
// Server receives only opaque ciphertext; never sees plaintext.

import { base64ToBytes, bytesToBase64, utf8ToBytes, bytesToUtf8 } from "./base64.js";

const VAULT_STORE = "void.vaults";

function getVaults() {
  try { return JSON.parse(localStorage.getItem(VAULT_STORE) || "{}"); } catch { return {}; }
}
function saveVaults(v) { localStorage.setItem(VAULT_STORE, JSON.stringify(v)); }

// Derive a 256-bit AES key from a passphrase + vault name as salt
export async function deriveVaultKey(passphrase, vaultName) {
  const subtle = crypto.subtle;
  const raw = await subtle.importKey("raw", utf8ToBytes(passphrase), "PBKDF2", false, ["deriveBits","deriveKey"]);
  return subtle.deriveKey(
    { name:"PBKDF2", salt: utf8ToBytes("VOID:vault:" + vaultName), iterations: 100_000, hash:"SHA-256" },
    raw,
    { name:"AES-GCM", length:256 },
    false,
    ["encrypt","decrypt"]
  );
}

export async function encryptVaultMessage(passphrase, vaultName, plaintext) {
  const key = await deriveVaultKey(passphrase, vaultName);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, utf8ToBytes(plaintext));
  return {
    ciphertext: bytesToBase64(new Uint8Array(enc)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptVaultMessage(passphrase, vaultName, envelope) {
  try {
    const key = await deriveVaultKey(passphrase, vaultName);
    const pt  = await crypto.subtle.decrypt(
      { name:"AES-GCM", iv: base64ToBytes(envelope.iv) },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    return bytesToUtf8(new Uint8Array(pt));
  } catch {
    return "[Encrypted — wrong key or corrupt]";
  }
}

// Vault registry stored in localStorage
export function listVaults() {
  const vaults = getVaults();
  return Object.values(vaults);
}

export function registerVault(id, name, passphrase) {
  const vaults = getVaults();
  vaults[id] = { id, name, passphrase };
  saveVaults(vaults);
}

export function getVaultPassphrase(id) {
  return getVaults()[id]?.passphrase || null;
}

export function removeVault(id) {
  const vaults = getVaults();
  delete vaults[id];
  saveVaults(vaults);
}
