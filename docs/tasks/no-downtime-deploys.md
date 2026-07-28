I need you to solve production deploy downtime for aidream (https://server.app.matrxserver.com, deployed via Coolify auto-deploy on push to main). Today (2026-07-28 ~20:00 UTC) a deploy rollover caused live user-visible failures: Cloudflare 502s on /health/version for ~1-2 minutes, the AI Dream MCP timing out mid-request, and — notably — /health/version answering with TWO different git SHAs during the flap (cfdaee95c, then settling on the OLDER 1acbe07f1), meaning two containers were serving simultaneously and the surviving one may have been the old build. There is also a related filed bug (feedback id fd95e4dc): Coolify builds intermittently die at `COPY . /app/` with exit 255 and no error text, and a bare retry of the same commit succeeds — suspected disk pressure or OOM on the build host.



Your job, in order:

1. INVESTIGATE the current Coolify configuration for this app: is a health check configured and gated (does Coolify wait for the new container to pass health before switching traffic and stopping the old one)? What are the current deploy settings (rolling vs stop-start, health check path/interval/retries, drain timing)? Check the build host's disk space and docker builder cache while you're there.

2. DIAGNOSE why we get 502s and dual-SHA serving during rollover, and why the old SHA can win.

3. RECOMMEND the simplest path to zero-downtime deploys, honoring the repo's PRIME RULE (simplicity is survival — no new infrastructure layers without my explicit approval). Evaluate in this order: (a) fixing Coolify's own health-check-gated rolling deploy so the new container must be healthy before cutover — this should be the first candidate because it's zero new infrastructure; (b) a two-instance setup — note we already run an EC2 instance supporting our sandboxes that also runs the aidream codebase, so staggered deploys across the Coolify box and that EC2 box (behind Cloudflare) may be feasible; (c) anything else only if (a) and (b) genuinely can't work. Also recommend the fix for the exit-255 build flake (likely a builder-cache prune schedule + making scripts/release.sh auto-retry an identical-commit deploy once before declaring failure).

4. STOP and present your findings and recommendation to me as a decision list BEFORE changing any infrastructure. Config-only changes inside the existing Coolify app (enabling/tuning its health check) you may propose with exact settings; I'll approve, then you apply and we verify with a real deploy while curling /health/version in a loop to prove zero dropped requests.



Constraints: one human runs this platform; do not propose Kubernetes, service meshes, or new orchestrators. The deploy entry point is ./scripts/release.sh. Liveness truth is GET /health/version returning the deployed git SHA.