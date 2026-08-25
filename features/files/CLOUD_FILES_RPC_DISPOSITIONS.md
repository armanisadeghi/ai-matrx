# Cloud-files RPCs — direct-vs-server disposition map

> **Cross-repo system-of-record:** `/Users/armanisadeghi/code/common-docs/systems/media/file-service/STATE.md` — the doctrine behind this map is in `DECISIONS.md` § Where file operations run, and the remaining conversions are in `HANDOFF.md` § 8, both in that directory.

Every cloud-files RPC lives in the **`public`** schema (the tables are in `files`). All are
`SECURITY DEFINER` and `EXECUTE`-granted to `authenticated`, and all eight mutation RPCs carry
`auth.uid()` + `iam.has_access` guards (hardened 2026-06-26, re-verified live 2026-08-25).

| RPC | Disposition |
|---|---|
| `get_user_file_tree` | DIRECT — canonical, `thunks.loadUserFileTree`. Grant is asserted by `migrations/get_user_file_tree_authenticated_execute.sql` (authenticated + service_role only; anon + PUBLIC revoked). |
| `search_files`, `list_trash`, `get_usage_status`, `get_user_limits` | DIRECT |
| `count_user_files` | DERIVED — the FE counts from the loaded tree. Not a bug, just unused. |
| `soft_delete_file`, `restore_file`, `rename_folder`, `soft_delete_folder` | DIRECT — `api/direct.ts` |
| `restore_folder` | DIRECT-capable, **unwired** — trash lists folders but only files restore. |
| `bump_version`, `consume_share_link`→`resolve_share_token`, `check_upload_quota`, `check_file_rate_limit`, `apply_usage_delta`, `ensure_folder_chain` | SERVER |
| `hard_delete_file` | **SERVER, never FE-direct.** It returns the S3 URIs to purge only to a service-role caller; a browser-direct hard delete drops the rows and strands the objects forever. **Do NOT adopt this RPC in the FE.** |
| `prune_old_versions` | SERVER, **no caller** — version retention never runs. |
| `rename_file` | **DOES NOT EXIST.** This is what blocks direct rename/move. `rename_folder` is the model to mirror — it re-prefixes descendant paths in SQL, which the single-row Python path does not. |

## Rules

- `check_file_rate_limit` was renamed from `cld_check_rate_limit` (collision with
  `public.check_rate_limit`). Every other RPC simply dropped the `cld_` prefix.
- **`rename_folder` and `soft_delete_folder` are the correct RPCs** for their operations — they
  cascade to the descendant tree (path re-prefixing, `deleted_at`, share-link deactivation). The
  Python paths touch one row and leave descendants drifting.
- Direct reads/writes go through `redux/thunks.ts` + `filesDb()` + `api/direct.ts`; share links go
  through the canonical RPC family in `utils/permissions/shareLinks.ts`, never a direct table write.
- **`storage_uri` never reaches the client** — a hard delete's S3 purge therefore needs a server
  endpoint. See `FEATURE.md` invariant 2.
