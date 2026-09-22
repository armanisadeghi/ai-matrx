-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: platform.relation_declaration(uuid, uuid) 3241af7410368c3e90e1b5ac7d1a81c7b287dd0562a34ffadbb4219d2e5054eb
-- based-on: platform.relation_label(uuid, text, uuid) 49dfdc3c869c1ef7afbcea10120b88238d4bb5a903877b6fe7c43437177d2ec4
-- based-on: platform.relation_field(uuid, uuid, text) 0a5f793cc67146848982ca2f469fcbefacab3c03a1b616ab360430dedd03957d
-- based-on: platform.relations_from(uuid, uuid) a9ca69f85d184aab772f06f6fa59b6e4fa8a1802d0ddb4de3465ce3b4fa758e4
-- based-on: platform.relations_to(uuid, uuid) 146ed632f33b9a289c76b80af6072e650885b809517a785bed2b41a5d08318c3
-- based-on: platform.relation_delete_effects(uuid, uuid) d81590a02da63799c40c43f32969f63192ab408612dee3e6c1f8105a6c5a7065
-- based-on: platform.relation_on_delete(uuid, uuid) 69cfeff6e733d53aeeb0df6a81e8eada9063ea453cac33a210a29ee0b56346ef
-- based-on: platform.relation_set(uuid, uuid, text, jsonb) 4c079889261859a47eae97b187c9d0ce6a21b4c3a12b9fb15862fb8c3ec1df46
-- based-on: platform.relation_unset(uuid, uuid, text, uuid) cc266e5df3f2b04d45d661c590233811bab1acd487c6e9c61b895d2ab232610b
-- based-on: platform.relation_snapshot_of(uuid, text, uuid) 0e1fe92bdbd66eb699a8677857d5aef95eaf47a138b5a6c5e58fb8109381e462
-- based-on: platform.relation_history(uuid, uuid) d05cf82e1270bfac46b5cb5b697c7264671ae6798f4afce31af2290ee1267181
--
-- LANE RELATION-DECLARE, 2026-09-20 — EVERY RELATION SURFACE HELD A GRANT IT COULD NOT USE.
--
-- MEASURED FROM THE SEAT `authenticated` AS admin@admin.com ON THE MAIN DATABASE, on an
-- organization whose store is switched on, who owns both Tables and every record in them:
--
--   platform.relation_set            → 42501 permission denied for table record
--   platform.relation_declaration    → 42501 permission denied for table record
--   platform.relations_from          → 42501 permission denied for table record
--   platform.relations_to            → 42501 permission denied for table record
--   platform.relation_label          → 42501 permission denied for table record
--   platform.relation_delete_effects → 42501 permission denied for table record
--   platform.relation_field          → 42501 permission denied for table record
--   platform.relation_snapshot_of    → 42501 permission denied for table record
--
-- All eight hold EXECUTE for `authenticated` and all eight are SECURITY INVOKER over
-- `custom.record`, on which `authenticated` holds no privilege at all and never will — that
-- is the whole design of schema `custom` (T9). So the relation feature had a front door with
-- the handle painted on: a grant that cannot be used, which is the same class SEAT-SUITES
-- recorded on 2026-09-19 and three independent workers hit.
--
-- The two that DID answer answered nothing: `platform.relation_on_delete` and
-- `platform.relation_history` only reach `custom.record` through a row of
-- `platform.associations`, so they returned cleanly for a record that had no relations and
-- died the moment one did.
--
-- AND WORSE THAN THE REFUSAL: none of the eleven asked WHO. `platform.assert_relations_door`
-- asks the organization's store switch and nothing else — not membership, not the record.
-- Making them SECURITY DEFINER without that would have handed every signed-in person on the
-- platform every other organization's relations, their reverse ends and their targets' titles.
--
-- THE FIX, one rule for the whole surface:
--   Every relation function a person legitimately reaches is SECURITY DEFINER, holds a row in
--   platform.client_callable_door, and decides the caller BEFORE its first read, on the ONE
--   ladder schema `custom` already uses — `custom.assert_client_may_reach` for the
--   organization wall, `custom.assert_client_may_open` at viewer for a row it shows,
--   `custom.assert_client_may_change` at editor for a row it writes, and
--   `custom.assert_may_know_table` for a Table it describes. BOTH ENDS ARE ASKED: a relation
--   joins two records in two tables, so writing one asks editor on the source AND viewer on
--   every target, and reading one asks viewer on the record AND masks the far end.
--
--   `platform.relation_label` is the far end, and it now tells the truth. A reader who may
--   not open the target gets `platform.relation_withheld_label()` — one sentence, in one
--   place — instead of the target's title. The chip a person cannot open says so; it never
--   wears the name of a record they were never shown.
--
--   Two new readers make the surface honest about its own data:
--   `platform.relation_edge_has_a_live_field` and the census
--   `platform.relation_edges_without_a_live_field()`. An association whose relation_field_id
--   names a field that is gone or no longer behaves as a relation is not a relation any more
--   (REL-10), and reading it used to take the WHOLE reverse side of a record down with a
--   23514 — measured: retype one column of one table away from `relation` and
--   `platform.relations_to` blew up for every record of the table it pointed at.
--
-- WHY IT IS ADDITIVE: eleven CREATE OR REPLACEs of bodies this file names by hash, three new
-- functions, eleven rows in a registry table. No table, column, policy or signature changes,
-- and NOT ONE GRANT: all eleven already hold EXECUTE for `authenticated` — that is the whole
-- defect, a grant nothing could use — so this file hands out no privilege at all. It makes
-- the privilege they already had mean something, and narrows what it reaches at the same
-- time, because until today none of them asked who was knocking.
--
-- ITS INVERSE: migrations/inverse/reldecl_the_relation_doors_take_a_person_down.sql

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE DECLARATIONS COME FIRST, AND THAT ORDER IS THE POINT.
-- `ddl_guard[definer_client_grant_revoked]` runs the moment a SECURITY DEFINER body is
-- created or replaced and takes the client EXECUTE away from anything with no door row.
-- Measured on the first run of this very file, 2026-09-20: all eleven lost their grant
-- because the rows were written further down the same transaction. A door is a ROW, and the
-- row has to exist before the body it describes becomes a definer body.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE DECLARATIONS. A door is a ROW, not a grant somebody remembered to write.
-- ════════════════════════════════════════════════════════════════════════════════════════

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values
  ('platform', 'relation_declaration', 'p_organization_id uuid, p_field_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'What a relation column IS - what it points at, how many, what happens when the target is deleted - is the first thing every relation screen has to read, and it was unreachable: SECURITY INVOKER over custom.record, which no client role may read. p_organization_id is the wall, asked first; p_field_id is decided through custom.assert_may_know_table on the field''s own table, so a caller only learns the shape of a table they may already know.',
   'RELATION-DECLARE', true, false),
  ('platform', 'relation_label', 'p_organization_id uuid, p_target_type text, p_target_id uuid',
   array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
   'REL-14: the chip on a relation cell reads the target''s title at read time and never stores it. p_organization_id is the wall; p_target_id is decided at viewer on the one ladder before the title is read, and a reader who may not open it gets platform.relation_withheld_label() - a sentence saying so - rather than the title or the bare id.',
   'RELATION-DECLARE', true, false),
  ('platform', 'relation_field', 'p_organization_id uuid, p_record_id uuid, p_field_key text',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
   'Turning the key a person clicked into the Field behind it, which REL-10 makes the role of every relation edge. p_organization_id is the wall; p_record_id is decided at viewer through custom.assert_client_may_open before this answers whether the record exists.',
   'RELATION-DECLARE', true, false),
  ('platform', 'relations_from', 'p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'The relations a record points OUT of - the chips on its own relation cells. p_organization_id is the wall; p_record_id is decided at viewer, and each target''s label is masked separately by platform.relation_label, so holding the source never reveals the names of targets that were not shared.',
   'RELATION-DECLARE', true, false),
  ('platform', 'relations_to', 'p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'REL-9: every relation is visible from both ends, and the reverse end is this query rather than a second stored row. p_organization_id is the wall; p_record_id is decided at viewer, and the label of each SOURCE pointing at it is masked by platform.relation_label, because the reverse side is the one surface that shows a person rows they did not ask for.',
   'RELATION-DECLARE', true, false),
  ('platform', 'relation_delete_effects', 'p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'What deleting this record would do to everything pointing at it - the sentence a person has to be shown BEFORE the delete, not after. p_organization_id is the wall; p_record_id is decided at viewer through custom.assert_client_may_open, and each other end''s label is masked by platform.relation_label.',
   'RELATION-DECLARE', true, false),
  ('platform', 'relation_on_delete', 'p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'REL-2 carried out: restrict refuses and names them, set_null takes the pointer out of every document that held it, cascade returns what the delete must take with it. It CHANGES other records, so p_record_id is decided at editor through custom.assert_client_may_change, not at the reading threshold. p_organization_id is the wall, asked first.',
   'RELATION-DECLARE', true, false),
  ('platform', 'relation_set', 'p_organization_id uuid, p_record_id uuid, p_field_key text, p_targets jsonb',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype]::oid[],
   'Picking what a relation cell points at. BOTH ENDS are decided: p_record_id at editor through custom.assert_client_may_change because the link is a change to that record, and every target in p_targets at viewer through custom.assert_client_may_open plus custom.assert_may_know_table on its table - a link to a record you may not see would be a way to read one row at a time by guessing ids. p_organization_id is the wall.',
   'RELATION-DECLARE', true, false),
  ('platform', 'relation_unset', 'p_organization_id uuid, p_record_id uuid, p_field_key text, p_target_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
   'Taking a pick back out of a relation cell, softly, so the reverse end and REL-13''s history both keep their record of it. p_organization_id is the wall; p_record_id is decided at editor through custom.assert_client_may_change, the same question as making the link.',
   'RELATION-DECLARE', true, false),
  ('platform', 'relation_snapshot_of', 'p_organization_id uuid, p_target_type text, p_target_id uuid',
   array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
   'REL-3: the frozen copy a snapshot-bound relation keeps in its own payload. It copies the WHOLE document of another record, so p_target_id is decided at viewer through custom.assert_client_may_open before anything is taken, and p_organization_id is the wall asked first.',
   'RELATION-DECLARE', true, false),
  ('platform', 'relation_history', 'p_organization_id uuid, p_association_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'REL-13: associations are versioned, so a relation has a history a person can read. p_organization_id is the wall; p_association_id is resolved to the record the edge comes out of and that record is decided at viewer through custom.assert_client_may_open, so the history of a link is readable by exactly whoever may read the record it belongs to.',
   'RELATION-DECLARE', true, false)
on conflict (schema_name, function_name, identity_argtypes) do update
   set reason            = excluded.reason,
       declared_by       = excluded.declared_by,
       signed_in_callers = excluded.signed_in_callers,
       anonymous_callers = excluded.anonymous_callers,
       non_client_lane   = null;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE TWO NEW READERS
-- ════════════════════════════════════════════════════════════════════════════════════════

create or replace function platform.relation_withheld_label()
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  -- ONE sentence, in ONE place, so no surface invents its own wording for the same fact and
  -- no caller has to pattern-match two of them. It is a SENTENCE and not a blank: a blank
  -- chip reads as a bug, and the id reads as a leak.
  select 'A record you have not been given access to'::text;
$function$;

create or replace function platform.relation_edge_has_a_live_field(p_organization_id uuid, p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  -- REL-10, asked of one edge: a relation IS a field, so an edge whose field has been retired
  -- or retyped is no longer a relation. This is a catalogue question about the store's own
  -- shape, not about a person, so it decides nothing — every caller of it has already decided
  -- its caller. It is SECURITY DEFINER only because `custom.record` is closed to clients.
  select exists (
    select 1 from custom.record f
     where f.id = p_field_id
       and f.deleted_at is null
       and f.table_id = custom.field_kernel_id()
       and (f.organization_id = p_organization_id or f.data_class = 'kernel')
       and f.data ->> 'type' = 'relation');
$function$;

create or replace function platform.relation_edges_without_a_live_field()
returns table(organization_id uuid, association_id uuid, role text, field_id uuid, why text)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  -- THE CENSUS. Nothing fails silently: an edge that still claims a field which is gone or no
  -- longer a relation is a real row in a real table, and the readers above skip it, so it has
  -- to be COUNTABLE rather than invisible. Zero is the expected answer; a number here is work.
  select a.organization_id, a.id, a.role, a.relation_field_id,
         case when f.id is null then 'the field this edge names is gone'
              else 'the field this edge names now behaves as ' ||
                   coalesce(nullif(f.data ->> 'type', ''), 'nothing') end
    from platform.associations a
    left join custom.record f
      on f.id = a.relation_field_id
     and f.deleted_at is null
     and f.table_id = custom.field_kernel_id()
     and f.data ->> 'type' = 'relation'
   where a.relation_field_id is not null
     and a.deleted_at is null
     and f.id is null
   order by a.organization_id, a.role;
$function$;

-- Both readers run as `postgres` only because `custom.record` is closed to clients, and
-- NEITHER is a client door: the first is called from inside the doors below, which have
-- already decided their caller, and the second is a platform-wide census with no organization
-- argument at all — there is no person it could be scoped to. Declared as what they are.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, non_client_lane)
values
  ('platform', 'relation_edge_has_a_live_field', 'p_organization_id uuid, p_field_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'REL-10 asked of one edge: is the field this association names still a live field that behaves as a relation. It takes no decision of its own because it is only ever called from inside platform.relations_from, relations_to and relation_delete_effects, each of which has already decided its caller against the record before it reaches here.',
   'RELATION-DECLARE', false, false,
   'server_only: it is a shape question, not a row question - it is called from inside the relation read doors, which decide the caller first, and no client route ever reaches it directly.'),
  ('platform', 'relation_edges_without_a_live_field', '',
   array[]::oid[],
   'The census behind the readers that skip such an edge: nothing fails silently, so an association still claiming a field that is gone or no longer a relation is countable rather than invisible. It takes no organization and no record, so it is platform-wide by construction.',
   'RELATION-DECLARE', false, false,
   'server_only: a platform-wide census with no organization argument, read by this campaign and by operators; there is no person it could be scoped to, so no client lane may reach it.')
on conflict (schema_name, function_name, identity_argtypes) do update
   set reason            = excluded.reason,
       declared_by       = excluded.declared_by,
       signed_in_callers = excluded.signed_in_callers,
       anonymous_callers = excluded.anonymous_callers,
       non_client_lane   = excluded.non_client_lane;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE ELEVEN DOORS
-- ════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION platform.relation_declaration(p_organization_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f         record;
  v_flavor  text;
  v_mode    text;
  v_card    text;
  v_on_del  text;
  v_bind    text;
  v_targets uuid[];
  v_owned   boolean;
  v_table   uuid;
  v_class   text;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- THE CALLER, BEFORE THE FIRST READ. A field document describes a table's shape, so the
  -- wall comes first and the table second — and both are asked before this function admits
  -- that the field exists, so a foreign id and an invented one answer identically.
  perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_declaration');

  select r.id, r.organization_id, r.data into f
    from custom.record r
   where r.id = p_field_id
     and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     and r.deleted_at is null
   limit 1;
  if not found then
    raise exception 'there is no field % in this organization', p_field_id using errcode = '23503';
  end if;
  v_table := nullif(f.data ->> 'entity_definition_id', '')::uuid;
  select r.data_class into v_class from custom.record r
   where r.id = p_field_id and (r.organization_id = p_organization_id or r.data_class = 'kernel')
   limit 1;
  -- A kernel field belongs to a standard table nobody was shared; asking the table question
  -- of it would refuse every caller for a shape the platform itself declares.
  if v_table is not null and coalesce(v_class, '') <> 'kernel' then
    perform custom.assert_may_know_table(p_organization_id, v_table, 'platform.relation_declaration');
  end if;
  if coalesce(f.data ->> 'type', '') <> 'relation' then
    raise exception 'the field % behaves as %, so it declares no relation',
      coalesce(f.data ->> 'name', f.data ->> 'label', p_field_id::text),
      coalesce(nullif(f.data ->> 'type', ''), 'nothing')
      using errcode = '23514',
            hint = 'FLD-1 / REL-10: only a field whose behavior is `relation` carries a relation. A list field points at an options Table and is not this.';
  end if;

  -- REL-1. OWNERSHIP IS THE CONTAINED TABLE'S FACT, NOT THE FIELD'S.
  if f.data ? 'flavor' or f.data -> 'config' ? 'flavor' then
    raise exception 'the field % cannot declare whether the relation owns what it points at',
      coalesce(f.data ->> 'name', p_field_id::text)
      using errcode = '23514',
            hint = 'REL-1 / V-39: ownership is ONE fact, stored once - on the table being pointed at, as `contained_by_relation`, because it is that table''s records that are or are not contained. Every field pointing at it reads the same answer, so two fields can never disagree about it. Declare it on the table.';
  end if;

  v_mode := lower(coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one'));
  if not (v_mode = any (platform.relation_target_modes())) then
    raise exception 'the field % points at "%", and a relation points at one table, several, or any',
      coalesce(f.data ->> 'name', p_field_id::text), v_mode
      using errcode = '23514',
            hint = 'REL-8: target_mode is one of ' || array_to_string(platform.relation_target_modes(), ', ') || '.';
  end if;

  if v_mode = 'one' then
    v_targets := array[nullif(f.data ->> 'relation_target', '')::uuid];
    if v_targets[1] is null then
      raise exception 'the field % points at one table and does not say which',
        coalesce(f.data ->> 'name', p_field_id::text) using errcode = '23514', hint = 'FLD-13 / REL-8: relation_target.';
    end if;
  elsif v_mode = 'several' then
    select array_agg((t #>> '{}')::uuid) into v_targets
      from jsonb_array_elements(coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb)) t;
    if v_targets is null or array_length(v_targets, 1) is null then
      raise exception 'the field % points at several tables and names none of them',
        coalesce(f.data ->> 'name', p_field_id::text)
        using errcode = '23514',
              hint = 'REL-8: target_mode `several` carries config.target_tables, the list of tables it may point at. One table is target_mode `one`; no list at all is target_mode `any`.';
    end if;
  else
    v_targets := null;   -- `any`: polymorphic without restriction
  end if;

  v_owned := false;
  if v_mode = 'one' then
    select coalesce((t.data ->> 'contained_by_relation')::boolean, false) into v_owned
      from custom.record t
     where t.id = v_targets[1] and t.deleted_at is null
       and (t.organization_id = p_organization_id or t.data_class = 'kernel')
     limit 1;
  end if;
  v_flavor := case when coalesce(v_owned, false) then 'owned' else 'referenced' end;

  v_card := case when coalesce((f.data ->> 'relation_max')::integer, 0) = 1
                 then 'at_most_one' else 'many' end;

  v_on_del := lower(coalesce(nullif(f.data ->> 'on_target_delete', ''),
                             case when v_flavor = 'owned' then 'cascade' else 'set_null' end));
  if not (v_on_del = any (platform.relation_on_delete_actions())) then
    raise exception 'the field % says "%" happens when the thing it points at is deleted',
      coalesce(f.data ->> 'name', p_field_id::text), v_on_del
      using errcode = '23514',
            hint = 'REL-2: on_target_delete is one of ' || array_to_string(platform.relation_on_delete_actions(), ', ') || ', and it is a property of its own - an owned relation may restrict, and a referenced one may cascade.';
  end if;

  v_bind := lower(coalesce(nullif(f.data -> 'config' ->> 'binding', ''), 'live'));
  if not (v_bind = any (platform.relation_bindings())) then
    raise exception 'the field % is bound "%" to what it points at',
      coalesce(f.data ->> 'name', p_field_id::text), v_bind
      using errcode = '23514',
            hint = 'REL-3: binding is one of ' || array_to_string(platform.relation_bindings(), ', ') || '. `live` follows the target; `snapshot` freezes a copy in the relation''s own payload at write time.';
  end if;

  return jsonb_build_object(
    'field_id',    f.id,
    'key',         coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
    'flavor',      v_flavor,
    'on_delete',   v_on_del,
    'binding',     v_bind,
    'ordered',     coalesce((f.data -> 'config' ->> 'ordered')::boolean, false),
    'loops',       coalesce((f.data -> 'config' ->> 'loops')::boolean, false),
    'carries',     coalesce((f.data -> 'config' ->> 'carries')::boolean, v_flavor = 'owned'),
    'carries_max', coalesce(nullif(f.data -> 'config' ->> 'carries_max', ''), 'editor'),
    'cardinality', v_card,
    'max',         greatest(coalesce((f.data ->> 'relation_max')::integer, 1), 1),
    'target_mode', v_mode,
    'target_tables', case when v_targets is null then null else to_jsonb(v_targets) end,
    'inverse_key', nullif(f.data ->> 'inverse_key', '')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_label(p_organization_id uuid, p_target_type text, p_target_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_title text;
  v_col   text;
  v_sch   text;
  v_tab   text;
  v_me    uuid;
begin
  -- REL-14. The label is READ, never stored on the edge.
  --
  -- THE FAR END OF A RELATION IS A DIFFERENT RECORD, IN A DIFFERENT TABLE, AND THE READER MAY
  -- NOT HOLD IT. Until now this function answered the title to anybody who could call it, so
  -- the reverse side of a shared record told a member the names of records nobody had shared
  -- with her. The access question is asked BEFORE the title is read, and a reader who may not
  -- open the target is told so in words — `platform.relation_withheld_label()` — never given
  -- the title and never handed the bare id.
  perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_label');

  if p_target_type = 'record' then
    v_me := custom.query_principal();
    if v_me is not null
       and not custom.query_is_store_owner()
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_target_id)
       and not custom.has_visibility(v_me, 'record', p_target_id, 'viewer'::public.permission_level) then
      return platform.relation_withheld_label();
    end if;
    select r.data ->> (t.data ->> 'title_field') into v_title
      from custom.record r
      join custom.record t on t.id = r.table_id
     where r.id = p_target_id and r.deleted_at is null
       and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     limit 1;
    if v_title is null then
      select l.cached_title into v_title
        from custom.external_link l
       where l.record_id = p_target_id and l.organization_id = p_organization_id
       limit 1;
    end if;
    return v_title;
  end if;

  select e.schema_name, e.table_name, nullif(e.title_column, '')
    into v_sch, v_tab, v_col
    from platform.entity_types e
   where e.token = p_target_type
   limit 1;
  if v_col is null or v_sch is null or v_tab is null then
    return null;
  end if;
  execute format('select %I::text from %I.%I where id = $1 limit 1', v_col, v_sch, v_tab)
    into v_title using p_target_id;
  return v_title;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_field(p_organization_id uuid, p_record_id uuid, p_field_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table uuid;
  v_field uuid;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- The record first, at viewer, and before this answers whether it exists.
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'platform.relation_field',
                                        'viewer'::public.permission_level, 'record');
  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_table is null then
    raise exception 'there is no record % in this organization', p_record_id using errcode = '23503';
  end if;
  select f.id into v_field
    from custom.record f
   where f.deleted_at is null
     and (f.organization_id = p_organization_id or f.data_class = 'kernel')
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') = p_field_key
   limit 1;
  if v_field is null then
    raise exception 'this record''s table has no field called "%"', p_field_key
      using errcode = '23503',
            hint = 'REL-10: a relation''s `role` IS the field key, so a role with no field behind it would be an edge nothing declares. Declare the field first.';
  end if;
  return v_field;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relations_from(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(role text, target_type text, target_id uuid, "position" integer, label text, flavor text, binding text, snapshot jsonb, field_id uuid)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform platform.assert_relations_door(p_organization_id);
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'platform.relations_from',
                                        'viewer'::public.permission_level, 'record');
  return query
    select a.role, a.target_type, a.target_id, a.position,
           -- REL-14, and masked at the far end: a target this reader may not open answers the
           -- withheld sentence, never its title.
           platform.relation_label(p_organization_id, a.target_type, a.target_id),
           d.declaration ->> 'flavor', d.declaration ->> 'binding',
           a.payload, a.relation_field_id
      from platform.associations a
      cross join lateral (select platform.relation_declaration(p_organization_id, a.relation_field_id) as declaration) d
     where a.organization_id = p_organization_id
       and a.source_type = 'record' and a.source_id = p_record_id
       and a.relation_field_id is not null
       and a.deleted_at is null
       -- An edge whose field is gone or no longer behaves as a relation is not a relation
       -- (REL-10). It used to take this whole read down with a 23514; it is now skipped here
       -- and COUNTED by platform.relation_edges_without_a_live_field().
       and platform.relation_edge_has_a_live_field(p_organization_id, a.relation_field_id)
     order by a.role, a.position nulls last, a.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relations_to(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(role text, source_type text, source_id uuid, "position" integer, label text, flavor text, field_id uuid)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform platform.assert_relations_door(p_organization_id);
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'platform.relations_to',
                                        'viewer'::public.permission_level, 'record');
  -- REL-9 / C-12a. THE REVERSE END IS A WHERE CLAUSE. This function reads THE SAME ROWS
  -- `platform.relations_from` reads and differs from it in exactly two identifiers: it matches
  -- on `target_id` and returns `source_id`. There is no second stored row and no second Field.
  --
  -- It is also the one surface that shows a person records they did not ask for — everything
  -- that points AT theirs — so the label of a source she may not open is withheld by
  -- `platform.relation_label`, which is where that decision belongs.
  return query
    select a.role, a.source_type, a.source_id, a.position,
           platform.relation_label(p_organization_id, a.source_type, a.source_id),
           d.declaration ->> 'flavor', a.relation_field_id
      from platform.associations a
      cross join lateral (select platform.relation_declaration(p_organization_id, a.relation_field_id) as declaration) d
     where a.organization_id = p_organization_id
       and a.target_id = p_record_id
       and a.relation_field_id is not null
       and a.deleted_at is null
       and platform.relation_edge_has_a_live_field(p_organization_id, a.relation_field_id)
     order by a.role, a.position nulls last, a.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_delete_effects(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(action text, role text, other_type text, other_id uuid, label text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform platform.assert_relations_door(p_organization_id);
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'platform.relation_delete_effects',
                                        'viewer'::public.permission_level, 'record');
  -- Every LIVE relation POINTING AT this record, read from the reverse end (REL-9).
  return query
    select platform.relation_declaration(p_organization_id, a.relation_field_id) ->> 'on_delete',
           a.role, a.source_type, a.source_id,
           platform.relation_label(p_organization_id, a.source_type, a.source_id)
      from platform.associations a
     where a.organization_id = p_organization_id
       and a.target_id = p_record_id
       and a.relation_field_id is not null
       and a.deleted_at is null
       and platform.relation_edge_has_a_live_field(p_organization_id, a.relation_field_id)
     order by a.role, a.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_on_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  e         record;
  v_names   text;
  v_cascade uuid[] := '{}';
  v_detach  integer := 0;
  v_ext     text;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- This verb CHANGES other people's records — the set_null arm takes the pointer out of
  -- every document that held it — so it asks the writing threshold on the record whose
  -- deletion is being carried out, not the reading one.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'platform.relation_on_delete',
                                          'editor'::public.permission_level, 'record');

  -- RESTRICT FIRST, AND IT NAMES THEM.
  select string_agg(distinct coalesce(x.label, x.other_id::text), ', ') into v_names
    from platform.relation_delete_effects(p_organization_id, p_record_id) x
   where x.action = 'restrict';
  if v_names is not null then
    raise exception 'this is still used by %, so it was not deleted', v_names
      using errcode = '23503',
            hint = 'REL-2 / T7: this relation is set to refuse the delete while anything still points at it. Remove those first, or change what the field does when the thing it points at is deleted.';
  end if;

  select string_agg(distinct x.other_type, ', ') into v_ext
    from platform.relation_delete_effects(p_organization_id, p_record_id) x
   where x.action in ('cascade', 'set_null') and x.other_type <> 'record';
  if v_ext is not null then
    raise exception 'something outside this system (%) is attached to this, and nothing here can change it', v_ext
      using errcode = '0A000',
            hint = 'REL-N-1 / the REL-8 ruling: a relation may POINT at a row behind a connection, and in this version nothing writes back down it. Detach it in the system it lives in, or use that source''s own write-through - a relation is not a route into somebody else''s database.';
  end if;

  for e in select * from platform.relation_delete_effects(p_organization_id, p_record_id) loop
    if e.action = 'cascade' then
      v_cascade := v_cascade || e.other_id;
    elsif e.action = 'set_null' then
      -- THE VALUE GOES TOO, AND IT GOES FIRST (T7).
      if e.other_type = 'record' then
        update custom.record r
           set data = case
                 when jsonb_typeof(r.data -> e.role) = 'array'
                   then jsonb_set(r.data, array[e.role],
                          coalesce((select jsonb_agg(x)
                                      from jsonb_array_elements(r.data -> e.role) x
                                     where (x #>> '{}') is distinct from p_record_id::text),
                                   '[]'::jsonb))
                 else r.data - e.role
               end
         where r.organization_id = p_organization_id
           and r.id = e.other_id
           and r.deleted_at is null
           and r.data ? e.role;
      end if;
      update platform.associations a
         set deleted_at = now()
       where a.organization_id = p_organization_id
         and a.source_id = e.other_id and a.role = e.role
         and a.target_id = p_record_id and a.deleted_at is null;
      v_detach := v_detach + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'restricted_by', '[]'::jsonb,
    'detached',      v_detach,
    'cascade_to',    to_jsonb(v_cascade));
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_set(p_organization_id uuid, p_record_id uuid, p_field_key text, p_targets jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb;
  v_field  uuid;
  t        jsonb;
  i        integer := 0;
  v_type   text;
  v_id     uuid;
  v_written integer := 0;
  v_tbl    uuid;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- BOTH ENDS, BEFORE THE FIRST WRITE. Linking is a change to the SOURCE record, so it asks
  -- editor there; and the TARGET is a record in another table whose title this link then
  -- shows on the source's screen, so it asks viewer there. A link you could make to a record
  -- you may not see would be a way to read one row at a time by guessing ids.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'platform.relation_set',
                                          'editor'::public.permission_level, 'record');
  v_field := platform.relation_field(p_organization_id, p_record_id, p_field_key);
  d := platform.relation_declaration(p_organization_id, v_field);

  if jsonb_typeof(p_targets) <> 'array' then
    raise exception 'the targets of a relation are a list, and this is %', jsonb_typeof(p_targets)
      using errcode = '22023',
            hint = 'REL-7: a relation points at at most one thing, or at many - both are written as a list, so the shape never has to change when the cardinality does. One target is a list of one.';
  end if;

  for t in select * from jsonb_array_elements(p_targets) loop
    i := i + 1;
    if jsonb_typeof(t) = 'string' then
      v_type := 'record'; v_id := (t #>> '{}')::uuid;
    else
      v_type := coalesce(nullif(t ->> 'entity', ''), 'record');
      v_id   := nullif(t ->> 'row_id', '')::uuid;
    end if;
    if v_id is null then
      raise exception 'target % of this relation names no row', i using errcode = '22004';
    end if;

    if v_type = 'record' then
      perform custom.assert_client_may_open(p_organization_id, v_id, 'platform.relation_set',
                                            'viewer'::public.permission_level, 'record');
      select r.table_id into v_tbl
        from custom.record r
       where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null;
      if v_tbl is not null then
        perform custom.assert_may_know_table(p_organization_id, v_tbl, 'platform.relation_set');
      end if;
    end if;

    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, position,
       relation_field_id, origin, payload_kind, payload, created_by)
    values
      ('record', p_record_id, v_type, v_id, p_organization_id, p_field_key,
       case when (d ->> 'ordered')::boolean then i else null end,
       v_field, 'campaign',
       case when d ->> 'binding' = 'snapshot' then 'relation_snapshot' else null end,
       case when d ->> 'binding' = 'snapshot'
            then platform.relation_snapshot_of(p_organization_id, v_type, v_id) else null end,
       (select auth.uid()))
    on conflict (source_type, source_id, target_type, target_id, role) do update
      set position          = excluded.position,
          relation_field_id = excluded.relation_field_id,
          origin            = excluded.origin,
          payload_kind      = excluded.payload_kind,
          payload           = excluded.payload,
          deleted_at        = null;
    v_written := v_written + 1;
  end loop;
  return v_written;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_unset(p_organization_id uuid, p_record_id uuid, p_field_key text, p_target_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_n integer;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- Unlinking changes the SOURCE record, so it is the same question as linking, at the same
  -- threshold. The target is not asked: removing a pointer tells you nothing about what it
  -- pointed at.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'platform.relation_unset',
                                          'editor'::public.permission_level, 'record');
  -- A relation is UNMADE the way every edge in this platform is: soft, so the reverse end and
  -- the history both keep their record of it (REL-13).
  update platform.associations a
     set deleted_at = now()
   where a.organization_id = p_organization_id
     and a.source_type = 'record' and a.source_id = p_record_id
     and a.role = p_field_key and a.target_id = p_target_id
     and a.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_snapshot_of(p_organization_id uuid, p_target_type text, p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_values jsonb;
  v_table  uuid;
begin
  -- REL-3: a FROZEN COPY, taken now, living in the relation's own payload.
  --
  -- It copies the WHOLE document of another record, so it is the strongest read on this
  -- surface and it asks the reading threshold on that record before taking anything.
  perform platform.assert_relations_door(p_organization_id);
  if p_target_type = 'record' then
    perform custom.assert_client_may_open(p_organization_id, p_target_id, 'platform.relation_snapshot_of',
                                          'viewer'::public.permission_level, 'record');
    select r.data, r.table_id into v_values, v_table
      from custom.record r
     where r.id = p_target_id and r.deleted_at is null
       and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     limit 1;
  else
    perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_snapshot_of');
  end if;
  return jsonb_build_object(
    'taken_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'title',    platform.relation_label(p_organization_id, p_target_type, p_target_id),
    'table_id', v_table,
    'values',   coalesce(v_values, '{}'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_history(p_organization_id uuid, p_association_id uuid)
 RETURNS TABLE(version integer, operation text, at_time timestamp with time zone, actor_id uuid, role text, target_type text, target_id uuid)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_source uuid;
begin
  perform platform.assert_relations_door(p_organization_id);
  perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_history');
  -- The history of an edge is the history of the record it comes OUT of, so it is decided at
  -- that record's reading threshold. An edge that is not in this organization answers nothing,
  -- which is the same answer an invented id gets.
  select a.source_id into v_source
    from platform.associations a
   where a.id = p_association_id and a.organization_id = p_organization_id
     and a.source_type = 'record'
   limit 1;
  if v_source is not null then
    perform custom.assert_client_may_open(p_organization_id, v_source, 'platform.relation_history',
                                          'viewer'::public.permission_level, 'record');
  end if;
  return query
    select v.version, v.operation, v.occurred_at, v.actor_id,
           v.row_data ->> 'role',
           v.row_data ->> 'target_type',
           nullif(v.row_data ->> 'target_id', '')::uuid
      from history.row_versions v
     where v.entity_type = 'agent_surface_binding'
       and v.row_id = p_association_id
       and v.organization_id = p_organization_id
     order by v.version, v.occurred_at;
end;
$function$;




-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE SWITCH, NAMED IN EXECUTABLE SQL.
-- Every function above reaches the organization's off switch through ONE reader —
-- `platform.assert_relations_door` → `platform.relations_are_on` → `custom.store_is_open`,
-- which resolves `custom/system_enabled` at the organization rung. Reading the knob a second
-- time in each body would be a second answer that can disagree with the first, so the knob is
-- named here instead, in SQL the database executes and keeps.
-- ════════════════════════════════════════════════════════════════════════════════════════

comment on function platform.relation_set(uuid, uuid, text, jsonb) is
  'Held by the knob custom/system_enabled, resolved for the organization through platform.assert_relations_door. While it is off this answers only the role that owns platform.associations.';
comment on function platform.relations_from(uuid, uuid) is
  'Held by the knob custom/system_enabled, resolved for the organization through platform.assert_relations_door. While it is off this answers only the role that owns platform.associations.';
comment on function platform.relations_to(uuid, uuid) is
  'Held by the knob custom/system_enabled, resolved for the organization through platform.assert_relations_door. While it is off this answers only the role that owns platform.associations.';
comment on function platform.relation_declaration(uuid, uuid) is
  'Held by the knob custom/system_enabled, resolved for the organization through platform.assert_relations_door. While it is off this answers only the role that owns platform.associations.';
comment on function platform.relation_label(uuid, text, uuid) is
  'Held by the knob custom/system_enabled through the callers that reach it; a reader who may not open the target is answered platform.relation_withheld_label() rather than the target title.';
