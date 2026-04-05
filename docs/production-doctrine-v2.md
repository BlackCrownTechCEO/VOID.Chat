# Production Doctrine v2

## Principles
- zero plaintext message logging
- fail closed on secret/config errors
- separate app, queue, and proxy concerns
- health before scale

## Recommended topology
- 3 API replicas
- 1 Redis primary
- 3 geographically separated relays
- 1 reverse proxy / ingress
- external managed database

## Safe rollout
1. staging
2. internal beta
3. canary 5%
4. regional rollout
5. general availability
