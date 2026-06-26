# App Agent Instructions — cld_ / cx_ / wf_ canonical cutover

**DB project:** `txzxabzwovsujtloxrus`. Canonical homes live in schemas `platform`, `iam`, `public.permissions`.
**Rule of thumb:** never duplicate a canonical concept. Grants → `public.permissions`. Members → `iam.memberships`. Activity → `platform.activity_log`. Relationships/links → `platform.associations` (via `assoc_*` RPCs).

Canonical facts you'll need:
- `permission_level` enum = `viewer < editor < admin`.
- `public.has_permission(p_resource_type text, p_resource_id uuid, p_required_permission permission_level)` → bool.
- `iam.has_access(p_type text, p_id uuid, p_required permission_level)` → bool (full resolver: owner + grant + org + org-admin oversight + cascade).
- Files are already registered as the canonical entity token **`file`** (so `has_access('file', file_id, 'viewer')` works today).

---

## 1) cld_  — DO NOW (100% application-side; no DB dependency on these tables)

### 1a. `cld_file_permissions` → `public.permissions`
Stop reading/writing `cld_file_permissions`. The grant store is `public.permissions`.

**Replace permission CHECKS** (currently via `cld_get_effective_permission` / `cld_user_has_permission_grant`) with:
```sql
SELECT iam.has_access('file', :file_id, :level);   -- preferred (full resolver)
-- or, for an explicit grant-only check:
SELECT public.has_permission('file', :file_id, :level);
```

**Replace grant WRITES** (insert into `cld_file_permissions`) with insert into `public.permissions`:
| cld_file_permissions | public.permissions |
|---|---|
| `resource_type` (= `'file'`) | `resource_type` = `'file'` |
| `resource_id` | `resource_id` |
| `grantee_id` (where `grantee_type='user'`) | `granted_to_user_id` |
| *(grantee_type='organization')* | `granted_to_organization_id` |
| `permission_level` | `permission_level` |
| `granted_by` | `created_by` |
| `granted_at` | `created_at` |
| `organization_id` | `organization_id` |
| — | `status` = `'active'` |
| `expires_at` | ⚠️ **no column yet** — see gap below |

> **GAP — grant expiry:** `public.permissions` has no `expires_at`. If file grants must expire, do **not** migrate that field silently. Tell the DB owner; we'll add `expires_at` to `public.permissions` (canonical) before you cut over. If file grants never expire in practice, ignore.

### 1b. `cld_events` → `platform.activity_log`
Stop writing `cld_events`. Use the canonical logger `platform.log_activity(organization_id, entity_type, action, entity_id, metadata)`.
| cld_events | activity_log |
|---|---|
| `resource_type` | `entity_type` |
| `resource_id` | `entity_id` |
| `event_type` | `action` |
| `actor_id` | `actor_id` (auto from `auth.uid()` in the RPC) |
| `payload` (+ `request_id`, `ip_address`) | `metadata` (jsonb) |
| `organization_id` | `organization_id` |
(`cld_events` is empty — pure code swap, no data to move.)

### 1c. `cld_user_groups` + `cld_user_group_members` → `iam.memberships`
Both empty. If the user-group sharing feature is live or being built, model **membership** on `iam.memberships` with `container_type = 'cld_user_group'`, `container_id = <group id>`, `user_id`, `role`. The group *record* itself (name/owner) can remain a thin feature table or be modeled as a container — your call — but **do not** build a second members table. If the feature is dead, say so and we graveyard both.

### 1d. KEEP — these are legitimate file-system infrastructure, NOT duplicates (do not touch):
`cld_files`, `cld_file_versions`, `cld_folders`, `cld_pages`, `cld_analysis`, `cld_analysis_result`, `cld_entities`, `cld_overrides`, `cld_page_annotations`, `cld_uploads_inflight`, `cld_file_rag_jobs`, `cld_account_tiers`, `cld_user_account`, `cld_user_storage_usage`, `cld_webhooks`, `cld_webhook_deliveries`, `cld_rate_limit_buckets`, `cld_idempotency`.

### 1e. `cld_share_links` (150 rows) — KEEP, but align semantics
This is a real feature (tokenized link access with expiry/use-count), not a permissions duplicate. Keep the table. Requirement: when a share link exists for a file/folder, set that resource's `visibility = 'link'` so the canonical resolver agrees with the link grant. Do not store per-user grants here — those go in `public.permissions`.

### 1f. After 1a–1c are merged and deployed
Tell the DB owner. I will move `cld_file_permissions`, `cld_events`, `cld_user_groups`, `cld_user_group_members` to the `graveyard` schema (reversible) and then drop after a soak period.

**Acceptance criteria for cld_:** no application code references `cld_file_permissions`, `cld_events`, `cld_user_groups`, `cld_user_group_members`, `cld_get_effective_permission`, or `cld_user_has_permission_grant`. All file permission checks resolve through `iam.has_access('file', …)`; all grants are rows in `public.permissions`; all audit events go through `platform.log_activity`.

---

## 2) cx_  — YOUR PART (lands after the DB expand migration; stage it now)

The DB will canonicalize cx_ (I ship this; I'll notify per table). Your part is the field swap. Order is expand→switch→contract, so you switch while both old and new columns exist.

1. **Visibility, not `is_public`** (root table `cx_conversation`): read/write the new `visibility` enum (`private`/`internal`/`link`/`public`) instead of the `is_public` boolean. Mapping: `is_public=true` → `'public'`, `false` → `'private'`. Once you've switched, stop writing `is_public` (it will be dropped).
2. **Ownership is `created_by`, not `user_id`** (tables that currently have both: `cx_conversation`, `cx_artifact`, `cx_agent_memory`, `cx_agent_plan`, `cx_agent_task`, `cx_observational_memory`, `cx_tool_call`, `cx_user_request`, `cx_user_todo`, `cx_working_documents`): read ownership from `created_by`; stop writing `user_id` (it collapses into `created_by` and is dropped). `created_by` is auto-stamped if you set the request's user context; otherwise set it explicitly.
3. **Access checks**: replace any direct `is_public`/`user_id = me` checks with `iam.has_access('cx_conversation', :id, :level)` (children resolve automatically once registered).
4. **`cx_user_request`**: do **not** build new work on this table — `runtime.global_request` supersedes it. Pending a migrate-and-drop decision; treat as frozen.

**Acceptance criteria for cx_:** app reads/writes `visibility` and `created_by`; no writes to `is_public` or `user_id` on the tables above; access decisions go through `iam.has_access`.

---

## 3) wf_  — YOUR PART (same pattern, smaller)

1. **`wf_definition`**: `is_public` → `visibility` (same mapping as cx_); `user_id` → `created_by` for ownership.
2. **`wf_run`, `wf_trigger`, `wf_template`**: ownership via `created_by`; stop writing `user_id` where present.
3. **Access checks**: `iam.has_access('wf_definition', :id, :level)` (run/child tables resolve via composition once registered).

**Acceptance criteria for wf_:** app reads/writes `visibility` and `created_by`; no `is_public`/`user_id` writes; access via `iam.has_access`.

---

## 4) Graveyard notations (app removes references → then DB retires)
The app team must confirm no code references these; then they move to the `graveyard` schema (reversible) before any drop.
- **cld_ (after §1 cutover):** `cld_file_permissions`, `cld_events`, `cld_user_groups`, `cld_user_group_members`.
- **cld_ (confirm dead, then graveyard):** `cld_structure` (empty, RLS off, appears abandoned), `cld_guest_migrations` (empty — only if the guest-import flow is retired).
- **cx_:** `cx_user_request` is runtime-superseded — migrate to `runtime.global_request` then graveyard (do **not** graveyard while it still has ~4.7k live rows).

> Nothing here is dropped outright. "Graveyard" = `ALTER TABLE … SET SCHEMA graveyard` — it leaves the data intact and recoverable but removes it from the live `public` API surface.
