# 06 — Plan: Manual Assignment of Unassigned Content + Filter Polish

**Status:** detailed build plan (context-handoff) · **Date:** 2026-06-04
**Audience:** this repo (frontend agents), **AI Dream** (Python/server team), **Database** (migrations).
Companion to `05_REQUIREMENTS_AND_GAPS.md`. Every section tagged `[FE]` / `[aidream]` / `[DB]` so it can be
split and shared. **Write paths reuse existing primitives — most of this is one read RPC + one FE surface.**

---

## 0. Shipped in this wave (already done, `[FE]`)

- **Toolbar no-shift:** the toolbar no longer `flex-wrap`s; controls are fixed-width + `flex-none`, the variable
  node/edge count `truncate`s instead of pushing them, and the row scrolls horizontally on narrow widths. Changing
  a dropdown value never reflows the row. (`KgGraphCanvas.tsx`)
- **"All" is always available:** the org picker (`KgOrgFilter`) always renders with **"All organizations"** (null
  org → backend returns the union of visible orgs + global). Scope picker already had "All scopes". No more traps.

---

## 1. THE BIG ONE — "Assign the unassigned" (backfill org + scope at view time)

**Problem (owner's words):** content came in from a few ingestion / NER jobs; some of it never got an org or a
scope assigned at runtime. In the graph we must **surface everything that's unassigned and let the user set it
manually** — grouped by job, not point-by-point.

**Key model facts (verified):**
- The thing that carries org/scope is the **SOURCE** (a note / file / …), not the individual entity. Entities
  inherit scope via their source: `entity → kg_chunk_entities → kg_chunks(source_kind, source_id) → source`.
- **Scope** assignment lives in `public.ctx_scope_assignments (entity_type, entity_id, scope_id)` — e.g.
  `('note', <note_id>, <scope_id>)`. **Org** lives on the source row (e.g. `notes.organization_id`).
- **Job grouping:** `rag.kg_chunks.extraction_run_id` (the NER run) groups sources by ingestion job.
- "Unassigned" = a source with **no row in `ctx_scope_assignments`** (no scope) and/or a **null org**.
- The user can only assign scopes to **scopeable** entity types (note/file/task/… — see `scopeable_entities.md`).

### 1a. `[DB]` — one read RPC to list unassigned sources (the only new server-side piece)
A `SECURITY INVOKER` function (respects RLS, so the user only sees their own) that returns the **distinct sources**
feeding the graph that lack a scope and/or org, with the metadata the UI needs. Sketch:

```sql
create or replace function public.kg_unassigned_sources(
  p_organization_id uuid default null,   -- null = across everything visible
  p_run_id          uuid default null,   -- optional: one ingestion job
  p_limit           int  default 200,
  p_offset          int  default 0
) returns table (
  source_kind   text,
  source_id     text,
  source_name   text,          -- note label, etc. (null if unresolvable)
  extraction_run_id uuid,
  chunk_count   int,
  entity_count  int,
  has_org       boolean,
  scope_count   int
) language sql stable security invoker as $$
  with src as (
    select c.source_kind, c.source_id,
           max(c.extraction_run_id) as extraction_run_id,
           count(distinct c.id) as chunk_count
    from rag.kg_chunks c
    where (p_run_id is null or c.extraction_run_id = p_run_id)
    group by c.source_kind, c.source_id
  )
  select s.source_kind, s.source_id,
         -- name resolution per kind (extend as kinds are added)
         case when s.source_kind = 'note'
              then (select n.label from public.notes n where n.id = s.source_id::uuid)
         end as source_name,
         s.extraction_run_id, s.chunk_count,
         (select count(distinct ce.entity_id) from rag.kg_chunk_entities ce
            join rag.kg_chunks c2 on c2.id = ce.chunk_id
            where c2.source_kind = s.source_kind and c2.source_id = s.source_id) as entity_count,
         -- org: resolve per kind (note → notes.organization_id)
         case when s.source_kind = 'note'
              then (select n.organization_id is not null from public.notes n where n.id = s.source_id::uuid)
              else false end as has_org,
         (select count(*) from public.ctx_scope_assignments a
            where a.entity_type = s.source_kind and a.entity_id = s.source_id::uuid) as scope_count
  from src s
  where -- unassigned = no scope, OR no org
        (select count(*) from public.ctx_scope_assignments a
           where a.entity_type = s.source_kind and a.entity_id = s.source_id::uuid) = 0
     or (s.source_kind = 'note'
         and (select n.organization_id from public.notes n where n.id = s.source_id::uuid) is null)
  order by s.extraction_run_id, s.chunk_count desc
  limit p_limit offset p_offset;
$$;
```
Notes for the DB team:
- Add indexes if missing: `rag.kg_chunks (source_kind, source_id)`, `rag.kg_chunks (extraction_run_id)`,
  `public.ctx_scope_assignments (entity_type, entity_id)`.
- `source_id` is **text** in `kg_chunks` but the referenced ids are uuids → cast (`::uuid`) per kind; guard against
  non-uuid source_ids for other kinds.
- Extend the `case` arms as more `source_kind`s become assignable (file → filename + its org column, etc.).
- After creating the function: regenerate FE types (`pnpm db-types`).

### 1b. `[aidream]` — (optional) counts on the graph payload
Cheap win so the FE can badge "Unassigned (N)" without a second call: add `unassigned_source_count` to the
`GET /kg/graph` response (a `count(distinct source) where no scope assignment` over the same node set). Optional —
the FE can also just call the RPC.

### 1c. `[FE]` — the triage surface (reuses existing tagging primitives — no new write path)
- A toolbar button **"Unassigned (N)"** (org graph) → opens a **sheet/drawer** (`features/overlays` or a side panel).
- The drawer calls `kg_unassigned_sources(orgId)` via `supabase.rpc(...)` (Supabase-direct), groups rows by
  `extraction_run_id` (the job), and lists each source: name, kind, entity_count, current org/scope badges.
- Per source, inline assignment **reusing the canonical components** (do NOT recreate):
  - org → `EntityTargetPicker kind="organization"` (writes the source's org via its existing handler/thunk),
  - scope → `EntityScopeTagger entityType={source_kind} entityId={source_id}` (writes `ctx_scope_assignments`
    via the existing `setEntityScopes` thunk — already used by `NoteContextPicker`).
- "Assign all in this job to scope X" bulk action (loop the existing thunk) — high value, since a job is usually
  one client/matter.
- On assign, optimistic-remove the row; when the drawer closes, bump the graph's `reloadKey` so the new scope
  assignment flows into the scope filter.
- **Files to add:** `features/kg-graph/service/unassignedSources.ts` (the rpc client + type),
  `features/kg-graph/components/KgUnassignedDrawer.tsx`; wire a button into `KgGraphCanvas` toolbar.
- **Reuse:** `EntityScopeTagger`, `EntityTargetPicker`, `useScopeTree`, the overlay/sheet system. No new Redux slice.

---

## 2. Remaining filter/nav basics `[FE]` (+ small `[aidream]`)

- **Node click-through (the "click an item to go straight to it"):** clicking a node in the **card** or the
  **graph** should open the graph focused/filtered on it. `[FE]` add a `?focus=<entityId>` param to
  `/knowledge-graph`; on load, `cy.fit()` to that node + open its Evidence panel. Card nodes become individually
  clickable (hit-test the SVG circle → push `?...&focus=`).
- **Scope-TYPE filtering** (e.g. "all Clients"): the API filters by a single `scope_id` only. `[aidream]` add a
  `scope_type_id` param to `GET /kg/graph` that unions the type's scopes (resolve via `ctx_scopes` of that type →
  their assigned sources → entities). Then `[FE]` the scope-type page gets a real card + the `?scopeType=` filter
  actually narrows the graph (today it only pre-filters the picker).
- **Shareable filters:** `[FE]` reflect the active org/scope filters into the URL (replaceState) so a filtered
  view is linkable. Today filters are in-page state only.

---

## 3. AI DREAM (server) — consolidated ask list to share

1. **(1a/[DB])** Create `public.kg_unassigned_sources(...)` RPC (SQL above) + indexes + regenerate types.
   *This is the single thing that unblocks the whole "assign the unassigned" feature.*
2. **(2)** Add `scope_type_id` filter to `GET /kg/graph` (union a scope type's scopes → entities).
3. **(1b, optional)** Add `unassigned_source_count` to the `GET /kg/graph` payload.
4. **(from 05)** Mentions API enrichment: return `chunk_index`, `document_char_start/end`, `page_numbers`,
   `document_id`, section/heading on each mention → unblocks passage-level deep-links + the notes `?find=` jump.
5. **(from 05)** Investigate the slow `GET /kg/graph` handler latency (DB is ~3ms; the wait is Python-side) — it
   gates every load and every card.
6. **(later)** A precomputed `kg_graph_summary` RPC/table for card + initial-load if the live fetch is too slow.

## 4. DATABASE — consolidated migration list to share

1. `public.kg_unassigned_sources(...)` function (above).
2. Indexes: `rag.kg_chunks (source_kind, source_id)`, `rag.kg_chunks (extraction_run_id)`,
   `public.ctx_scope_assignments (entity_type, entity_id)` (if not already present).
3. **Security (from 05):** `rag.kg_clusters` and `rag.embedding_cache` currently have **RLS disabled** — enable +
   add scoped policies.
4. (later, from 05) Curation overlay tables (`kg_entity_curation`, `kg_entity_merge`, `kg_manual_edges`) +
   user-defined `ctx_relationship_types` — only when we build curation / typed relations.

---

## 5. Suggested order for the next session

1. `[DB]` RPC (1a) → `[FE]` `KgUnassignedDrawer` + "Unassigned (N)" button (1c). *The headline feature.*
2. `[FE]` node click-through + `?focus=` (2).
3. `[aidream]` `scope_type_id` (2) → `[FE]` scope-type card + filter.
4. `[FE]` shareable filter URLs.

> **Reminder for whoever picks this up:** writes already work (the user can tag their own notes/files to scopes
> today via `EntityScopeTagger`). The new feature is almost entirely **(a) one read RPC to find the unassigned**
> and **(b) one drawer that lists them and drops the existing pickers next to each**. Don't rebuild tagging.
