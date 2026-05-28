# FEATURE.md — `skills`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-05-27`

---

## Purpose

Agent skills are markdown-backed capability cards an agent can include in its
system preamble, list by name + description, or be forbidden from. This
feature is the user-facing half of the system — browse / create / edit /
delete / categorise / ingest, plus the per-agent `skill_config` picker.

---

## Entry points

**Routes**
- `app/(admin)/administration/skills/` — super-admin registry view + category
  tree editor + filesystem ingest panel.
- *(no top-level `/skills` route — full management lives inside the
  agent-connections window panel; see `(a)/agent-connections/skills` in
  features/agent-connections.)*

**Hooks**
- `useSkills({ types?, projectId?, isPublicOnly? })` — canonical "give me
  the visible skills list" hook (`features/skills/hooks/useSkills.ts`).
  Subscribes to the stream-event `lastIngestAt` and reloads + toasts
  whenever sandbox auto-discovery fires.
- `useSkill({ skillRef })` — single skill loader; accepts UUID or
  `skill_id` business key (`features/skills/hooks/useSkill.ts`).
- `useSkillCategories()` — category tree (`features/skills/hooks/useSkillCategories.ts`).
- `useSkillsIngest()` — admin-only; preview + apply against a list of paths
  (`features/skills/hooks/useSkillsIngest.ts`).
- `useSkillProjects(skillId)` — many-to-many associations via
  `skl_skill_projects` (`features/skills/hooks/useSkillProjects.ts`).

**Services**
- `features/skills/service/skillsStreamHandler.ts` — called from the
  central stream pump (`process-stream.ts`) when a `resource_changed`
  event has `kind` starting in `"skill"`.

**API endpoints** (Python backend — aidream)
- `GET    /api/skills` — list visible (system + public + own); supports
  `?category_id`, `?is_public_only`, `?project_id`, `?limit`.
- `GET    /api/skills/categories` — flat category list.
- `GET    /api/skills/{skill_ref}` — UUID or `skill_id` business key.
- `POST   /api/skills` — create (`is_public` honored; `is_system` forced
  to false server-side).
- `PATCH  /api/skills/{skill_id}` — update (owner / admin only).
- `DELETE /api/skills/{skill_id}` — soft-deactivate (owner / admin only).
- `POST   /api/skills/ingest` — admin-only filesystem ingest.
- `POST   /api/skills/{skill_id}/projects/{project_id}` — associate.
- `DELETE /api/skills/{skill_id}/projects/{project_id}` — disassociate.

**Redux slice(s)**
- `features/skills/redux/skillsSlice.ts` — state shape: `skills`,
  `categories`, `ingest`. Registered as `skills` in the root reducer.

---

## Data model

**Database tables** (Supabase, project `txzxabzwovsujtloxrus`)
- `public.skl_definitions` — one row per skill. Composite-unique on
  `(skill_id, user_id, organization_id, project_id)` so the same business
  key can exist for different scopes. RLS gates writes to owners / org +
  project admins.
- `public.skl_categories` — hierarchical (`parent_category_id` self-FK)
  category tree.
- `public.skl_resources` — file/markdown attachments tied to a skill
  (read-only stub for now; full CRUD endpoint pending).
- `public.skl_skill_projects` — many-to-many join, lets a single skill
  belong to many `ctx_projects` (migration 0094).
- `public.agx_agent.skill_config` — JSONB column on every agent row:
  `{ included: uuid[], listed: uuid[], forbidden: uuid[], disabled: bool }`.
  Structural CHECK constraint enforced by migration 0095.

**Key types** (`features/skills/types.ts`)
- `SkillRow` / `SkillDraft` — view model + form draft.
- `CategoryRow` — flat category shape; the tree is computed by the hook.
- `SkillConfig` — `{ included, listed, forbidden, disabled }` UUID arrays.
- `IngestReport` — server response shape for the admin ingest endpoint.

---

## Key flows

### 1. Browse and edit a skill (in the agent-connections window panel)

1. User opens the agent-connections window and selects "Skills" in the
   sidebar (rendered by `features/agent-connections/components/sections/SkillsSection.tsx`).
2. `useSkills()` loads `/api/skills`; the slice fills `skills.byId`.
3. The user clicks a row → SkillsSection enters `detail` mode, rendering
   `<SkillDetailEditor>` (`features/skills/components/SkillDetailEditor.tsx`).
4. The editor seeds a `SkillDraft` via `skillRowToDraft` and tracks a
   `changed` set as the user edits.
5. Save → `patchSkillFromDraft` thunk computes the patch body and posts
   `PATCH /api/skills/{id}`. The slice upserts the new row.

### 2. Sandbox auto-discovery surfaces new skills

1. The aidream backend's `resolve_and_arm_run` schedules
   `_auto_discover_skills` for any fresh sandbox binding.
2. The background task walks the sandbox's filesystem via the
   orchestrator's fs proxy, upserts SKILL.md files into `skl_definitions`,
   and emits `RESOURCE_CHANGED kind="skills.ingested"`.
3. The FE stream pump dispatches `applySkillStreamEvent` →
   `skillsActions.streamEventReceived` → `lastIngestAt` bumps.
4. `useSkills()` reacts: `fetchSkills` reloads; `toast.success("Discovered
   N skills")` fires from the metadata counts.

### 3. Admin ingest via the registry page

1. Super-admin opens `/administration/skills/ingest`.
2. They paste one or more paths and click "Dry run".
3. `useSkillsIngest().preview(roots)` → `POST /api/skills/ingest` with
   `dry_run: true`. Report shows what *would* land.
4. Click "Apply" → same hook, `dry_run: false`. Slice's `ingest.lastReport`
   updates; `fetchSkills` reloads to surface the new rows.

---

## Invariants & gotchas

- **Never read `skl_definitions` directly from Supabase on the frontend.**
  All reads go through `/api/skills` (the Python backend owns ownership
  filtering: system + public + own). The migration of the legacy
  `features/agent-connections/redux/skl/` slice is in progress.
- **`is_system=true` cannot be set by non-admins.** The backend forces it
  to `false` on POST regardless of payload. Admin-only paths (the
  filesystem ingest endpoint, the registry "System skill" toggle) are the
  only legal mints.
- **`SkillConfig` overlap is silently resolved by the runtime** — if a
  skill UUID appears in both `included` and `forbidden`, `forbidden` wins.
  The Postgres CHECK constraint in migration 0095 does NOT enforce
  non-overlap (subqueries aren't allowed in CHECK). The picker UI
  enforces it by moving a chip between lists when selected.
- **Project association is many-to-many.** The `skl_definitions.project_id`
  column is legacy / origin-only — the canonical list is
  `skl_skill_projects` exposed via `SkillRow.projectIds`.
- **The Phase A project-association endpoints aren't in the OpenAPI
  types yet.** Thunks use `as never` casts; remove them after
  `pnpm sync-types` once the backend deploys.

---

## Related features

- Depends on: `features/agent-connections` (the panel that surfaces the UI),
  `features/agents` (stream pump consumes events that drive
  `lastIngestAt`).
- Depended on by: `features/agents/components/builder` (Track 3 skill
  picker), `app/(admin)/administration/skills` (registry mirror).
- Cross-links: `aidream/docs/AGENT_SKILLS_HANDOFF.md` (backend contract),
  `aidream/packages/matrx-ai/matrx_ai/skills/MODULE_README.md`
  (server-side cheat sheet).

---

## Doctrine compliance

**Primitives reused**
- HTTP transport: `callApi()` from `lib/api/call-api.ts`.
- Reducer registration / typed hooks: `lib/redux/store.ts` + `lib/redux/hooks.ts`.
- Toast: `sonner` (global mount).
- Selector pattern: `createSelector` from `@reduxjs/toolkit`.
- Stream pump: `features/agents/redux/execution-system/thunks/process-stream.ts`.

**Primitives introduced**
- `SkillRow` / `SkillDraft` / `CategoryRow` / `IngestReport` /
  `SkillConfig` view-model types — needed a camelCase mirror of the
  Python wire shape; could not extend the Supabase-generated `Database`
  types because the new wire fields (`projectIds`, ingest report shape)
  don't exist in the DB row.
- `skills` reducer key — could not extend `skl` in agent-connections
  because that slice mixes render-blocks / render-components / resources
  with definitions, and Phase B of the plan deliberately separates them
  so render-blocks can keep their Supabase reads while definitions move
  to the Python backend.
- `skillsStreamHandler` — single dispatch site for skill-related
  `resource_changed` events; extending the stream pump's switch
  statement directly is the cousin pattern (`fsChangesSlice`), but the
  helper keeps each consumer's wiring isolated.

---

## Current work / migration state

Phases A–K of [`/.claude/plans/immutable-imagining-dove.md`](../../../../.claude/plans/immutable-imagining-dove.md) are landed. **Feature is 100% complete.**

- ✅ Backend (aidream): `/api/skills` CRUD + admin `/skills/categories`
  CRUD, `skl_skill_projects` join + endpoints, sandbox auto-discovery
  (`walk_via_proxy`, `_auto_discover_skills`, `RESOURCE_CHANGED` emit),
  structural CHECK on `agx_agent.skill_config`.
- ✅ Frontend foundation: `features/skills/` slice, thunks (Python +
  Supabase-direct, smart-dispatched by row ownership), converters,
  selectors, hooks, service.
- ✅ Frontend UI: full CRUD inside `SkillsSection` (browse / detail /
  create / categories / ingest), admin registry at
  `/administration/skills`. Categories editor supports drag-to-reparent,
  inline rename, color + icon pickers, "+ New" / "Delete" / "+ Add child".
- ✅ Resources panel: Supabase-direct CRUD mounted in
  `SkillDetailEditor` with drag-to-reorder and 256 KB content soft-cap.
- ✅ Per-agent picker: `AgentSkillsModal` mounted next to
  `AgentToolsModal` on the builder; `setAgentSkillConfig` round-trips
  through Supabase via `agentDefinitionToUpdate`.
- ✅ Legacy slice strip: `definitions` + `categories` removed from
  `features/agent-connections/redux/skl/`. Render-blocks /
  render-components / render-block-categories / resources stay in the
  old slice until their own future migration.
- ✅ Type-cast cleanup: only ~7 `as never` casts remain in
  `skillsThunks.ts`, all scoped to the new admin category endpoints
  that aren't in the deployed backend's OpenAPI yet. Drop after the
  next aidream deploy + `pnpm sync-types`.

---

## Change log

- `2026-05-27` — claude: finishing pass (phases H–K). Full category CRUD
  + drag-to-reparent via @dnd-kit; admin category POST/PATCH/DELETE
  endpoints on the Python router; SkillResourcesPanel with Supabase-
  direct CRUD mounted in SkillDetailEditor; `as never` cast cleanup
  using generated OpenAPI types via `satisfies`; legacy `skl` slice
  stripped of `definitions` + `categories` (render-blocks / resources
  intact for their own future migration). All four parallel verifiers
  GREEN. Feature is 100% complete.
- `2026-05-27` — claude: end-to-end build-out. Backend gaps closed
  (Tracks 2 + 3); frontend slice migration + full CRUD UI; agent-builder
  picker; admin registry mirror. See plan file for full commit chain.
- `2026-05-27` — claude: scaffold (types, slice, converters, selectors,
  thunks, hooks, stream handler, FEATURE.md).
