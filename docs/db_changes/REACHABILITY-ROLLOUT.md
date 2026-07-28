# Reachability & Relationship Registry — Rollout Guide

**Audience:** AI Matrx engineering team + coding agents
**Database:** `automation-matrx` (Supabase project `txzxabzwovsujtloxrus`)
**Status:** Core system is **deployed and live in production** as of 2026-07-06. **§2 immediate actions and §4 admin UI: EXECUTED 2026-07-06** (same day, follow-up session). Live state: containers registered as shareable (§2.1), RLS gaps closed on `files.files` / `transcripts.transcripts` / `transcripts.studio_sessions` (§2.2 — `workbench.notes`, `chat.conversation`, `workspace.tasks` were already registered), war_room↔project normalized (§2.3 — **`project→war_room`**, per Arman: a war room is MUCH bigger than a project — many threads make a war room, and a thread already carries notes/files/chats a project doesn't; the FE writer already wrote this shape; **conveyance is deliberately `none` — whether a war-room share grants project access is set by Arman in the Relationship Manager, never by an agent**; a `trg_associations_auto_orient` BEFORE-INSERT trigger REJECTS any wrong-way write of a registered pair with an error naming the registered direction), Wave 1 rules flipped **plus** `note→project`, `research_topic→project`, `message→task` (viewer), `fc_card→fc_set` (13 conveying rules; 1,163+ closure rows, max depth 3), Appendix A rollback test passed (viewer inherited, editor denied), admin RPCs live **in `public.` (NOT `platform.` — see correction in §4.1)**, and the Relationship Manager ships at `/administration/database/relationships`. Enforcement (§2.6) remains OFF; unregistered pairs = 0, so it can be enabled from the UI at will. Migrations: `migrations/reachability_*.sql` + `relationship_manager_admin_rpcs.sql`, all ledger-recorded.

---

## 0. The problem this solves, in one paragraph

Sharing a container must cascade to its contents: *"If I share a Thread with you with read-only access, you gain read-only access to everything associated with that thread — and when I revoke it, your access is gone."* This is a graph-reachability problem (the same shape Google Drive, Notion, and Zanzibar solve). The architecture decision, now implemented: **materialize the containment graph at write time, resolve the human at read time.** The container→contents closure is precomputed into a flat cache maintained by triggers; user grants and memberships are always evaluated live. Result: RLS stays a stack of flat indexed lookups (zero recursion at read time), and revocation is instant by construction (deleting a grant row takes effect on the next query — no cache to invalidate).

**The load-bearing invariant:** `platform.associations` + `platform.association_types` + `iam.permissions` + `iam.memberships` are the source of truth. `platform.reachability` is a **disposable cache** — rebuildable at any moment via `platform.rebuild_reachability()`. Never hand-edit it. Never treat it as truth.

**Shared Knowledge (2026-07-10, page_image retarget 2026-07-11):** library `data_store_grants` ride this same graph — `file→data_store`, `processed_document→file`, page-image `file→file` (all `conveys_max=viewer`). `iam.has_access` / `has_access_as` admit grant readers on those containers. See `features/rag/FEATURE.md` § Shared Knowledge Resources. Migrations: `library_store_file_reachability_cascade.sql` + `library_reachability_cascade_hardening.sql` + `page_image_assoc_retarget_to_source_file.sql`.

---

## 1. What was deployed (three migrations, 2026-07-06)

### 1.1 `platform.association_types` — the edge dictionary

Registry of known `(source_type, target_type[, label])` association shapes. Parallel to `platform.entity_types`: that table registers *things*, this one registers *relationships between things*. Seeded with all **29 type-pairs** that existed in `platform.associations` at deploy time, all with `container_side = 'none'` (known, conveying nothing).

| Column | Meaning |
|---|---|
| `source_type`, `target_type` | FK → `platform.entity_types(token)`. The edge shape. |
| `label` | `NULL` = rule applies to any label. A label-specific rule takes precedence over the generic rule for the same pair. |
| `container_side` | `'none'` = known relationship, conveys **no** access (safe default). `'source'` = the source is the container. `'target'` = the target is the container. This also permanently resolves source/target direction ambiguity: the registry is the canonical answer. |
| `conveys_max` | `permission_level` ceiling on inherited access through this edge type. Default `'editor'` — admin on a container never silently confers admin on contents. Set `'viewer'` for relationship types that should only ever convey read access. |
| `is_active` | Deactivate a rule without deleting its history. |
| `notes` | Free text. Use it. |

Unique on `(source_type, target_type, COALESCE(label, ''))`.

### 1.2 `platform.reachability` — the closure cache

Flat rows: *"item X is inside container C at depth D, conveying at most level L."* Contains **no user data and no grants** — only graph structure.

- PK `(container_type, container_id, item_type, item_id)`; secondary index on `(item_type, item_id)` for the `has_access` lookup direction.
- `depth` (1 = direct, 2+ = transitive), `max_level` = `LEAST(conveys_max along the path)`; when multiple paths reach the same item, the most permissive path wins and the shallowest depth is recorded.
- Cycle-guarded (path tracking) and depth-capped at **8** during derivation. Cycles in the raw association data (e.g., the existing `war_room↔project` edges) cannot loop or corrupt the cache.

### 1.3 Functions

| Function | What it does |
|---|---|
| `platform.derive_reachability(type, id)` | Pure derivation: everything reachable downward from one container. The single source of closure logic. |
| `platform.refresh_reachability(type, id)` | Delete + re-derive one container's rows. Serialized per-container via advisory transaction lock (safe under concurrency — no incremental delta math that can drift). |
| `platform.reachability_ancestors(type, id)` | All containers that transitively contain a node (used to find affected cache rows on edge changes). |
| `platform.rebuild_reachability()` → `bigint` | Nuke and rebuild the entire cache from the tuples. Returns row count. **The reset button.** |

### 1.4 Triggers

| Trigger | Table | State | Behavior |
|---|---|---|---|
| `trg_associations_reachability` | `platform.associations` | **enabled** | On insert/delete/update of edge columns: if the edge matches an active containment rule, refresh the edge's container plus all its ancestors. Edges whose pair conveys nothing are a complete no-op. |
| `trg_association_types_reachability` | `platform.association_types` | **enabled** | Any rule change → full rebuild (statement-level). This is why flipping a rule propagates instantly. |
| `trg_associations_enforce_known` | `platform.associations` | **DISABLED** | When enabled: rejects any association whose `(source_type, target_type, label)` is not registered and active. Enable only after app code is aligned (see §2.6). |
| `trg_association_types_touch` | `platform.association_types` | enabled | Keeps `updated_at` honest. |

### 1.5 The new pass in `iam.has_access`

Placed immediately after the direct-membership pass. For each reachability row where `item = (p_type, p_id)` and `max_level >= p_required`, the caller gains access if they hold the container by any of:

1. **Explicit grant** — `public.has_permission(container_type, container_id, p_required)` (covers user grants *and* org grants, respects `status` and `expires_at`).
2. **Membership** — live row in `iam.memberships` on the container whose role confers `>= p_required` via `iam.membership_grant`.
3. **Ownership** — `created_by` on the container row (e.g., a collaborator added a note to *my* thread; as the thread owner I see it).

Deliberate exclusions: a container being `public` or org-`internal` does **not** cascade to contents through this pass. Item-level visibility passes still apply to the item itself as before.

Effective inherited level = `LEAST(level held on container, conveys_max along path)`. Viewer share on a thread ⇒ viewer on its contents, never more.

### 1.6 What did NOT change

All existing passes (owner, org-admin oversight, public read, system orgs, super admin, explicit grant, direct membership, org context, FK-based `entity_relationships` containment, component composition) are untouched. With all rules at `'none'`, the new pass is a strict no-op — verified in production. **No one has gained or lost access from this deployment.**

### 1.7 End-to-end verification already performed

A rolled-back production test (rules flipped inside a transaction, real note/thread/user, transaction aborted) confirmed: 667 closure rows built (406 depth-1, 261 depth-2; war rooms transitively reached 33 notes through threads); a non-owner with **no** baseline access to a note gained **viewer** on it purely by receiving viewer on the containing thread; **editor was correctly denied**; all state rolled back to zero.

---

## 2. Immediate actions (do these in order)

### 2.1 Register the container types as shareable resources

`iam.permissions` has a validation trigger (`permissions_validate_resource_type`): a grant row can only be written for a `resource_type` registered in `platform.shareable_resource_registry`. **`thread`, `war_room`, `project`, and `studio_session` are not registered** — so containers cannot be shared at all yet. `task` is already registered.

```sql
-- Template — verify schema/table/owner_column against platform.entity_types
-- and each table's actual columns before running. Fill in real URL routes.
INSERT INTO platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column,
   display_label, url_path_template, rls_uses_has_permission)
VALUES
  ('thread',         'workspace', 'threads',   'id', 'created_by', 'Thread',   '/threads/{id}',   true),
  ('war_room',       'workspace', 'war_rooms', 'id', 'created_by', 'War Room', '/war-rooms/{id}', true),
  ('project',        '<verify>',  '<verify>',  'id', '<verify>',   'Project',  '/projects/{id}',  true),
  ('studio_session', '<verify>',  '<verify>',  'id', '<verify>',   'Session',  '/sessions/{id}',  true);
```

Pull `schema_name`/`table_name` from `platform.entity_types` (`SELECT token, schema_name, table_name FROM platform.entity_types WHERE token IN ('thread','war_room','project','studio_session');`) and confirm the owner column on each table.

### 2.2 Close the RLS delegation gaps

Inherited access only works where a table's RLS actually calls the judge. The registry's own notes flag tables whose RLS predates the canonical pattern:

- `workbench.notes` — "uses user_id + organization scope; add has_permission"
- `public.prompts` — same
- `workspace.tasks` — "does not call has_permission(); tracked in rls-rollout"
- `agent.definition` (agx_agent) — "sharing rows insert but grantee can't see; tracked in rls-rollout"

**The fix for all of them:** RLS policies should delegate to **`iam.has_access(<token>, id, <level>)`** — the single judge — not `has_permission` alone. `has_access` already composes explicit grants + memberships + inherited containment + everything else. Use the canonical conformance machinery (`platform.create_entity_table` / `iam.verify_canonical` / `entity_types.rls_variant`) rather than hand-writing policies. **Priority tables for the thread cascade to actually work end-to-end: `workbench.notes`, `files.files`, `chat.conversation`, and transcripts.** Audit any other content table that will sit inside a container.

### 2.3 Decide the canonical direction for `war_room ↔ project`

Both `project→war_room` and `war_room→project` edges exist today (2 each). Pick one canonical direction, register it, and migrate the reverse edges. Suggested semantics: a war room lives inside a project → keep `war_room→project` with `container_side='target'` (project contains war room), and rewrite the two `project→war_room` rows to the canonical direction. The trigger's cycle guard keeps the cache sane either way, but the registry should hold one truth. This is a product decision — confirm with Arman.

### 2.4 Flip the first containment rules

See §3 for the full decision table. The recommended first wave (safe, obvious containment):

```sql
UPDATE platform.association_types
   SET container_side = 'target',
       notes = 'Wave 1 containment — thread/task cascade enabled ' || now()::date
 WHERE (source_type, target_type) IN (
   ('note','thread'), ('file','thread'), ('conversation','thread'),
   ('studio_session','thread'), ('thread','war_room'),
   ('working_document','conversation'),
   ('note','task'), ('artifact','task'), ('conversation','task')
 );
```

The rules trigger rebuilds the closure automatically — no further step. `conveys_max` stays at the `'editor'` default unless a rule warrants tightening (see §3).

### 2.5 Verify

Run the safe test recipe in Appendix A (transaction-rollback pattern — proves the cascade with real data without persisting anything), then do one real smoke test: grant a teammate viewer on a thread, confirm they can see its notes/files, revoke, confirm access is gone on the next request.

### 2.6 (Later) Enable relationship enforcement

Once all app code paths that insert into `platform.associations` are known to write registered pairs (the admin UI's "unregistered pairs" panel — §4 — will show any strays):

```sql
ALTER TABLE platform.associations ENABLE TRIGGER trg_associations_enforce_known;
```

From then on, an unregistered edge shape is rejected at write time with a clear error. New relationship = one registry `INSERT` first (or one click in the admin UI). This makes the registry *required*, which is the end-state design: no association exists whose meaning and direction aren't declared.

---

## 3. Which relationships should convey access

### 3.1 The principle

**Direction doctrine (load-bearing): little points to big.** The edge's **source is the smaller thing; the target is the bigger thing it points to** (a task points to its project, a note to its thread, a project to its war room — the size hierarchy is a PRODUCT fact set by Arman, not inferred by agents; when unsure, ask or leave a note in the registry). `container_side='target'` is the norm; `'source'` declares a deliberately-inverted stored edge and requires a documented reason in `notes`. The registry is the single truth of direction; `trg_associations_auto_orient` (BEFORE INSERT on `platform.associations`) **REJECTS** any write whose reverse pair is the registered one — the writer gets stuck with an error naming the canonical direction; direction changes happen in the Relationship Manager, not in code. The UI flags rules with wrong-way edges (`reverse_edge_count`). Two-way relationships exist only when BOTH directions are registered active — a deliberate design act, never an accident. **Direction ≠ conveyance:** registering the direction of a pair is structural; flipping `container_side` so it conveys access is a human decision made in the UI.

Ask one question per relationship type: **"If I share X with someone, should Y come with it?"**

- **Containment** (yes): the edge means *belongs inside* — a note in a thread, a file in a thread, a thread in a war room, an artifact on a task. Sharing the container without its contents would be meaningless.
- **Semantic linkage** (no): the edge means *is related to* — a research source tagged with a keyword, an agent linked to a surface, an entity attached to a ctx scope. These carry meaning, not membership. Cascading access through them causes accidental exposure. **Default is always `'none'`; conveying access is opt-in per rule.**

The product intent (from Arman): anything that is a container/workspace — **Project, Task, War Room, Thread, Session** — cascades whatever access level is granted on it to everything inside it: files, notes, transcripts, conversations/chats, and (transitively) anything associated with those conversations. Transitivity is automatic: once `conversation→thread` and `working_document→conversation` both convey, sharing a war room reaches working documents at depth 3 (cap is 8).

### 3.2 Decision table for all 29 registered pairs

Direction note: in every YES row below, the existing edges already point item→container, so the setting is `container_side='target'`.

| # | source → target | Edges | Decision | conveys_max | Rationale |
|---|---|---|---|---|---|
| 1 | note → thread | 49 | **YES** | editor | Core cascade |
| 2 | file → thread | 2 | **YES** | editor | Core cascade |
| 3 | conversation → thread | 2 | **YES** | editor | Core cascade; opens the chat subtree |
| 4 | studio_session → thread | 317 | **YES** | editor | Sessions belong to threads |
| 5 | thread → war_room | 47 | **YES** | editor | Container nesting |
| 6 | working_document → conversation | 29 | **YES** | editor | The "everything associated with the chat" hop |
| 7 | note → task | 16 | **YES** | editor | Task workspace |
| 8 | artifact → task | 11 | **YES** | editor | Labeled edges; generic rule is fine |
| 9 | conversation → task | 1 | **YES** | editor | Task workspace |
| 10 | note → project | 1 | **YES** | editor | Project workspace |
| 11 | research_topic → project | 13 | **YES** | editor | Project contains its research topics |
| 12 | message → task | 4 | **YES** | **viewer** | Referenced messages should be readable, not editable, via the task |
| 13 | agent → project | 3 | **DECIDE** | viewer if yes | Should project members *see/use* the agent? Probably yes at viewer; never editor via cascade |
| 14 | war_room → project | 2 | **DECIDE §2.3** | editor | Pick canonical direction first |
| 15 | project → war_room | 2 | **DECIDE §2.3** | — | Reverse of #14; migrate to canonical |
| 16 | fc_card → fc_set | 471 | **YES when fc_set sharing ships** | editor | A set genuinely contains its cards |
| 17 | tool → tool_bundle | 88 | **DECIDE** | viewer if yes | If bundles become shareable, members should see tools; viewer cap |
| 18 | file → scope | 24 | NO | — | ctx/scope edges are configuration, not sharing |
| 19 | conversation → scope | 23 | NO | — | Same |
| 20 | note → scope | 20 | NO | — | Same |
| 21 | project → scope | 16 | NO | — | Same |
| 22 | task → scope | 13 | NO | — | Same |
| 23 | thread → scope | 5 | NO | — | Same |
| 24 | war_room → scope | 1 | NO | — | Same |
| 25 | research_source → research_keyword | 3023 | NO | — | Pure tagging |
| 26 | research_source → research_tag | 47 | NO | — | Pure tagging |
| 27 | agent → surface | 30 | NO | — | Deployment linkage |
| 28 | agent → agent | 21 | NO | — | Agent graph, not containment |
| 29 | agent → organization | 1 | NO | — | Org access flows through iam, never through associations |

### 3.3 Future relationships

Transcripts are not yet linked via `platform.associations` (they flow through the scope system today). When transcript→thread / transcript→session / transcript→war_room edges are introduced, register them **first** (especially once enforcement is on) with `container_side='target'`, `conveys_max='editor'`. Same procedure for any new content type entering a container: one registry row, and the cascade is live.

### 3.4 `conveys_max` guidance

- `editor` (default): full collaboration inside a shared workspace — an editor on the thread can edit its notes. Admin on the container still only conveys editor on contents; item-level admin requires ownership or a direct grant. This asymmetry is deliberate and matches Drive/Notion behavior.
- `viewer`: for reference-style containment (messages on tasks, agents on projects, tools in bundles) — visible through the container, never editable through it.
- `admin`: avoid. Only if a relationship should transmit full control, which is almost never right through a cascade.

---

## 4. Admin UI spec — "Relationship Manager" (Matrx Admin)

**Purpose:** Arman must be able to manage all of the above **without writing SQL**: see every known relationship, control which ones convey access and at what ceiling, register new ones, inspect what a container reaches, rebuild the cache, and toggle enforcement.

**Suggested route:** `/administration/database/relationships` in Matrx Admin (Next.js App Router).

### 4.1 Server-side API layer — create these RPCs first

> ✅ **DONE 2026-07-06 — with one correction: the RPCs live in `public.`, not `platform.`** The `platform` schema is not PostgREST-exposed, so supabase-js can never call `platform.*` functions; FE-callable RPCs must live in an exposed schema (this is the same pattern as the `assoc_*` family). Also: `p_label`/`p_notes` on the upsert got `DEFAULT NULL` + `NULLIF(p,'')` normalization — args without SQL defaults generate *required* params in the FE types, and a `''` label would half-collide with the `COALESCE(label,'')` unique index. Canonical source: `migrations/relationship_manager_admin_rpcs.sql`.

Do **not** hit the platform tables directly from the client. Create thin `SECURITY DEFINER` RPCs, each guarded by `public.is_super_admin()` (already exists and is used by `iam.has_access`). Apply as one migration; grant execute to `authenticated` (the guard does the gating).

```sql
-- ============================================================
-- Admin RPCs for the Relationship Manager UI
-- ============================================================

-- 1. List all rules with live edge counts and closure impact
CREATE OR REPLACE FUNCTION platform.admin_relationship_rules()
RETURNS TABLE (
  source_type text, target_type text, label text,
  container_side text, conveys_max permission_level,
  is_active boolean, notes text,
  created_at timestamptz, updated_at timestamptz,
  edge_count bigint, closure_rows bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.source_type, r.target_type, r.label,
         r.container_side, r.conveys_max, r.is_active, r.notes,
         r.created_at, r.updated_at,
         (SELECT count(*) FROM platform.associations a
           WHERE a.source_type = r.source_type AND a.target_type = r.target_type
             AND (r.label IS NULL OR a.label = r.label)) AS edge_count,
         (SELECT count(*) FROM platform.reachability x
           WHERE r.container_side = 'target' AND x.container_type = r.target_type AND x.item_type = r.source_type
              OR r.container_side = 'source' AND x.container_type = r.source_type AND x.item_type = r.target_type) AS closure_rows
  FROM platform.association_types r
  WHERE public.is_super_admin()
  ORDER BY (r.container_side <> 'none') DESC, edge_count DESC;
$$;

-- 2. Association pairs present in data but missing from the registry
--    (must be empty before enabling enforcement)
CREATE OR REPLACE FUNCTION platform.admin_unregistered_pairs()
RETURNS TABLE (source_type text, target_type text, label text, edge_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.source_type, a.target_type, a.label, count(*)
  FROM platform.associations a
  WHERE public.is_super_admin()
    AND NOT EXISTS (
      SELECT 1 FROM platform.association_types r
      WHERE r.source_type = a.source_type AND r.target_type = a.target_type
        AND (r.label IS NULL OR r.label = a.label) AND r.is_active)
  GROUP BY 1, 2, 3 ORDER BY count(*) DESC;
$$;

-- 3. Create or update a rule (upsert). Closure rebuilds automatically via trigger.
CREATE OR REPLACE FUNCTION platform.admin_upsert_relationship_rule(
  p_source_type text, p_target_type text, p_label text,
  p_container_side text, p_conveys_max permission_level,
  p_is_active boolean, p_notes text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO platform.association_types
    (source_type, target_type, label, container_side, conveys_max, is_active, notes)
  VALUES (p_source_type, p_target_type, p_label, p_container_side, p_conveys_max, p_is_active, p_notes)
  ON CONFLICT (source_type, target_type, COALESCE(label, ''))
  DO UPDATE SET container_side = EXCLUDED.container_side,
                conveys_max    = EXCLUDED.conveys_max,
                is_active      = EXCLUDED.is_active,
                notes          = EXCLUDED.notes;
END $$;

-- 4. Rebuild the cache; returns row count for display
CREATE OR REPLACE FUNCTION platform.admin_rebuild_reachability()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN platform.rebuild_reachability();
END $$;

-- 5. Inspect: what does this container reach?
CREATE OR REPLACE FUNCTION platform.admin_reachability_contents(p_type text, p_id uuid)
RETURNS TABLE (item_type text, item_id uuid, depth int, max_level permission_level)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.item_type, r.item_id, r.depth, r.max_level
  FROM platform.reachability r
  WHERE public.is_super_admin()
    AND r.container_type = p_type AND r.container_id = p_id
  ORDER BY r.depth, r.item_type;
$$;

-- 6. Inspect: which containers convey access to this item? ("why can they see this?")
CREATE OR REPLACE FUNCTION platform.admin_reachability_containers(p_type text, p_id uuid)
RETURNS TABLE (container_type text, container_id uuid, depth int, max_level permission_level)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.container_type, r.container_id, r.depth, r.max_level
  FROM platform.reachability r
  WHERE public.is_super_admin()
    AND r.item_type = p_type AND r.item_id = p_id
  ORDER BY r.depth;
$$;

-- 7. Toggle enforcement; returns the new state
CREATE OR REPLACE FUNCTION platform.admin_set_association_enforcement(p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_enabled THEN
    ALTER TABLE platform.associations ENABLE TRIGGER trg_associations_enforce_known;
  ELSE
    ALTER TABLE platform.associations DISABLE TRIGGER trg_associations_enforce_known;
  END IF;
  RETURN p_enabled;
END $$;

-- 8. System status card
CREATE OR REPLACE FUNCTION platform.admin_relationship_system_status()
RETURNS TABLE (
  total_rules bigint, rules_conveying bigint, closure_rows bigint,
  max_depth int, enforcement_enabled boolean, unregistered_pairs bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    (SELECT count(*) FROM platform.association_types),
    (SELECT count(*) FROM platform.association_types WHERE container_side <> 'none' AND is_active),
    (SELECT count(*) FROM platform.reachability),
    (SELECT COALESCE(max(depth), 0) FROM platform.reachability),
    (SELECT tgenabled <> 'D' FROM pg_trigger WHERE tgname = 'trg_associations_enforce_known'),
    (SELECT count(*) FROM platform.admin_unregistered_pairs())
  WHERE public.is_super_admin();
$$;

GRANT EXECUTE ON FUNCTION
  platform.admin_relationship_rules(),
  platform.admin_unregistered_pairs(),
  platform.admin_upsert_relationship_rule(text, text, text, text, permission_level, boolean, text),
  platform.admin_rebuild_reachability(),
  platform.admin_reachability_contents(text, uuid),
  platform.admin_reachability_containers(text, uuid),
  platform.admin_set_association_enforcement(boolean),
  platform.admin_relationship_system_status()
TO authenticated;
```

### 4.2 UI screens

Follow the SSR-first architecture standard (see `nextjs-ssr-architecture` skill): Server Components by default; fixed-dimension shells with dimension-matched skeletons inside granular `<Suspense>` boundaries; interactivity isolated into thin `'use client'` islands; never mark the whole page `'use client'`; if any of this data needs Redux, hydrate once via a null-rendering hydrator with a `useRef` guard. Strict TypeScript throughout — type the RPC payloads.

**Screen 1 — Registry table (the main view).**
Data from `admin_relationship_rules()`, fetched server-side. One row per rule showing: the relationship rendered in **plain language** (see below), edge count, status badges (`Conveys access` / `Known only`, `Active` / `Inactive`), `conveys_max`, closure row count for conveying rules. Sort conveying rules first, then by edge count. Filters: conveying / known-only / inactive; free-text over type names. Row click → editor drawer.

**Plain-language rendering is the most important UI detail.** Never show raw `container_side` values. Render each rule as a sentence:

> **Thread contains Note** — sharing a Thread grants up to **editor** on its Notes. *(49 existing links)*
> **Note ↔ Scope** — known relationship, conveys no access. *(20 existing links)*

Use `entity_types.label` for display names (`SELECT token, label FROM platform.entity_types` — cache server-side).

**Screen 2 — Rule editor (drawer or modal).**
Fields: container side as a three-way choice rendered in plain language ("Neither — just a known relationship" / "**{source label}** is the container" / "**{target label}** is the container"), `conveys_max` (viewer/editor/admin with the guidance from §3.4 as helper text; visually discourage admin), active toggle, notes. A live preview sentence updates as the user changes fields. **Guardrail:** when a change flips a rule from `none` → conveying (or changes side/cap on a conveying rule), show a confirmation dialog: *"This will immediately make N existing associations convey access, and the reachability cache will rebuild. Continue?"* (N = `edge_count`). Save via `admin_upsert_relationship_rule`; on success, refresh the status card (rebuild already happened via trigger).

**Screen 3 — Unregistered pairs.**
Data from `admin_unregistered_pairs()`. Each row: pair + label + edge count + a one-click **Register as known** action (calls the upsert with `container_side='none'`). Banner logic: this list must be empty before enforcement can be enabled; if enforcement is on and this list is non-empty, show a red alert (means enforcement was toggled while strays existed — shouldn't happen, but surface it).

**Screen 4 — Reachability inspector.**
Two lookups: (a) pick a container (entity type dropdown from `entity_types` where sensible + UUID input, or an entity picker if one exists in Matrx Admin) → table of contents from `admin_reachability_contents` with depth and max_level, grouped by depth; (b) reverse — pick an item → `admin_reachability_containers` shows every container that conveys access to it. This is the "why can this person see this?" debugging tool.

**Screen 5 — System controls card.**
From `admin_relationship_system_status()`: total rules, conveying rules, closure rows, max depth, enforcement state, unregistered pair count. Actions: **Rebuild cache** button (calls `admin_rebuild_reachability`, shows returned row count, confirm dialog noting it's always safe — the cache is disposable); **Enforcement toggle** (calls `admin_set_association_enforcement`; disable the "on" switch while unregistered pairs > 0, with an explanatory tooltip linking to Screen 3).

### 4.3 Implementation notes for the coding agent

- The platform tables have no client grants; all reads/writes go through the RPCs above. Server Components can call them with the user's Supabase session client; the `is_super_admin()` guard handles authorization. Gate the route itself with the existing Matrx Admin admin-guard pattern as well.
- Mutations from client islands: server actions or route handlers calling the RPCs, then `revalidatePath`/refresh of the affected server data.
- Rule changes are rare and admin-driven; the automatic full rebuild they trigger is intentional and cheap at current scale (~4k associations). Don't debounce or batch around it.
- Do not build any UI that writes to `platform.reachability` directly. If a "fix the cache" affordance is ever wanted, it is exactly one button: rebuild.

---

## 5. Operational invariants & gotchas

1. **Cache is disposable; tuples are truth.** Any doubt about `reachability` → rebuild. Never patch rows by hand.
2. **Revocation is instant by design.** Grants and memberships are evaluated live; deleting a `permissions` row or soft-deleting a membership cuts inherited access on the next query. `expires_at` on permissions also just works — no sweeper needed.
3. **Public/internal visibility does not cascade.** A public container does not make its contents public. Deliberate. Don't "fix" this without a design discussion.
4. **`conveys_max` composes as LEAST along a path; best path wins across paths.** A viewer-capped hop anywhere in the chain caps everything below it through that path.
5. **Label-specific rules beat generic rules** for the same pair. If both exist and disagree, the label rule governs edges with that label.
6. **Depth cap 8, cycle guard on.** Edges creating cycles won't loop derivation; they just stop contributing at the repeat point. Still: keep the containment projection a DAG (see §2.3).
7. **Every content table inside a container must delegate RLS to `iam.has_access`.** A perfect closure does nothing for a table whose policies never ask the judge (§2.2).
8. **Container sharing requires `shareable_resource_registry`** (§2.1) — that's the write-side gate on `iam.permissions`, independent of this system.
9. **New content types:** register the entity (`entity_types`), the relationship (`association_types`), the shareability (`shareable_resource_registry` if directly grantable), and ensure canonical RLS. Then containment is config, not code.
10. **Performance watch-items** (not concerns at current scale): the association trigger refreshes container + ancestors per edge change — if a future bulk-import writes thousands of containment edges, wrap it and call `rebuild_reachability()` once after, or convert the trigger to statement-level with transition tables at that time.

---

## Appendix A — Safe verification recipe (no persistent changes)

Runs the full chain against real data inside a transaction, then aborts via exception so nothing persists. Adjust the rule list/types as needed. Expected output arrives in the error message.

```sql
DO $$
DECLARE
  v_item uuid; v_container uuid; v_owner uuid; v_user uuid;
  v_before boolean; v_after boolean; v_editor boolean;
BEGIN
  -- flip the rule(s) under test
  UPDATE platform.association_types SET container_side = 'target'
   WHERE (source_type, target_type) IN (('note','thread'));

  -- pick a real edge
  SELECT a.source_id, a.target_id INTO v_item, v_container
  FROM platform.associations a
  WHERE a.source_type = 'note' AND a.target_type = 'thread' LIMIT 1;

  SELECT created_by INTO v_owner FROM workbench.notes WHERE id = v_item;
  SELECT user_id INTO v_user FROM iam.memberships
   WHERE user_id IS DISTINCT FROM v_owner LIMIT 1;

  -- impersonate
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  v_before := iam.has_access('note', v_item, 'viewer');

  INSERT INTO iam.permissions (resource_type, resource_id, granted_to_user_id,
                               permission_level, status, created_by)
  VALUES ('thread', v_container, v_user, 'viewer', 'active', v_owner);

  v_after  := iam.has_access('note', v_item, 'viewer');   -- expect true
  v_editor := iam.has_access('note', v_item, 'editor');   -- expect false

  RAISE EXCEPTION 'TEST before=% after=% editor_denied=% closure_rows=%',
    v_before, v_after, NOT v_editor, (SELECT count(*) FROM platform.reachability);
END $$;
```

Note: this requires `thread` in `shareable_resource_registry` (§2.1); if testing before that lands, insert the registry row inside the same DO block (it rolls back too).

## Appendix B — Object quick reference

| Object | Kind | Notes |
|---|---|---|
| `platform.association_types` | table | Edge dictionary; 29 pairs seeded, all `'none'` |
| `platform.reachability` | table | Disposable closure cache |
| `platform.containment_edges` | view | Associations × active containment rules, normalized to (container, item, conveys_max) |
| `platform.derive_reachability(text, uuid)` | fn | Pure closure derivation for one container |
| `platform.refresh_reachability(text, uuid)` | fn | Scoped recompute, advisory-locked |
| `platform.reachability_ancestors(text, uuid)` | fn | Upward walk |
| `platform.rebuild_reachability()` | fn → bigint | Full rebuild from tuples |
| `platform.enforce_known_association()` | fn | Registration enforcement (trigger fn) |
| `trg_associations_reachability` | trigger | Live; maintains cache on edge changes |
| `trg_association_types_reachability` | trigger | Live; full rebuild on rule changes |
| `trg_associations_enforce_known` | trigger | **Disabled** until §2.6 |
| `iam.has_access` | fn | New inherited-containment pass after the membership pass |
