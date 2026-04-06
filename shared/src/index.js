export * from "./crypto/index.js";

export const APP_NAME = "VØID";

export function buildAlias(seed = "void-user") {
  const words = ["ghost", "echo", "shadow", "cipher", "nova", "void"];
  const a = words[seed.length % words.length];
  const b = words[(seed.charCodeAt(0) || 0) % words.length];
  return `@${a}-${b}-${seed.slice(0, 4)}`;
}
