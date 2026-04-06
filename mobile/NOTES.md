# Integration notes

## Polyfill order
`mobile/index.js` imports `./src/polyfills` before app code. This is critical.

## Expo Go
This setup is intended for a native development build, not plain Expo Go.

## Next hardening step
Move from JSON/JWK export persistence to:
- non-exportable keys where possible
- hardware-backed secrets
- a smaller session serialization surface
