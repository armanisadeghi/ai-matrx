# Proposal — Admin cluster → `admin` schema

**Date:** 2026-06-27 · **Project:** Matrx Main (`txzxabzwovsujtloxrus`) · **Status:** applied + verified live during downtime.

## Scope
Move the admin cluster out of `public` into the **`admin`** schema (already PostgREST-exposed). These are
**protected resources** (`protected-resources` skill) — the move preserves the five-layer defense exactly:
RLS deny-writes + `SECURITY DEFINER` RPCs gated by `is_super_admin()` + the audit trigger all follow the table.

| Table | Rows | Notes |
|---|---|---|
| `admins` | 4 | The authorization backbone. Self-select RLS + RPC-only writes (unchanged). |
| `admin_audit_log` | 10 | Written only by the audit trigger; read via `admin_list_audit()`. |
| `admin_email_logs` | 1 | Admin bulk-email send log. |
| `admin_markdown_samples` | 4 | Admin Markdown-Tester sample library. |

## The hard part: the authorization backbone
`is_super_admin()` / `is_admin()` and **18 other functions** name `public.admins` by qualified string in their
bodies; **2** name `public.admin_audit_log`. plpgsql/sql bodies store the name as **text**, so the move breaks
them unless repointed. Everything else that "uses admins" (`iam.has_access`, `agx_*`, `org_admin_overview`,
SSR shell RPCs, …) only *calls* `is_super_admin()`/`is_admin()` — they need no change once the helpers resolve.

**Views + RLS policies on other tables follow automatically** (they reference the table by OID, not name):
the `current_user_is_admin` view and the `contact_submissions` / `graveyard.system_prompts` admin policies were
verified resolving post-move with no edits.

## How it was done (one atomic migration — `migrations/move_admin_tables_to_admin_schema.sql`)
`SET SCHEMA admin` for all 4 tables **and** repoint all 20 functions (a loop that pulls each
`pg_get_functiondef`, string-replaces `public.admins`→`admin.admins` / `public.admin_audit_log`→`admin.admin_audit_log`,
and `EXECUTE`s it) — **in the same transaction**, so `is_super_admin()` is never broken at commit.

### Verified live
- 0 functions still reference the old names; view + audit trigger followed.
- Impersonating a real super-admin: `is_super_admin()=true`, `is_admin()=true`, RLS self-select returns the row.
- `get_admin_status()`, `admin_list()` (4 rows), `admin_list_audit()` (10 rows) resolve through `admin.*`.
- REST `Accept-Profile: admin` on `admins` → HTTP 200 `[]` for anon (RLS intact, schema/table reachable).

## Consumers repointed (matrx-frontend)
- Direct reads/writes → `.schema('admin')`: `utils/supabase/userSessionData.ts`, `hooks/usePublicAuthSync.ts`
  (`admins`), `components/admin/markdown-tester/samples-service.ts` (`admin_markdown_samples`, + `Tables<{schema:'admin'}>`),
  `app/api/admin/email/route.ts` (`admin_email_logs`).
- **Unchanged:** the admin RPC routes (`app/api/admin/admins/**`, `feedback/assignable-admins`) call
  `.rpc('admin_*')` — RPCs stay in `public`, schema-agnostic.
- `admin` added to the `pnpm db-types` `--schema` list; `admins`/`admin_email_logs`/`admin_markdown_samples`/`admin_audit_log` regenerated under `Database["admin"]`.
- aidream / matrx-extend: no references — not touched.
