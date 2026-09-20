-- additive: yes
--
-- chair-step: THE INVERSE of writeperf2_the_rest_of_the_write_path_plans_once.sql. It puts all
--   twenty bodies back to LANGUAGE sql exactly as the live catalogue held them before that file,
--   byte for byte. It is run for real by scripts/campaign-tests/writeperf2_red.sql and by
--   scripts/campaign-tests/writeperf2_parity.sql, inside a transaction that rolls back.
--

CREATE OR REPLACE FUNCTION custom._checklist_finished(p_organization_id uuid, p_table_id uuid, p_status text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce((select (s.data ->> 'terminal')::boolean
                     from custom.record s
                    where s.organization_id = p_organization_id
                      and s.id = custom.work_state_id(p_organization_id, p_table_id, p_status)
                      and s.deleted_at is null), false);
$function$;

CREATE OR REPLACE FUNCTION custom._stage_field_key(p_organization_id uuid, p_table_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select t.data ->> 'stage_field'
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
$function$;

CREATE OR REPLACE FUNCTION custom.choice_synonyms(p_organization_id uuid, p_table_id uuid, p_token text)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
     where s is not null and s <> '');
$function$;

CREATE OR REPLACE FUNCTION custom.containment_edges(p_organization_id uuid)
 RETURNS TABLE(parent_id uuid, child_id uuid, via text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION custom.dependency_cycle(p_organization_id uuid, p_row custom.record)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
   limit 1;
$function$;

CREATE OR REPLACE FUNCTION custom.dependency_label(p_organization_id uuid, p_node text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case split_part(p_node, ':', 1)
           when 'rule'  then coalesce(r.data ->> 'name', 'a rule')
           when 'merge' then coalesce(r.data ->> 'key', 'a merge field')
           when 'field' then coalesce(nullif(r.data ->> 'label', ''), r.data ->> 'key', 'a field')
           else p_node
         end
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = nullif(split_part(p_node, ':', 2), '')::uuid;
$function$;

CREATE OR REPLACE FUNCTION custom.owning_table_gone(p_organization_id uuid, p_record_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
           when custom.owning_table(p_organization_id, p_record_id) is null then false
           else not custom.table_is_live(p_organization_id,
                                         custom.owning_table(p_organization_id, p_record_id))
         end;
$function$;

CREATE OR REPLACE FUNCTION custom.portal_admits(p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
              and pp.is_active);
$function$;

CREATE OR REPLACE FUNCTION custom.record_values(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select (r.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
         || coalesce((select jsonb_object_agg(e.key, e.value -> 'value')
                        from jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e),
                     '{}'::jsonb)
         || coalesce(custom.derived_values(p_organization_id, p_record_id), '{}'::jsonb)
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_record_id;
$function$;

CREATE OR REPLACE FUNCTION custom.rule_context(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
     and r.deleted_at is null;
$function$;

CREATE OR REPLACE FUNCTION custom.rule_field_key(p_organization_id uuid, p_field_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select f.data ->> 'key'
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
$function$;

CREATE OR REPLACE FUNCTION custom.rule_field_label(p_organization_id uuid, p_field_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key', p_field_id::text)
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
$function$;

CREATE OR REPLACE FUNCTION custom.share_levels()
 RETURNS TABLE(level permission_level, ordinal integer, label text, means text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  -- VIS-17's ONE ladder, read from the enum rather than listed, and VIS-N-2's scope-qualified
  -- label: "Admin" never stands alone on an access surface.
  select l.level, l.ordinal, iam.level_label('record', l.level), l.noun
    from iam.content_levels() l
   order by l.ordinal;
$function$;

CREATE OR REPLACE FUNCTION custom.table_contents(p_organization_id uuid, p_table_id uuid)
 RETURNS TABLE(record_id uuid, kind text, goes_at integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION custom.table_is_live(p_organization_id uuid, p_table_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.table_id = custom.table_kernel_id()
                    and t.deleted_at is null);
$function$;

CREATE OR REPLACE FUNCTION custom.work_assignment_fields(p_options_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(key text, label text, spec jsonb)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION custom.work_state_id(p_organization_id uuid, p_table_id uuid, p_value text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- The state RECORD behind whatever the document holds. The key first (the contract), then the
  -- label, then the option's own id - `custom.choice_key_of` asks all three in that order - and
  -- finally a bare uuid that names no choice at all, which is handed back as itself so a state
  -- written outside the choice machinery still resolves. Anything else is null.
  select coalesce(
    (select (m.f -> 'options' -> custom.choice_key_of(m.f, btrim(coalesce(p_value, ''))) ->> 'id')::uuid
       from (select custom.choice_field_map(p_organization_id, p_table_id) -> 'status' as f) m),
    case when btrim(coalesce(p_value, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then btrim(p_value)::uuid end);
$function$;

CREATE OR REPLACE FUNCTION iam.has_org_admin(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM iam.organization_member m
                 WHERE m.organization_id = p_org
                   AND m.user_id = (SELECT auth.uid())
                   AND m.role = ANY (ARRAY['owner'::org_role,'admin'::org_role]));
$function$;

CREATE OR REPLACE FUNCTION platform.relation_edge_has_a_live_field(p_organization_id uuid, p_field_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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

CREATE OR REPLACE FUNCTION public.current_personal_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT iam.personal_org_id((select auth.uid()))
$function$;
