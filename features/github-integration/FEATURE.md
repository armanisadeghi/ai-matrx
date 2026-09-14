Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/integrations/github/FEATURE.md — read it before touching this feature in ANY repo.

`useGitHubConnection()` waits for Redux authentication before loading the
direct Supabase inventory, and `loadGitHubConnectionInventory()` verifies a
live session at the transport boundary. `users.integration_connections` is
intentionally unavailable to `anon`, so both gates are required to prevent
hydration and sign-out races from becoming durable permission errors.
Authenticated browser reads also use only the client-safe connection
projection; vault reference identifiers stay excluded.

## What the user sees

`GitHubConnectionCard` is the ONE GitHub surface, used full on
`/settings/integrations` and `compact` inside `CredentialsModal` and
`CloneRepoDialog`. It renders the connected account (avatar + login), one row
per installation (account, type, "All repositories" / "N selected", link to that
installation's GitHub settings page), the total repositories, when the inventory
last synced, a Refresh action, and — ALWAYS, not only when something looks wrong
— "Don't see the repos you want? Add an organization or more repositories".

That last door is permanent by design. Repository access is granted per GitHub
App INSTALLATION, so a connection can be perfectly healthy, list 62
repositories, and still 403 on an organization's repo because that organization
has no installation. AI Matrx cannot detect that state; only the user knows what
they came looking for. `useGitHubInstallReturn` arms a single refresh when they
open the installation page and runs it on the next window focus — once, then
disarmed, so tab switching never becomes a background sync storm.

`GitHubRepositoryPicker` searches the full inventory (full name, visibility,
permission) and its empty result names the missing-organization fix. It replaced
a 62-option `<select>`, which could not be searched and could not explain a
miss.

Installations, the account, the synced count, and the last sync time all come
from `users.integration_connections.metadata`, written by aidream's
`_persist_discovery` / `_installation_metadata`. No extra endpoint exists or is
needed for them.

## Changelog

- 2026-09-14 — One card everywhere: installation rows with coverage, avatar,
  total repositories, last-synced, and a permanently visible "add an
  organization or more repositories" door with refresh-on-return. Added the
  searchable repository picker and put it in the sandbox clone dialog.

- 2026-09-12 — Removed protected vault-reference identifiers from the browser
  projection and retained only client-safe connection metadata and health.
- 2026-09-12 — Added auth gates around direct GitHub connection inventory
  reads.
