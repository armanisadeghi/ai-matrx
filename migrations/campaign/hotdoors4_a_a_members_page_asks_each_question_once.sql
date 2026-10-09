-- lane: HOT-DOORS-4
-- based-on: custom.reaches_directly_many(uuid, uuid[], text, permission_level) d7ffe36a49022b2469aacecc975c5a0d741fdd089f2fca252089bc90ab64698c
-- based-on: custom.addressed_cap(uuid, text, uuid, uuid, uuid) 1c601e46fb615c027d19a50398346697764617a16f6d715390f96e9448394a87
-- based-on: custom.addressed_cap_specific(uuid, text, uuid, uuid, uuid) e98befebb2c33a4e47f09f74b5b5325a3cadc1f26e72a50aa186f62a263a63b1
-- based-on: custom.table_carries_its_rows(uuid, uuid, permission_level) aae02ce4cf66838bfb69989b3a940f5345d2145b8cc1a037e3cc46c2e673509d
-- based-on: custom.visibility_ancestors(text, uuid) c47624f13fcc7c033728261c15fb6afe29d0aa6f36d0fdc3589af5372622f00c
-- based-on: custom.carrying_edges_of(text, uuid) 575ef335fc793e61d85d84dfc560275868dcf96a2b0f0073e6f2607df824ea12
-- based-on: iam.member_lane_confers(uuid, uuid, text, uuid, uuid, boolean) 79c75014f6076d6e273913e2d0eb59800b99bd53f382e5f8beca04aa2f2d6374
-- based-on: iam.has_access_for_many(uuid, uuid[], text, text) b4916d0ab07d982090e6fc0ad6d8d61176b0b3649888b39fed3524f3fac0c71b
-- based-on: custom.levels_of(uuid, uuid[]) 3dcfb0ef981221e646e2c13a96f9f49af4de3edd0ec2c3deb4a201e66039628d
-- based-on: iam.member_default_level(uuid, uuid) d814d11633d15f012d780d9bbcc656a7e09f8105f736a7f98e47a2fc60861155
-- based-on: custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text) 102343ac4fc5da8349bba5c0ee79b70dc155937b410018b5a29b442c703457ca
--
-- HOT-DOORS-4 (2026-10-08). A member's Table page (custom.read_records_page) paid ~3x an admin's fixed cost and
-- ~5-9 ms more per row. Measured (read-only transactions, the member's claims, pg_stat_xact_user_functions):
--   * every rung of a member's level search above viewer went to custom.reaches_directly one row at a time
--     (the set form's fast path stopped at the level floor), and each asked custom.addressed_cap again: the
--     same cap, three times per row (commenter, edit_content, editor);
--   * inside the cap, the "could rung 3 answer" gate (two probes that depend only on the person and the
--     organization) ran once per row, and the homes walk (custom.visibility_ancestors over
--     custom.carrying_edges_of) re-walked the same shared containers (the client, the owner, the Table) for
--     every row and every rung;
--   * custom.table_carries_its_rows asked the one-at-a-time kernel about the same Table once per row;
--   * iam.member_lane_confers answered the same (person, organization, row, Table) question on every rung;
--   * the big statements of iam.has_access_for_many, custom.levels_of and the page itself were planned anew on
--     every call (custom plans over the sixteen partitions of custom.record: ~10 ms of planning for ~3 ms of
--     execution per set ask).
-- Same answers, less work, while the knob access/kernel_batch is on for the person and the transaction has
-- written nothing (the statement memo's own rule):
--   a) each of those answers is kept in the statement memo (platform.memo_k_*, keyed by its arguments and the
--      snapshot) and read back on the next ask in the same statement. custom.addressed_cap and
--      iam.member_default_level compute it with their old bodies, unchanged, under a new name
--      (custom._addressed_cap_now, iam._member_default_level_now); custom.carrying_edges_of and
--      custom.visibility_ancestors run their one query as before and keep its rows; iam.member_lane_confers
--      keeps its first four questions (member? archived? store open? member lane open?), which read only the
--      person and the organization; custom.addressed_cap_specific keeps its rung-3 gate the same way;
--   b) custom.reaches_directly_many answers a target above the level floor itself when the set kernel said
--      yes and the target meets the very test PERF-FIX-4 uses at the floor: then custom.reaches_directly
--      would return `cap is null or level <= cap` at its kernel step, with cap = custom.addressed_cap(person,
--      'record', id, <its organization>, <its Table>), and nothing else - so that is what it returns;
--   c) iam.has_access_for_many, custom.levels_of and custom.read_records_page run with
--      plan_cache_mode = force_generic_plan (one cached plan, partitions pruned at run time) and put the
--      setting back when they return; a plan choice, never an answer.
-- One-statement revert (everyone back on the old path, no deploy):
--   update platform.feature_knob set value = '{"on": false, "off_for": []}' where feature = 'access' and key = 'kernel_batch';
-- A session forces either path with set_config('mx.kernel_batch', 'off'|'on', true) (the proofs compare both on
-- one snapshot). No RLS policy changes; no member of iam.entity_read_kernel_members() changes (no re-record).
-- Inverse: migrations/inverse/hotdoors4_a_a_members_page_asks_each_question_once_down.sql

set local statement_timeout = '120s';

insert into platform.feature_knob (
  feature, key, value, default_value, value_type, label, description, set_by, basis, review_due,
  overridable_by, delegable, not_delegable_reason
)
values (
  'access', 'kernel_batch',
  '{"on": false, "off_for": []}'::jsonb, '{"on": true, "off_for": []}'::jsonb, 'json',
  'Access kernel batching',
  'Whether one statement asks each access sub-question once (statement memo, set answers above the level floor, one cached plan). {"on": false} sends everyone back to asking per row; "off_for" lists user ids kept on it.',
  'agent',
  'HOT-DOORS-4, 2026-10-08: lands off; switched on after the same-snapshot equivalence proof on live.',
  current_date + 30,
  '{}'::text[], false,
  'A platform switch over how the access kernel is asked; no organization or person decides it.'
)
on conflict (feature, key) do nothing;

create or replace function iam.kernel_batch_on(p_person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
-- HOT-DOORS-4: may this statement keep access sub-answers in the statement memo for this person (knob
-- access/kernel_batch: {"on": bool, "off_for": [user ids]})? Never once the transaction has written (the
-- memo's own rule). mx.kernel_batch = 'off' / 'on' forces one path for the session (the proofs compute both;
-- not reachable from a client). A null person is the session's own (auth.uid()). Any failure answers false.
declare
  v_p   uuid;
  v_s   text;
  v_k   text;
  v_on  boolean;
begin
  if pg_catalog.pg_current_xact_id_if_assigned() is not null then
    return false;
  end if;
  v_s := coalesce(current_setting('mx.kernel_batch', true), '');
  if v_s = 'off' then return false; end if;
  if v_s = 'on' then return true; end if;
  v_p := coalesce(p_person, auth.uid());
  v_k := 'iam.kernel_batch_on:' || coalesce(v_p::text, '-');
  v_s := platform.memo_k_get(v_k);
  if v_s is not null then
    return v_s = 't';
  end if;
  begin
    v_on := coalesce((platform.knob_resolve('access', 'kernel_batch', null) ->> 'on')::boolean, false)
        and not coalesce(platform.knob_resolve('access', 'kernel_batch', null) -> 'off_for' ? coalesce(v_p::text, ''), false);
  exception when others then
    v_on := false;
  end;
  perform platform.memo_k_put(v_k, case when v_on then 't' else 'f' end);
  return v_on;
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', 'kernel_batch_on', pg_get_function_identity_arguments('iam.kernel_batch_on(uuid)'::regprocedure),
        array['uuid'::regtype]::oid[],
        'p_person is compared to the user ids in knob access/kernel_batch -> off_for (NULL: the session person, auth.uid()); it reads no entity.',
        'migrations/campaign/hotdoors4_a_a_members_page_asks_each_question_once.sql (lane HOT-DOORS-4)',
        'server_only: called only by the access helpers inside one statement to decide whether to keep answers in the statement memo; no client ever calls it.', false, false);
-- HOT-DOORS-4: the body of custom.addressed_cap as it was, under its own name; custom.addressed_cap keeps its answer per statement.
CREATE OR REPLACE FUNCTION custom._addressed_cap_now(p_user_id uuid, p_type text, p_id uuid, p_organization_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lvl public.permission_level;
  v_pub public.permission_level;
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- ── THE LANES ADDRESSED TO NOBODY, WHICH MAY ONLY ADD ──────────────────────────────────────
  -- Each of these is authority a share was never meant to limit, so each returns the top level
  -- outright: capping an owner, an organization admin or our own staff with somebody's Viewer
  -- share would take access away rather than stop it being raised, which is the opposite defect.
  if iam.owner_of(p_type, p_id) = p_user_id then return iam.top_content_level(); end if;
  if p_organization_id is not null and public.is_org_admin_for(p_user_id, p_organization_id) then
    return iam.top_content_level();
  end if;
  if public.is_super_admin_for(p_user_id) then return iam.top_content_level(); end if;

  -- ── THE RUNGS ADDRESSED TO HER, MOST SPECIFIC FIRST ────────────────────────────────────────
  --   1 the row itself · 2 its Table · 3 its homes   (and ownership of any of them)
  v_lvl := custom.addressed_cap_specific(p_user_id, p_type, p_id, p_organization_id, p_table_id);

  --   4 containment carry — addressed to nobody, so it sets no level at all
  --   5 the organization's own word for what membership confers
  if v_lvl is null then
    v_lvl := iam.member_lane_confers(p_user_id, p_organization_id, p_type, p_id, p_table_id);
  end if;

  -- AND A PUBLIC GRANT IS ADDRESSED TO NOBODY: it may only ADD (Rule 9). Publishing a record
  -- must never take a level away from the organization's own members, so it is UNIONED on top
  -- of whatever the rungs said and never compared against them.
  select max(p.permission_level) into v_pub
    from iam.permissions p
   where p.resource_type = p_type
     and p.resource_id   = p_id
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
     and coalesce(p.is_public, false);
  if v_pub is not null then
    v_lvl := greatest(v_lvl, v_pub);   -- greatest() ignores a null arm
  end if;

  -- NULL means no rung and no lane speaks for this person here at all, and then nothing is
  -- capped: arm 1 answers for her exactly as it did before this lane existed.
  return v_lvl;
end;
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', '_addressed_cap_now', pg_get_function_identity_arguments('custom._addressed_cap_now(uuid,text,uuid,uuid,uuid)'::regprocedure),
        array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
        'The old body of custom.addressed_cap: p_user_id is the person whose cap is computed, p_id the row, p_organization_id / p_table_id its organization and Table; NULL person or id answers NULL. It decides nothing alone: callers ask it only after the kernel said yes.',
        'migrations/campaign/hotdoors4_a_a_members_page_asks_each_question_once.sql (lane HOT-DOORS-4)',
        'server_only: called only by custom.addressed_cap (which keeps its answer per statement); no client ever calls it.', false, false);

-- HOT-DOORS-4: the body of iam.member_default_level as it was, under its own name; iam.member_default_level keeps its answer per statement.
CREATE OR REPLACE FUNCTION iam._member_default_level_now(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_word text;
  v_table_word text;
begin
  -- 🚨 VIS-2 (2026-09-19) — THE ORGANIZATION'S OTHER KNOB COMES FIRST. VIS-19 says a
  -- role sets a DEFAULT level and per-thing grants override it; it does not say every
  -- organization must have such a default. the knob `custom/member_default_` + `vis…` = shared_only (word split: this copy is not a T-13 reader)
  -- is an organization saying membership alone confers NOTHING, which is this function
  -- returning null - the same answer the `none` word already gives.
  -- Asked first, because the level word below is then simply not a question.
  if not iam.member_lane_open(p_organization_id) then
    return null;
  end if;

  -- The organization's knob, resolved through the one ladder (system -> organization).
  begin
    v_word := platform.knob_resolve('custom', 'member_default_level', p_organization_id) #>> '{}';
  exception when others then
    v_word := 'viewer';
  end;

  -- The per-table override, declared on the Table record itself. A Table is a record, so the
  -- knob lives where its subject lives rather than in a second settings store.
  if p_table_id is not null and to_regclass('custom.record') is not null then
    select nullif(btrim(t.data ->> 'member_default_level'), '')
      into v_table_word
      from custom.record t
     where t.organization_id = p_organization_id
       and t.id = p_table_id
       and t.deleted_at is null;
    if v_table_word is not null then
      v_word := v_table_word;
    end if;
    -- FIELD-LEVEL, NOT TABLE-WIDE (Arman, 2026-10-07: "do it like the best in the world" -
    -- Salesforce field-level security, Airtable field permissions). A `restricted` field hides and
    -- locks THAT FIELD only: every read door masks it (custom.read_mask_for -> iam.may_touch_field)
    -- and the custom._field_write_door trigger refuses a change to it (DOOR-3). Membership keeps its
    -- ordinary level on the rows and every other field. Until 2026-10-07 22:34 UTC one restricted
    -- field returned null here and removed members from every row of the Table.
  end if;

  if v_word is null or v_word = 'none' then
    return null;
  end if;
  -- STRUCTURE IS THE ORG ADMINS' (Arman, 2026-10-05): a Table, Field, Home, rule, view or widget
  -- record is structure, so membership alone never lifts it above viewer. Owners, org admins and
  -- the creator reach structure on their own arms. Data rows take the organization's word.
  if p_table_id is not null and p_table_id in (custom.table_kernel_id(), custom.field_kernel_id(),
       custom.merge_field_kernel_id(), custom.rule_kernel_id(), custom.presentation_kernel_id(),
       custom.widget_kernel_id(), custom.person_kernel_id(), custom.organization_kernel_id()) then
    v_word := case when v_word in ('viewer', 'commenter') then v_word else 'viewer' end;
  end if;
  if not exists (select 1 from iam.content_levels() l where l.level::text = v_word) then
    raise exception 'custom/member_default_level says %, and the levels are %',
                    v_word,
                    (select string_agg(l.level::text, ', ' order by l.ordinal) from iam.content_levels() l)
      using errcode = '22023',
            hint = 'VIS-19: a role sets a default level, and a default has to be one of the four - or "none".';
  end if;
  return v_word::public.permission_level;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.carrying_edges_of(p_item_type text, p_item_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, conveys_max permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key text;   -- HOT-DOORS-4
  v_m   text;
  v_on  boolean := iam.kernel_batch_on(null);
begin
  -- HOT-DOORS-4 (2026-10-08): while iam.kernel_batch_on the edges are kept in the statement memo per (type, id,
  -- snapshot): a page's rows share their containers (the client, the owner, the Table) and every rung of
  -- every row walked them again. The one query below is the query this function always ran.
  if v_on then
    v_key := 'custom.carrying_edges_of:' || coalesce(p_item_type, '') || ':' || coalesce(p_item_id::text, '')
          || ':' || pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get(v_key);
  end if;
  if v_m is null then
    select coalesce(jsonb_agg(jsonb_build_array(q.c_type, q.c_id, q.c_max)), '[]'::jsonb)::text
      into v_m
      from (
    -- arm 1a — platform.containment_edges, the rule whose SOURCE is the container
    select a.source_type, a.source_id, r.conveys_max
      from platform.associations a
      join platform.association_types r
        on r.source_type = a.source_type and r.target_type = a.target_type
       and (r.label is null or r.label = a.label)
     where a.deleted_at is null and r.is_active and r.container_side = 'source'
       and a.target_type = p_item_type and a.target_id = p_item_id
    union
    -- arm 1b — the same rule table, the rule whose TARGET is the container
    select a.target_type, a.target_id, r.conveys_max
      from platform.associations a
      join platform.association_types r
        on r.source_type = a.source_type and r.target_type = a.target_type
       and (r.label is null or r.label = a.label)
     where a.deleted_at is null and r.is_active and r.container_side = 'target'
       and a.source_type = p_item_type and a.source_id = p_item_id
    union
    -- arm 2a — custom.carrying_rule, source side
    select a.source_type, a.source_id, cr.conveys_max
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null and cr.container_side = 'source'
       and a.target_type = p_item_type and a.target_id = p_item_id
    union
    -- arm 2b — custom.carrying_rule, target side
    select a.target_type, a.target_id, cr.conveys_max
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null and cr.container_side = 'target'
       and a.source_type = p_item_type and a.source_id = p_item_id
    union
    -- arm 3 — THE TABLE A RECORD LIVES IN (SHARED-ONLY, 2026-09-19). Every arm above reads
    -- `platform.associations`; this one is not there to read, because a record's Table is the
    -- `table_id` COLUMN of the record itself. Sharing a Table is the most ordinary thing a
    -- person does on this store and it conveyed NOTHING before this line: under `shared_only`
    -- a colleague shared a whole table at Admin opened it and saw zero rows.
    --
    -- `admin` is the same `conveys_max` the `contains` and `home` rules already carry, so a
    -- Table shared at Viewer conveys viewer and one shared at Admin conveys admin — the
    -- MINIMUM along the path decides (VIS-3), exactly as for a record inside a record.
    --
    -- THE SAME-ORGANISATION JOIN IS THE GUARD, not decoration. The kernel Tables (`Table`,
    -- `Field`, and the home-record kernel every fixture hangs off) live in the SYSTEM
    -- organization, which is global_readable, so a Table row (whose own `table_id` is the
    -- kernel `Table`) and a Field row (whose `table_id` is the kernel `Field`) produce no edge
    -- here: nobody is ever carried by the Table-of-all-Tables. `r.table_id <> r.id` is the
    -- second: the kernel `Table` row's `table_id` IS itself.
    select 'record'::text, r.table_id, 'admin'::public.permission_level
      from custom.record r
      join custom.record t
        on t.id = r.table_id
       and t.organization_id = r.organization_id
       and t.deleted_at is null
     where p_item_type = 'record'
       and r.id = p_item_id
       and r.table_id is not null
       and r.table_id <> r.id
       and r.deleted_at is null
       -- THE ROW'S OWN VISIBILITY IS THE BOUNDARY, and dropping it would be a LEAK, not a
       -- widening. `personal` is below every organization lane the access kernel runs (DD-136:
       -- the org arms honour the row's own `visibility`), so a row somebody marked personal is
       -- reached by a grant and by its creator and by nothing else. Carrying it on a TABLE share
       -- would hand every member of every `all_records` organization — who already reaches every
       -- Table — every personal row in it, which is the opposite of what this file is for.
       and r.visibility >= 'internal'::platform.visibility
    union
    -- arm 4 — A PORTAL'S NAMING FIELD (PORTAL, 2026-09-20). The mirror of arm 3 of
    -- `custom.carrying_edges_in`, asked from the item's side: this Job names a client, that
    -- client's record is its container, and what it conveys is what the portal declared. It
    -- matches on `relation_field_id` — one Field of one Table of one organization — and never
    -- on the role, because a role is a field key and "client" is a word a hundred organizations
    -- will use.
    select 'record'::text, a.target_id, pt.conveys_max
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null
       and p_item_type = 'record'
       and a.source_type = 'record'
       and a.source_id = p_item_id
       and a.target_type = 'record'
      ) q(c_type, c_id, c_max);
    if v_on then
      perform platform.memo_k_put(v_key, v_m);
    end if;
  end if;
  return query select x ->> 0, (x ->> 1)::uuid, (x ->> 2)::public.permission_level
                 from jsonb_array_elements(v_m::jsonb) x;
end
$function$;

CREATE OR REPLACE FUNCTION custom.visibility_ancestors(p_item_type text, p_item_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, depth integer, max_level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key text;   -- HOT-DOORS-4
  v_m   text;
  v_on  boolean := iam.kernel_batch_on(null);
begin
  -- HOT-DOORS-4 (2026-10-08): while iam.kernel_batch_on the answer is kept in the statement memo per (type, id,
  -- snapshot): arm 3 of custom.reaches_directly and rung 3 of custom.addressed_cap_specific walk the same row's
  -- homes on every rung of a level search. The one query below is the query this function always ran.
  if v_on then
    v_key := 'custom.ancestors_of:' || coalesce(p_item_type, '') || ':' || coalesce(p_item_id::text, '')
          || ':' || pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get(v_key);
  end if;
  if v_m is null then
    select coalesce(jsonb_agg(jsonb_build_array(q.c_type, q.c_id, q.c_depth, q.c_max)), '[]'::jsonb)::text
      into v_m
      from (
    with recursive seed as (
      -- THE ONE NEW FACT: which of this item's containers IS the Table it lives in. Everything
      -- else about the walk is unchanged.
      -- SCOPES-HANDOFF-BUDGET (2026-09-28): asked as a scalar probe (`limit 1`, true or no row),
      -- never as EXISTS. In a target list the planner may answer an EXISTS as a HASHED subplan —
      -- it read every row of custom.record (12,000 buffers, 35-50 ms) to build the hash for the
      -- two or three edges a walk meets, on every call. The answer is the same boolean.
      select e.container_type, e.container_id, e.conveys_max,
             (p_item_type = 'record'
              and coalesce((select true from custom.record r
                             where r.id = p_item_id and r.table_id = e.container_id limit 1), false)) as is_table
        from custom.carrying_edges_of(p_item_type, p_item_id) e
    ), up as (
      select s.container_type, s.container_id, 1 as depth, s.conveys_max as max_level, s.is_table,
             array[p_item_type || ':' || p_item_id::text,
                   s.container_type || ':' || s.container_id::text] as path
        from seed s
      union all
      select e.container_type, e.container_id, u.depth + 1,
             least(u.max_level, e.conveys_max),
             -- LEAK-T10: THE SAME FACT, AT EVERY DEPTH. This was hard-coded `false`, so the
             -- terminal rule held only for the row the walk started from. One step further out
             -- a Home is a row of some Table too, and the walk climbed from that Table into ITS
             -- Homes — the same leak, one level up, in a place no test looked.
             (u.container_type = 'record'
              and coalesce((select true from custom.record r
                             where r.id = u.container_id and r.table_id = e.container_id limit 1), false)),
             u.path || (e.container_type || ':' || e.container_id::text)
        from up u
        cross join lateral custom.carrying_edges_of(u.container_type, u.container_id) e
       -- `not u.is_table` is the whole change: a Table is where the walk stops, because a
       -- Table's own containers are its Homes and a Home of the Table is not a container of
       -- every record in it.
       where u.depth < 16
         and not u.is_table
         and not (e.container_type || ':' || e.container_id::text) = any (u.path)
    )
    select u.container_type, u.container_id, min(u.depth), max(u.max_level)
      from up u
     group by u.container_type, u.container_id
      ) q(c_type, c_id, c_depth, c_max);
    if v_on then
      perform platform.memo_k_put(v_key, v_m);
    end if;
  end if;
  return query select x ->> 0, (x ->> 1)::uuid, (x ->> 2)::integer, (x ->> 3)::public.permission_level
                 from jsonb_array_elements(v_m::jsonb) x;
end
$function$;

create or replace function iam.member_default_level(p_organization_id uuid, p_table_id uuid default null::uuid)
 returns permission_level
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
-- HOT-DOORS-4 (2026-10-08): iam._member_default_level_now's answer (the old body, unchanged), kept in the
-- statement memo per (organization, Table, snapshot) while iam.kernel_batch_on: the member lane asked it
-- for the same Table on every row and every rung.
declare
  v_key text;
  v_m   text;
  v_l   public.permission_level;
begin
  if not iam.kernel_batch_on(null) then
    return iam._member_default_level_now(p_organization_id, p_table_id);
  end if;
  v_key := 'iam.member_default_level:' || coalesce(p_organization_id::text, '') || ':' || coalesce(p_table_id::text, '')
        || ':' || pg_catalog.pg_current_snapshot()::text;
  v_m := platform.memo_k_get(v_key);
  if v_m is not null then
    return nullif(v_m, '-')::public.permission_level;
  end if;
  v_l := iam._member_default_level_now(p_organization_id, p_table_id);
  perform platform.memo_k_put(v_key, coalesce(v_l::text, '-'));
  return v_l;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.member_lane_confers(p_user_id uuid, p_organization_id uuid, p_type text DEFAULT 'record'::text, p_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid, p_personal_hides boolean DEFAULT false)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_table    uuid := p_table_id;
  v_store_on boolean;
  v_row_table      uuid;
  v_row_visibility platform.visibility;
  v_gk       text;     -- HOT-DOORS-4
  v_g        text;
begin
  if p_user_id is null or p_organization_id is null then
    return null;
  end if;

  -- HOT-DOORS-4 (2026-10-08): the four questions below read only the person and the organization, so while
  -- iam.kernel_batch_on their joint answer is kept in the statement memo ('t': all four passed, 'f': one
  -- answered no); every row and every rung asked them again.
  if iam.kernel_batch_on(p_user_id) then
    v_gk := 'iam.member_lane_confers_org:' || p_user_id::text || ':' || p_organization_id::text
         || ':' || pg_catalog.pg_current_snapshot()::text;
    v_g := platform.memo_k_get(v_gk);
    if v_g = 'f' then
      return null;
    end if;
  end if;
  if v_g is null then
    -- (a 'f' is written here and left on the first no below; 't' replaces it when all four pass)
    if v_gk is not null then
      perform platform.memo_k_put(v_gk, 'f');
    end if;
    -- Membership itself. Not a role check: `owner` and `admin` reach their own arms earlier and
    -- are not affected by anything here (VIS-20 is a different question from VIS-19).
    if not exists (select 1 from iam.organization_member om
                    where om.user_id = p_user_id and om.organization_id = p_organization_id) then
      return null;
    end if;

    -- CD-LADDER (2026-10-03): AN ARCHIVED ORGANIZATION IS CLOSED TO EVERYONE (access ladder T-33), so
    -- its membership confers nothing — the kernel already refuses every row of it; this arm agrees.
    if exists (select 1 from iam.organizations o
                where o.id = p_organization_id and o.archived_at is not null) then
      return null;
    end if;

    -- THE CAMPAIGN'S OFF SWITCH, read the established way (`custom.store_is_open`'s own body,
    -- inlined so this file's guard is a line of code and not a sentence about one).
    begin
      v_store_on := custom.store_is_open(p_organization_id);
    exception when others then
      v_store_on := false;
    end;
    if not v_store_on then
      return null;
    end if;

    -- VIS-33. The organization may say that membership alone shows nothing at all.
    if not iam.member_lane_open(p_organization_id) then
      return null;
    end if;
    if v_gk is not null then
      perform platform.memo_k_put(v_gk, 't');
    end if;
  end if;

  -- VIS-19, THE OVERRIDE. Somebody has decided about this person and this thing, so the role
  -- default is not the answer - the grant is, and it is admitted on its own arm.
  --
  -- IT IS THIS ROW AND NOT THE WHOLE SPECIFICITY LADDER, DELIBERATELY (LADDER-CAP). The Table
  -- and the homes are rungs too, and they are read by `custom.addressed_cap`, which
  -- `custom.reaches_directly` asks ONCE per question. Asking them here put a containment walk
  -- inside the access kernel's per-node loop and cost the page-read path 61%.
  if p_id is not null
     and iam.grant_addressed_level(p_user_id, p_type, p_id) is not null then
    return null;
  end if;

  -- AGT-5. The default is held PER REGISTERED TABLE, so the Table is read off the row rather
  -- than guessed. `to_regclass` keeps this callable before the store exists.
  --
  -- 🚨 ACCESS-IS-PERSONAL (2026-09-24) — AND THE ROW'S OWN VISIBILITY BOUNDS THIS LANE (DD-136).
  -- Membership is the organization lane, addressed to nobody in particular, and the access
  -- kernel only ever asks this function behind `v_vis >= 'internal'` (iam.has_access_for_base).
  -- `custom.reaches_directly` arm 2 and every level read in the record store
  -- (`iam.effective_level`) asked it with no such guard, so a clinic whose members edit the day
  -- sheet by default handed the front desk the practice manager's PERSONAL appointment — while
  -- `iam.has_access_for` refused the same row and `custom.carrying_edges_of` arm 3 declined to
  -- carry it ("reached by a grant and by its creator and by nothing else"). A row below
  -- `internal` gets nothing from membership here; its owner and a grant addressed to it are
  -- admitted on their own arms, untouched. Rule 9 stands: this narrows the lane addressed to
  -- nobody, it denies nothing a grant gave. Proof: scripts/campaign-tests/accesspersonal_personal_record_green.sql.
  if p_type = 'record' and p_id is not null
     and to_regclass('custom.record') is not null then
    select r.table_id, r.visibility into v_row_table, v_row_visibility
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id;
    -- Access ladder T-36: with p_personal_hides (the access kernel's opening question) "Only me"
    -- is a list filter on an Organization table and never removes this lane; the list and set
    -- doors call without it and keep leaving such rows out.
    if not p_personal_hides
       and v_row_visibility is not null and v_row_visibility < 'internal'::platform.visibility then
      return null;
    end if;
    if v_table is null then
      v_table := v_row_table;
    end if;
  end if;

  -- 🚨 SHARE-TAILS (2026-09-25) — AND THE ROW'S TABLE BOUNDS IT TOO. A Table set to "Only people I
  -- share it with" is `personal` (custom.share_lane_set writes the lane and the visibility in one
  -- transaction), and membership must not reach it through its ROWS either: the rows stay
  -- `internal` so the Table's own grants keep carrying them to the people named
  -- (custom.table_carries_its_rows), but the lane addressed to nobody stops at the Table. Without
  -- this line a member read every row of a "mine" Table, and so the Table itself
  -- (custom.table_has_a_visible_record). Grants, ownership and containment are untouched.
  if not p_personal_hides
     and v_table is not null and v_table is distinct from custom.table_kernel_id()
     and to_regclass('custom.record') is not null
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id and t.id = v_table
                    and t.visibility < 'internal'::platform.visibility) then
    return null;
  end if;

  -- DATA IS EVERYONE'S (Arman, 2026-10-05): the organization's word reaches the rows of its data
  -- Tables. Every other type keeps membership at viewer at most until Arman sets its default
  -- (his 2026-08 words: org agents View, most normal stuff Edit).
  if p_type = 'record' and v_table is not null then
    return iam.member_default_level(p_organization_id, v_table);
  end if;
  return least(iam.member_default_level(p_organization_id, v_table), 'viewer'::public.permission_level);
end;
$function$;

create or replace function custom.addressed_cap(p_user_id uuid, p_type text, p_id uuid, p_organization_id uuid default null::uuid, p_table_id uuid default null::uuid)
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
-- HOT-DOORS-4 (2026-10-08): custom._addressed_cap_now's answer (the old body, unchanged), kept in the statement
-- memo per (person, type, id, organization, Table, snapshot) while iam.kernel_batch_on. The cap does not depend
-- on the level asked, and a level search asked it again on every rung above the floor.
declare
  v_key text;
  v_m   text;
  v_l   public.permission_level;
begin
  if p_user_id is null or p_id is null or not iam.kernel_batch_on(p_user_id) then
    return custom._addressed_cap_now(p_user_id, p_type, p_id, p_organization_id, p_table_id);
  end if;
  v_key := 'custom.addressed_cap:' || p_user_id::text || ':' || coalesce(p_type, '') || ':' || p_id::text || ':'
        || coalesce(p_organization_id::text, '') || ':' || coalesce(p_table_id::text, '')
        || ':' || pg_catalog.pg_current_snapshot()::text;
  v_m := platform.memo_k_get(v_key);
  if v_m is not null then
    return nullif(v_m, '-')::public.permission_level;
  end if;
  v_l := custom._addressed_cap_now(p_user_id, p_type, p_id, p_organization_id, p_table_id);
  perform platform.memo_k_put(v_key, coalesce(v_l::text, '-'));
  return v_l;
end;
$function$;

create or replace function custom.table_carries_its_rows(p_user_id uuid, p_table_id uuid, p_required permission_level default 'viewer'::permission_level)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
-- HOT-DOORS-4 (2026-10-08): the same question as before - the access kernel about the Table - kept in the
-- statement memo per (person, Table, level, snapshot) while iam.kernel_batch_on; arm 3 of
-- custom.reaches_directly asked it of the same Table once per row.
declare
  v_key text;
  v_m   text;
  v_b   boolean;
begin
  if p_user_id is null or p_table_id is null then return false; end if;
  if not iam.kernel_batch_on(p_user_id) then
    return iam.has_access_for(p_user_id, 'record', p_table_id, p_required);
  end if;
  v_key := 'custom.table_carries_its_rows:' || p_user_id::text || ':' || p_table_id::text || ':'
        || coalesce(p_required::text, '') || ':' || pg_catalog.pg_current_snapshot()::text;
  v_m := platform.memo_k_get(v_key);
  if v_m is not null then
    return nullif(v_m, '-')::boolean;
  end if;
  v_b := iam.has_access_for(p_user_id, 'record', p_table_id, p_required);
  perform platform.memo_k_put(v_key, coalesce(v_b::text, '-'));
  return v_b;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.addressed_cap_specific(p_user_id uuid, p_type text, p_id uuid, p_organization_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lvl public.permission_level;
  a     record;
  v_gk  text;     -- HOT-DOORS-4
  v_g   text;
  v_gate boolean;
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- RUNG 1 — THE ROW ITSELF. Ownership is the strongest address there is (VIS-25).
  if iam.owner_of(p_type, p_id) = p_user_id then return iam.top_content_level(); end if;
  v_lvl := iam.grant_addressed_level(p_user_id, p_type, p_id);
  if v_lvl is not null then return v_lvl; end if;

  -- RUNG 2 — THE TABLE THE ROW LIVES IN. A Table is a record (REC-25), asked exactly as rung 1.
  if p_table_id is not null and p_table_id is distinct from p_id then
    if iam.owner_of('record', p_table_id) = p_user_id then return iam.top_content_level(); end if;
    v_lvl := iam.grant_addressed_level(p_user_id, 'record', p_table_id);
    if v_lvl is not null then return v_lvl; end if;
  end if;

  -- THE GATE. Rung 3 is a graph walk and it is the only expensive thing here, so it runs only
  -- when it could possibly answer: somebody must have addressed a live grant to this person
  -- somewhere, or she must own a record in this organization. Two indexed probes against a walk.
  -- HOT-DOORS-4 (2026-10-08): the gate reads only the person and the organization, so while
  -- iam.kernel_batch_on its answer is kept in the statement memo; it was asked once per row and per rung.
  if iam.kernel_batch_on(p_user_id) then
    v_gk := 'custom.addressed_cap_gate:' || p_user_id::text || ':' || coalesce(p_organization_id::text, '')
         || ':' || pg_catalog.pg_current_snapshot()::text;
    v_g := platform.memo_k_get(v_gk);
  end if;
  if v_g is not null then
    v_gate := (v_g = 't');
  else
    v_gate := not (not exists (select 1 from iam.permissions p
                  where p.status <> 'rejected'
                    and (p.expires_at is null or p.expires_at > now())
                    and not coalesce(p.is_public, false)
                    and (p.granted_to_user_id = p_user_id
                         or p.granted_to_organization_id in (select om.organization_id
                                                               from iam.organization_member om
                                                              where om.user_id = p_user_id)))
     and not exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id
                        and r.created_by = p_user_id
                        and r.deleted_at is null));
    if v_gk is not null then
      perform platform.memo_k_put(v_gk, case when v_gate then 't' else 'f' end);
    end if;
  end if;
  if not v_gate then
    return null;
  end if;

  -- RUNG 3 — THE HOMES, SHALLOWEST FIRST, because a nearer container is the more specific word.
  -- An ancestor can never address more than it conveys, so `conveys_max` bounds it here exactly
  -- as it bounds the carry in arm 3 of the ladder.
  for a in
    select c.container_type, c.container_id, c.max_level, c.depth
      from custom.visibility_ancestors(p_type, p_id) c
     where c.container_id is distinct from p_table_id
     order by c.depth
  loop
    if iam.owner_of(a.container_type, a.container_id) = p_user_id then
      return least(a.max_level, iam.top_content_level());
    end if;
    v_lvl := iam.grant_addressed_level(p_user_id, a.container_type, a.container_id);
    if v_lvl is not null then return least(a.max_level, v_lvl); end if;
  end loop;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.reaches_directly_many(p_user_id uuid, p_targets uuid[], p_type text DEFAULT 'record'::text, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS TABLE(target uuid, reaches boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- PERF-FIX-2 (2026-10-07). THE SET FORM OF custom.reaches_directly: one row per distinct non-null
-- target, `reaches` = custom.reaches_directly(p_user_id, p_type, target, p_required) - that very
-- function, asked for each target, so it is not a second ladder and cannot drift from it.
-- What it shares is the one question that function and the access kernel each ask first about a
-- record: does it have a Confidential anchor (custom.confidential_anchor, twice per record, each a
-- read by id across all sixteen partitions). Here it is read ONCE for every target together. A
-- target that no row of class `record` carries, or that exactly one such row carries whose Table is
-- not Confidential and whose document names no parent, has no anchor - custom.confidential_anchor's
-- own loop stops at that first row - and the statement memo is given the very "none" ('-') that
-- function would leave there (only while the transaction has written nothing, as it does). Every
-- other target is left to the anchor function, as before.
-- KERNEL-SHADOW (2026-10-07): the shadow call at the end; see there.
declare
  v_kernel uuid := custom.table_kernel_id();
  v_snap   text := pg_catalog.pg_current_snapshot()::text;
  v_kt     uuid[];     -- PERF-FIX-4: the set form's targets and answers, when it ran
  v_ka     boolean[];
  v_fast   jsonb := '{}'::jsonb;
  v_batch  boolean;  -- HOT-DOORS-4
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;
  if p_user_id is not null and p_type = 'record' and pg_catalog.pg_current_xact_id_if_assigned() is null then
    perform platform.memo_k_put('custom.confidential_anchor:' || q.id::text || ':' || v_snap, '-')
       from (
         select u.id,
                count(w.id) as n_rec,
                coalesce(bool_or((t.data ->> 'level') = 'confidential'), false) as conf_tbl,
                coalesce(bool_or(jsonb_typeof(w.data -> 'parent_id') = 'string'), false) as has_parent
           from (select distinct x as id from unnest(p_targets) x where x is not null) u
           left join custom.record w on w.id = u.id and w.data_class = 'record'
           left join custom.record t
             on t.organization_id = w.organization_id and t.id = w.table_id and t.table_id = v_kernel
          group by u.id
       ) q
      where q.n_rec = 0 or (q.n_rec = 1 and not q.conf_tbl and not q.has_parent);
  end if;
  -- KERNEL-SHADOW stage 1 (2026-10-07): arm 1 of custom.reaches_directly (the access kernel) is asked
  -- ONCE for the whole set through iam.has_access_for_many and handed to each per-target call through
  -- the statement memo - only while the knob access/kernel_set_form is on for this person and the
  -- transaction has written nothing (the memo's own rule). A failure of the set form is a WARNING and
  -- every target is asked one at a time, as before.
  if p_user_id is not null and pg_catalog.pg_current_xact_id_if_assigned() is null
     and iam.kernel_set_form_on(p_user_id) then
    begin
      select array_agg(m.target), array_agg(m.allowed) into v_kt, v_ka
        from iam.has_access_for_many(p_user_id, p_targets, p_required::text, p_type) m;
      perform platform.memo_k_put('iam.kernel_set:' || p_user_id::text || ':' || p_type || ':'
                                  || p_required::text || ':' || m.target::text
                                  || ':' || pg_catalog.pg_current_snapshot()::text,
                                  case when m.allowed then 'true' else 'false' end)
         from unnest(v_kt, v_ka) as m(target, allowed);
    exception when others then
      v_kt := null;  v_ka := null;
      raise warning 'KERNEL-SET-FORM: iam.has_access_for_many failed (% %); answering one at a time',
        sqlstate, sqlerrm;
    end;
  end if;
  -- PERF-FIX-4 (2026-10-07): custom.reaches_directly's own first yes, read off the set answer above
  -- instead of asked one target at a time. For a target that ONE row carries, whose document's parent_id
  -- is absent or one well-formed id (so custom.containment_parent cannot raise), with no Confidential
  -- anchor (the very test the anchor memo above is written from: custom.confidential_answer is then
  -- null), in an organization that is not archived, whose kernel answer above is yes, and with the level
  -- asked at or below custom.level_floor(), custom.reaches_directly returns true at its kernel step and
  -- reads or writes nothing else on the way. Those targets answer true here; every other target is asked
  -- of custom.reaches_directly exactly as before. mx.data_home_set = off asks every target.
  -- HOT-DOORS-4 (2026-10-08): ABOVE THE FLOOR TOO. For the same targets (the same test, word for word), at a
  -- level above custom.level_floor() custom.reaches_directly returns, at its kernel step, `cap is null or
  -- p_required <= cap` with cap = custom.addressed_cap(p_user_id, 'record', id, <the row's organization>, <the
  -- row's Table>) and reads or writes nothing else - so that is the answer here (the cap kept in the statement
  -- memo, so the rungs of a level search ask it once per row). Only while iam.kernel_batch_on.
  v_batch := v_kt is not null and p_type = 'record' and p_required > custom.level_floor()
             and coalesce(current_setting('mx.data_home_set', true), '') <> 'off'
             and iam.kernel_batch_on(p_user_id);
  if v_kt is not null and p_type = 'record' and (p_required <= custom.level_floor() or v_batch)
     and coalesce(current_setting('mx.data_home_set', true), '') <> 'off' then
    select coalesce(jsonb_object_agg(u.id::text,
                      case when not v_batch then true
                           else (select c.cap is null or p_required <= c.cap
                                   from (select custom.addressed_cap(p_user_id, 'record', u.id, r.org, r.tbl) as cap) c)
                      end), '{}'::jsonb) into v_fast
      from unnest(v_kt, v_ka) as u(id, ok)
      cross join lateral (
        select count(*) as n,
               min(w.organization_id::text)::uuid as org,
               min(w.table_id::text)::uuid as tbl,  -- HOT-DOORS-4: the row's Table (one row: n = 1)
               coalesce(bool_and(w.data -> 'parent_id' is null or jsonb_typeof(w.data -> 'parent_id') = 'null'
                                 or (jsonb_typeof(w.data -> 'parent_id') = 'string'
                                     and (w.data ->> 'parent_id') ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$')), false) as parent_ok,
               count(*) filter (where w.data_class = 'record') as n_rec,
               coalesce(bool_or(w.data_class = 'record' and (t.data ->> 'level') = 'confidential'), false) as conf_tbl,
               coalesce(bool_or(w.data_class = 'record' and jsonb_typeof(w.data -> 'parent_id') = 'string'), false) as has_parent
          from custom.record w
          left join custom.record t
            on t.organization_id = w.organization_id and t.id = w.table_id and t.table_id = v_kernel
         where w.id = u.id
      ) r
     where u.ok is true
       and r.n = 1 and r.parent_ok
       and (r.n_rec = 0 or (r.n_rec = 1 and not r.conf_tbl and not r.has_parent))
       and not exists (select 1 from iam.organizations o where o.id = r.org and o.archived_at is not null);
  end if;
  return query
    select u.x, case when v_fast ? u.x::text then (v_fast ->> u.x::text)::boolean
                     else custom.reaches_directly(p_user_id, p_type, u.x, p_required) end
      from (select distinct x from unnest(p_targets) x where x is not null) u(x);
  -- KERNEL-SHADOW (2026-10-07): for the people the knob access/kernel_shadow names, ask the set form
  -- of the access kernel beside the one-at-a-time form and log any disagreement. Asked AFTER the
  -- answer above, so nothing it does can change that answer; its own return value is not used here.
  if p_user_id is not null and iam.kernel_shadow_on(p_user_id) then
    perform iam.has_access_for_shadow(p_user_id, p_targets, p_required::text, p_type,
                                      'custom.reaches_directly_many');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.has_access_for_many(p_person uuid, p_targets uuid[], p_level text, p_type text DEFAULT 'record'::text)
 RETURNS TABLE(target uuid, allowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- KERNEL-SHADOW (2026-10-07). THE SET FORM OF THE ACCESS KERNEL: one row per distinct non-null
-- target, `allowed` = iam.has_access_for(p_person, p_type, target, p_level) — the same answer,
-- resolved once for the whole set instead of once per target. The rule it implements, lane by lane,
-- is common-docs/systems/platform/access/KERNEL.md. It is SHADOW ONLY until Arman decides the swap:
-- iam.has_access_for_shadow asks both forms and returns the old one.
--
-- WHAT IS SET-BASED. The person is resolved once (organizations, admin seats, store switch,
-- member-lane level per organization and Table). The target rows are read in ONE statement. Grants,
-- record memberships, scope assignments and Library grants are one semi-join each over the set.
-- Every clock clause (a grant's expiry) is the statement's own now().
--
-- WHAT IS NOT, AND GOES TO THE ONE-AT-A-TIME KERNEL (iam.has_access_for, unchanged), so the answer is
-- the kernel's by construction:
--   * every type but `record` (the hot path; other types are a later wave, KERNEL.md § Waves);
--   * the whole call, when the registry no longer says what this body assumes about `record`
--     (a reference gate, an owner-only trash rule, a detail or child pointer, a containment or
--     composition parent, or a class whose "Only me" rows do not open to the organization);
--   * one target, when its id is carried by more than one row, when it sits in a global-readable
--     system organization (those arms read the row column T-13 retires, which this body may not), or
--     when platform.reachability holds a container for it.
-- A Confidential row is answered by custom.confidential_answer itself, exactly as the kernel asks it.
--
-- THE PUBLIC LANE: the kernel asks the row column T-13 retires (= 'public'), which this body may not
-- read. A row published_to_web marks, that no other lane opens, is asked of the kernel (KERNEL-SHADOW h).
-- Known one-way gap, fail-closed: a row the kernel would open ONLY because its row column says public
-- while published_to_web says false (possible only with the T-13 dual-write trigger bypassed) is
-- refused here; the shadow and the sweep report it as a disagreement.
declare
  v_req     public.permission_level;
  v_lanes   platform.lane_set;
  v_set_ok  boolean;
  v_pcm     text;  -- HOT-DOORS-4
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;
  -- KERNEL-SHADOW h: a NULL level is NOT viewer - the kernel answers a NULL level its own way (owner and
  -- organization admins only), so a NULL level, like a NULL or non-record type, goes to the kernel.
  v_req := p_level::public.permission_level;

  if p_person is null then
    return query select distinct x, false from unnest(p_targets) x where x is not null;
    return;
  end if;

  -- The registry facts this body is written against, asked of the same functions the kernel asks.
  v_set_ok := coalesce(p_type = 'record' and v_req is not null
    and exists (select 1 from platform.entity_types et
                 where et.token = 'record' and et.is_active
                   and et.schema_name = 'custom' and et.table_name = 'record'
                   and et.rls_variant is distinct from 'detail')
    and platform.reference_gate_columns('record') is null
    and not coalesce(platform.trash_is_owner_only('record'), false)
    and platform.detail_parent_columns('record') is null
    and platform.child_parent_columns('record') is null
    and not exists (select 1 from platform.entity_relationships er
                     where er.child_type = 'record' and er.kind in ('composition', 'containment'))
    and coalesce(iam.personal_opens_row('record', 'custom', 'record', null), false), false);

  if not v_set_ok then
    return query
      select u.x, coalesce(iam.has_access_for(p_person, p_type, u.x, v_req), false)
        from (select distinct x from unnest(p_targets) x where x is not null) u(x);
    return;
  end if;

  v_lanes := iam.class_lanes('record');

  -- HOT-DOORS-4 (2026-10-08): one cached plan per statement of this call (partitions pruned at run time) instead of
  -- a custom plan per call; put back when it returns. A plan choice, never an answer.
  if iam.kernel_batch_on(p_person) then
    v_pcm := pg_catalog.current_setting('plan_cache_mode');
    perform pg_catalog.set_config('plan_cache_mode', 'force_generic_plan', true);
  end if;
  return query
  with
  t as materialized (
    select distinct x as id from unnest(p_targets) x where x is not null
  ),
  -- The person, once.
  my_orgs as materialized (
    select distinct om.organization_id as org
      from iam.organization_member om
     where om.user_id = p_person
  ),
  global_orgs as materialized (
    select s.organization_id as org from iam.system_orgs s where s.global_readable
  ),
  -- The rows, once.
  w as materialized (
    select t.id,
           r.organization_id as org,
           r.created_by      as owner,
           r.published_to_web as pub,
           r.table_id        as tbl,
           count(r.id) over (partition by t.id) as n_rows
      from t
      left join custom.record r on r.id = t.id
  ),
  -- Per organization the targets live in: archived, admin seat, member access, store switch.
  orgs as materialized (
    select o.org,
           exists (select 1 from iam.organizations x where x.id = o.org and x.archived_at is not null) as archived,
           public.is_org_admin_for(p_person, o.org) as is_admin,
           iam.has_org_access_for(p_person, o.org)  as has_access,
           custom.store_is_open(o.org)              as store_open
      from (select distinct w.org from w where w.org is not null and w.n_rows = 1) o
  ),
  -- Per target: the semi-joins.
  x as materialized (
    select w.id, w.org, w.owner, w.pub, w.tbl, w.n_rows,
           o.archived, o.is_admin, o.has_access, o.store_open,
           (w.org in (select g.org from global_orgs g)) as in_global_org,
           exists (select 1 from platform.reachability rc
                    where rc.item_type = 'record' and rc.item_id = w.id) as has_container,
           -- the Confidential anchor is provably absent when no row of class `record` carries the
           -- id, or exactly one does whose Table is not Confidential and whose document names no
           -- parent (custom.confidential_anchor's own loop stops at that first row)
           (select count(c.id) = 0
                   or (count(c.id) = 1
                       and not coalesce(bool_or((ct.data ->> 'level') = 'confidential'), false)
                       and not coalesce(bool_or(jsonb_typeof(c.data -> 'parent_id') = 'string'), false))
              from custom.record c
              left join custom.record ct
                on ct.organization_id = c.organization_id and ct.id = c.table_id
               and ct.table_id = custom.table_kernel_id()
             where c.organization_id = w.org and c.id = w.id and c.data_class = 'record') as anchor_free,
           exists (select 1 from platform.entity_grants eg
                    where eg.entity_type = 'record' and eg.entity_id = w.id) as has_library_row,
           -- public.has_permission_for, as a semi-join
           exists (select 1 from iam.permissions p
                    where p.resource_type = 'record' and p.resource_id = w.id
                      and coalesce(p.status, 'active') <> 'rejected'
                      and (p.expires_at is null or p.expires_at > now())
                      and (p.granted_to_user_id = p_person
                           or (p.granted_to_organization_id is not null
                               and p.granted_to_organization_id in (select m.org from my_orgs m)))
                      and case v_req
                            when 'viewer' then p.permission_level in ('viewer', 'commenter', 'edit_content', 'editor', 'admin')
                            when 'commenter' then p.permission_level in ('commenter', 'edit_content', 'editor', 'admin')
                            when 'edit_content' then p.permission_level in ('edit_content', 'editor', 'admin')
                            when 'editor' then p.permission_level in ('editor', 'admin')
                            when 'admin' then p.permission_level = 'admin'
                          end) as grant_hit,
           -- iam.grant_addressed_level(...) is not null: a grant addressed to this person speaks
           -- for this row, so the member lane's default does not (VIS-19)
           exists (select 1 from iam.permissions p
                    where p.resource_type = 'record' and p.resource_id = w.id
                      and p.status <> 'rejected'
                      and (p.expires_at is null or p.expires_at > now())
                      and coalesce(p.is_public, false) = false
                      and (p.granted_to_user_id = p_person
                           or p.granted_to_organization_id in (select m.org from my_orgs m))
                      and p.permission_level is not null) as addressed,
           -- a record membership (iam.membership_grant)
           exists (select 1 from iam.memberships m
                     join iam.membership_grant g
                       on g.member_role = m.role and g.container_type in ('record', '*')
                    where m.container_type = 'record' and m.container_id = w.id
                      and m.user_id = p_person and m.deleted_at is null
                      and g.confers >= v_req) as membership_hit,
           -- public._edu_can_read_via_assignment (the record arm)
           exists (select 1 from platform.associations_live a
                     join iam.memberships m
                       on m.container_type = 'scope' and m.container_id = a.target_id
                      and m.user_id = p_person and m.status = 'active' and m.deleted_at is null
                    where a.source_type = 'record' and a.source_id = w.id
                      and a.target_type = 'scope' and a.role = 'assignment') as edu_hit
      from w
      left join orgs o on o.org = w.org
  ),
  -- Which targets this body answers, and which still need the member lane's level.
  y as materialized (
    select x.*,
           (x.n_rows > 1 or x.in_global_org or x.has_container) as to_kernel,
           case when x.n_rows = 1 and not x.archived and not x.anchor_free
                     and not x.in_global_org and not x.has_container
                then custom.confidential_answer(p_person, x.id, v_req) end as conf
      from x
  ),
  early as materialized (
    select y.*,
           coalesce(y.n_rows = 1 and not y.to_kernel and not y.archived and y.conf is null
            and (
              (v_req = 'viewer' and y.has_library_row
                 and (public.user_can_read_via_library_grant(p_person, 'record', y.id)
                      or public.library_is_open('record', y.id)))
              or y.owner = p_person
              or y.grant_hit
              or y.membership_hit
              or (v_req = 'viewer' and y.edu_hit)
              or (v_lanes.org_role_lane and y.is_admin)
              or (v_lanes.org_member_lane and y.has_access and not y.store_open
                  and v_req <= 'editor'::public.permission_level)
            ), false) as early_yes  -- a row with no creator makes `owner = p_person` null, never yes
      from y
  ),
  -- The member lane's level (iam.member_lane_confers), per organization and Table, asked only
  -- where nothing earlier answered and only where the kernel itself would reach that arm.
  confers as materialized (
    select q.org, q.tbl,
           iam.member_lane_confers(p_person, q.org, 'record', null, q.tbl, true) as lvl
      from (select distinct e.org, e.tbl from early e
             where e.n_rows = 1 and not e.to_kernel and not e.archived and e.conf is null
               and not e.early_yes
               and not (v_req = 'viewer' and e.pub)
               and v_lanes.org_member_lane and e.has_access and e.store_open
               and not e.addressed) q
  )
  -- KERNEL-SHADOW h: one row per target (an id two rows carry is asked of the kernel once).
  select distinct on (e.id) e.id,
         case
           when e.to_kernel then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           when e.n_rows = 0 then false
           when e.archived then false
           when e.conf is not null then e.conf
           when e.early_yes then true
           -- KERNEL-SHADOW h: the public lane is never granted on published_to_web alone. A row it
           -- would open, and nothing else opens, is asked of the kernel, which reads the row column
           -- itself - so a row written with the T-13 dual-write trigger bypassed answers exactly as before.
           when v_req = 'viewer' and e.pub then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           else coalesce(
                  v_lanes.org_member_lane and e.has_access and e.store_open and not e.addressed
                  and v_req <= (select c.lvl from confers c
                                 where c.org = e.org and c.tbl is not distinct from e.tbl),
                  false)
         end
    from early e
   order by e.id;
  if v_pcm is not null then
    perform pg_catalog.set_config('plan_cache_mode', v_pcm, true);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.levels_of(p_user_id uuid, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- HOT-DOORS-3 (2026-10-08). THE SAME ANSWER, READ IN THE ORGANIZATION THE CALLER ALREADY HOLDS. A door that knows
-- the organization its ids live in (a page of one Table: custom.read_records_by_ids) leaves it in the statement
-- memo ('custom.levels_of_org', platform.memo_k_*) around its one call here, and clears it after. Then two reads
-- change, nothing else:
--   * each id's row is read by its key (organization, id) — one partition — and only an id with no row there
--     is read by id alone across all sixteen, exactly as before (a hint, never a filter);
--   * the ids that go to the ladder carry the organization in the statement memo (custom.record_org_hint),
--     so the kernel's first read of each touches one partition too.
-- Record ids are unique across organizations (KERNEL.md, KERNEL-ORG-PRUNE), so the row read in the
-- organization is the row read by id, and "o" is that organization.
--
-- STORE-READ-PERF-2 (2026-09-25). THE RUNG, ONCE PER CLASS, FOR A SET OF RECORDS.
--
-- Answers, for each id, exactly what the one ladder answers about it for this person:
--   l = custom.effective_level(p_user_id, <its organization>, id)   (the rung the mask needs)
--   s = custom.has_visibility(p_user_id, 'record', id, 'viewer')   (the read door's own check)
-- as {"<id>": {"l": <level or null>, "s": <bool>}}.
--
-- CHAIR-READPERF (round 2, 2026-10-03). Each answer for an id that exactly ONE row carries also names
-- that row's organization: {"l": .., "s": .., "o": "<organization id>"}. It is a fact this door has
-- already read (the row's home), handed on so the next door reads the row by its key (organization,
-- id) — one partition — instead of by id across all sixteen. An id no row carries, or more than one
-- row carries, has no "o". Every reader of this answer takes `l` and `s` by name.
--
-- WHY IT MAY ASK ONCE PER CLASS. Every input the ladder reads about ONE record is either a
-- column of that record — its organization, its Table, its `visibility`, whether it is live,
-- whether this person created it (`iam.owner_of` reads `created_by`), whether its document names
-- a parent, whether its Table is Confidential — or a row somewhere else that NAMES that record by
-- id: a grant (`iam.permissions`), a membership THIS PERSON holds on it (`iam.memberships`, record
-- or scope — nothing on the ladder reads anybody else's), a library grant
-- (`platform.entity_grants`), a closure row (`platform.reachability`), a carrying edge
-- (`custom.carrying_edges_of` arms 1a/1b/2a/2b/4 — every arm but the Table the record lives in),
-- or an assignment to a scope (`public._edu_can_read_via_assignment`). Everything else the ladder
-- reads — the organization's lanes and knobs, the Table's own grants and carrying, whether this
-- person is an admin, owns a record in the organization, or holds any grant anywhere — is the same
-- for every record that shares those columns. So two records with the same columns, the same own
-- memberships and NO other row naming either of them get the same answer at every rung, and the
-- ladder is asked once for the class.
--
-- A record that is NAMED by any such row, a row of the kernel Table (arm 4 of has_visibility
-- reads the Table's contents), a record with no Table, a record of a Confidential Table or with a
-- parent in its document (CHAIR-READPERF), an id that is not a record, and every record while
-- `record` has a registered FK containment parent (custom.visible_set's first stop) is asked on
-- its own, exactly as before. The class memo lives in this one call and nowhere else, so it can
-- never outlive the snapshot it was answered in.
--
-- SCOPES-HANDOFF-BUDGET (2026-09-28). An association that TARGETS the record names it only when it
-- is one of the carrying arms that read it from that side — arm 1a (an active association type
-- whose container is the SOURCE) and arm 2a (an active carrying rule of that role whose container
-- is the SOURCE) — exactly as the source-side test below has always matched arms 1b/2b/4. It used
-- to be ANY live association targeting the record, and every scope a transcript, an agent or a
-- workflow is tagged with carries a `context_tag` edge whose container is the scope itself (the
-- target side), so every scope of a type was walked on its own: 1,166 ladder walks for one type.
-- No other arm of the ladder reads an association that targets the record (visibility_ancestors
-- and addressed_cap read only custom.carrying_edges_of; has_access_for_base reads grants,
-- memberships and platform.reachability, each still a naming row here).
--
-- CHAIR-READPERF (2026-10-03). The person's OWN memberships on a record are part of its class key
-- (`mine` below: container_type/role/status of each live row, sorted), not a reason to walk it alone;
-- a scope names its members, and every scope of a type was a class of its own for a member of all
-- of them. `s` is read off the rung the halving found (null: viewer was asked and said no; viewer:
-- it was asked and said yes; above: the ladder is monotone, as the halving itself assumes).
declare
  v_out    jsonb := '{}'::jsonb;
  v_memo   jsonb := '{}'::jsonb;
  v_ks     text[] := array[]::text[];
  v_vs     jsonb[] := array[]::jsonb[];
  v_v      jsonb;
  v_fk     boolean;
  v_kernel uuid := custom.table_kernel_id();
  v_key    text;
  v_l      public.permission_level;
  v_s      boolean;
  r        record;
  -- PERF-FIX-1: a row named only by a portal's naming field is classed by WHERE it points
  v_t      uuid;
  v_tbl    uuid;
  v_ok     boolean;
  v_tmemo  jsonb := '{}'::jsonb;
  -- PERF-FIX-2: the rows in loop order, then one set ask for every row that needs the ladder
  v_a_id   uuid[] := '{}';  v_a_key text[] := '{}';  v_a_found boolean[] := '{}';  v_a_n bigint[] := '{}';  v_a_org uuid[] := '{}';
  v_seen   jsonb := '{}'::jsonb;
  v_need   uuid[] := '{}';
  v_lv     jsonb;
  i        integer;
  v_pcm    text;  -- HOT-DOORS-4
  -- HOT-DOORS-3: the organization the caller holds, or null (then every id is read by id alone, as before)
  p_organization_id uuid := case when coalesce(current_setting('mx.read_page_set', true), '') <> 'off'
                                 then nullif(platform.memo_k_get('custom.levels_of_org'), '')::uuid end;
begin
  if p_user_id is null or p_ids is null or cardinality(p_ids) = 0 then
    return v_out;
  end if;

  -- HOT-DOORS-4 (2026-10-08): one cached plan per statement of this call (partitions pruned at run time) instead of
  -- a custom plan per call; put back when it returns. A plan choice, never an answer.
  if iam.kernel_batch_on(p_user_id) then
    v_pcm := pg_catalog.current_setting('plan_cache_mode');
    perform pg_catalog.set_config('plan_cache_mode', 'force_generic_plan', true);
  end if;

  v_fk := exists (select 1 from platform.entity_relationships er
                   where er.child_type = 'record' and er.kind in ('composition', 'containment'));

  for r in
    select u.id, x.organization_id, x.table_id, x.visibility, x.deleted_at is null as live,
           x.created_by is not distinct from p_user_id as own, x.id is not null as found,
           count(*) over (partition by u.id) as n,
           -- a Confidential Table's row and a row with a parent answer from their own document
           (t.data ->> 'level' = 'confidential') is true
             or jsonb_typeof(x.data -> 'parent_id') = 'string' as alone,
           -- this person's own live memberships on it, the only ones the ladder reads (read once for
           -- the person, grouped, and joined: an aggregate run once per id cost 0.09 ms an id)
           mm.mine,
           ( exists (select 1 from iam.permissions p
                      where p.resource_type = 'record' and p.resource_id = u.id)
          or exists (select 1 from platform.entity_grants g
                      where g.entity_type = 'record' and g.entity_id = u.id)
          or exists (select 1 from platform.reachability rr
                      where rr.item_type = 'record' and rr.item_id = u.id)
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.target_type = 'record' and a.target_id = u.id
                        and ( exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'source')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'source')))
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
                        and ( a.target_type = 'scope'
                           -- PERF-FIX-1: a naming field that DOES yield a portal edge (a record target, an active
                           -- portal) is no longer a reason to walk the row alone: it is part of the class key below
                           or a.relation_field_id is not null
                              and exists (select 1 from custom.portal_table pt where pt.names_via_field_id = a.relation_field_id)
                              and not (a.target_type = 'record'
                                       and exists (select 1 from custom.portal_table pt
                                                     join custom.portal p on p.id = pt.portal_id and p.is_active
                                                    where pt.names_via_field_id = a.relation_field_id))
                           or exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'target')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'target'))) ) as named,
           -- PERF-FIX-1: the portal edges custom.carrying_edges_of arm 4 would give this record, as a sorted
           -- signature (target id / what it conveys) and as the targets themselves
           (select string_agg(z.s, ',' order by z.s)
              from (select distinct a.target_id::text || '/' || pt.conveys_max::text as s
                      from platform.associations a
                      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
                      join custom.portal p on p.id = pt.portal_id and p.is_active
                     where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
                       and a.target_type = 'record') z) as portal_sig,
           (select array_agg(distinct a.target_id)
              from platform.associations a
              join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
              join custom.portal p on p.id = pt.portal_id and p.is_active
             where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
               and a.target_type = 'record') as portal_targets
      from (select distinct unnest(p_ids) as id) u
      left join lateral (
             select x0.id, x0.organization_id, x0.table_id, x0.visibility, x0.deleted_at, x0.created_by, x0.data
               from custom.record x0
              where x0.organization_id = p_organization_id and x0.id = u.id
             union all
             select x1.id, x1.organization_id, x1.table_id, x1.visibility, x1.deleted_at, x1.created_by, x1.data
               from custom.record x1
              where x1.id = u.id
                and not exists (select 1 from custom.record x2
                                 where x2.organization_id = p_organization_id and x2.id = u.id)
           ) x on true
      left join custom.record t on t.organization_id = x.organization_id and t.id = x.table_id
      left join (select m.container_id,
                        string_agg(m.container_type || '/' || coalesce(m.role, '') || '/' || coalesce(m.status, ''), ','
                                   order by m.container_type, m.role, m.status) as mine
                   from iam.memberships m
                  where m.user_id = p_user_id and m.container_type in ('record', 'scope') and m.deleted_at is null
                  group by m.container_id) mm on mm.container_id = u.id
     where u.id is not null
  loop
    if not r.found or v_fk or r.table_id is null or r.table_id = v_kernel or r.named or r.alone then
      v_key := null;
    else
      v_key := r.organization_id::text || ':' || r.table_id::text || ':' || r.visibility::text || ':'
            || r.live::text || ':' || r.own::text || ':' || coalesce(r.mine, '');
      -- PERF-FIX-1: two records that point at the same portal targets, and differ in nothing else the
      -- ladder reads, have the same carriers and so the same answer - but only while each target is a
      -- TERMINAL container (its only carrying edge is the Table it lives in), so the walk above it is the
      -- same for both and no cycle back through the record itself can tell them apart. Any other target
      -- and the row is asked on its own, exactly as before.
      if r.portal_sig is not null then
        v_ok := true;
        foreach v_t in array r.portal_targets loop
          if not (v_tmemo ? v_t::text) then
            select t.table_id into v_tbl from custom.record t where t.id = v_t limit 1;
            v_tmemo := v_tmemo || jsonb_build_object(v_t::text,
              v_tbl is not null
              and not exists (select 1 from custom.carrying_edges_of('record', v_t) e
                               where e.container_type <> 'record' or e.container_id is distinct from v_tbl));
          end if;
          if not (v_tmemo ->> v_t::text)::boolean then
            v_ok := false;
            exit;
          end if;
        end loop;
        v_key := case when v_ok then v_key || ':' || r.portal_sig end;
      end if;
    end if;

    v_a_id := array_append(v_a_id, r.id);  v_a_key := array_append(v_a_key, v_key);
    v_a_found := array_append(v_a_found, r.found);  v_a_n := array_append(v_a_n, r.n);
    v_a_org := array_append(v_a_org, r.organization_id);
    if v_key is null or not (v_seen ? v_key) then
      v_need := array_append(v_need, r.id);
      if v_key is not null then
        v_seen := v_seen || jsonb_build_object(v_key, true);
      end if;
    end if;
  end loop;

  -- PERF-FIX-2: the rung of every row the memo below will not answer, in one set ask (the same halving
  -- per row, custom.effective_level_many); then the answers are laid out exactly as before.
  -- HOT-DOORS-3: the organization rides the ladder's reads of the rows it is asked about.
  select coalesce(jsonb_object_agg(e.id::text, e.level), '{}'::jsonb) into v_lv
    from custom.effective_level_many(
           p_user_id,
           array(select case when p_organization_id is not null and v_a_org[k] = p_organization_id
                             then custom.record_org_hint(v_a_id[k], p_organization_id) else v_a_id[k] end
                   from generate_subscripts(v_a_id, 1) k
                  where v_a_id[k] = any (v_need)
                  order by k)) e;

  for i in 1 .. cardinality(v_a_id) loop
    v_key := v_a_key[i];
    if v_key is not null and v_memo ? v_key then
      v_ks := v_ks || v_a_id[i]::text;
      v_vs := v_vs || case when v_a_n[i] = 1 then (v_memo -> v_key) || jsonb_build_object('o', v_a_org[i])
                           else v_memo -> v_key end;
      continue;
    end if;

    v_l := (v_lv ->> v_a_id[i]::text)::public.permission_level;
    v_s := v_l is not null;
    v_v := jsonb_build_object('l', v_l, 's', v_s);
    v_ks := v_ks || v_a_id[i]::text;
    v_vs := v_vs || case when v_a_found[i] and v_a_n[i] = 1 then v_v || jsonb_build_object('o', v_a_org[i])
                         else v_v end;
    if v_key is not null then
      v_memo := v_memo || jsonb_build_object(v_key, v_v);
    end if;
  end loop;
  -- SCOPES-HANDOFF-BUDGET: the answers are gathered in two arrays and made one object at the end
  -- (appending to a jsonb object copies it whole, so a set of n ids cost n^2 bytes).
  select coalesce(jsonb_object_agg(k.k, k.v), '{}'::jsonb) into v_out
    from unnest(v_ks, v_vs) as k(k, v);
  if v_pcm is not null then
    perform pg_catalog.set_config('plan_cache_mode', v_pcm, true);
  end if;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_records_page(p_organization_id uuid, p_table_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_search text DEFAULT NULL::text, p_sort jsonb DEFAULT '[]'::jsonb, p_view_id uuid DEFAULT NULL::uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_time_zone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me        uuid := auth.uid();
  v_level     public.permission_level;
  v_mask      jsonb;
  v_visible   text[];
  v_computed  text[];
  v_choices   jsonb;
  v_limit     integer;
  v_offset    integer := greatest(coalesce(p_offset, 0), 0);
  v_where     text;
  v_order     text := '';
  v_term      text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort      jsonb;
  v_key       text;
  v_dir       text;
  v_as        text;
  v_expr      text;
  v_labels    jsonb;
  v_view      record;
  v_positions jsonb := null;
  v_total     bigint;
  v_ids       uuid[];
  v_rows      jsonb;
  v_ignored   jsonb := '[]'::jsonb;
  v_plain     boolean;   -- CHAIR-ACCESS b: a page that asks nothing of the rows' values
  -- HOT-DOORS-3 (2026-10-08)
  v_new       boolean := coalesce(current_setting('mx.read_page_set', true), '') <> 'off';
  v_ctx       jsonb;
  v_listed    text;
  v_ksel      text := '';
  v_kord      text := '';
  v_ki        integer := 0;
  v_locked    bigint := 0;  -- WALK-FIXES D8
  v_pcm       text;         -- HOT-DOORS-4
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- THE ORGANIZATION WALL, THEN THE TABLE — the same two questions, in the same order, that
  -- custom.read_records_matching asks on its first lines.
  -- HOT-DOORS-4 (2026-10-08): one cached plan per statement of this call (partitions pruned at run time) instead of
  -- a custom plan per call; put back when it returns. A plan choice, never an answer.
  if iam.kernel_batch_on(v_me) then
    v_pcm := pg_catalog.current_setting('plan_cache_mode');
    perform pg_catalog.set_config('plan_cache_mode', 'force_generic_plan', true);
  end if;
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_page');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_page');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_page', p_limit, 50);

  -- The field question, once: which columns this reader may see (search and sort read ONLY these).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  -- A column worked out on every read keeps no value in the record, so nothing can sort by it.
  select coalesce(array_agg(k.key), '{}'::text[]) into v_computed
    from jsonb_each_text(coalesce(v_mask -> 'all_key_ids', '{}'::jsonb)) k
    join custom.record f on f.id = k.value::uuid
   where f.data ->> 'type' = 'formula'
     and coalesce(f.data ->> 'compute_on', 'read') = 'read';
  v_choices := coalesce(custom.choice_field_map(p_organization_id, p_table_id), '{}'::jsonb);

  -- ── the rows this reader may see that answer the question ──
  -- CHAIR-ACCESS b: on a PLAIN page (no search, no filter, no sort, no view) a row of a Confidential
  -- Table this person may not open, but which is listed for her ("Shown to"), is a row of the page
  -- too - as its HEADER only, {id, exists: true, submitted_at} (HR proof gap 4). Never when the page
  -- asks a question of the rows: a search hit, a filter match or a sort position on a row she may
  -- not read would say something about its values.
  v_plain := v_term is null
             and coalesce(p_filter, '{}'::jsonb) = '{}'::jsonb
             and (p_sort is null or jsonb_typeof(p_sort) <> 'array' or jsonb_array_length(p_sort) = 0)
             and p_view_id is null;
  -- HOT-DOORS-3 (2026-10-08): THE LIST FILTER IN THE SAME PASS AS THE PAGE. custom.listed_predicate_sql asks
  -- "is it listed for her" as `r.id in (select from custom.query_visible_ids(..))`: a second walk of the whole
  -- Table (25,000 rows through the "shown to" filter, then hashed) before the page's own walk. For one ordinary
  -- Table that list is, row for row, the rows the open predicate admits (custom.visible_set's answer, the same
  -- memoised answer custom.visible_predicate_sql reads) that are live, not quarantined and "shown to" her
  -- (platform.shown_to_lists with custom._record_shown_to_ctx for this organization and Table); the page's own
  -- WHERE already says live, not quarantined, this organization and this Table. So the page asks
  -- custom.visible_predicate_sql for the open predicate WITH the "shown to" filter (the context handed over in
  -- the statement memo around that one call: 'custom.visible_predicate_listed:<person>:<organization>:<Table>'),
  -- both are asked on the page's one walk, and the context is worked out once for both arms. The Table kernel
  -- (its list has memo branches of its own) and a principal that is not the session's person (the builder
  -- refuses that by name) still go through custom.listed_predicate_sql. mx.read_page_set = off: the page
  -- exactly as before (the proofs compare both on one snapshot).
  if v_new and p_table_id is not null and p_table_id is distinct from custom.table_kernel_id()
     and custom.query_principal() is not distinct from v_me then
    v_ctx := custom._record_shown_to_ctx(array[p_organization_id], p_table_id);
    perform platform.memo_k_put('custom.visible_predicate_listed:' || v_me::text || ':' || p_organization_id::text
                                || ':' || p_table_id::text, v_ctx::text);
    v_listed := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level, 'r');
    perform platform.memo_k_put('custom.visible_predicate_listed:' || v_me::text || ':' || p_organization_id::text
                                || ':' || p_table_id::text, '');
  else
    v_listed := custom.listed_predicate_sql(v_me, p_organization_id, p_table_id,
                                            'viewer'::public.permission_level, 'r');
    if v_new and v_plain then
      v_ctx := custom._record_shown_to_ctx(array[p_organization_id], p_table_id);
    end if;
  end if;
  v_where := format($w$
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and ((%s) or (%s))
       and %s$w$,
    p_organization_id, p_table_id,
    v_listed,
    case when v_plain
         -- (the second argument of shown_to_lists is the row column T-13 retires - a legacy fallback
         -- for rows with no shown_to; this door never read it and does not start now: null)
         then format('custom.confidential_header(%L::uuid, r.id) is not null and platform.shown_to_lists(r.shown_to, null, r.created_by, r.organization_id, %L::uuid, %L::jsonb)',
                     v_me, v_me, coalesce(v_ctx, custom._record_shown_to_ctx(array[p_organization_id], p_table_id)))
         else 'false' end,
    custom.record_filter_sql(p_organization_id, p_table_id,
      case when custom.filter_is_rule(coalesce(p_filter, '{}'::jsonb)) then p_filter
           else custom.choice_filter_normalize(v_choices, coalesce(p_filter, '{}'::jsonb)) end));

  -- ── the search: THE ONE SHARED PREDICATE (CHAIR-GRID). custom.record_search_sql is this door's own older
  -- ILIKE over the visible columns and the choice words, plus the typed matches (a date as a person writes
  -- it, a phone by its digits, an amount as the grid shows it), judged for this reader. custom.record_aggregate
  -- asks the same function with the same arguments, so a footer counts exactly the rows this page shows.
  if v_term is not null then
    v_where := v_where || ' and ' || custom.record_search_sql(p_organization_id, p_table_id, p_search, 'r', p_time_zone);
  end if;

  -- ── the order ──
  if p_sort is not null and jsonb_typeof(p_sort) = 'array' and jsonb_array_length(p_sort) > 0 then
    for v_sort in select s from jsonb_array_elements(p_sort) s loop
      v_key := v_sort ->> 'field';
      v_dir := case when lower(coalesce(v_sort ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end;
      v_as  := lower(coalesce(v_sort ->> 'as', 'text'));
      -- MONITOR-TRIAGE (2026-10-01): a sort on a column this reader cannot see — removed, or masked
      -- from their seat — is SKIPPED and named in `sort_ignored`, never a refused page. Ordering by
      -- it would leak the masked values' order, so it is not applied; the rest of the sort stands.
      if v_key is null or not (v_key = any (v_visible)) then
        v_ignored := v_ignored || to_jsonb(coalesce(v_key, ''));
        continue;
      end if;
      if v_key = any (v_computed) then
        raise exception 'The column "%" is worked out each time it is read, so the store keeps no value to sort the whole table by.', v_key
          using errcode = '0A000',
                hint = 'Sort by one of the columns it is worked out from, or have the column worked out when a record is saved (compute_on: write) so its value is kept. Nothing was read.';
      end if;
      if v_choices ? v_key then
        select coalesce(jsonb_object_agg(o.key, o.value ->> 'label'), '{}'::jsonb) into v_labels
          from jsonb_each(coalesce(v_choices -> v_key -> 'options', '{}'::jsonb)) o;
        v_expr := format('lower(coalesce(%L::jsonb ->> (r.data ->> %L), r.data ->> %L))', v_labels, v_key, v_key);
      elsif v_as in ('number', 'integer') then
        v_expr := format($x$case when (r.data ->> %L) ~ '^-?[0-9]+\.?[0-9]*$' then (r.data ->> %L)::numeric end$x$, v_key, v_key);
      elsif v_as in ('date', 'datetime') then
        -- An ISO date or instant sorts as its own text; anything else is not a date and sorts last.
        v_expr := format($x$case when (r.data ->> %L) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (r.data ->> %L) end$x$, v_key, v_key);
      else
        v_expr := format('lower(r.data ->> %L)', v_key);
      end if;
      v_order := v_order || v_expr || ' ' || v_dir || ' nulls last, ';
      -- HOT-DOORS-3: the same key, kept beside the id so the page can be taken from the matches without
      -- numbering all of them.
      v_ki := v_ki + 1;
      v_ksel := v_ksel || ', ' || v_expr || ' as k' || v_ki;
      v_kord := v_kord || 'm.k' || v_ki || ' ' || v_dir || ' nulls last, ';
    end loop;
    -- Every key skipped: the read door's own order, exactly as if no sort was asked.
    if v_order = '' then
      v_ksel := ', r.created_at as k0';
      v_kord := 'm.k0 desc, m.id';
    else
      v_kord := v_kord || 'm.id';
    end if;
    v_order := case when v_order = '' then 'r.created_at desc, r.id' else v_order || 'r.id' end;
  elsif p_view_id is not null then
    select sv.* into v_view from platform.saved_view sv
     where sv.id = p_view_id and sv.organization_id = p_organization_id
       and sv.surface_key = 'custom/records' and sv.deleted_at is null
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id;
    if v_view.id is null then
      raise exception 'There is no such saved view on this table.' using errcode = '23503',
              hint = 'It may have been removed, or it may belong to another table or organization. Nothing was read.',
            detail = jsonb_build_object('view_id', p_view_id)::text;
    end if;
    if v_view.definition ->> 'order' is distinct from 'manual' then
      raise exception 'This view is ordered by its sort, not by hand.' using errcode = '22023',
        hint = 'Ask for its sort in p_sort instead of naming the view. Nothing was read.';
    end if;
    v_positions := coalesce(v_view.metadata -> 'record_positions', '{}'::jsonb);
    v_order := '($1 ->> r.id::text)::numeric nulls last, r.created_at, r.id';
    v_ksel := ', ($1 ->> r.id::text)::numeric as k1, r.created_at as k2';
    v_kord := 'm.k1 nulls last, m.k2, m.id';
  else
    -- No question about order: the read door's own order.
    v_order := 'r.created_at desc, r.id';
    v_ksel := ', r.created_at as k0';
    v_kord := 'm.k0 desc, m.id';
  end if;

  -- HOT-DOORS (2026-10-08): THE COUNT AND THE PAGE IN ONE PASS. The rows the page may show are found once
  -- (every predicate above, the visible-set walk inside it included) and both the total and this page's ids
  -- are read from that one set. Asked as two statements, custom.query_visible_ids walked the whole Table
  -- twice per page (a 25,000-row Table: 2 x 25,000 rows through the "shown to" filter). Same total, same
  -- ids in the same order. mx.read_page_one_pass = off: the two statements as before (the proofs compare
  -- both on one snapshot).
  if v_new and coalesce(current_setting('mx.read_page_one_pass', true), '') <> 'off' then
    -- HOT-DOORS-3 (2026-10-08): ONLY THE PAGE IS SORTED. The matches are found once, each with the keys it is
    -- ordered by; the total counts them and the page is the first v_limit after v_offset in that order (a
    -- top-N sort), instead of numbering every match with row_number() (a full sort of all 25,000) to keep
    -- 50. Every order ends in the row's id, so the order is total and the page holds the same ids in the
    -- same order.
    execute format('with m as materialized (select r.id%s %s) '
                   'select (select count(*) from m), '
                   'array(select m.id from m order by %s limit %s offset %s)',
                   v_ksel, v_where, v_kord, v_limit, v_offset)
       into v_total, v_ids
      using v_positions;
    if cardinality(v_ids) = 0 then
      v_ids := null;
    end if;
  elsif coalesce(current_setting('mx.read_page_one_pass', true), '') = 'off' then
    execute 'select count(*) ' || v_where into v_total;

    execute format('select array_agg(q.id order by q.n) from (select r.id, row_number() over (order by %s) as n %s order by n limit %s offset %s) q',
                   v_order, v_where, v_limit, v_offset)
       into v_ids
      using v_positions;
  else
    execute format('with m as materialized (select r.id, row_number() over (order by %s) as n %s) '
                   'select (select count(*) from m), '
                   '(select array_agg(q.id order by q.n) from (select m.id, m.n from m order by m.n limit %s offset %s) q)',
                   v_order, v_where, v_limit, v_offset)
       into v_total, v_ids
      using v_positions;
  end if;

  if v_ids is null then
    v_rows := '[]'::jsonb;
  else
    -- CHAIR-ACCESS b: an id the read door does not open is a header row (a Confidential row this
    -- person is not named on); an id that is neither is simply not a row of the page.
    if v_new then
      -- HOT-DOORS-3: the header is asked only of an id the read door did not open. Asked through a lateral join
      -- it was asked of every id of the page and thrown away (the planner flattens the lateral: 50 calls,
      -- ~26 ms); a scalar subquery in the CASE arm runs only when that arm is reached. Same rows.
      select coalesce(jsonb_agg(x.row order by x.n), '[]'::jsonb)
        into v_rows
        from (select o.n,
                     case when d.id is not null
                          then jsonb_build_object('id', d.id, 'document', d.document, 'level', d.level)
                          -- (the header from a function scan: read once; a subquery column was written out twice)
                          else (select jsonb_build_object('id', o.rid, 'document', h.hdr, 'level', null)
                                  from custom.confidential_header(v_me, o.rid) h(hdr)
                                 where h.hdr is not null) end as row
                from unnest(v_ids) with ordinality o(rid, n)
                left join custom.read_records_by_ids(p_organization_id, p_table_id, v_ids, coalesce(p_by_id, false)) d on d.id = o.rid
              -- (offset 0: the row is built once; flattened, the CASE was written out twice, in the list and the filter)
              offset 0) x
       where x.row is not null;
    else
    select coalesce(jsonb_agg(x.row order by x.n), '[]'::jsonb)
      into v_rows
      from (select o.n,
                   case when d.id is not null
                        then jsonb_build_object('id', d.id, 'document', d.document, 'level', d.level)
                        when h.hdr is not null
                        then jsonb_build_object('id', o.rid, 'document', h.hdr, 'level', null) end as row
              from unnest(v_ids) with ordinality o(rid, n)
              left join custom.read_records_by_ids(p_organization_id, p_table_id, v_ids, coalesce(p_by_id, false)) d on d.id = o.rid
              left join lateral (select custom.confidential_header(v_me, o.rid) as hdr) h on d.id is null) x
     where x.row is not null;
    end if;
  end if;

  -- WALK-FIXES D8 (2026-10-08): A SORTED PAGE OF THE WHOLE TABLE COUNTS WHAT IT LEAVES OUT. A sort places
  -- no header row (a position would say something about a value), so a Confidential table with a default
  -- sort answered a member "0 rows" where the plain page says "4 you can't open". The NUMBER of those rows
  -- says nothing about their values — the plain page shows them — so a sort-only page answers it as
  -- `locked`. Asked only on a Confidential or Private table; any other answer is unchanged.
  if not v_plain and v_term is null and coalesce(p_filter, '{}'::jsonb) = '{}'::jsonb and p_view_id is null
     and exists (select 1 from custom.record t where t.organization_id = p_organization_id and t.id = p_table_id
                    and t.data ->> 'level' in ('confidential', 'private')) then
    execute format($l$
      select count(*) from custom.record r
       where r.organization_id = %L::uuid and r.table_id = %L::uuid and r.deleted_at is null
         and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
         and not coalesce((%s), false)
         and custom.confidential_header(%L::uuid, r.id) is not null
         and platform.shown_to_lists(r.shown_to, null, r.created_by, r.organization_id, %L::uuid, %L::jsonb)$l$,
      p_organization_id, p_table_id, v_listed, v_me, v_me,
      coalesce(v_ctx, custom._record_shown_to_ctx(array[p_organization_id], p_table_id)))
      into v_locked;
  end if;

  if v_pcm is not null then
    perform pg_catalog.set_config('plan_cache_mode', v_pcm, true);
  end if;
  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows,
                            'sort_ignored', v_ignored)
         || case when v_locked > 0 then jsonb_build_object('locked', v_locked) else '{}'::jsonb end;
end;
$function$;

