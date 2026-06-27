# DB Canonicalization + Teardown Session Handoff

## 0. TL;DR
Canonicalized the last 6 domains (**skill, agent, app, chat, ai, tool**) onto the platform's access model, built two reusable RLS generators, fixed 3 broken functions, and tore down 20 of 23 legacy compat shims. All work was live on `automation-matrx` (`txzxabzwovsujtloxrus`) via 17 migrations. Three `ai_*` shims remain pending a codegen/backend cutover.

## 1. The canonical model (reference)

**Visibility ladder** (`platform.visibility` enum): `private < internal < link < public`.
- `visibility` = the **ambient audience** of a row.
- **`link` is dormant** — the resolver treats it identically to `internal`. Do **not** set rows to `link` expecting public-by-URL behavior.
- **"Share" is a grant, not a visibility tier.** Sharing = a row in `public.permissions` (checked via `has_permission`), independent of visibility. You can share *any* row, including `private`.
- **Defaults:** entities (skill/agent/app) default `internal` (owner creates → org can find → outsiders need a link/grant). Config (ai/tool) defaults `private`.

**Resolvers / generators in `iam`:**
| Function | Purpose | Policies it emits |
|---|---|---|
| `iam.has_access(token, id, level)` | The entity access resolver (owner / org-admin oversight / public / grant / org-member / containment + composition cascade). | — |
| `iam.apply_rls(schema, table, token, variant)` | variants `entity` / `component` / `ledger`. | entity=6, component=5 |
| `iam.apply_config_rls(schema, table)` **(new)** | Public system catalog + private user-custom rows; `is_admin()` manages system (`created_by IS NULL`) rows. | 5 |
| `iam.apply_reference_rls(schema, table)` **(new)** | Public read, admin/service write; no per-row ownership. | 3 |

**Registration substrate (`platform`):** `entity_types` (token → schema.table, `is_component`, `default_visibility`, `category`), `entity_relationships` (`composition` = component defers to parent; `containment` = access cascades from parent), and `public.shareable_resource_registry` (share-link metadata + the legacy `is_resource_owner` path, driven by `schema_name`+`table_name`).

## 2. Per-domain results

**skill** (6 tables) — entity template
- Roots: `definition`→`skill`, `category`→`skill_category`, `render_definition`→`skill_render_definition`.
- Components: `resource`→`skill_resource`, `render_component`→`skill_render_component`.
- Junction (id-less): `project` — direct policy deferring to `has_access('skill', skill_id)`.
- 26 library skills → `public`; new rows default `internal`. Registry: `skill`.

**agent** (7 tables) — the secret + card (see §3)
- Roots: `definition`→`agent`, `template`→`agent_template`, `agent_surface`→`agent_surface_binding`, `shortcut`→`agent_shortcut`.
- Components: `definition_version`→`agent_definition_version`, `drift_alert`→`agent_drift_alert`, `usage`→`agent_usage`.
- 581 bodies `internal`; 81 cards `public`. Registry: `agent`, `agent_card`.

**app** (6 tables) — simple entity
- Root: `definition`→`app` (token renamed from legacy `agent_app`). Components: `definition_version`, `error`, `execution`, `rate_limit`. Lookup: `category` (reference RLS).
- 67 `public` / 3 `internal`. Registry: `app`.

**chat** (21 tables) — was already structurally canonical
- Repointed all 20 `entity_types` tokens off the dead `public.cx_*` names onto `chat.*` (locations only; **tokens unchanged**, e.g. `cx_request` still resolves — just at `chat.request`).

**ai** (3 tables) — config-hybrid
- `model`, `provider`, `endpoint`: added `created_by/organization_id/visibility/deleted_at`; existing rows → `public` catalog; `apply_config_rls`. **Not** in `entity_types`/registry (config, not link-shared).

**tool** (14 tables) — config-hybrid mix
- Config-hybrid roots: `definition`→`tool`, `bundle`→`tool_bundle` (registered so components can defer).
- Components: `definition_version`, `test_sample`, `ui`, `ui_version`, `ui_incident`.
- Junctions: `binding`, `bundle_member` (defer to `has_access('tool', tool_id)`).
- Reference: `executor`, `mcp_server`, `mcp_config`, `surface_defaults`.
- **Untouched:** `mcp_user_conn` (per-user credentials — left with its existing 4 owner-scoped policies).
- 272 catalog tools `public`. **Not** registry-registered (config).

## 3. The agent secret + card — APP INTEGRATION (read this)

The problem: a "public" agent must expose a **card** to the world but **never** its body, yet `has_access('agent')` has a `public→anyone` branch and the version/usage components defer to it. Solution = split the audiences:

- **`agent.definition.visibility`** = the **body** audience. **CHECK-capped non-public** (`agent_definition_body_not_public_chk`). Standard `apply_rls('agent')` is therefore leak-proof — body = owner + org + grant only.
- **`agent.definition.card_visibility`** = the **card** audience (full ladder incl. `public`).
- **`agent.card`** = a `security_definer` view exposing **only** safe columns, gated by `card_visibility` + `agent_card` grants.

**Safe (in the card):** `id, name, description, agent_type, category, tags, variable_definitions, output_schema, is_active, version, created_at, updated_at, created_by, organization_id, card_visibility`.
**Secret (body only, never in card):** `messages, settings, model_id, model_tiers, tools, custom_tools, tool_config, context_slots, mcp_servers, rag_awareness_*, default_rag_boost, skill_config, matrx_actions, ui_gates, source_*`.

**App must:**
1. Render shared / public / outsider agent views from **`agent.card`**, never `agent.definition`.
2. Implement **"Share agent"** as a `public.permissions` grant with `resource_type = 'agent_card'` (outsider → card only). Use `resource_type = 'agent'` only for full-body shares with trusted org members.
3. Treat `agent.definition` as org-internal: only owner + org members (+ explicit `agent` grants) ever load the full body.

## 4. Teardown (compat shims)

- **Dropped (20):** `ctx_*` (11) + `wr_*` (2) [migration `teardown_drop_ctx_wr_shims`]; `file_*` (7) [`teardown_drop_file_shims`].
- The base `public.cx_*/agx_*/aga_*` shims **never existed** — those moves were clean renames, so there was nothing to drop there.
- **`file_*` modernization:** the legacy `is_resource_owner` path resolves a resource-type string through the registry and dynamically queries `schema_name.table_name`. Those 5 rows pointed at `public.<shim>`; repointed to `files.*` [`files_registry_repoint_off_shims`]. `is_resource_owner`, `make_resource_public/private`, `share_resource_with_user/org` were already schema-aware, so the repoint fixed the whole path. Verified: `resolve_shareable_resource('file_analysis')` → `files.analysis / owner_id`.

**Still standing (3) — `ai_endpoint`, `ai_model`, `ai_provider`** — see Action Items 2–3.

## 5. Function fixes
`agx_purge_versions`, `agx_usage_scan_core`, `agx_usage_update_to_active` referenced the dead `aga_apps` / `aga_versions` (post-rename). Rewritten to `app.definition` / `app.definition_version` [`fix_agx_usage_fns_aga_to_app`]. Full function catalog now has **zero** dead-name references.

## 6. ACTION ITEMS for the team

1. **App — agent card:** render shared agents from `agent.card`; wire "Share agent" to `agent_card` grants (full-body shares = `agent` grants). *(§3)*
2. **Codegen — `ai_endpoint`:** repoint the generated CRUD (`add_one_ / fetch_all_ / fetch_by_id_ / upsert_ai_endpoint`) from `public.ai_endpoint` to `ai.endpoint`. Then the `ai_endpoint` shim can be dropped. (Don't hand-edit — fix the generator, or they'll regress on next regen and break, since the shim will be gone.)
3. **Backend (AI Dream) — `ai_model`/`ai_provider`:** confirm the inference path reads `ai.model` / `ai.provider` (not the `public.ai_model`/`ai_provider` shims). Once confirmed, those 2 shims can be dropped (no DB-side refs remain).
4. **Registry snapshot:** rerun `pnpm tsx scripts/regen-shareable-registry-snapshot.ts` — registry changed (`skill`, `agent`, `agent_card`, `app`; `agent_app` removed; `file_*` repointed).
5. **Supabase API + types:** expose the new schemas as needed (`agent`, `app`, `skill`, `ai`, `tool`, plus `chat`/`workspace`/`context`/`files`/`workflow`) and regenerate types.
6. **App — stop referencing dropped shims:** `public.ctx_*` (11), `public.wr_*` (2), `public.file_*` (7) are gone. Use the real schemas: `context.*` / `workspace.*` (projects→`workspace.projects`, tasks→`workspace.tasks`, war rooms→`workspace.war_rooms`/`threads`) and `files.*`.
7. **Config-hybrid default-visibility gap:** rows inserted through the auto-CRUD helpers (e.g. `add_one_ai_endpoint`) don't set `visibility`, so they default to `private` — invisible under `cfg_select`. For system-catalog inserts, set `visibility='public'` in those paths (or we add a `BEFORE INSERT` trigger: `created_by IS NULL → public`). Existing rows were backfilled `public`, so this only affects newly-created catalog rows.

## 7. Flags / deferred follow-ups (DB-side, lower priority)

1. **chat `cx_agent_memory` + `cx_user_request`:** registered `is_component=false` but their tables have no `visibility` column, so `has_access` errors→false for those tokens. Their existing 5 policies are conversation/org-based and work, but the registration is inconsistent — they should be reclassified as **components of `conversation`** (or given `visibility`). Note: `cx_user_request` is the table you want M2M-linked to `wf_run`.
2. **skill system rows** are service-role-write only (least privilege). Add one `is_admin()` write policy if admins need to edit the global library in-app.
3. **tasks cutover (deferred):** repoint skill `task_id` policies to canonical, then drop `tasks_canonical_bridge` + vestigial `user_id`/`is_public`.
4. **chat vestigial `user_id`** columns linger on many components — drop after a function-ref check (same audit method used this session).
5. **tool sharing:** `tool`/`tool_bundle` are not in `shareable_resource_registry` (treated as config). If you want link-shareable custom tools, add a `has_permission` branch to `apply_config_rls` and register them.

## 8. Migrations applied this session (in order)
`skill_canon_1_columns_visibility` → `skill_canon_2_register_entity_types` → `skill_canon_3_rls_and_registry` → `agent_canon_1_columns_visibility` → `agent_canon_2_register_entity_types` → `agent_canon_3_rls_card_registry` → `app_canon_1_columns_and_register` → `app_canon_2_rls_and_registry` → `chat_canon_repoint_entity_types` → `ai_config_hybrid_and_generator` → `tool_canon_1_columns_and_reference_helper` → `tool_canon_2_register_entity_types` → `tool_canon_3_rls` → `fix_agx_usage_fns_aga_to_app` → `teardown_drop_ctx_wr_shims` → `files_registry_repoint_off_shims` → `teardown_drop_file_shims`.

---

# DB Feature Update Checklist

<feature_update_checklist>
```md
## Canonical checklist — confirm on EVERY entity. Legacy pattern → canonical.

**1. Owner** — `created_by uuid` (+ `updated_by`). Kill: `user_id`/`owner_id`/`author_id`/`creator_id` meaning owner → `created_by`.

**2. Org** — `organization_id uuid NOT NULL` (FK organizations).

**3. Visibility** — `visibility` of type `platform.visibility` (`private < internal < link < public`). "Make public" = set `visibility='public'`. Kill: free-text visibility, or an `is_public` boolean as the access driver.

**4. Sharing (grants)** — grants are ROWS in `public.permissions` (`resource_type`, `resource_id`, `granted_to_user_id`/`granted_to_organization_id`, `permission_level`, `status`, `expires_at`).
- ONE TOKEN: `resource_type` MUST equal the entity token — *identical* across `entity_types.token`, `shareable_resource_registry.resource_type`, and `permissions.resource_type`. The registry `table_name` is routing only, NEVER the grant token. (Mismatch → `has_access` silently ignores the grant.)
- Register in `shareable_resource_registry` (`owner_column` = `created_by`).
- Kill: any per-feature `<x>_permissions`/`_shares`/`_collaborators`/`_acl` table or `shared_with` jsonb → migrate rows into `public.permissions`, then graveyard.

**5. Access (RLS)** — generate with `iam.apply_rls` (NEVER hand-write). Policies delegate to `iam.has_access('<token>', id, level)`, but SELECT/UPDATE must LEAD with `created_by = (select auth.uid())` — a `has_access`-only policy breaks `INSERT…RETURNING` (42501). Plus one anon policy `visibility = 'public'`. Register in `entity_types`; containment in `entity_relationships` (`kind='containment'`, `fk_column`). Kill: bespoke "can-I-see-this" funcs, blanket org-member reads, owner-only checks hard-wired to `user_id`.

**6. Versions** — `version int` bumped by trigger; `is_versioned=true` in `entity_types` for history. Kill: parallel/ad-hoc version tracking.

**7. Soft delete** — `deleted_at timestamptz` (NULL = live). Kill: `is_deleted`/`deleted` boolean, `status='deleted'`.

**8. Timestamps** — `created_at`, `updated_at` (shared touch trigger).

**One-line test:** "`created_by` + `deleted_at` + `visibility` enum, shares via `public.permissions` keyed on the entity token, reads via `iam.has_access` generated by `apply_rls`? If no to any → fix it."
```
</feature_update_checklist>

# Access System

```text
Visibility
----------
Public
  • Anyone can discover and access.
  • Example: Blog posts, podcasts, public templates.

Discoverable
  • Anyone can discover, but access may still be restricted.
  • Example: Public applets, marketplace items, shared-by-link content.

Shared (or Internal)
  • Visible only to your organization and explicitly authorized projects or collaborators.
  • Example: Workers' comp reports, internal documents, HIPAA or confidential business data.

Private
  • Visible only to users who have been explicitly granted access.
  • Example: AI conversations, personal notes, drafts.

Special Handling (not a visibility tier)
----------------------------------------
Secret / Protected
  • Sensitive values requiring additional safeguards.
  • Examples: API keys, GitHub tokens, OAuth credentials, environment variables, encryption keys.
```

```text
Access
------
Viewer
  • Can view only.

Commenter
  • Can view and comment, but cannot modify content.

Editor
  • Can create, edit, delete, and comment, but cannot manage ownership or permissions.

Owner
  • Full control, including permissions, sharing, transfer of ownership, deletion, and administration.
  • Ownership may belong to an individual user or an organization.
```

> **Visibility answers "Who can discover this item?" Access answers "What can an authorized user do with it?" Secrets are an additional protection layer, not another visibility tier.**
