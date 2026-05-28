# Secrets

> **Status:** active · **Tier:** 1 · **Owners:** platform · **Created:** 2026-05-28

User-facing vault for env-vars, API keys, GitHub PATs, OAuth tokens, and anything else the user wants the system to remember once and reuse forever. Set in three ways, stored in one place, available everywhere.

## Why this is its own feature (not a sub-folder)

Cross-cutting concern: writes come from three independent surfaces (UI form, .env upload, agent chat tool); reads come from at least two independent paths (sandbox env auto-injection, future MCP credential resolution); persistence is its own table with its own encryption boundary. A "secrets" sub-folder of `settings/` would only satisfy the writer side and would force two other systems to import settings UI code, which they shouldn't. Top-level feature folder is the doctrine-compliant home for a multi-consumer, multi-writer module.

## Architecture

```
                                        ┌──────────────────────────────────┐
                                        │     public.user_secrets          │
                                        │  Fernet-encrypted BYTEA at rest  │
                                        │  RLS per user_id                 │
                                        │  unique(user_id, key) where      │
                                        │   deleted_at IS NULL             │
                                        └─────────▲────────────────────────┘
                                                  │
                       ┌──────────────────────────┼──────────────────────────┐
                       │                          │                          │
        POST /api/user-secrets/   POST /api/user-secrets/bulk-env   user_secret_set tool
        (UI: paste key/val)       (UI: .env upload)                  (agent chat path)
                       ▲                          ▲                          ▲
                       │                          │                          │
                       └──── this feature ────────┘                          │
                            (features/secrets/)                              │
                                                                             │
                                                            matrx-ai @tool registry
                                                            handler defers aidream import

        Auto-injection on sandbox create:
        Browser → /api/sandbox (Next.js route)
               → server-side fetch /api/user-secrets/sandbox-env (JWT-auth)
               → merge into config.env
               → POST orchestrator /sandboxes
               → orchestrator merges into Docker environment=…
               → docker run -e KEY=value
               → bash inherits → user's agent sees env vars from boot
```

## Files

| File | Role |
|---|---|
| [`types.ts`](./types.ts) | Wire shapes mirroring aidream's Pydantic models. `VALID_KEY_RE` mirrors the DB CHECK constraint. |
| [`service.ts`](./service.ts) | Thin client over aidream `/api/user-secrets/*`. Browser → Python direct (no Next.js hop). |
| [`hooks.ts`](./hooks.ts) | `useSecrets`, `useCreateSecret`, `useUpdateSecret`, `useDeleteSecret`, `useBulkImportEnv`. Toast-on-success/failure. |
| [`../../app/(transitional)/settings/secrets/page.tsx`](../../app/(transitional)/settings/secrets/page.tsx) | The settings page itself. Three cards: add one / bulk import .env / list with rotate-delete. |

## Entry points

- **UI route:** `/settings/secrets` (nav entry in `app/(transitional)/settings/SettingsLayoutClient.tsx`, KeyRound icon)
- **Aidream REST:** `/api/user-secrets/{list, create, patch, delete, bulk-env, sandbox-env}` — see `aidream/api/routers/user_secrets.py`
- **Sandbox-create hook:** `app/api/sandbox/route.ts` fetches `/sandbox-env` server-side before forwarding to the orchestrator
- **Agent tool:** `user_secret_set` registered in `tool_def` + `tool_binding` (executor=aidream)

## Invariants

1. **Plaintext values never reach the browser.** The listing endpoint returns `value_hint` (first4…last4 masked) and never the raw value. The only path that sees plaintext on the wire is the server-to-server `/sandbox-env` call from the Next.js sandbox route to aidream (authenticated with the user's Supabase JWT).
2. **One canonical store, one encryption primitive.** All secrets live in `public.user_secrets`. All encryption goes through `aidream/services/scraper/credentials._get_fernet()` (the existing key). Adding a second store or second crypto is forbidden.
3. **Vault wins on config.env merge.** When a sandbox-create caller supplies `config.env` AND the user has vault entries, the vault values overwrite the caller's. This makes "set once, never lose it" structural.
4. **Soft-delete preserves the row but releases the key.** A deleted secret can be re-created with the same `key` (partial unique index excludes `deleted_at IS NOT NULL` rows). Useful for "rotate and re-create" without losing audit.
5. **Decrypt failures are skipped, not raised, during sandbox env build.** If `CREDENTIALS_ENCRYPTION_KEY` rotates without re-encrypting rows, those rows are logged and excluded from sandbox env. The user's sandbox creation never blocks on a broken row.

## Adding a new input path

If you build a new way for a secret to land in `user_secrets` (e.g. a CSV importer, a CLI tool, a Chrome extension), call aidream's `create_user_secret(user_id, key, value, ...)` service function — don't INSERT directly. The service is the choke point for key-shape validation, Fernet encryption, hint masking, and audit timestamps.

## Adding a new consumer

If you need the user's secrets in a new context (e.g. an MCP tool that needs the user's GitHub PAT, a background scheduler that runs on the user's behalf), call `aidream.services.user_secrets.get_user_secret(user_id, key, touch_last_used=True)` — that bumps `last_used_at` for the audit trail. Don't add a parallel "give me the env" endpoint; extend `build_user_sandbox_env` if you need a different filter.

## Doctrine compliance

- ✅ Reuses existing Fernet primitive — no second encryption stack
- ✅ Single Redux/state path — no parallel slice
- ✅ Browser → Python direct for CRUD (no Next.js middle tier added; the one exception in `app/api/sandbox/route.ts` is a pre-existing route doing pre-existing brokerage, see comment block in that file)
- ✅ Lucide icons only (KeyRound, Plus, Upload, Eye, EyeOff, Pencil, Trash2, Loader2, AlertCircle)
- ✅ Component library used throughout (Card / Input / Switch / Select / Badge / Button / Textarea)
- ✅ Toast (sonner) used for feedback, not window.alert

## Change Log

- **2026-05-28** — Initial implementation. DB table + Fernet service + 6 REST endpoints + auto-inject hook + agent tool + UI page. Three blockers caught by parallel verification sub-agents (EXCLUDE→UNIQUE migration, warm-pool config.env drop, response_model on /sandbox-env) and fixed before deploy.
