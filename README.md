# VOID.Chat

VØID is a Chat App — production-ready build pack.

## Included
- Dockerfile
- docker-compose.production.yml
- Nginx reverse proxy config
- Kubernetes manifests
- GitHub Actions CI pipeline
- `.env.production.example`
- Healthcheck route example
- Ops runbook
- Release checklist

## Production goals
- reproducible builds
- safe environment variable handling
- reverse proxy + TLS termination
- horizontal scaling path
- observability and rollback guidance

## Next steps
1. Copy `.env.production.example` to `.env.production`
2. Build and run with Docker Compose or Kubernetes
3. Configure TLS at the proxy / ingress layer
4. Point mobile/web clients to production API
5. Enable monitoring and alerting before public launch
