-- lane: access-ladder T-11, step 2 (the per-item choice): the ONE setter and state reader for a
-- record's "Shown to", and the retirement of the content.document default_visibility.* knobs.
--
-- The `shown_to` column itself was added to every Organization and Public entity table that
-- carries a row `visibility` (332 tables), one table per transaction with lock_timeout 2s, and each
-- row's legacy value mapped per common-docs/projects/access-ladder/terminology.md §5 in batches of
-- 2000 rows (Organization: personal -> only_me; Public: personal -> only_me, internal -> everyone;
-- everything else NULL = follow the knob; a child row — a file naming its parent record — gets
-- none). That DDL ran table by table directly (the Supabase-MCP path), because a migration file is
-- one transaction and would have held every table's lock at once.
--
-- content.document: `default_visibility.<type>` knobs set a new document's ROW SECURITY (a
-- `personal` default locked coworkers out) — a knob may never do that (law: "A knob never changes
-- row security"). A document written with no visibility now takes the one its class needs —
-- `personal` for a Private/Confidential-class document (the class guard below still requires
-- it), `internal` otherwise — and what coworkers' lists show is the type's "Shown to by default"
-- knob (access.shown_to_default/document). Nothing reads the 20 retired knob rows any more; they
-- were removed through the MCP (a deletion is not a file statement on this path).
set local lock_timeout = '2s';
-- based-on: content._document_guard_data_class() 55f97dd783db647942af17d6a6fd10f53236aa65a61530503e30f24cddfac79a

-- ── 1. Which table a token names, when it carries a Shown to ───────────────────────────────────
create or replace function platform._shown_to_table(p_resource_type text)
returns table (s text, tb text, data_class text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
begin
  return query
  select et.schema_name, et.table_name, et.data_class::text
    from platform.entity_types et
   where et.token = p_resource_type and et.is_active
     and et.data_class in ('organization', 'public')
     and exists (select 1 from information_schema.columns c
                  where c.table_schema = et.schema_name and c.table_name = et.table_name
                    and c.column_name = 'shown_to');
  if not found then
    raise exception using errcode = '22023',
      message = format('A %s has no "Shown to": only Organization and Public records appear in shared lists.', p_resource_type),
      hint = 'Private and Confidential records are listed only for their owner and the people they are shared with.';
  end if;
end;
$function$;

-- ── 2. State: what the share dialog shows ──────────────────────────────────────────────────────
create or replace function platform.shown_to_state(p_resource_type text, p_resource_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  t record; v_val platform.shown_to; v_vis text; v_org uuid; v_owner uuid; v_child boolean := false;
  v_cols text[] := platform.child_parent_columns(p_resource_type);
begin
  if not iam.has_access(p_resource_type, p_resource_id, 'viewer'::public.permission_level) then
    raise exception using errcode = '42501', message = 'You cannot open this record.';
  end if;
  select * into t from platform._shown_to_table(p_resource_type);
  execute format('select r.shown_to, r.visibility::text, r.organization_id, r.created_by%s from %I.%I r where r.id = $1',
                 case when v_cols is null then ', false' else format(', r.%I is not null', v_cols[1]) end, t.s, t.tb)
    into v_val, v_vis, v_org, v_owner, v_child using p_resource_id;
  return jsonb_build_object(
    'value', v_val,
    'legacy_only_me', v_val is null and v_vis = 'personal',
    'type_default', platform.shown_to_default(p_resource_type, v_org, auth.uid()),
    'effective', coalesce(v_val, case when v_vis = 'personal' then 'only_me'::platform.shown_to end,
                          platform.shown_to_default(p_resource_type, v_org, auth.uid())),
    'allowed', case when t.data_class = 'public' or v_vis = 'public'
                    then '["only_me","my_team","everyone","everyone_on_ai_matrx"]'::jsonb
                    else '["only_me","my_team","everyone"]'::jsonb end,
    'is_child', v_child,
    'can_change', not v_child and (v_owner = auth.uid()
                  or iam.has_access(p_resource_type, p_resource_id, 'admin'::public.permission_level)));
end;
$function$;

-- ── 3. THE setter: the creator's per-item choice (NULL = follow the type default) ──────────────
create or replace function platform.set_shown_to(p_resource_type text, p_resource_id uuid, p_shown_to text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $function$
declare
  t record; v_owner uuid; v_vis text; v_child boolean := false; v_val platform.shown_to;
  v_cols text[] := platform.child_parent_columns(p_resource_type);
begin
  select * into t from platform._shown_to_table(p_resource_type);
  execute format('select r.created_by, r.visibility::text%s from %I.%I r where r.id = $1',
                 case when v_cols is null then ', false' else format(', r.%I is not null', v_cols[1]) end, t.s, t.tb)
    into v_owner, v_vis, v_child using p_resource_id;
  -- The creator decides; someone with full access to the record may too. Access is decided
  -- before existence, so a foreign id answers exactly like an unknown one.
  if v_owner is distinct from auth.uid()
     and not iam.has_access(p_resource_type, p_resource_id, 'admin'::public.permission_level) then
    raise exception using errcode = '42501',
      message = 'Only the person who created this (or someone with full access to it) can choose who it is shown to.';
  end if;
  if v_child then
    raise exception using errcode = '22023',
      message = 'This belongs to another record and is shown wherever that record is; it has no "Shown to" of its own.';
  end if;
  v_val := nullif(p_shown_to, '')::platform.shown_to;
  if v_val = 'everyone_on_ai_matrx' and t.data_class <> 'public' and v_vis is distinct from 'public' then
    raise exception using errcode = '22023',
      message = 'Publish this to the web first; only a record published to the web can be shown to everyone on AI Matrx.';
  end if;
  execute format('update %I.%I r set shown_to = $2 where r.id = $1', t.s, t.tb) using p_resource_id, v_val;
  return platform.shown_to_state(p_resource_type, p_resource_id);
end;
$function$;

comment on function platform.set_shown_to(text, uuid, text) is
  'Access ladder T-11: the creator''s "Shown to" for one record — only_me | my_team | everyone | '
  'everyone_on_ai_matrx (Public types, or a record published to the web) | NULL = follow the type '
  'knob. Hides from lists; never locks.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers,
   anonymous_purpose, gate_predicate, argument_rules)
select v.* from (values
  ('platform','shown_to_state','p_resource_type text, p_resource_id uuid',
   'access_ladder_t11g_shown_to_setter_and_document_default.sql',
   'SIGNED-IN door. The share dialog reads a record''s Shown to (its own value, the type default, what applies, who may change it).',
   false, null, 'iam.has_access(p_resource_type, p_resource_id, viewer)',
   jsonb_build_object('version',1,'arguments',jsonb_build_object(
     'p_resource_type', jsonb_build_object('type','text','position',1,'optional',false,'foreign',jsonb_build_object('not_an_id',true)),
     'p_resource_id', jsonb_build_object('type','uuid','position',2,'optional',false,'foreign',jsonb_build_object('bounded',true,'note','iam.has_access viewer decides on this id before any read'))))),
  ('platform','set_shown_to','p_resource_type text, p_resource_id uuid, p_shown_to text',
   'access_ladder_t11g_shown_to_setter_and_document_default.sql',
   'SIGNED-IN door. The creator (or someone with full access) chooses who one record is shown to in lists.',
   false, null, 'created_by = auth.uid() or iam.has_access(p_resource_type, p_resource_id, admin)',
   jsonb_build_object('version',1,'arguments',jsonb_build_object(
     'p_resource_type', jsonb_build_object('type','text','position',1,'optional',false,'foreign',jsonb_build_object('not_an_id',true)),
     'p_resource_id', jsonb_build_object('type','uuid','position',2,'optional',false,'foreign',jsonb_build_object('bounded',true,'note','the creator check or iam.has_access admin decides on this id before any write; an unknown id is refused the same way')),
     'p_shown_to', jsonb_build_object('type','text','position',3,'optional',true,'foreign',jsonb_build_object('not_an_id',true)))))
) as v(schema_name, function_name, identity_args, declared_by, reason, anonymous_callers,
       anonymous_purpose, gate_predicate, argument_rules)
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = v.schema_name and d.function_name = v.function_name
                     and d.identity_args = v.identity_args);

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', '_shown_to_table', 'p_resource_type text', array['text'::regtype]::oid[],
       'Resolves a token to its table; takes no id.',
       'access_ladder_t11g_shown_to_setter_and_document_default.sql',
       'server_only: called only inside platform.shown_to_state and platform.set_shown_to (T-11).',
       false, false
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'platform' and d.function_name = '_shown_to_table');

grant execute on function platform.shown_to_state(text, uuid) to authenticated, service_role;
grant execute on function platform.set_shown_to(text, uuid, text) to authenticated, service_role;

-- ── 4. content.document: no knob sets row security any more ────────────────────────────────────
create or replace function content._document_guard_data_class()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_slug     text;
  v_platform platform.data_class;
  v_resolved platform.data_class;
  v_floor    platform.data_class;
begin
  select c.slug into v_slug from platform.categories c where c.id = new.document_type_id;
  if v_slug is null then
    return new;   -- the type guard refuses this row with its own sentence
  end if;

  if content._capture_bypassed() then
    -- Access ladder T-11: a writer that names no visibility gets the one its class needs; who sees
    -- it in lists is the "Shown to by default" knob, never a row-security default.
    if tg_op = 'INSERT' and new.visibility is null then
      new.visibility := case when new.data_class in ('private', 'confidential')
                             then 'personal' else 'internal' end::platform.visibility;
    end if;
    return new;
  end if;
  select (k.value #>> '{}')::platform.data_class into v_platform
    from platform.feature_knob k
   where k.feature = 'content.document' and k.key = 'data_class.' || v_slug;
  if v_platform is null then
    raise exception using
      errcode = '55000',
      message = format('Document type %s has no class floor (knob content.document / data_class.%s is not seeded).', v_slug, v_slug),
      hint = 'Seed the knob in platform.feature_knob; a missing floor is never defaulted.';
  end if;
  v_resolved := (platform.knob_resolve('content.document', 'data_class.' || v_slug, new.organization_id, auth.uid()) #>> '{}')::platform.data_class;
  v_floor := least(v_platform, coalesce(v_resolved, v_platform));   -- enum order: private < confidential < organization < public

  if tg_op = 'INSERT' and new.data_class is null then
    new.data_class := v_floor;
  end if;
  -- Access ladder T-11: a writer that names no visibility gets the one its class needs; who sees
  -- it in lists is the "Shown to by default" knob, never a row-security default.
  if tg_op = 'INSERT' and new.visibility is null then
    new.visibility := case when new.data_class in ('private', 'confidential')
                           then 'personal' else 'internal' end::platform.visibility;
  end if;
  if new.data_class > v_floor then
    raise exception using
      errcode = '42501',
      message = format('A %s may not be classed %s: its floor is %s.', v_slug, new.data_class, v_floor),
      hint = format('Use %s or stricter.', v_floor);
  end if;
  if tg_op = 'UPDATE' and new.data_class is distinct from old.data_class
     and auth.uid() is not null
     and old.created_by is distinct from auth.uid()
     and not iam.has_access('document', new.id, 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Only the owner of a document (or an admin on it) can change its data class.',
      hint = 'Ask the owner to change it.';
  end if;
  if new.data_class = 'private' and new.visibility <> 'personal' then
    raise exception using
      errcode = '23514',
      message = format('A private-class %s can only be personal (visibility is %s).', v_slug, new.visibility),
      hint = 'Send visibility = ''personal'' (or none: the class default applies), or lower the class (not below its floor) before sharing.';
  end if;
  if new.visibility = 'public' and new.data_class not in ('organization', 'public') then
    raise exception using
      errcode = '23514',
      message = format('A %s-class document cannot be public.', new.data_class),
      hint = 'Lower the class to organization (if its floor allows) before making it public.';
  end if;
  return new;
end;
$function$;
