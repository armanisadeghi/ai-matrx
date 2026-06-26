# Cloud-files RPC dispositions (`cld_` → unprefixed rename, 2026-06-26)

The DB agent dropped the `cld_` prefix from 26 functions in `public` (one collision:
`cld_check_rate_limit` → **`check_file_rate_limit`**, not a plain drop). This doc records,
for every app-facing RPC, whether we call it, who actually calls it, and the disposition
(Use it / it's duplicative / our method is better / other).

## TL;DR — the premise was wrong, and it mattered

The task brief said *"the server doesn't really use these so it's mostly going to be a FE task."*
The opposite is true. **The frontend calls exactly one of these RPCs directly** (`get_user_file_tree`,
via supabase-js — and it was already on the new name). **Every other one is invoked by the Python
backend** (`aidream` + its `matrx-utils` / `matrx-ai` packages) by its OLD `cld_` name. The rename
therefore broke the file backend's tree / trash / search / restore / soft+hard delete / share-consume /
version-bump / folder-chain / quota / rate-limit / usage paths until propagated.

This is intentional architecture, not an accident: per CLAUDE.md, **file mutations funnel through the
Python REST layer** (for cascade, quota enforcement, audit, and bulk envelopes), and **reads prefer
supabase-js** (RLS-filtered, no round-trip). So the FE *correctly* does not call these mutation RPCs
directly — it calls `/files/*` and `/folders/*`, which call the RPCs server-side.

### What was changed in this pass
- **FE (`matrx-frontend`):** the one live call (`supabase.rpc("get_user_file_tree")` in
  [thunks.ts](features/files/redux/thunks.ts) + the debug demo) was already on the new name. Only stale
  `cld_*` references in **comments/docstrings** under `features/files/**` were corrected.
- **Backend (`aidream`):** all 19 live `client.rpc("cld_…")` call sites were repointed to the new names
  (including the `check_file_rate_limit` special case) across `aidream/api/routers/files/__init__.py`,
  `common/account_tiers.py`, `packages/matrx-utils/**`, `packages/matrx-ai/**`, and one util script,
  plus their docstrings. The historical applier `db/migrations/_apply_0031.py` was **left untouched**
  (rewriting an already-applied migration's record would falsify history).

> **Deploy gate:** the backend edits only take effect once aidream is redeployed. Until then the live
> server still calls the old names and file ops 500. Verify end-to-end after deploy.

## Per-RPC disposition

Legend — **A** = our method is better, delete the RPC · **B** = not needed / duplicative · **C** = use it (kept; in use) · **D** = other.

| # | RPC (new name) | FE direct? | Real caller | Disp. | Reason |
|---|---|---|---|---|---|
| 1 | `get_user_file_tree` | ✅ supabase-js | FE thunk **and** `files/__init__.py:888` | **C** | The canonical tree read. FE calls it directly (RLS-filtered, no Python hop); backend also exposes it at `/files/tree`. Already on new name. |
| 2 | `search_files` | no | `files/__init__.py:1166` (`/files/search`) | **C** | Backend search endpoint wraps it. FE calls `/files/search` (`searchFiles`); the RPC is the engine underneath. |
| 3 | `list_trash` | no | `files/__init__.py:961` (`/files/trash`) | **C** | Trash view (`listTrash`) → `/files/trash` → this RPC. |
| 4 | `soft_delete_file` | no | `matrx-utils cloud_sync/db.py:285,299` | **C** | `DELETE /files/{id}` (no `hard_delete`) → soft delete via this RPC. |
| 5 | `hard_delete_file` | no | `db.py:313,318`, `matrx-ai cloud_files.py:97` | **C** | `DELETE /files/{id}?hard_delete=true` + the agent purge tool. |
| 6 | `restore_file` | no | `files/__init__.py:1783` (`/files/{id}/restore`) | **C** | File restore from trash. |
| 7 | `consume_share_link` | no | `db.py:757,762` | **C** | Public `/share/{token}` resolve/download decrements + validates the link. |
| 8 | `bump_version` | no | `matrx-utils cloud_sync/versioning.py:323` | **C** | New version on re-upload of an existing path. |
| 9 | `ensure_folder_chain` | no | `files/__init__.py:1820`, `service.py:978`, `transports/{tus,presigned}.py`, relocate script (5×) | **C** | Atomic "create folder + all missing ancestors" used by every path-style upload/move. Heavily relied upon. |
| 10 | `get_usage_status` | no | `common/account_tiers.py:113` | **C** | Drives `/files/usage` (`getStorageUsage`, `useStorageQuota`). |
| 11 | `get_user_limits` | no | `account_tiers.py:45` | **C** | Tier limits used for gating + quota math. |
| 12 | `check_upload_quota` | no | `account_tiers.py:66` | **C** | Pre-upload storage/file-count gate (413 on overflow). |
| 13 | `check_file_rate_limit` | no | `account_tiers.py:141` ⚠ renamed | **C** | Per-actor upload rate limiting. **Collision rename** — callers updated `cld_check_rate_limit` → `check_file_rate_limit`. |
| 14 | `apply_usage_delta` | no | `account_tiers.py:97` + image/asset routers | **C** | Post-commit storage accounting after upload/delete. |
| 15 | `count_user_files` | no | **nobody** | **B** | Duplicative. No caller in either repo. The tree RPC already returns the set the UI counts, and listings expose `length`; a dedicated count round-trip is redundant. Safe to drop, or keep dormant for a future "stats" surface. |
| 16 | `rename_folder` | no | **nobody** | **D** | Latent-gap. `PATCH /folders/{id}` renames via a **single-row** `_update_folder_row` UPDATE on `cld_folders` — it does **not** replay `folder_path` onto descendants in app code. The FE comment claims "the backend cascades… to descendants," which only holds if a DB trigger does it. This RPC's signature (`p_folder_id, p_new_path, p_new_parent_id`) is the SQL-side cascade. **Verify a descendant-cascade trigger exists; if not, adopt this RPC (→C) rather than delete.** |
| 17 | `soft_delete_folder` | no | **nobody** | **D** | Same shape as #16. `DELETE /folders/{id}` sets `deleted_at` on the **one** row via `_soft_delete_folder`; the endpoint comment says deletion "cascades to descendants," again only true with a trigger. This RPC is the SQL-side cascade. **Verify the trigger; adopt (→C) if descendants aren't cascaded today.** |
| 18 | `restore_folder` | no | **nobody** | **C (wire it)** | Genuine missing feature: there is **no folder-restore endpoint** — `/files/trash` lists folders but only files can be restored. This RPC is the ready-made implementation. Recommend wiring a `POST /folders/{id}/restore` that calls it, mirroring `restoreFile`. |
| 19 | `prune_old_versions` | no | **nobody** | **D** | Retention enforcement (`p_file_id, p_keep`). `bump_version` runs on every re-upload but nothing prunes, so version rows grow unbounded. Either call this after `bump_version` (→C) or confirm retention is handled elsewhere; otherwise it's dead and can be dropped. |

### Internal helpers (renamed for cleanliness — no app change, kept)
`is_system_path`, `user_owns_file`, `user_owns_folder` (RLS/policy helpers, bound by OID),
and the four triggers (`files_inherit_org_from_folder`, `folders_set_is_system`,
`protect_system_folders`, `sync_update_timestamp`). All **C** — in use via RLS/triggers; comment
references in `features/files/utils/folder-conventions.ts` were updated.

## Open follow-ups (surfaced by this audit — not yet acted on)
1. **Deploy aidream** so the repointed RPC names take effect, then live-verify a file op end-to-end.
2. **Folder cascade (#16/#17):** confirm whether a trigger cascades `folder_path` / `deleted_at` to
   descendants. If not, this is a real correctness bug — adopt `rename_folder` / `soft_delete_folder`.
3. **Folder restore (#18):** no endpoint exists; wire `restore_folder`.
4. **Version retention (#19):** nothing calls `prune_old_versions`; versions accumulate.
5. **Dead RPCs:** if 2–4 are resolved another way, `count_user_files` (and any of 16/17/19 deemed
   superseded) should be **dropped** from the DB rather than left as confusing dead surface.
6. Regenerate FE Python API types (`pnpm sync-types`) so `types/python-generated/api-types.ts` picks up
   the updated `list_trash` docstrings.

_Last updated: 2026-06-26._
