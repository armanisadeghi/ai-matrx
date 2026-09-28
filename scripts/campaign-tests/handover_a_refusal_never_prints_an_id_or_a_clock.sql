-- HANDOVER (2026-09-27) — A REFUSAL NEVER PRINTS AN ID OR A CLOCK.
--
-- The use case: admin@admin.com approved a Patient Capacity column in Cedar Ridge Physical
-- Therapy's chat, reopened it, pressed Approve again and read "That was already approved, on
-- 2026-09-28T01:23:12.271Z." The class: 89 refusal sentences across 74 custom.* doors put a
-- uuid ("There is no record 3f1c… in this organization") or a server clock (UTC) into the words a
-- person reads. The fact belongs in DETAIL, structured, where a screen can say it in the reader's
-- own words and clock.
--
--   1  CENSUS (the class), widened 2026-09-28 after VERIFIER-28 item 5 overturned "0 of 699": over
--      the DERIVED reach of every client door (not schema custom alone), no `raise exception
--      '…%…', <args>` interpolates a uuid or a timestamp — typed by the function's own
--      declarations, not only by name. RED on the live bodies before the second file (237
--      statements in 168 functions across 16 schemas; the second file fixes 151 functions, and 17 are held by the two rules in clause 1, the verifier's platform.assert_same_org and
--      custom.sign_request_create among them).
--   2  THE USE CASE, through the door as the person: an approval admin decided is decided again;
--      the refusal names who, carries no clock, and its DETAIL says state, decided_at, decided_by
--      and decided_by_name. RED before the lane ("…, on 2026-…").
--   3  The read door names the decider (decided_by_name). RED before the lane.
\i scripts/campaign-tests/_preamble.sql

begin;
do $$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_room    uuid;
  v_appr    jsonb;
  v_appr_id uuid;
  v_msg     text;
  v_detail  text;
  v_hits    text;
  v_read    jsonb;
  v_frozen  integer;
begin
  -- ── 1  THE CENSUS, over everything a signed-in person or an agent can reach ───────────────
  -- The reach is DERIVED, never a hand list: every declared client door
  -- (platform.client_callable_door, signed-in or anonymous callers), every function those doors
  -- call (schema-qualified calls in their bodies, transitively), and every trigger function in a
  -- schema that reach touches (a door's write fires them). An argument is printed when it is a
  -- name the function declares as uuid or timestamp (a parameter or a DECLARE line), an id-named
  -- variable (p_*_id, v_*_id, v_id, p_id), a ::uuid / ::timestamp cast, now() and its kin,
  -- to_char(), decided_at, or a parent id cast to text. A date the person typed and a duration
  -- are not clocks; RAISE WARNING / NOTICE are operator log lines, not refusals, and are out.
  with recursive
  fns as materialized (
    select p.oid, n.nspname, p.proname, n.nspname || '.' || p.proname as qname, pg_get_functiondef(p.oid) as body,
           p.prorettype = 'trigger'::regtype as is_trigger
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prokind = 'f'
       and n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public','pgsodium','vault','net','cron','realtime','storage','supabase_functions','pgbouncer','auth','graveyard','deprecated','topology','tiger')
       and n.nspname not like 'pg\_%'
  ),
  seeds as (
    select f.oid from platform.client_callable_door d
    join fns f on f.nspname = d.schema_name and f.proname = d.function_name
    where coalesce(d.signed_in_callers, false) or coalesce(d.anonymous_callers, false)
  ),
  -- WHAT THOSE DOORS CALL: every schema-qualified call in a body, joined to the function it names.
  edges as materialized (
    select distinct f.oid as caller, g.oid as callee
      from fns f,
           regexp_matches(lower(f.body), '([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(', 'g') m
      join fns g on g.nspname = m[1] and g.proname = m[2]
     where g.oid <> f.oid
  ),
  reach(oid) as (
    select oid from seeds
    union
    select e.callee from reach r join edges e on e.caller = r.oid
  ),
  reach_schemas as (select distinct f.nspname from reach r join fns f on f.oid = r.oid),
  scope as (
    select oid from reach
    union
    -- triggers fire on the writes those doors make: every trigger function in a reached schema
    select f.oid from fns f where f.is_trigger and f.nspname in (select nspname from reach_schemas)
  ),
  raises as (
    select f.oid, f.nspname || '.' || f.proname as fn, m[1] as said,
           regexp_replace(m[2], '\musing\M.*$', '', 'si') as args, f.body
      from scope s join fns f on f.oid = s.oid,
           regexp_matches(f.body, 'raise\s+exception\s+(''(?:[^'']|'''')*'')\s*,([^;]*);', 'gi') m
  ),
  typed as (
    -- every name the function declares as a uuid or a clock: its parameters and its DECLARE lines
    select f.oid, lower(a.name) as name
      from scope s join fns f on f.oid = s.oid
      join pg_proc p on p.oid = f.oid,
      lateral unnest(coalesce(p.proargnames, '{}'::text[]),
                     coalesce(p.proallargtypes, p.proargtypes::oid[])) as a(name, typ)
     where format_type(a.typ, null) in ('uuid','timestamp with time zone','timestamp without time zone')
    union
    select f.oid, lower(d[1])
      from scope s join fns f on f.oid = s.oid,
           regexp_matches(f.body, '\m([a-z_][a-z0-9_]*)\s+(uuid|timestamptz|timestamp(\s+with(out)?\s+time\s+zone)?)\s*(:=|;|default|not\s+null)', 'gi') d
  ),
  pieces as (
    select r.oid, r.fn, r.said, btrim(x, E' \t\r\n') as piece
      from raises r, regexp_split_to_table(r.args, ',') x
  ),
  hits as (
    select distinct p.oid::regprocedure::text as sig, p.fn, p.said, p.piece from pieces p
     where p.piece ~* '^([pv]_[a-z_]*_id|v_id|p_id)(::text)?$'
        or p.piece ~* '::(uuid|timestamptz|timestamp)\s*$'
        or p.piece ~* '^(now|clock_timestamp|statement_timestamp)\(\)$|^current_timestamp$'
        or p.piece ~* 'decided_at|v_parent::text|^to_char\('
        or exists (select 1 from typed t where t.oid = p.oid
                    and regexp_replace(lower(p.piece), '::text$', '') = t.name)
  )
    -- TWO KINDS THIS LANE MAY NOT REPLACE, exempt by RULE (never by a list of names), and printed so
  -- the count stays honest:
  --   (a) a function that assigns NEW.organization_id — the ddl_guard refuses ANY replacement of
  --       such a function (writers must supply organization_id);
  --   (b) a SECURITY DEFINER function with no access decision declared in
  --       platform.client_callable_door — replacing it demands that decision (provision_shape_guard)
  --       and revokes client EXECUTE; who may call it is its owner's access decision.
  -- Neither kind can be born any more (both guards refuse new ones), so this set only shrinks.
  select string_agg(h.sig || ': ' || left(h.said, 80) || ' [' || h.piece || ']', E'\n' order by h.sig)
           filter (where not h.frozen),
         count(distinct h.sig) filter (where h.frozen)
    into v_hits, v_frozen
    from (select h.*,
                 (f.body ~* 'new\s*\.\s*organization_id\s*:?=')
                 or (p.prosecdef and not exists (select 1 from platform.client_callable_door d
                                                  where d.schema_name = f.nspname and d.function_name = f.proname)) as frozen
            from hits h join fns f on f.qname = h.fn join pg_proc p on p.oid = f.oid) h;
  if v_hits is not null then
    raise exception E'1: these refusals still print an id or a clock:\n%', v_hits;
  end if;
  raise notice '1 PASSED — no replaceable refusal anywhere a signed-in person or an agent can reach interpolates an id or a clock (% functions held by the two rules above).', v_frozen;

  -- ── 2  THE USE CASE ──────────────────────────────────────────────────────────────────────
  perform set_config('app.actor_system', 'campaign-test/handover_a_refusal_never_prints_an_id_or_a_clock', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy — East Clinic ' || substr(v_org::text, 1, 8),
          'cedar-ridge-pt-east-' || substr(v_org::text, 1, 8), 'CRE', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'handover guard');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Treatment Rooms','slug','treatment_rooms','type','entity',
    'label_singular','Treatment Room','label_plural','Treatment Rooms','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','name'), jsonb_build_object('name','capacity')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','capacity','label','Patient capacity','plain','number','sort',20));
  v_room := custom.record_write(v_org, v_tbl, jsonb_build_object('name','Hydrotherapy Pool','capacity',3));
  -- The assistant asks, for admin (an agent's request is decided by the person it works for).
  v_appr := custom.work_approval_request(v_org, v_room,
    jsonb_build_object('kind', 'record_patch', 'patch', jsonb_build_object('capacity', 4)),
    'The pool now takes four patients.', null, 'agent', null);
  v_appr_id := (v_appr ->> 'approval_id')::uuid;
  perform custom.work_approval_decide(v_org, v_appr_id, true, null);
  begin
    perform custom.work_approval_decide(v_org, v_appr_id, true, null);
    raise exception '2: an approval was decided twice';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  end;
  if v_msg ~ '\d{4}-\d{2}-\d{2}' then
    raise exception '2: THE WHOLE DEFECT — the sentence carries a clock: "%"', v_msg;
  end if;
  if v_msg !~ '^That was already approved by .+\.$' then
    raise exception '2: the sentence does not say who decided it: "%"', v_msg;
  end if;
  if v_detail is null or (v_detail::jsonb ->> 'state') <> 'approved'
     or (v_detail::jsonb ->> 'decided_at') is null
     or (v_detail::jsonb ->> 'decided_by')::uuid <> c_admin
     or coalesce(v_detail::jsonb ->> 'decided_by_name', '') = '' then
    raise exception '2: the detail is not the structured answer: %', v_detail;
  end if;
  raise notice '2 PASSED — "%" with %', v_msg, v_detail;

  -- ── 3  THE READ DOOR NAMES THE DECIDER ───────────────────────────────────────────────────
  v_read := custom.work_approval_read(v_org, v_appr_id);
  if coalesce(v_read ->> 'decided_by_name', '') = '' or v_read ->> 'state' <> 'approved' then
    raise exception '3: the read door does not name who decided: %', v_read - 'change';
  end if;
  raise notice '3 PASSED — the read door says it was decided by %.', v_read ->> 'decided_by_name';
end
$$;
rollback;
