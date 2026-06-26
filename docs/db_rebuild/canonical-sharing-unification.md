# Canonical Sharing — unification with the access model

> The sharing system already exists and is mature (`features/sharing/FEATURE.md`): one
> `public.permissions` table, a declarative `shareable_resource_registry`, a full
> `SECURITY DEFINER` RPC write-path, and `has_permission`. "Deeper on sharing" is
> **not build-from-scratch — it's unifying it with the new access model** (`iam.has_access`
> + `platform.entity_types` + the `visibility` enum). This doc is the finding + plan.

## The core bug (proven live, 2026-06-26)

`iam.has_access(type, id, …)` delegates grant checks to `public.has_permission(type, id, …)`.
But the two systems **key the same entity on different tokens**:

| | token used |
|---|---|
| `entity_types` / `iam.has_access` passes | the **short entity token** — `note`, `agent`, `conversation` |
| `permissions.resource_type` stores (validated against registry `table_name`) | the **table name** — `notes`, `agx_agent`, `cx_conversation` |

So `has_access('note', id)` → `has_permission('note', id)` → finds **no** row (grant is stored as `'notes'`) → **the grant is silently ignored.**

**Proof:** a note shared (viewer) to user B, with `notes` now on canonical RLS:
`grantee_can_see = 0`; `has_permission('notes',…)=true` but `has_permission('note',…)=false`; `has_access('note',…)=false`. Sharing is broken on every canonical-RLS table whose grant token ≠ entity token.

**Live grants mis-keyed** (need re-key): `agx_agent`→`agent` ×30, `cx_conversation`→`conversation` ×2, `notes`→`note` ×4. `file` already uses the short token `file` (1 grant) — someone began the alignment.

## The canonical decision: ONE token = `entity_types.token`

The short entity token is canonical (it drives RLS via `has_access`, and `file` already migrated to it). `shareable_resource_registry.resource_type`, `permissions.resource_type`, and `entity_types.token` must be the **same string** per entity.

> Reconciles checklist #4 ("`table_name` = the token") → the token is the **entity token**, not the table name. The registry keeps `table_name` for routing/owner-column lookup, but `resource_type` (the share token) **must equal the entity token**.

Registry aliases that already disagree even before grants: `cx_conversation` (should be `conversation`), `transcripts` (should be `transcript`).

## The plan (each step access-sensitive → verify live, never widen)

1. **Re-key live grants** `permissions.resource_type`: `agx_agent`→`agent`, `cx_conversation`→`conversation`, `notes`→`note`. (file already correct.)
2. **Validation trigger** (`permissions_validate_resource_type`) → validate against the entity token / registry `resource_type`, not `table_name`.
3. **Share RPCs** (`share_resource_with_user/org`, `resolve_shareable_resource`) → resolve to and store the **entity token**.
4. **Registry alignment** → set `resource_type` = entity token for `cx_conversation`→`conversation`, `transcripts`→`transcript`; update the TS mirror + parity snapshot.
5. **Verify** per type: grant to user B → B can read via `has_access`.

## Second reconciliation: `is_public` boolean → `visibility` enum

The sharing RPC `make_resource_public` flips the resource row's `is_public`, but `has_access` + the new anon `pub_read` policy read `visibility = 'public'`. So **making a resource public via ShareModal does nothing** on a canonical table. Reconcile:
- `make_resource_public` / `make_resource_private` → set `visibility` (`public` / back to default) where the column exists.
- `shareable_resource_registry.owner_column` `user_id` → `created_by`; `is_public_column` → drop (visibility drives it).
- Retire resource-row `is_public` (gated drop) once `visibility` is everywhere.

## Third: retire bespoke share storage (kill-list → `public.permissions`)
- `note_shares` table; `shared_with` jsonb on `notes` / `flashcard_data` / `flashcard_sets` → migrate to `permissions` rows, then graveyard. (`admins.permissions` jsonb is the protected-admin blob — leave.)

## Already shipped (2026-06-26)
- `apply_rls` v2.1 emits the canonical anon `pub_read` policy (`visibility='public'`, checklist #5); re-applied to `notes`, `wr_sessions`, `wr_threads`.
- `notes` registry `rls_uses_has_permission=true` is correct **once step 1 re-keys its 4 grants** (today those grants are ignored — the flag overstates reality until the token matches).

## Recommendation
Execute steps 1–4 as the next move (it fixes live-broken sharing on agents/conversations/notes), then the `is_public`→`visibility` reconciliation. Access-sensitive (re-keys grant data + touches the stable share RPCs) → confirm direction, then I verify each type live.
