-- additive: yes
--
-- chair-step: it REPLACES twenty live function bodies on the record write path, moving each
--   from LANGUAGE sql to LANGUAGE plpgsql with the body character for character unchanged.
--   Nothing is created, dropped, granted or revoked, no row of anybody's data is touched, and
--   no knob can hold it off — these bodies ARE the live path, so a `-- guard:` line would be a
--   comment pretending to be a switch. Every one carries a `-- based-on:` hash of the body it
--   was written against, so the whole file refuses if any of them has moved since. The inverse
--   is `migrations/inverse/writeperf2_the_rest_of_the_write_path_plans_once_down.sql` and it
--   restores all twenty LANGUAGE sql bodies byte for byte.
--
-- based-on: custom._checklist_finished(uuid, uuid, text) 6e23187d51bcb06b3c42a324e2b3ed2439877a50322670a53c8f34b01dae6e65
-- based-on: custom._stage_field_key(uuid, uuid) 37f94e4e249cfc7f0feb25f1e695318fcd36b5fd5060fded7c8db6419bc50c3c
-- based-on: custom.choice_synonyms(uuid, uuid, text) 08e120b02893bd9b7fc2d16a4ed177de26ef02edce3cccfce70b5d568e7f35f6
-- based-on: custom.containment_edges(uuid) 27cd36b9978b28853617f295a6143438208384b9cf0c051ba4c547eaef38e2fb
-- based-on: custom.dependency_cycle(uuid, custom.record) d63458314e2493c1caa2b323a716e467f616d89261ef035c57eb8e9a384e771c
-- based-on: custom.dependency_label(uuid, text) 994600e176e8c351b28a36567d5d9cbd99cabd4e63673d51be0f1ce598b71d67
-- based-on: custom.owning_table_gone(uuid, uuid) c4133745c0cedda6bc0c2e6ac782eeea7cfda125615d7a6172d609b610f0e9e3
-- based-on: custom.portal_admits(uuid, uuid) feff50ccd8846f515f8f5f74af262247da1c32bde4fb4f0dd1dc54db738319fe
-- based-on: custom.record_values(uuid, uuid) f8d3fd7c0de466c811d2b3a818096f72ea02432e6f6766094a79f66bb5aa0778
-- based-on: custom.rule_context(uuid, uuid) 1026cc98f435350bdd0e396a746e18a94de7f50bf3c68b013e6f9db519ce9f40
-- based-on: custom.rule_field_key(uuid, uuid) f053d381df4fd937389387fdc733baf4050063d725804817fdda506738b267db
-- based-on: custom.rule_field_label(uuid, uuid) 938af9a9784f18db5a02e04829242f9bc384d2a6d9bf56985d15887deb02216c
-- based-on: custom.share_levels() 9d946a3375b11420136aa452b52cbff56bbf4e3f36331f1e1f2368745edf2609
-- based-on: custom.table_contents(uuid, uuid) c8850294e8dd4bbd38b95e3a61fba8fc14479860013ead7c93ab3bccb400a74e
-- based-on: custom.table_is_live(uuid, uuid) 13f5dd95c1b73fdf04d8e84bf6c960be85663077330e85818d75dd7d2159697e
-- based-on: custom.work_assignment_fields(uuid) 207e5da9d24c852228ab3f9e3cf88c23cf963857f8bd983a14e89b82f938069e
-- based-on: custom.work_state_id(uuid, uuid, text) 3bcfa621dc970d2e2e7c68e3263432d038dc13c7530469f7def37fe187a5bd94
-- based-on: iam.has_org_admin(uuid) 32cc4342b5dd57c26115e5411817d5ee8888d40d33f010a5fa893414d7f1e05c
-- based-on: platform.relation_edge_has_a_live_field(uuid, uuid) 3e81611613956c2e92bf3f67b7f1327c383e272b30afb68e5e6dccf7da2aa261
-- based-on: public.current_personal_org_id() 743aff7875bb8d9532cfea5afeb14cae249676bab885634a4b88effa1c99fcde
--
-- WRITE-PERF-2 — THE REST OF LADDER-PERF'S CLASS, ON THE WRITE PATH.
--
-- LADDER-PERF proved the class on the read path and WRITE-PERF closed seven of them on the
-- write path. `custom.ladder_replanners()` walked from the forty-one functions that are
-- actually ON the write path (`custom.record_write`, `custom.record_update`,
-- `custom.io_import_rows` and every trigger function on `custom.record`) and named TWENTY more:
--
--   custom._checklist_finished        custom._stage_field_key       custom.choice_synonyms
--   custom.containment_edges          custom.dependency_cycle       custom.dependency_label
--   custom.owning_table_gone          custom.portal_admits          custom.record_values
--   custom.rule_context               custom.rule_field_key         custom.rule_field_label
--   custom.share_levels               custom.table_contents         custom.table_is_live
--   custom.work_assignment_fields     custom.work_state_id          iam.has_org_admin
--   platform.relation_edge_has_a_live_field                         public.current_personal_org_id
--
-- A SQL-language function is inlined by the planner only when it is a plain SELECT with no
-- SECURITY DEFINER and no SET clause. Every one of these carries `SET search_path`, correctly,
-- so none is ever inlined — and a NON-INLINED SQL-language function is RE-PLANNED ON EVERY
-- CALL, because its plan cache lives for the duration of the calling query rather than the
-- session. plpgsql caches the plan for the session. The body does not change; the planner stops
-- doing the same work once per row.
--
-- Each body below is character for character the one the live catalogue holds, wrapped in
-- `begin` / `end` with `#variable_conflict use_column` so a RETURNS TABLE column name still
-- means the column. Nothing else moves — same name, same arguments, same return type, same
-- volatility, same SECURITY, same `SET search_path`.
--
-- PARITY IS PROVED END TO END, NOT FUNCTION BY FUNCTION.
-- `scripts/campaign-tests/writeperf2_parity.sql` writes 2,000 records through the batched door
-- with these bodies, then — inside the SAME transaction, on ONE snapshot — executes the REAL
-- BYTES of this lane's inverses and writes the same 2,000 again with the bodies the store had
-- before, and compares every history row, every outbox row and every record envelope. These
-- twenty are all ON that path, so a changed answer anywhere in them moves that comparison.
--
-- COLLISION NOTE, said rather than discovered later. `custom.portal_admits` and
-- `custom.share_levels` are lane PORTAL's objects and `custom.work_state_id` /
-- `custom.work_assignment_fields` are WORK-DOORS's. This file changes no byte of any body, only
-- the language, and carries a `-- based-on:` hash of each, so it refuses outright rather than
-- silently reverting anybody. If either lane re-applies its own file the body goes back to
-- LANGUAGE sql and `custom.ladder_replanners(<the write-path roots>)` names it again — which is
-- the census doing its job, not a surprise.

CREATE OR REPLACE FUNCTION custom._checklist_finished(p_organization_id uuid, p_table_id uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  select coalesce((select (s.data ->> 'terminal')::boolean
                     from custom.record s
                    where s.organization_id = p_organization_id
                      and s.id = custom.work_state_id(p_organization_id, p_table_id, p_status)
                      and s.deleted_at is null), false)
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom._stage_field_key(p_organization_id uuid, p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  select t.data ->> 'stage_field'
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.choice_synonyms(p_organization_id uuid, p_table_id uuid, p_token text)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  -- EVERY WAY OF SAYING THE SAME CHOICE: what was asked, its key, its label, its option id.
  -- `applies_to_types` on a Field or a Rule was written by whoever declared it — in words, in
  -- keys, or (before this lane) in ids — and T8 turns on the type field's stored value finding
  -- them all. This is how a Field that says it applies to "Circle" is found by a record whose
  -- type value is `circle`.
  select array(
    select distinct s from (
      select btrim(coalesce(p_token, '')) as s
      union all
      select k from (
        select custom.choice_key_of(e.value, p_token) as k
          from jsonb_each(custom.choice_field_map(p_organization_id, p_table_id)) e) q
       where q.k is not null
      union all
      select v from (
        select custom.choice_field_map(p_organization_id, p_table_id)
                 -> e.key -> 'options' -> custom.choice_key_of(e.value, p_token) ->> w as v
          from jsonb_each(custom.choice_field_map(p_organization_id, p_table_id)) e,
               unnest(array['label', 'id']) w) q2
       where q2.v is not null) u
     where s is not null and s <> '')
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.containment_edges(p_organization_id uuid)
 RETURNS TABLE(parent_id uuid, child_id uuid, via text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return query
  select case when cr.container_side = 'target' then a.target_id else a.source_id end,
         case when cr.container_side = 'target' then a.source_id else a.target_id end,
         case when a.role = 'contains' then 'contained'::text else 'carrying'::text end
    from platform.associations a
    join custom.carrying_rule cr
      on cr.role = a.role
     and cr.is_active
   where a.deleted_at is null
     and a.source_type = 'record'
     and a.target_type = 'record'
     and a.organization_id = p_organization_id;
end
$function$;

CREATE OR REPLACE FUNCTION custom.dependency_cycle(p_organization_id uuid, p_row custom.record)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  with recursive e as (
    select needs, needed from custom.rule_dependency_edges(p_organization_id, p_row)
  ),
  seed as (
    select case when p_row.table_id = custom.rule_kernel_id() then 'rule:' else 'merge:' end
           || p_row.id as node
  ),
  walk (node, path) as (
    select s.node, array[s.node] from seed s
    union all
    select e.needed, w.path || e.needed
      from walk w
      join e on e.needs = w.node
     where array_length(w.path, 1) <= 64
       and (e.needed = w.path[1] or not (e.needed = any (w.path)))
  )
  select w.path from walk w
   where array_length(w.path, 1) > 1 and w.path[array_length(w.path, 1)] = w.path[1]
   order by array_length(w.path, 1)
   limit 1
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.dependency_label(p_organization_id uuid, p_node text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  select case split_part(p_node, ':', 1)
           when 'rule'  then coalesce(r.data ->> 'name', 'a rule')
           when 'merge' then coalesce(r.data ->> 'key', 'a merge field')
           when 'field' then coalesce(nullif(r.data ->> 'label', ''), r.data ->> 'key', 'a field')
           else p_node
         end
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = nullif(split_part(p_node, ':', 2), '')::uuid
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.owning_table_gone(p_organization_id uuid, p_record_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  select case
           when custom.owning_table(p_organization_id, p_record_id) is null then false
           else not custom.table_is_live(p_organization_id,
                                         custom.owning_table(p_organization_id, p_record_id))
         end
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.portal_admits(p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  -- ONE SENTENCE, ONE PLACE. VIS-31 says an external principal is a signed-in person with
  -- no membership of a non-personal organization and that Visibility alone decides what
  -- they see. This asks the narrower question the doors need: is this person an outsider
  -- THIS organization has deliberately let in, through a live portal, right now.
  --
  -- The knob is read here and not at each call site, so no surface can invent a second
  -- answer. While `custom/external_principal_enabled` resolves false for an organization
  -- this returns false for everybody in it and every door refuses by name, which is
  -- exactly the answer the platform gave before this file.
  select coalesce(
           (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean,
           false)
     and exists (
           select 1
             from custom.portal_principal pp
             join custom.portal p on p.id = pp.portal_id and p.is_active
            where pp.organization_id = p_organization_id
              and pp.user_id = coalesce(p_user_id, (select auth.uid()))
              and pp.user_id is not null
              and pp.is_active)
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_values(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  select (r.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
         || coalesce((select jsonb_object_agg(e.key, e.value -> 'value')
                        from jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e),
                     '{}'::jsonb)
         || coalesce(custom.derived_values(p_organization_id, p_record_id), '{}'::jsonb)
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_record_id
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.rule_context(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  -- ONE parent, read through W1-TABLE's own REC-7 reader, and NOTHING RECURSIVE. This body
  -- is the whole of REC-16's ceiling: an evaluator cannot reach a grandparent because the
  -- map it reads has one parent in it and no way to ask for another.
  select jsonb_build_object(
           'record_id',     r.id,
           'parent_id',     to_jsonb(custom.containment_parent(r.data)),
           'parent_values', coalesce(custom.record_values(p_organization_id,
                                       custom.containment_parent(r.data)), 'null'::jsonb))
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_record_id
     and r.deleted_at is null
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.rule_field_key(p_organization_id uuid, p_field_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  select f.data ->> 'key'
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.rule_field_label(p_organization_id uuid, p_field_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key', p_field_id::text)
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.share_levels()
 RETURNS TABLE(level permission_level, ordinal integer, label text, means text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return query
  -- VIS-17's ONE ladder, read from the enum rather than listed, and VIS-N-2's scope-qualified
  -- label: "Admin" never stands alone on an access surface.
  select l.level, l.ordinal, iam.level_label('record', l.level), l.noun
    from iam.content_levels() l
   order by l.ordinal;
end
$function$;

CREATE OR REPLACE FUNCTION custom.table_contents(p_organization_id uuid, p_table_id uuid)
 RETURNS TABLE(record_id uuid, kind text, goes_at integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return query
  select r.id, 'record'::text, 1
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.table_id = p_table_id
     and r.id <> p_table_id
  union
  select r.id, 'saved view'::text, 2
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.data ? 'layout'
     and r.data ->> 'subject' = p_table_id::text
     and r.id <> p_table_id
  union
  select r.id, 'rule'::text, 3
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.table_id = custom.rule_kernel_id()
     and r.data ->> 'scope_table_id' = p_table_id::text
  union
  select r.id, 'field'::text, 4
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.table_id = custom.field_kernel_id()
     and r.data ->> 'entity_definition_id' = p_table_id::text;
end
$function$;

CREATE OR REPLACE FUNCTION custom.table_is_live(p_organization_id uuid, p_table_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  select exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.table_id = custom.table_kernel_id()
                    and t.deleted_at is null)
  );
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_assignment_fields(p_options_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(key text, label text, spec jsonb)
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return query
  select v.key, v.label, v.spec from (values
    ('assignee', 'Assignee', jsonb_build_object(
        'key', 'assignee', 'label', 'Assignee', 'sort', 900,
        'type', 'relation', 'parity_type', 'member',
        'relation_target', custom.person_kernel_id()::text,
        'relation_max', 1, 'on_target_delete', 'set_null',
        'multi', false, 'dated', false, 'required', false,
        'source', 'manual', 'config', '{}'::jsonb, 'rules', '[]'::jsonb,
        'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
        'sensitivity', 'internal', 'context_policy', 'include',
        'applies_to_types', '[]'::jsonb,
        'promoted', true, 'unique', false)),
    ('due_date', 'Due date', jsonb_build_object(
        'key', 'due_date', 'label', 'Due date', 'sort', 910,
        'type', 'range', 'parity_type', 'datetime',
        'config', jsonb_build_object('kind', 'date'),
        'multi', false, 'dated', false, 'required', false,
        'source', 'manual', 'rules', '[]'::jsonb,
        'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
        'sensitivity', 'internal', 'context_policy', 'include',
        'applies_to_types', '[]'::jsonb,
        'promoted', true, 'unique', false)),
    ('status', 'Status', jsonb_build_object(
        'key', 'status', 'label', 'Status', 'sort', 920,
        'type', 'list', 'parity_type', 'select',
        'config', jsonb_build_object('options_table_id', p_options_table_id),
        'multi', false, 'dated', false, 'required', false,
        'source', 'manual', 'rules', '[]'::jsonb,
        'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
        'sensitivity', 'internal', 'context_policy', 'include',
        'applies_to_types', '[]'::jsonb,
        'promoted', true, 'unique', false))
  ) v(key, label, spec);
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_state_id(p_organization_id uuid, p_table_id uuid, p_value text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  -- The state RECORD behind whatever the document holds. The key first (the contract), then the
  -- label, then the option's own id - `custom.choice_key_of` asks all three in that order - and
  -- finally a bare uuid that names no choice at all, which is handed back as itself so a state
  -- written outside the choice machinery still resolves. Anything else is null.
  select coalesce(
    (select (m.f -> 'options' -> custom.choice_key_of(m.f, btrim(coalesce(p_value, ''))) ->> 'id')::uuid
       from (select custom.choice_field_map(p_organization_id, p_table_id) -> 'status' as f) m),
    case when btrim(coalesce(p_value, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then btrim(p_value)::uuid end)
  );
end
$function$;

CREATE OR REPLACE FUNCTION iam.has_org_admin(p_org uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  SELECT EXISTS (SELECT 1 FROM iam.organization_member m
                 WHERE m.organization_id = p_org
                   AND m.user_id = (SELECT auth.uid())
                   AND m.role = ANY (ARRAY['owner'::org_role,'admin'::org_role]))
  );
end
$function$;

CREATE OR REPLACE FUNCTION platform.relation_edge_has_a_live_field(p_organization_id uuid, p_field_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
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
       and f.data ->> 'type' = 'relation')
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.current_personal_org_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
#variable_conflict use_column
begin
  -- WRITE-PERF-2, LADDER-PERF's class on the rest of the write path. Everything between
  -- `begin` and `end` is this function's own SQL body, character for character; only the
  -- language moved, so its plan is cached for the session instead of being rebuilt on
  -- every single call.
  return (
  SELECT iam.personal_org_id((select auth.uid()))
  );
end
$function$;
