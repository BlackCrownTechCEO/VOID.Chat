# Ops Runbook

## API unhealthy
1. Check `/healthz`
2. Inspect container logs
3. Verify Redis and Supabase connectivity
4. Roll back to previous image if error rate rises

## Relay degradation
1. Remove unhealthy relay from pool
2. Rebalance traffic
3. Re-add only after health check passes

## Suspected abuse
1. Increase rate limits for trusted internal paths only
2. Enable stricter throttling
3. Preserve metadata-only logs
