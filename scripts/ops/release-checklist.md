# Release Checklist

## Security
- [ ] Secrets are only in env / secret manager
- [ ] No plaintext private keys in browser storage
- [ ] Rate limiting enabled
- [ ] Health / readiness endpoints enabled
- [ ] Logs redact sensitive fields

## Reliability
- [ ] Redis reachable
- [ ] Supabase reachable
- [ ] Relay endpoints healthy
- [ ] Retry logic enabled
- [ ] Rollback image tag prepared

## Product
- [ ] Mobile points to production API
- [ ] Push notifications wake only, no content
- [ ] App privacy policy published
- [ ] Terms / abuse controls enabled
