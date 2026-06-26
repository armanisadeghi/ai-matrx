# Cloud-files RPCs — canonical direct-vs-server map (2026-06-26)

Two things happened on 2026-06-26:
1. The DB dropped the `cld_` prefix from the cloud-files functions (one non-trivial:
   `cld_check_rate_limit` → **`check_file_rate_limit`**, a collision with existing `public.check_rate_limit`).
2. The audit of who calls them exposed a **doctrine violation**: our FE routes pure UI↔DB file
   operations through the Python REST `/files/*` API instead of going **direct to Supabase**.

> **The rule** (CLAUDE.md → "Data flow"): our FE has Supabase, so every pure UI↔DB op goes **direct
> via supabase-js**. The Python REST file API exists for consumers *without* Supabase (the extension,
> external clients). For us, routing a plain DB read/write through Python is two wasted hops through a
> slow, agent-saturated server. **Direct is canonical.** Python is for **bytes** (S3 up/download),
> **signing**, **processing** (RAG/variants), and the **anon** share-resolve path — nothing else.

## Current state (the problem)

`features/files/` has **two** data layers:
- **Direct supabase (canonical)** — `redux/thunks.ts` + [`filesDb()`](filesDb.ts) (the tables live in the
  `files` Postgres schema) + `supabase.rpc(...)`. Already used for: tree (`get_user_file_tree`), folder
  contents, versions, permissions, share-links reads, realtime. `useFileSearch` searches the loaded tree
  client-side. **This is the model to extend.**
- **Python REST (`api/*.ts` + `@/lib/python-client`)** — the parallel path. Consumed by `fileHandler`
  (`upload.ts`, `resolver.ts`, `intelligence/refresh.ts`) and a few callsites (`useStorageQuota`,
  `searchFiles`, rename/delete in some surfaces). **Pure-DB ops here are the violation to convert.**

## The security gate — mutation RPCs are not yet safe to call from the browser

All 19 RPCs are `SECURITY DEFINER` and `EXECUTE`-granted to `authenticated`, so the browser *can* call them.
But there are two classes:

- **Reads with `p_user_id`** (`get_user_file_tree`, `search_files`, `count_user_files`, `list_trash`,
  `get_usage_status`, `get_user_limits`): each **enforces** `IF auth.uid() <> p_user_id THEN RAISE
  'forbidden'` and gates rows with `iam.has_access(...)`. ✅ **Safe to call directly today.**
- **Mutations with only an id** (`soft_delete_file`, `hard_delete_file`, `restore_file`, `restore_folder`,
  `rename_folder`, `soft_delete_folder`, `bump_version`, `prune_old_versions`): bare
  `UPDATE … WHERE id = p_id`, **no ownership check**. SECURITY DEFINER bypasses RLS, so a direct browser
  call lets **any authenticated user mutate anyone's file by UUID** — a severe IDOR hole. Authorization
  currently lives only in the Python `PermissionsManager` that runs *before* the RPC.
  ⛔ **Must be hardened (`auth.uid()` + `iam.has_access(...,'editor')`, mirroring the read RPCs) BEFORE any
  direct call.**

## Per-RPC disposition

Legend — **DIRECT-NOW** = convert FE to a direct supabase-js call (safe today) · **DIRECT-AFTER-HARDEN**
= convert once the RPC self-authorizes · **SERVER** = legitimately stays on Python (bytes/processing) ·
**DERIVED** = FE already computes it without any server call · **GAP** = unimplemented, wire it.

| RPC | Today | Target | Disposition |
|---|---|---|---|
| `get_user_file_tree` | FE direct ✅ + backend | FE direct | Already canonical (`thunks.loadUserFileTree`). |
| `search_files` | backend `/files/search`; `searchFiles()` callsite | FE direct | **DIRECT-NOW.** Auth-checked. (Main UI search is already client-side via `useFileSearch`; convert the remaining `searchFiles()` callsite + any server-search need to `supabase.rpc('search_files')`.) |
| `list_trash` | backend `/files/trash` | FE direct | **DIRECT-NOW.** Auth-checked. Convert the trash view to `supabase.rpc('list_trash')`. |
| `get_usage_status` | backend `/files/usage` via `useStorageQuota` | FE direct | **DIRECT-NOW.** Convert `useStorageQuota` to `supabase.rpc('get_usage_status')` (verify the JSON shape maps to `StorageUsageResponse`). |
| `get_user_limits` | backend (account_tiers) | FE direct or fold into usage | **DIRECT-NOW** if the FE ever needs limits standalone; today it rides inside usage. |
| `count_user_files` | **nobody** | DERIVED | The FE never asks the server for a count — it derives counts from the already-loaded tree (`files.length`, per-folder maps). **Not a bug, not duplicative-of-an-RPC; just unused.** Keep dormant only if a "total count before the tree loads" badge is ever needed; otherwise drop. |
| `soft_delete_file` | backend (matrx-utils) | FE direct after harden | **DIRECT-AFTER-HARDEN.** |
| `hard_delete_file` | backend (matrx-utils, matrx-ai) | FE direct after harden | **DIRECT-AFTER-HARDEN.** (Returns S3 URIs to purge — the FE calls the RPC for the DB delete; byte purge of those URIs still needs the server.) |
| `restore_file` | backend `/files/{id}/restore` | FE direct after harden | **DIRECT-AFTER-HARDEN.** |
| `rename_folder` | **nobody** (Python renames via single-row `_update_folder_row`, NOT this RPC) | FE direct after harden | **DIRECT-AFTER-HARDEN.** This RPC is the *correct* one: it re-prefixes descendant file+folder paths in SQL. The Python path updates only the one row → descendant paths drift unless a trigger fixes them. Adopt the RPC directly from the FE rename flow. |
| `soft_delete_folder` | **nobody** (Python sets `deleted_at` on one row via `_soft_delete_folder`) | FE direct after harden | **DIRECT-AFTER-HARDEN.** RPC cascades `deleted_at` to the descendant tree + deactivates share-links; the Python path does not. Adopt the RPC. |
| `restore_folder` | **nobody**, no endpoint | GAP → FE direct after harden | **Wire it.** No folder-restore exists (trash lists folders but only files restore). RPC recursively un-deletes the subtree. Add it to the trash UI as a direct call. |
| `bump_version` | backend (versioning) | SERVER | **SERVER.** Fired during the byte upload flow (new version on re-upload) — already on the server side of an S3 write. Leave. |
| `prune_old_versions` | **nobody** | GAP (admin) | Version retention never runs → versions grow unbounded. Build an **admin page** surfacing the biggest-version files with a prune action (direct RPC, admin-gated). |
| `consume_share_link` | backend (matrx-utils) | SERVER | **SERVER.** Anon/public `/share/{token}` path + bumps `use_count`; crosses the auth boundary the browser can't. Leave. |
| `check_upload_quota` | backend (account_tiers) | SERVER | **SERVER.** Authoritative pre-upload gate on the byte path. Leave. |
| `check_file_rate_limit` | backend (account_tiers) ⚠ renamed | SERVER | **SERVER.** Per-actor rate gate on the byte path. Leave. (Renamed from `cld_check_rate_limit`.) |
| `apply_usage_delta` | backend (account_tiers + routers) | SERVER | **SERVER.** Post-commit storage accounting after an S3 write/delete. Leave. |
| `ensure_folder_chain` | backend (5×, upload transports) | SERVER (mostly) | **SERVER** when part of an upload byte flow; if a pure "create folder" UI op exists, that one goes **DIRECT-AFTER-HARDEN**. |

### Internal helpers (renamed; no app change)
`is_system_path`, `user_owns_file`, `user_owns_folder` + the four triggers — in use via RLS/triggers.

## Phased plan

- **Phase A — docs (done 2026-06-26):** CLAUDE.md + this feature's FEATURE.md now state the rule; the
  `cld_`→new RPC names were propagated in the backend (aidream `76cc64b05`) and FE comments (`0c3d0c06d`).
- **Phase B — DIRECT-NOW reads (safe):** convert `useStorageQuota`, the `searchFiles()` callsite, and the
  trash view to `supabase.rpc(...)`. No DB change required.
- **Phase C — harden the 8 mutation RPCs** with `auth.uid()` + `iam.has_access(...,'editor')` (one
  idempotent migration; canonical `iam` access primitive). Closes the IDOR gap.
- **Phase D — DIRECT-AFTER-HARDEN mutations:** repoint FE soft-delete / rename / move / restore (file +
  folder) to the hardened RPCs; wire **restore_folder** into the trash UI.
- **Phase E — admin prune page** for `prune_old_versions`.
- **Phase F — collapse the dead path:** once B–E land, the Python `/files/*` *metadata* endpoints are
  unused by our FE — keep them only for non-Supabase consumers, and delete any FE wrapper that no longer
  has a caller. `count_user_files` / dead RPCs dropped from the DB.

_Last updated: 2026-06-26._
