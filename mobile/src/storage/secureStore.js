import * as SecureStore from "expo-secure-store";

const OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false
};

export async function secureSetJson(key, value, options = {}) {
  await SecureStore.setItemAsync(key, JSON.stringify(value), { ...OPTIONS, ...options });
}

export async function secureGetJson(key) {
  const raw = await SecureStore.getItemAsync(key, OPTIONS);
  return raw ? JSON.parse(raw) : null;
}

export async function secureDelete(key) {
  await SecureStore.deleteItemAsync(key, OPTIONS);
}

export async function secureSetString(key, value, options = {}) {
  await SecureStore.setItemAsync(key, value, { ...OPTIONS, ...options });
}

export async function secureGetString(key) {
  return SecureStore.getItemAsync(key, OPTIONS);
}
