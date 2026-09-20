-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
-- based-on: custom.read_record(uuid, uuid, boolean) 9b4c81b0c915566e079f22345b58fe37df19baba7847611c2ff74d9f83344b1a
-- based-on: custom.record_values_versioned(uuid, uuid) 9685b83fc5e68e8dbe32c0e335065c63396c224ea4bf23206aed046261cd4e9a
-- based-on: custom.record_as_of(uuid, uuid, timestamp with time zone) cbb8df34a21e2e014fb9b847e77071b99e92a286bc12967fcd5018878ec337c8
-- based-on: custom.record_history(uuid, uuid, integer, integer) c0e6904dd27fcad18434b20de8bbb464fd8e1ea31c43f0cc48d3dae60e9ddd5b
-- based-on: custom.field_history(uuid, uuid, text, integer, integer, uuid) 5a8e3a4f1d15a8b43f946db4144465d413d2ec053431bf53853b6c762fa07182
-- based-on: custom.io_export(uuid, uuid, text[], integer, text) 21d46a9f9d0e1b9b551d5c762c51f1a576ea4e9a07af19bcb4a9c31f5751978e
--
-- A VALUE A READER MAY NOT SEE NEVER LEAVES THE STORE — NOT THROUGH ANY DOOR.
--
-- Lane TALK-TO-RECORD, 2026-09-20. AGT-N-9 says a record-scoped conversation's context is
-- "assembled through the one read door under the operating person's own field-level
-- security". Building that assembly meant asking which doors actually HOLD field-level
-- security, and the answer, measured live on the main database from the seat a signed-in
-- person really has (`role authenticated`, `request.jwt.claims` = test@test.com, shared ONE
-- record at `viewer`, one Field `sensitivity = confidential`), was: two of them.
--
--   custom.read_record        ssn -> null, _hidden names it.            MASKED
--   custom.read_records       ssn -> null, _hidden names it.            MASKED
--   custom.record_values_versioned   ssn = "123-45-6789"                LEAKED
--   custom.value_read(…,'ssn')       ssn = "123-45-6789"                LEAKED (via the above)
--   custom.record_as_of              data.ssn = "123-45-6789"           LEAKED
--   custom.record_history            changes[].after = "123-45-6789"    LEAKED
--   custom.field_history(…,'ssn')    after = "123-45-6789"              LEAKED
--   custom.io_export                 rows[].ssn = "123-45-6789"         LEAKED
--
-- Every one of those six is granted to `authenticated` and reachable over PostgREST by the
-- same person the read door refuses. This is not six bugs; it is ONE CLASS — masking was
-- written INSIDE `custom.read_record` instead of being a fact of the record that every door
-- asks for. So this file makes it a fact, `custom.read_mask`, and routes every door onto it.
--
-- WHAT DOES NOT CHANGE: no return type moves (a `CREATE OR REPLACE` cannot change one and
-- callers depend on all six), no door gains or loses an argument, and a reader who may see a
-- field sees exactly what they saw before. What changes is only what a reader may NOT see:
-- it is withheld, and the withholding is NAMED with the store's own sentence — never a
-- silent omission (AGT-N-7).

-- (the runner owns the transaction)

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE FACT. Which keys of one record THIS caller may see, the notices for the rest, and the
-- ids behind both — the exact four things `custom.read_record` worked out privately.
-- SERVER-ONLY: it answers a field census, so it is not a client door and holds no grant.
-- ════════════════════════════════════════════════════════════════════════════════════════
create function custom.read_mask(p_organization_id uuid, p_record_id uuid,
                                            p_action text default 'read')
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $fn$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
begin
  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if v_table is null then
    -- A record with no Table (a Home) declares no Fields, so nothing is masked and nothing
    -- is claimed. The caller's own door has already decided whether they may read it.
    return jsonb_build_object('table_id', null, 'level', null,
                              'visible', '[]'::jsonb, 'declared', '[]'::jsonb,
                              'notices', '{}'::jsonb, 'key_ids', '{}'::jsonb,
                              'undeclared_ride_along', true);
  end if;

  v_level := custom.effective_level(v_me, p_organization_id, p_record_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, v_table, v_level, p_action) f;

  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, p_action)), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and not (f.data ->> 'key' = any (v_visible));

  return jsonb_build_object(
    'table_id', v_table,
    'level',    v_level,
    'visible',  to_jsonb(v_visible),
    'declared', to_jsonb(v_declared),
    'notices',  v_notices,
    'key_ids',  v_key_ids,
    -- A key that is not a declared Field carries no field-level sensitivity, because there is
    -- no Field to carry one — exactly how custom.mask_document has always treated it.
    'undeclared_ride_along', true);
end;
$fn$;

revoke all on function custom.read_mask(uuid, uuid, text) from public;
revoke all on function custom.read_mask(uuid, uuid, text) from authenticated, anon;

-- DD-223 / provision_shape_guard: a SECURITY DEFINER function says IN DATA who may call it.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'read_mask', 'p_organization_id uuid, p_record_id uuid, p_action text',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
   'p_organization_id and p_record_id are NOT checked here and deliberately so: this function '
   'decides nothing and reads nothing of the record''s VALUES — it answers only which Field KEYS '
   'of that record the session''s own auth.uid() may read, which is the fact the calling door then '
   'applies. Every caller is a door that has already run custom.assert_client_may_reach and '
   'custom.assert_client_may_open (or custom.has_visibility) on exactly these two arguments; a '
   'NULL either side yields an empty mask, which withholds everything rather than widening '
   'anything. It is server-only for the opposite reason to secrecy: a client calling it directly '
   'would learn the Field census of a record it has not opened.',
   'talkrec_a_value_a_reader_may_not_see_never_leaves_the_store.sql',
   'server_only: called only from inside schema custom''s own read doors — custom.read_record, '
   'custom.read_records, custom.record_values_versioned, custom.record_as_of, '
   'custom.record_history, custom.field_history — each of which has already decided this caller '
   'against this record. No client ever calls it, and PostgREST cannot: it holds no EXECUTE.',
   false, false)
on conflict do nothing;

comment on function custom.read_mask(uuid, uuid, text) is
  'TALK-TO-RECORD 2026-09-20: which keys of one record this caller may see, and the store''s '
  'own notice for every key they may not. The one fact behind every masking door; server-only.';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE ONE ANSWER FOR "MAY I SEE THIS KEY". Kept beside the fact so no door re-derives it.
-- ════════════════════════════════════════════════════════════════════════════════════════
create function custom.mask_says_withheld(p_mask jsonb, p_key text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select p_mask -> 'notices' ? p_key;
$fn$;

revoke all on function custom.mask_says_withheld(jsonb, text) from public;
revoke all on function custom.mask_says_withheld(jsonb, text) from authenticated, anon;

/** The withheld stand-in a door puts where a value used to be: named, with the reason. */
create function custom.withheld_marker(p_mask jsonb, p_key text)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select jsonb_build_object('withheld', coalesce(p_mask -> 'notices' -> p_key, '{}'::jsonb),
                            'field_key', p_key);
$fn$;

revoke all on function custom.withheld_marker(jsonb, text) from public;
revoke all on function custom.withheld_marker(jsonb, text) from authenticated, anon;

/** The one sentence a door writes into a text column where a value used to be. */
create function custom.withheld_sentence(p_mask jsonb, p_key text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select 'withheld: this field is ' ||
         coalesce(p_mask -> 'notices' -> p_key ->> 'reason', 'not yours to read') ||
         ', and reading it needs ' ||
         coalesce(p_mask -> 'notices' -> p_key ->> 'needs', 'a higher level') ||
         ' or ' || coalesce(p_mask -> 'notices' -> p_key ->> 'or', 'a share of this one field');
$fn$;

revoke all on function custom.withheld_sentence(jsonb, text) from public;
revoke all on function custom.withheld_sentence(jsonb, text) from authenticated, anon;


-- ════════════════════════════════════════════════════════════════════════════════════════
-- DOOR 1 — custom.read_record. It already masked; now it asks the FACT instead of keeping a
-- private copy of it. Two bodies that mean to agree is how the leak below was born.
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean default false)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $fn$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_now      uuid;
  v_alts     jsonb;
  v_retired  jsonb;
  v_out      jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  select r.table_id, custom.record_values(r.organization_id, r.id)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an export, not an agent. Ask somebody who holds it to share it with you.';
  end if;

  -- THE ONE FACT. `custom.read_mask` is the whole of what this door used to work out privately.
  v_mask := custom.read_mask(p_organization_id, v_now, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;

  v_out := custom.mask_document(v_doc, v_visible, v_mask -> 'notices', p_by_id,
                                v_mask -> 'key_ids', v_declared);

  -- CHOICE-VALUE. Rendered AFTER masking, so a field this reader may not see keeps its notice
  -- and is never resolved.
  v_out := custom.choice_render(p_organization_id, v_table, v_out);

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT — only for keys this reader may see.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  -- SEAT-SUITES / T5+T12. THE VALUES THE STORE KEPT AND THE DOOR THREW AWAY, masked exactly
  -- like the value they used to be.
  select jsonb_agg(x order by x ->> 'key') into v_retired
    from custom.record r
    cross join lateral jsonb_array_elements(coalesce(r.data -> '_retired', '[]'::jsonb)) x
   where r.organization_id = p_organization_id and r.id = v_now
     and ((x ->> 'key') = any (v_visible) or not ((x ->> 'key') = any (v_declared)));

  if v_retired is not null and jsonb_array_length(v_retired) > 0 then
    v_out := v_out || jsonb_build_object('_retired', v_retired);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  return v_out;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- DOOR 2 — custom.record_values_versioned. THE TRIPLE (record, field, value version) that
-- DYN says every merge field resolves to, and the door a record-scoped chat cites from. It
-- asserted `viewer` on the ROW and then handed over every FIELD.
-- `custom.value_read` delegates to this one and is fixed by the same stroke.
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.record_values_versioned(p_organization_id uuid, p_record_id uuid)
returns table(field_key text, field_id uuid, value jsonb, value_version integer, source jsonb,
              absent_reason text, actor text, on_behalf_of text,
              written_at timestamp with time zone, alternates jsonb)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
#variable_conflict use_column
declare
  v_mask jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_values_versioned');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.record_values_versioned', 'viewer'::public.permission_level, 'record');

  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  return query
  with r as (
    select rec.* from custom.record rec
     where rec.organization_id = p_organization_id and rec.id = p_record_id
  ),
  vals as (
    select custom.record_values(p_organization_id, p_record_id) v
  ),
  keys as (
    select k from vals, jsonb_object_keys(vals.v) k
    union
    select k from r, jsonb_object_keys(coalesce(r.data -> '_values', '{}'::jsonb)) k
  ),
  base as (
  select keys.k as field_key,
         f.id   as field_id,
         vals.v -> keys.k as value,
         coalesce((r.data -> '_values' -> keys.k ->> 'ver')::integer, 1) as value_version,
         coalesce(r.data -> '_sources' -> (r.data -> '_values' -> keys.k ->> 'src'),
                  case when r.data -> '_derived' ? keys.k
                       then jsonb_build_object(
                              'kind',     'derived',
                              'parity',   r.data -> '_derived' -> keys.k -> 'parity',
                              'field_id', r.data -> '_derived' -> keys.k -> 'field_id')
                       when r.data -> '_computed' ? keys.k
                       then jsonb_build_object(
                              'kind',         'computed',
                              'rule_id',      r.data -> '_computed' -> keys.k -> 'rule_id',
                              'rule_version', r.data -> '_computed' -> keys.k -> 'rule_version',
                              'field_id',     r.data -> '_computed' -> keys.k -> 'field_id')
                  end) as source,
         r.data -> '_values' -> keys.k ->> 'absent' as absent_reason,
         r.data -> '_values' -> keys.k ->> 'actor' as actor,
         r.data -> '_values' -> keys.k ->> 'on_behalf_of' as on_behalf_of,
         coalesce((r.data -> '_values' -> keys.k ->> 'at')::timestamptz,
                  (r.data -> '_derived' -> keys.k ->> 'at')::timestamptz,
                  (r.data -> '_computed' -> keys.k ->> 'at')::timestamptz) as written_at,
         coalesce((select jsonb_agg(jsonb_build_object('value', a -> 'value',
                                                       'rank',  a -> 'rank',
                                                       'source', r.data -> '_sources' -> (a ->> 'src'))
                                    order by (a ->> 'rank')::int)
                     from jsonb_array_elements(coalesce(r.data -> '_values' -> keys.k -> 'alternates',
                                                        '[]'::jsonb)) a),
                  '[]'::jsonb) as alternates
    from r
    cross join vals
    cross join keys
    left join lateral (
      select af.id
        from custom.applicable_fields(p_organization_id, r.table_id,
                                      r.data ->> custom.table_type_field(p_organization_id, r.table_id)) af
       where af.data ->> 'key' = keys.k
       limit 1
    ) f on true
  )
  -- THE MASK. The triple still answers — a chat may cite "field X, version 3" of a field it
  -- may not read the VALUE of — but the value, its alternates and its provenance do not
  -- leave, and the row SAYS it was withheld rather than looking like an empty cell.
  select b.field_key,
         b.field_id,
         case when custom.mask_says_withheld(v_mask, b.field_key) then null else b.value end,
         b.value_version,
         case when custom.mask_says_withheld(v_mask, b.field_key)
              then custom.withheld_marker(v_mask, b.field_key) else b.source end,
         case when custom.mask_says_withheld(v_mask, b.field_key)
              then custom.withheld_sentence(v_mask, b.field_key) else b.absent_reason end,
         b.actor, b.on_behalf_of, b.written_at,
         case when custom.mask_says_withheld(v_mask, b.field_key) then '[]'::jsonb else b.alternates end
    from base b
   order by b.field_key;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- DOOR 3 — custom.record_as_of. The world-clock read. It handed the raw stored row back,
-- `_values` envelopes and all, so a viewer read a confidential field AS OF ANY MOMENT.
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.record_as_of(p_organization_id uuid, p_record_id uuid, p_at timestamp with time zone)
returns table(state jsonb, replayed boolean)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_mask jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_as_of');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.record_as_of',
                                        'viewer'::public.permission_level, 'record');

  -- The mask is taken on the record AS IT IS NOW, deliberately: sensitivity is a property of
  -- the Field today, not of the row in 2024. A field that is confidential now is confidential
  -- in every past version of the record, which is the only reading that cannot be walked
  -- around by asking for yesterday.
  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  return query
  select case
           when v_mask -> 'notices' = '{}'::jsonb then s.state
           else s.state
                || jsonb_build_object(
                     'data',
                     coalesce(
                       (select jsonb_object_agg(
                                 e.key,
                                 case when custom.mask_says_withheld(v_mask, e.key)
                                      then 'null'::jsonb else e.value end)
                          from jsonb_each(coalesce(s.state -> 'data', '{}'::jsonb)) e
                         where left(e.key, 1) <> '_'),
                       '{}'::jsonb)
                     -- The envelopes carry the same values a second time; a withheld key's
                     -- envelope goes with it, and the version it names is kept.
                     || jsonb_build_object(
                          '_values',
                          coalesce(
                            (select jsonb_object_agg(
                                      e.key,
                                      case when custom.mask_says_withheld(v_mask, e.key)
                                           then (e.value - 'value' - 'alternates')
                                                || custom.withheld_marker(v_mask, e.key)
                                           else e.value end)
                               from jsonb_each(coalesce(s.state -> 'data' -> '_values', '{}'::jsonb)) e),
                            '{}'::jsonb)))
                || jsonb_build_object('_hidden', v_mask -> 'notices')
         end,
         s.replayed
    from custom.record_state_as_of(p_record_id, p_at) s;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- DOOR 4 — custom.record_history. THE HISTORY PANEL, and the history a record-scoped chat
-- cites. `custom.history_changes` builds one entry per key that moved, with `before` and
-- `after` — and every one of them, for every field, reached anybody holding viewer.
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.record_history(p_organization_id uuid, p_record_id uuid,
                                                 p_limit integer default 200, p_offset integer default 0)
returns table(version integer, occurred_at timestamp with time zone, operation text,
              operation_label text, actor jsonb, changes jsonb, migration_id uuid, undoable boolean)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_table  uuid;
  v_people jsonb;
  v_mask   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_history');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.record_history',
                                        'viewer'::public.permission_level, 'record');

  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  select custom.history_people(
           p_organization_id,
           array(select distinct a.id from (
                   select v.actor_id as id
                     from history.record_versions(p_organization_id, p_record_id) v
                   union
                   select (e.value ->> 'on_behalf_of')::uuid
                     from history.record_versions(p_organization_id, p_record_id) v,
                          lateral jsonb_each(
                            case when jsonb_typeof(v.row_data -> 'data' -> '_values') = 'object'
                                 then v.row_data -> 'data' -> '_values' else '{}'::jsonb end) e
                    where (e.value ->> 'on_behalf_of') is not null) a
                  where a.id is not null))
    into v_people;

  return query
    select w.version,
           w.occurred_at,
           coalesce(w.operation_name, lower(w.operation)) as operation,
           case
             when w.operation_name is not null then
               w.operation_name || case w.operation
                                     when 'SOFT_DELETE' then ' (record removed)'
                                     when 'RESTORE'     then ' (record restored)'
                                     when 'INSERT'      then ' (record created)'
                                     else '' end
             when w.operation = 'INSERT'      then 'created'
             when w.operation = 'UPDATE'      then 'edited'
             when w.operation = 'SOFT_DELETE' then 'deleted'
             when w.operation = 'RESTORE'     then 'restored'
             else lower(w.operation)
           end as operation_label,
           custom.history_actor(w.actor_tier, w.row_data -> 'data', w.actor_id, v_people),
           -- THE MASK. A change to a field this reader may not see is still a CHANGE — the
           -- panel says "Tax ID was edited" and who edited it, which is the audit trail — but
           -- the before and the after do not leave, and the entry says why.
           coalesce((select jsonb_agg(
                              case when custom.mask_says_withheld(v_mask, c ->> 'key')
                                   then (c - 'before' - 'after' - 'alternates')
                                        || custom.withheld_marker(v_mask, c ->> 'key')
                                   else c end
                              order by ord)
                       from jsonb_array_elements(
                              custom.history_changes(p_organization_id, v_table,
                                                     coalesce(w.previous_data, '{}'::jsonb),
                                                     coalesce(w.row_data -> 'data', '{}'::jsonb)))
                              with ordinality as e(c, ord)),
                    '[]'::jsonb),
           w.migration_id,
           (w.migration_id is not null
            and exists (select 1 from history.migration_log m
                         where m.id = w.migration_id
                           and m.organization_id = p_organization_id
                           and m.undone_at is null)) as undoable
      from (select v.*,
                   lag(v.row_data -> 'data') over (order by v.version) as previous_data
              from (select rv.version, rv.operation, rv.occurred_at, rv.actor_id,
                           rv.row_data, rv.migration_id, rv.operation_name,
                           hv.actor_tier
                      from history.record_versions(p_organization_id, p_record_id) rv
                      left join lateral (
                        select h.actor_tier
                          from history.row_versions h
                         where h.entity_type = 'custom.record'
                           and h.organization_id = p_organization_id
                           and h.row_id = p_record_id
                           and h.version = rv.version
                           and h.occurred_at = rv.occurred_at
                         limit 1) hv on true) v) w
     order by w.version desc, w.occurred_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- DOOR 5 — custom.field_history. "Who changed the price, and when" — over a whole Table.
-- It already answered only over records this person may SEE; it never asked whether they may
-- see THIS COLUMN of them, so `field_history(org, table, 'ssn')` was a column dump.
-- Visibility of a Field depends on this reader's level ON EACH RECORD, so it is decided per
-- record, once, beside the id set the door already builds.
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.field_history(p_organization_id uuid, p_table_id uuid, p_field_key text,
                                                p_limit integer default 100, p_offset integer default 0,
                                                p_record_id uuid default null)
returns table(record_id uuid, record_title text, version integer,
              occurred_at timestamp with time zone, operation_label text,
              actor jsonb, before jsonb, after jsonb)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_people jsonb;
  v_titlek text;
  v_sql    text;
  v_ids    uuid[];
  v_me     uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_history');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.field_history');

  if coalesce(btrim(coalesce(p_field_key, '')), '') = '' then
    raise exception 'custom.field_history: name the column whose history you want.'
      using errcode = '22004',
            hint = 'custom.applicable_fields(organization, table, null) lists this table''s columns with their keys.';
  end if;

  if not exists (select 1
                   from custom.applicable_fields(p_organization_id, p_table_id, null) f
                  where (f.data ->> 'key') = p_field_key) then
    raise exception 'This table has no column called "%", so there is no history of it.', p_field_key
      using errcode = '22023',
            hint = 'Check the column''s name on the table''s own settings panel — the history is kept per column key, and a renamed column keeps the key it was declared with.';
  end if;

  select nullif(t.data ->> 'title_field', '') into v_titlek
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id();

  v_sql := format(
    'select array_agg(r.id) from custom.record r
      where r.organization_id = %L::uuid and r.table_id = %L::uuid and %s %s',
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    case when p_record_id is null then ''
         else format('and r.id = %L::uuid', p_record_id) end);
  execute v_sql into v_ids;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return;
  end if;

  select custom.history_people(
           p_organization_id,
           array(select distinct h.actor_id
                   from history.row_versions h
                  where h.entity_type = 'custom.record'
                    and h.organization_id = p_organization_id
                    and h.row_id = any (v_ids)
                    and h.actor_id is not null))
    into v_people;

  return query
  with masks as (
    -- ONE mask per record this person may see, and nothing more: the id set is already the
    -- read door's own answer, so this adds the FIELD question to the ROW question.
    select i.id as row_id, custom.read_mask(p_organization_id, i.id, 'read') as m
      from unnest(v_ids) i(id)
  )
    select w.row_id,
           coalesce(nullif(btrim(coalesce(
                      case when v_titlek is null then null
                           else w.row_data -> 'data' ->> v_titlek end, '')), ''),
                    'Untitled'),
           w.version,
           w.occurred_at,
           case
             when w.operation_name is not null then w.operation_name
             when w.operation = 'INSERT'      then 'created'
             when w.operation = 'SOFT_DELETE' then 'deleted'
             when w.operation = 'RESTORE'     then 'restored'
             else 'edited'
           end,
           custom.history_actor(w.actor_tier, w.row_data -> 'data', w.actor_id, v_people),
           case when custom.mask_says_withheld(mk.m, p_field_key)
                then custom.withheld_marker(mk.m, p_field_key)
                else w.previous_data -> p_field_key end,
           case when custom.mask_says_withheld(mk.m, p_field_key)
                then custom.withheld_marker(mk.m, p_field_key)
                else w.row_data -> 'data' -> p_field_key end
      from (select h.row_id, h.version, h.operation, h.operation_name, h.occurred_at,
                   h.actor_id, h.actor_tier, h.row_data,
                   lag(h.row_data -> 'data') over (partition by h.row_id order by h.version)
                     as previous_data
              from history.row_versions h
             where h.entity_type = 'custom.record'
               and h.organization_id = p_organization_id
               and h.row_id = any (v_ids)) w
      join masks mk on mk.row_id = w.row_id
     where (coalesce(w.previous_data, '{}'::jsonb) -> p_field_key)
             is distinct from (coalesce(w.row_data -> 'data', '{}'::jsonb) -> p_field_key)
     order by w.occurred_at desc, w.row_id, w.version desc
     limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- DOOR 6 — custom.io_export. The spreadsheet a person downloads. It chose its ROWS through
-- the read door's own id set and then read the VALUES around it, so the export carried every
-- column of every row the person could open. It now reads the rows through
-- `custom.read_records` — the read door itself — which is the whole of the fix: nothing
-- reads a record around the door, not a screen, not an agent, and not an export.
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function custom.io_export(p_organization_id uuid, p_table_id uuid,
                                            p_columns text[] default null,
                                            p_limit integer default 10000,
                                            p_required text default 'viewer')
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_cols   text[];
  v_token  text;
  v_rows   jsonb;
  v_held   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  v_cols := coalesce(p_columns,
    (select array_agg(f.data ->> 'key' order by coalesce((f.data ->> 'sort')::int, 0),
                                                 f.data ->> 'key')
       from custom.applicable_fields(p_organization_id, p_table_id, null) f),
    (select array_agg(k order by k)
       from (select distinct jsonb_object_keys(r.data) k
               from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = p_table_id
                and r.deleted_at is null) ks
      where left(k, 1) <> '_'),
    array[]::text[]);

  -- THE READ DOOR DECIDES BOTH QUESTIONS NOW: which rows, and which cells of them.
  -- `custom.read_records` already choice-renders and already carries `_hidden`.
  select coalesce(jsonb_agg(x.doc order by x.ord), '[]'::jsonb),
         coalesce(jsonb_object_agg(h.key, h.value), '{}'::jsonb)
    into v_rows, v_held
    from (select row_number() over () as ord,
                 (select coalesce(jsonb_object_agg(c, coalesce(rr.document -> c, 'null'::jsonb)),
                                  '{}'::jsonb)
                    from unnest(v_cols) c) as doc,
                 rr.document -> '_hidden' as hidden
            from custom.read_records(p_organization_id, p_table_id, false,
                                     greatest(1, least(coalesce(p_limit, 10000), 100000)), 0) rr) x
    left join lateral jsonb_each(coalesce(x.hidden, '{}'::jsonb)) h on true;

  -- NOTHING FAILS SILENTLY: a column the store withheld from this reader is named with the
  -- store's own reason, beside an export whose cells for it read `null`.
  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows,
                            'withheld', v_held,
                            'choices', custom.choice_field_map(p_organization_id, p_table_id));
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE CENSUS THAT KEEPS IT CLOSED. Same ratchet shape as custom.doors_not_on_one_ladder:
-- a client door in schema `custom` that reaches a raw value source and never reaches the
-- mask. `--` comments are stripped, so a sentence promising the mask is not the mask.
-- ════════════════════════════════════════════════════════════════════════════════════════
create function custom.doors_not_masking_fields()
returns table(function_name text, identity_args text, why text)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'a client may execute it, it reaches a RAW value source (custom.record_values, '
         'custom.record_state_as_of, custom.history_changes, history.row_versions or '
         'custom.record directly) and its body never reaches custom.read_mask or the two '
         'doors that already carry it, so a Field this reader may not see leaves the store'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~* '(custom\.record_values\M|custom\.record_state_as_of|custom\.history_changes|history\.row_versions|history\.record_versions)'
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         !~* '(custom\.read_mask|custom\.mask_says_withheld|custom\.read_record\M|custom\.read_records\M|custom\.record_values_versioned)'
   order by 1;
$fn$;

revoke all on function custom.doors_not_masking_fields() from public;
revoke all on function custom.doors_not_masking_fields() from anon;
revoke all on function custom.doors_not_masking_fields() from authenticated;


