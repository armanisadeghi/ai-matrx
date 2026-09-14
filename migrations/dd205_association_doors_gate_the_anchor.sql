-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DD-205 — AN EDGE IS REVEALED ONLY WHEN BOTH ENDS MAY BE READ (SECURITY)
--
-- WHAT WAS WRONG (measured live 2026-09-14, this database, every probe rolled back)
-- --------------------------------------------------------------------------------
-- DD-195 closed one half of the association readers: the side an edge REVEALS is now asked of the
-- kernel per edge. It said so in its own file, in the sentence it shipped on every door row:
--
--     "The door does NOT gate the anchor the caller named, so a caller holding an id they cannot
--      read can still learn an edge touches it when the other end is readable to them..."
--
-- That residue is this row, and it is not theoretical. `test@test.com` (4060701e-…) is a PLAIN
-- MEMBER of admin's Workspace (884d1ce8-…). `chat.agent_run` is `confidential`; the nine runs hanging
-- off `plan.node` 1f0c6379-… are `personal`, authored by `admin@admin.com`, and the kernel says that
-- member may read NONE of them. DD-195 correctly returns 0 when he names the plan node as the anchor.
-- Turn the same nine ids around and make THEM the anchor and the doors hand every edge back:
--
--   as test@test.com, before this file:
--     assoc_for_targets('agent_run', <the 9 unreadable ids>)                    -> 9 edges
--     assoc_for_entity('agent_run',  d6374f13-…)                                -> 1 edge
--     assoc_for_sources('conversation', [d06ccca3-…, 914804e8-…])               -> 2 edges
--     assoc_for_entity('conversation', d06ccca3-…)                              -> 1 edge
--       (iam.has_access(<anchor>, 'viewer') for that caller, on every one of those anchors: FALSE)
--
-- The edge itself is the disclosure. "Nine of your private agent runs hang off this plan node, and
-- here are their ids, roles, labels, positions and metadata" is an answer no caller should get about
-- rows the kernel refuses them, and it is EXACTLY the answer DD-195 still gave, one argument order
-- away from the case it closed. An asymmetric gate is not a gate; it is a direction.
--
-- TWO MORE DOORS, THE SAME CLASS (found by auditing all eleven `assoc_*` door rows, not just three)
-- -------------------------------------------------------------------------------------------------
--   `public.assoc_list`             — gated the ANCHOR (`iam.has_access(p_type,p_id,'viewer')`) and
--                                     NOTHING else: not the edge's tenancy, not the row it reveals.
--                                     Measured: as that member, assoc_list('plan_node', 1f0c6379-…,
--                                     'out') returned all NINE unreadable agent runs.
--   `public.assoc_members_visible`  — gated the anchors it was given, then admitted an edge on
--                                     `iam.has_org_access(a.organization_id) OR <anchor viewable>`.
--                                     The OR arm is the pre-DD-195 defect verbatim: a member of the
--                                     edge's organization got every edge in it. Measured: as that
--                                     member, assoc_members_visible('thread', [0a3cf82d-…]) returned
--                                     4 edges revealing `chat.conversation` rows the kernel refuses.
--
-- THE FIX — ONE RULE, ASKED OF BOTH ENDS, ON EVERY ASSOCIATION READER
-- ------------------------------------------------------------------
-- An edge is returned only when ALL THREE are true:
--
--     iam.org_readable(a.organization_id, <revealed token>)   -- may I see edges of THIS EDGE'S org?
--     and iam.assoc_side_readable(<revealed token>, <revealed id>)   -- may I read the far end?
--     and iam.assoc_side_readable(<anchor token>,   <anchor id>)     -- may I read the end I named?
--
-- `iam.assoc_side_readable` is unchanged. It was already the right question — "may this caller read
-- THIS ROW" — and DD-195 only ever pointed it at one end. Signed in it is `iam.has_access(token, id,
-- 'viewer')` verbatim; signed out it is the §3.1 public-class anon lane. Its comment is updated
-- below so nobody reads it as a far-end-only helper again.
--
-- THE ANONYMOUS LANE — MEASURED FIRST, THEN CHANGED (the chair's ruling, DD-205)
-- -----------------------------------------------------------------------------
-- The anon lane now survives only where BOTH ends are public-class and public. That is a real
-- narrowing and it was measured before it was written, not after. Every one of the 33,139 live edges
-- was evaluated in both directions (66,278 anchor/revealed pairs) exactly as an anonymous caller's
-- door evaluates it:
--
--   anchor_type   revealed_type  anchor class   anon gets today   lost to the anchor gate
--   purpose    -> tool           organization        678                678
--   purpose    -> mandate        organization        430                430
--   tool       -> tool_bundle    public              109                  0
--   tool_bundle<- tool           public              109                  0
--   web_page   <- seo_keyword    (null class)         36                 36
--   agent      -> surface        organization          8                  8
--                                             TOTAL 1370               1152
--
-- Corroborated over real HTTPS with no JWT (`https://db.matrxserver.com/rest/v1/rpc/...`,
-- `Content-Profile: public`, publishable key only): agent 6cb7be35-… -> 2, agent ad8548bd-… -> 1,
-- purpose d7d063fc-… -> 1, web_page f76294ea-… -> 10, tool 02c34de4-… -> 1, tool_bundle anchor -> 5.
-- After this file the first four are 0 and the tool/tool_bundle pair is unchanged.
--
-- WHAT SIGNED-OUT SURFACE LOSES THAT? **NONE — and that was checked before the gate was written.**
-- `assoc_for_entity`, `assoc_for_sources` and `assoc_for_targets` were grepped across all four
-- repos (matrx-frontend, aidream, matrx-extend, matrx-local) plus matrx-sandbox. matrx-extend,
-- matrx-local and matrx-sandbox contain ZERO references. In matrx-frontend every caller runs behind
-- a session; the three anchor kinds this narrows are read at exactly three call sites, all signed-in:
--   * `web_page`  — features/marketing/data/page-keywords.ts:54, the /marketing/pages/[pageId] card
--   * `agent`     — features/agents/orchestras/service/orchestrasService.ts:137 (Orchestra load)
--   * `purpose`   — no caller exists in any repo
-- The signed-out surfaces were enumerated and checked one at a time: the indexable public lane
-- (`utils/permissions/publicLane.ts`) serves `fc_set`, `note` and `message_template` through
-- `publicLaneSelect` and never touches an association door; the share-link viewer `/s/[token]`, the
-- shared canvas `/canvas/shared/[token]`, `/p/e/[resourceType]/[id]`, `/p/[slug]`, `/l/[code]`,
-- `/r/[token]`, `/open/chat/[conversationId]`, the kiosk and the portal contain no `@ai-matrx/
-- associations` import and no `assoc_*` call of their own. aidream reaches the doors through
-- `apps/shared/associations`, which is driven by a caller-supplied data source, never by the
-- publishable key on an unauthenticated path.
--
-- So 1152 edges an anonymous caller COULD have been handed had anything asked stop being reachable,
-- and zero rendered surfaces change. That is the honest statement of this half: a lane nobody walks
-- is still a lane, and it is closed on purpose rather than left open on the excuse that it is unused.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ----------------------------------
-- It does not touch `iam.org_readable`: the EDGE's own tenancy is still its question, and dropping it
-- was measured and rejected by DD-195 because it WIDENS. It does not add a third access predicate:
-- both new questions are the same `iam.assoc_side_readable` the doors already call. It changes no
-- write door: `assoc_add`, `assoc_remove` and `assoc_link` were measured and already gate BOTH
-- endpoints themselves, and `assoc_set_targets`, `assoc_remove_for_entity` and `assoc_unlink` reach
-- the same gate one hop down by delegating every mutation to `assoc_add` / `assoc_remove`. Their
-- bodies are untouched; only their declared reasons are made to say which end they gate, because a
-- reason that does not name both ends is how this whole class stayed invisible for a day.
--
-- COST (EXPLAIN ANALYZE, rolled back, as admin@admin.com, on the fattest live anchor)
-- ----------------------------------------------------------------------------------
-- The anchor is asked ONCE, not once per edge. `assoc_for_entity` evaluates it in a MATERIALIZED CTE
-- whose result is a single boolean; `assoc_for_sources` / `assoc_for_targets` / `assoc_members_visible`
-- reduce the caller's id array to the readable ones ONCE, the shape `assoc_members_visible` already
-- used. So the per-edge work is unchanged from DD-195 and the anchor costs one kernel call per
-- distinct anchor, not per edge.
--
-- APPLIED WITH: pnpm db:apply migrations/dd205_association_doors_gate_the_anchor.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. THE HELPER'S COMMENT — it was never a far-end-only question ───────────────────────────────
COMMENT ON FUNCTION iam.assoc_side_readable(text, uuid) IS
  'DD-195 / DD-205 — "may this caller read THIS ROW?" for the association doors. It answers about ONE END of an edge and is asked about BOTH: the end the edge reveals AND the anchor the caller named (DD-205; until then only the revealed end was asked, so turning the arguments around handed a caller every edge touching a row the kernel refused them). Signed in it IS iam.has_access(token,id,''viewer''); signed out it is the §3.1 public-class anon lane (the class carries anon_lane AND the row''s visibility is public), because the kernel needs a uid. Not client-callable: the doors call it, nobody else.';

-- ── 2. THE THREE READER DOORS — the anchor is asked too ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assoc_for_entity(p_type text, p_id uuid)
RETURNS TABLE(id uuid, direction text, other_type text, other_id uuid, role text, label text,
              "position" integer, metadata jsonb, organization_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  -- DD-205: the anchor is ONE row and it is asked ONCE — materialized so it cannot become a
  -- per-edge call. DD-195: and the row each edge reveals is asked per edge, as before.
  with anchor_ok as materialized (
    select iam.assoc_side_readable(p_type, p_id) as ok
  )
  select a.id, 'outgoing'::text, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from anchor_ok, platform.associations_live a
   where anchor_ok.ok                                                -- DD-205: may I read the anchor I named?
     and a.source_type = p_type and a.source_id = p_id
     and iam.org_readable(a.organization_id, a.target_type)          -- the EDGE's own tenancy, unchanged
     and iam.assoc_side_readable(a.target_type, a.target_id)         -- DD-195: AND the row it reveals
  union all
  select a.id, 'incoming'::text, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from anchor_ok, platform.associations_live a
   where anchor_ok.ok                                                -- DD-205
     and a.target_type = p_type and a.target_id = p_id
     and iam.org_readable(a.organization_id, a.source_type)          -- the EDGE's own tenancy, unchanged
     and iam.assoc_side_readable(a.source_type, a.source_id)         -- DD-195
  order by 7 nulls last, 10;
$fn$;

CREATE OR REPLACE FUNCTION public.assoc_for_sources(p_source_type text, p_source_ids uuid[], p_target_type text DEFAULT NULL::text)
RETURNS TABLE(id uuid, source_id uuid, target_type text, target_id uuid, role text, label text,
              "position" integer, metadata jsonb, organization_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  -- DD-205: reduce the caller's anchors to the ones they may read, ONCE per distinct id.
  with readable_anchors as materialized (
    select x as id
      from unnest(coalesce(p_source_ids, '{}'::uuid[])) as x
     where iam.assoc_side_readable(p_source_type, x)
  )
  select a.id, a.source_id, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.source_type = p_source_type
     and a.source_id in (select id from readable_anchors)       -- DD-205: the anchor the caller named
     and (p_target_type is null or a.target_type = p_target_type)
     and iam.org_readable(a.organization_id, a.target_type)     -- the EDGE's own tenancy, unchanged
     and iam.assoc_side_readable(a.target_type, a.target_id)    -- DD-195: AND the row it reveals
  order by 7 nulls last, 10;
$fn$;

CREATE OR REPLACE FUNCTION public.assoc_for_targets(p_target_type text, p_target_ids uuid[])
RETURNS TABLE(id uuid, target_id uuid, source_type text, source_id uuid, role text, label text,
              "position" integer, metadata jsonb, organization_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  with readable_anchors as materialized (
    select x as id
      from unnest(coalesce(p_target_ids, '{}'::uuid[])) as x
     where iam.assoc_side_readable(p_target_type, x)            -- DD-205
  )
  select a.id, a.target_id, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.target_type = p_target_type
     and a.target_id in (select id from readable_anchors)       -- DD-205: the anchor the caller named
     and iam.org_readable(a.organization_id, a.source_type)     -- the EDGE's own tenancy, unchanged
     and iam.assoc_side_readable(a.source_type, a.source_id)    -- DD-195: AND the row it reveals
  order by 7 nulls last, 10;
$fn$;

-- ── 3. `assoc_list` — a fourth reader, and it gated ONE end ──────────────────────────────────────
-- The anchor check it already had stays exactly where it is: it is the only door of the family that
-- REFUSES instead of returning nothing, and a refusal with a sentence is better than an empty list.
-- What it never had is the other two thirds of the gate its siblings carry.
CREATE OR REPLACE FUNCTION public.assoc_list(p_type text, p_id uuid, p_direction text DEFAULT 'out'::text, p_role text DEFAULT NULL::text)
RETURNS TABLE(assoc_id uuid, direction text, role text, label text, edge_position integer,
              other_type text, other_id uuid, metadata jsonb, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  -- DD-205: the anchor. Unchanged, and it still refuses out loud rather than answering emptily.
  IF NOT iam.assoc_side_readable(p_type, p_id) THEN
    RAISE EXCEPTION 'assoc_list: you may not read %/% , so its edges cannot be listed (DD-205: an edge is revealed only when BOTH ends may be read).', p_type, p_id
      USING ERRCODE = '42501';
  END IF;
  IF p_direction NOT IN ('out','in','both') THEN RAISE EXCEPTION 'direction must be out|in|both'; END IF;
  RETURN QUERY
    SELECT a.id,'out'::text,a.role,a.label,a.position,a.target_type,a.target_id,a.metadata,a.created_at
      FROM platform.associations_live a
     WHERE p_direction IN ('out','both') AND a.source_type=p_type AND a.source_id=p_id
       AND (p_role IS NULL OR a.role=p_role)
       AND iam.org_readable(a.organization_id, a.target_type)        -- DD-205: the EDGE's own tenancy
       AND iam.assoc_side_readable(a.target_type, a.target_id)       -- DD-205: AND the row it reveals
    UNION ALL
    SELECT a.id,'in'::text,a.role,a.label,a.position,a.source_type,a.source_id,a.metadata,a.created_at
      FROM platform.associations_live a
     WHERE p_direction IN ('in','both') AND a.target_type=p_type AND a.target_id=p_id
       AND (p_role IS NULL OR a.role=p_role)
       AND iam.org_readable(a.organization_id, a.source_type)        -- DD-205
       AND iam.assoc_side_readable(a.source_type, a.source_id)       -- DD-205
    ORDER BY 5 NULLS LAST, 9;
END; $function$;

-- ── 4. `assoc_members_visible` — the pre-DD-195 OR arm, still live on a fifth door ───────────────
-- `iam.has_org_access(a.organization_id) OR <anchor viewable>` is an OR, so the organization arm
-- WIDENED: a member of the edge's organization was handed every edge in it, anchor unreadable or not,
-- revealed row unreadable or not. It becomes the same conjunction the siblings ask.
CREATE OR REPLACE FUNCTION public.assoc_members_visible(p_target_type text, p_target_ids uuid[])
RETURNS TABLE(id uuid, target_id uuid, source_type text, source_id uuid, role text, label text,
              "position" integer, metadata jsonb, organization_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with viewable as materialized (
    -- Evaluate the (heavier) row-level authorization ONCE per distinct anchor. DD-205: this is now
    -- the whole anchor gate, not one branch of an OR.
    select tid
      from unnest(coalesce(p_target_ids, '{}'::uuid[])) as tid
     where iam.assoc_side_readable(p_target_type, tid)
  )
  select a.id, a.target_id, a.source_type, a.source_id, a.role, a.label,
         a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.target_type = p_target_type
     and a.target_id in (select tid from viewable)                   -- DD-205: the anchor the caller named
     and iam.org_readable(a.organization_id, a.source_type)          -- DD-205: the EDGE's own tenancy
     and iam.assoc_side_readable(a.source_type, a.source_id)         -- DD-205: AND the row it reveals
  order by 7 nulls last, 10;
$function$;

-- ── 5. EVERY ASSOCIATION DOOR ROW NOW SAYS WHAT IT DOES WITH **BOTH ENDS** ───────────────────────
-- An association door always has two ends. A reason that names one of them is how DD-195's residue
-- survived a whole verification round: the sentence was true and incomplete, and incomplete read as
-- fine. `check:impl-doors` D14 (added with this file) makes "both ends" a stated, checked property.

update platform.client_callable_door d
   set reason = 'Association edge vocabulary — THE one way to relate two entities (@ai-matrx/associations). '
                'The client holds no grant on platform.associations; every read goes through this definer chokepoint. '
                'DD-205 (2026-09-14): BOTH ENDS of every edge are gated, and the edge is returned only when all three '
                'questions pass. (1) THE ANCHOR the caller named — iam.assoc_side_readable, asked once, materialized. '
                '(2) THE ROW THE EDGE REVEALS, its other end — iam.assoc_side_readable, asked per edge (DD-195). '
                '(3) THE EDGE''S OWN ORGANIZATION — iam.org_readable, unchanged, the tenancy of the association row itself. '
                'iam.assoc_side_readable is iam.has_access(token, id, ''viewer'') for a signed-in caller and the §3.1 '
                'public-class anon lane for a signed-out one, so the anonymous lane now survives only where BOTH ends are '
                'public-class and public. Question 1 is what DD-205 adds: until then the anchor was ungated, so passing ids '
                'the kernel refused you as the ANCHOR handed back every edge touching them (measured live: nine personal '
                'confidential agent runs, to a plain member of their organization). An asymmetric gate is a direction, not a gate.',
       gate_predicate = 'iam.assoc_side_readable'
 where d.schema_name = 'public'
   and d.function_name in ('assoc_for_entity', 'assoc_for_sources', 'assoc_for_targets');

update platform.client_callable_door d
   set reason = 'Association edge reader (legacy name; no client call site remains in matrx-frontend, aidream, matrx-extend '
                'or matrx-local). SIGNED-IN only — anon and PUBLIC hold no EXECUTE. DD-205 (2026-09-14): BOTH ENDS are gated. '
                '(1) THE ANCHOR the caller named — iam.assoc_side_readable, and this door REFUSES with a sentence rather than '
                'answering with an empty list. (2) THE ROW EACH EDGE REVEALS — iam.assoc_side_readable, per edge. (3) THE '
                'EDGE''S OWN ORGANIZATION — iam.org_readable. Before DD-205 the anchor check was the WHOLE gate: it asked '
                'iam.has_access on the anchor and then returned every edge touching it, including edges revealing rows the '
                'kernel refused the caller (measured live: nine personal confidential agent runs to a plain member).',
       gate_predicate = 'iam.assoc_side_readable'
 where d.schema_name = 'public' and d.function_name = 'assoc_list';

update platform.client_callable_door d
   set reason = 'Association membership reader — the members of many containers in one round-trip (@ai-matrx/associations '
                'listMembersVisible). The client holds no grant on platform.associations. SIGNED-IN only. DD-205 (2026-09-14): '
                'BOTH ENDS are gated. (1) THE ANCHOR containers the caller named — iam.assoc_side_readable, once per distinct '
                'id. (2) THE ROW EACH EDGE REVEALS, the member — iam.assoc_side_readable, per edge. (3) THE EDGE''S OWN '
                'ORGANIZATION — iam.org_readable. Before DD-205 the gate was an OR, not a conjunction — an organization-level '
                'predicate OR anchor-viewable — so the organization arm WIDENED it: a member of the edge''s '
                'organization was handed every edge in that organization regardless of either end''s own lane (measured live: '
                'four edges revealing personal private conversations authored by somebody else).',
       gate_predicate = 'iam.assoc_side_readable'
 where d.schema_name = 'public' and d.function_name = 'assoc_members_visible';

-- The write doors. Bodies UNCHANGED — they were measured and they already ask about both ends. Only
-- the sentence changes, because "resolves access per entity via iam.has_access" never said which
-- entity, and that vagueness is the whole reason DD-195 and DD-205 were invisible.
update platform.client_callable_door d
   set reason = 'Association edge writer — THE one way to relate two entities (@ai-matrx/associations). The client holds no '
                'grant on platform.associations; every write goes through this definer chokepoint. BOTH ENDS are gated before '
                'an edge is created: iam.has_access(p_source_type, p_source_id, ''editor'') or ''viewer'' on the source AND '
                'iam.has_access(p_target_type, p_target_id, ''editor'') or ''viewer'' on the target, plus iam.has_org_access on '
                'the organization the edge is filed under. Verified live 2026-09-14 (DD-205) against the same shape that '
                'caught the readers: neither end can be a row the kernel refuses the caller.',
       gate_predicate = 'iam.has_access'
 where d.schema_name = 'public' and d.function_name = 'assoc_add';

update platform.client_callable_door d
   set reason = 'Association edge remover — THE one way to unrelate two entities (@ai-matrx/associations). The client holds no '
                'grant on platform.associations. BOTH ENDS are gated before an edge is removed: iam.has_access on the source '
                'AND iam.has_access on the target (editor on the end being edited, viewer on the other), plus the container '
                'authority check for container-shaped edges. Verified live 2026-09-14 (DD-205).',
       gate_predicate = 'iam.has_access'
 where d.schema_name = 'public' and d.function_name = 'assoc_remove';

update platform.client_callable_door d
   set reason = 'Association set-replacement writer (@ai-matrx/associations). The client holds no grant on '
                'platform.associations. It gates THE ANCHOR itself — iam.has_access(p_source_type, p_source_id, ''editor'') — '
                'and reaches THE OTHER END''s gate one hop down: every removal is delegated to public.assoc_remove and every '
                'addition to public.assoc_add, both of which gate BOTH ENDS with iam.has_access. So no target the caller may '
                'not read can be attached or detached through it. Verified live 2026-09-14 (DD-205).',
       gate_predicate = 'iam.has_access'
 where d.schema_name = 'public' and d.function_name = 'assoc_set_targets';

update platform.client_callable_door d
   set reason = 'Association bulk-detach writer — removes every edge touching one entity (@ai-matrx/associations). The client '
                'holds no grant on platform.associations. It gates THE ANCHOR — iam.has_access(p_type, p_id, ''editor'') — and '
                'reaches THE OTHER END''s gate one hop down: every removal is delegated to public.assoc_remove, which gates '
                'BOTH ENDS, so an edge whose far end the caller may not read is refused there rather than swept away here. '
                '`file` and `conversation` are refused outright and must use their dedicated mutation paths. Verified live '
                '2026-09-14 (DD-205).',
       gate_predicate = 'iam.has_access'
 where d.schema_name = 'public' and d.function_name = 'assoc_remove_for_entity';

update platform.client_callable_door d
   set reason = 'Signed-in association writer (DD-169 batch 3, B-75); SECURITY DEFINER; anon holds no EXECUTE. The caller is '
                'resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. BOTH ENDS are gated '
                'one hop down: the whole mutation is delegated to public.assoc_remove, which gates the source AND the target '
                'with iam.has_access. Verified live 2026-09-14 (DD-205).'
 where d.schema_name = 'public' and d.function_name = 'assoc_unlink';

update platform.client_callable_door d
   set reason = 'Signed-in association writer (DD-169 batch 3, B-75); SECURITY DEFINER; anon holds no EXECUTE. The caller is '
                'resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. BOTH ENDS are gated '
                'in the body: iam.has_access(p_source_type, p_source_id, ''editor'') on the source AND '
                'iam.has_access(p_target_type, p_target_id, ''viewer'') on the target. Verified live 2026-09-14 (DD-205).'
 where d.schema_name = 'public' and d.function_name = 'assoc_link';

-- ── 6. THE FILE REFUSES TO LAND HALF-WRITTEN ─────────────────────────────────────────────────────
do $dd205_assert$
declare
  v_n int;
  v_bad text;
begin
  -- (a) the five readers carry the helper as their declared gate
  select count(*) into v_n from platform.client_callable_door
   where schema_name='public'
     and function_name in ('assoc_for_entity','assoc_for_sources','assoc_for_targets','assoc_list','assoc_members_visible')
     and gate_predicate = 'iam.assoc_side_readable';
  if v_n <> 5 then
    raise exception 'DD-205: expected 5 association READER door rows to declare iam.assoc_side_readable, found %. The door register is the thing this row exists to make honest — refusing rather than leaving it half-written.', v_n;
  end if;

  -- (b) every one of the eleven assoc door rows names BOTH ENDS, and none disclaims gating an end.
  --     This is D14's rule, asserted here so the migration cannot ship a reason the guard will fail.
  select string_agg(function_name, ', ' order by function_name) into v_bad
    from platform.client_callable_door
   where schema_name='public' and function_name ~ '^assoc_'
     and (reason !~* 'both ends' or reason ~* 'not gate the (anchor|other|far)');
  if v_bad is not null then
    raise exception 'DD-205: association door reason(s) that do not name BOTH ENDS (or that disclaim gating one): %. Every association door has two ends; a reason that names one is how this whole class stayed invisible.', v_bad;
  end if;

  -- (c) the anchor gate is actually in the five reader bodies, not just in their sentences.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace and n.nspname='public'
   where p.proname in ('assoc_for_entity','assoc_for_sources','assoc_for_targets','assoc_list','assoc_members_visible')
     and (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), 'assoc_side_readable', ''))) / length('assoc_side_readable') < 2;
  if v_bad is not null then
    raise exception 'DD-205: reader(s) % call iam.assoc_side_readable fewer than twice, so they cannot be asking about both ends.', v_bad;
  end if;
end
$dd205_assert$;
