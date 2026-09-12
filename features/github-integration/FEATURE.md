Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/integrations/github/FEATURE.md — read it before touching this feature in ANY repo.

`useGitHubConnection()` waits for Redux authentication before loading the
direct Supabase inventory, and `loadGitHubConnectionInventory()` verifies a
live session at the transport boundary. `users.integration_connections` is
intentionally unavailable to `anon`, so both gates are required to prevent
hydration and sign-out races from becoming durable permission errors.

## Changelog

- 2026-09-12 — Added auth gates around direct GitHub connection inventory
  reads.
