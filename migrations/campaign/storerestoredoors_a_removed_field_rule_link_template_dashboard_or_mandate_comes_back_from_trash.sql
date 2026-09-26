-- chair-step: lane STORE-RESTORE-DOORS. Everything a person removes on their own in the record store is in Trash and comes back: a Field (with its values, the Fields retired with it and the links it made), a Rule, a link between two Records, a document template and a dashboard each get a store restore door on the same rung as the door that removes them, and five Trash kinds (personal and Organization Trash, "<name> (in <table>)"); archived mandates become a Trash kind of their own with mandate.definition_restore. It GRANTS EXECUTE on six NEW functions to authenticated. Nothing is dropped, no row of any feature is deleted or rewritten.
--
-- WHY. Lane TRASH-COVERAGE-2 (2026-09-26) found five STORE GAPS: a person removes a Field
-- (custom.field_retire), a Rule (custom.record_delete / custom.rule), a link between Records
-- (custom.relation_uncarry), a document template (custom.doc_template_delete) and a dashboard
-- (custom.dashboard_delete) on their own, each is soft-archived, and the store had no door that puts
-- one back — so none could be in Trash. And the mandate screens say an archived mandate is
-- "restorable from Trash" while mandates were not a Trash kind. Standing law (Arman, 2026-09-20):
-- archive, never delete; everything a person removes is findable in Trash and restorable.
--
-- THE VALUES OF A REMOVED FIELD NEVER LEFT. custom.field_retire soft-archives the Field rows and takes
-- the key out of its Table's `fields` list; it never rewrites a record, and custom._undeclared_key_guard
-- judges only a key a write CHANGES, so every record keeps its value under the retired key (checked on
-- production: retired columns whose records still hold the key). custom.field_restore puts the
-- declaration back and the column shows the same values again.
--
-- lane: STORE-RESTORE-DOORS
-- additive: yes
-- guard: custom/system_enabled
-- based-on: public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer) a61dad432ada1053d97c0ef97e832f641573310e25fdcfef88da64dc9997c79e
-- based-on: public._trash_kind_counts(uuid, uuid, uuid) 469afca97b00ffe263f4a417b58c614c20d632cbe0d2a415f617323a0e177b05
-- based-on: public.entity_undelete(text, uuid) 68e847e771eb48c40e3477ce66eb06710124b5cfda36e6b1aab256c775575f43
-- based-on: public.org_trash_restore(uuid, text, uuid) f996440c5230fa43c04d16490bf3eadb0a4f08cd8806bd128e821f09e8036597
-- INVERSE: migrations/inverse/storerestoredoors_a_removed_field_rule_link_template_dashboard_or_mandate_comes_back_from_trash_down.sql

-- ── 1. THE FIVE STORE RESTORE DOORS ──────────────────────────────────────────────────────────
-- Each is the undo half of the door that removes the thing, and climbs the SAME rung that door
-- climbs (custom.field_retire: admin on the Table; custom.record_delete on a Rule: editor on the
-- Rule; custom.relation_uncarry: editor on the record the link reaches; custom.doc_template_delete:
-- editor on the Table it renders; custom.dashboard_delete: admin on the dashboard). Each decides the
-- caller in its own body, before any row moves, and answers a refusal with a sentence.

create or replace function custom.field_restore(p_organization_id uuid, p_field_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
-- lane STORE-RESTORE-DOORS. THE UNDO OF custom.field_retire. A retirement takes a SET — the Field
-- and every Field of the same Table that works its answer out through it — in one statement, so the
-- set is every Field of this Table archived at this Field's own moment. It comes back whole: the
-- Table declares the columns again (custom.field_declare's order: the Table is told first), the
-- Field rows are live again, and the links custom.relation_edges_withdraw took out in the same
-- statement come back. THE VALUES NEVER LEFT: a retirement changes no record's document (the
-- undeclared-key guard judges only a key a write changes), so every record still holds what it held
-- under that column, and the column shows it again the moment it is back.
declare
  v_field  jsonb;
  v_table  uuid;
  v_at     timestamptz;
  v_spec   jsonb;
  v_going  uuid[];
  v_keys   text[];
  v_taken  text;
  v_edges  integer := 0;
  v_named  boolean := false;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_restore');

  select r.data, nullif(r.data ->> 'entity_definition_id', '')::uuid, r.deleted_at
    into v_field, v_table, v_at
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id();
  if v_field is null then
    raise exception 'There is no such field in this organization, so nothing was brought back.'
      using errcode = '02000', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_at is null then
    raise exception 'The field "%" was not removed, so there was nothing to bring back.',
                    custom.said(v_field ->> 'label', v_field ->> 'key')
      using errcode = '02000', hint = 'REC-23: it is already here.';
  end if;
  if v_table is null then
    raise exception 'The field "%" belongs to a standard table, and this door brings back a field of a table somebody made.',
                    custom.said(v_field ->> 'label', 'that one')
      using errcode = '23514', hint = 'FLD-8: a field on a standard table is part of that table''s own definition.';
  end if;

  select r.data into v_spec
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_table
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;
  if v_spec is null then
    raise exception 'The field "%" belongs to a table that is archived, so it cannot come back on its own.',
                    custom.said(v_field ->> 'label', v_field ->> 'key')
      using errcode = '23514',
            hint = 'Restore the table from Trash first. A field removed with its table comes back with it; a field removed before, from Trash once the table is back.';
  end if;

  -- The rung custom.field_retire climbs: admin on the Table.
  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_restore',
                                          'admin'::public.permission_level, 'table');

  -- THE SET THAT WENT TOGETHER: every Field of this Table retired in the same statement.
  select array_agg(f.id order by f.id), array_agg(f.data ->> 'key' order by f.id)
    into v_going, v_keys
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at = v_at
     and f.data ->> 'entity_definition_id' = v_table::text;

  -- A column made since under the same key holds that key now; two columns cannot share it.
  select string_agg(format('"%s"', custom.said(f.data ->> 'label', f.data ->> 'key')), ', ')
    into v_taken
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_table::text
     and f.data ->> 'key' = any (v_keys);
  if v_taken is not null then
    raise exception 'This table has a field % again, so "%" cannot come back beside it.',
                    v_taken, custom.said(v_field ->> 'label', v_field ->> 'key')
      using errcode = '23505',
            hint = 'Two fields of one table cannot share a key. Rename or remove the newer one, then restore this one from Trash.';
  end if;

  -- The Table declares the columns first — the field guard refuses a definition for a column the
  -- Table does not declare (custom.field_declare tells the Table first for the same reason).
  update custom.record
     set data = jsonb_set(data, '{fields}',
                          coalesce(data -> 'fields', '[]'::jsonb)
                          || coalesce((select jsonb_agg(jsonb_build_object('name', k) order by o)
                                         from unnest(v_keys) with ordinality as u(k, o)
                                        where not exists (select 1
                                                            from jsonb_array_elements(coalesce(data -> 'fields', '[]'::jsonb)) x
                                                           where x ->> 'name' = k)), '[]'::jsonb)),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = v_table
     and table_id = custom.table_kernel_id();

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id
     and id = any (v_going)
     and table_id = custom.field_kernel_id()
     and deleted_at = v_at;

  -- THE LINKS THE RETIREMENT TOOK: custom.relation_edges_withdraw tombstoned them in the same
  -- statement (deleted_at = that moment, no deleted_via — it is not a trashing). One the records
  -- have made again since is live already and is left as it is.
  if nullif(current_setting('app.actor_system', true), '') is null
     and coalesce(platform.declared_actor_tier(), platform.actor_tier()) in ('ai', 'code') then
    perform set_config('app.actor_system', 'custom.relations', true);
    v_named := true;
  end if;
  update platform.associations a
     set deleted_at = null
   where a.organization_id = p_organization_id
     and a.relation_field_id = any (v_going)
     and a.deleted_at = v_at
     and a.deleted_via_type is null
     and not exists (select 1 from platform.associations b
                      where b.organization_id = a.organization_id
                        and b.relation_field_id = a.relation_field_id
                        and b.source_type = a.source_type and b.source_id = a.source_id
                        and b.target_type = a.target_type and b.target_id = a.target_id
                        and b.role is not distinct from a.role
                        and b.deleted_at is null);
  get diagnostics v_edges = row_count;
  if v_named then
    perform set_config('app.actor_system', '', true);
  end if;

  raise notice '%', format('Brought back: %s field(s) with their values%s.',
    cardinality(v_going),
    case when v_edges > 0 then format(', and %s link(s) they made', v_edges) else '' end);
  return true;
end
$function$;

create or replace function custom.rule_restore(p_organization_id uuid, p_rule_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
-- lane STORE-RESTORE-DOORS. THE UNDO OF REMOVING A RULE (custom.record_delete on it, or a delete
-- through custom.rule, which custom._rule_definition_write turns into an archive). The rung is the
-- one removing it climbs — editor on the Rule. The Rule's own guards judge it coming back: a Rule
-- that reads a Field removed since is refused in the guard's own sentence, never half-restored.
declare
  v_rule  jsonb;
  v_at    timestamptz;
  v_table uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.rule_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.rule_restore');

  select r.data, r.deleted_at, nullif(r.data ->> 'scope_table_id', '')::uuid
    into v_rule, v_at, v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_rule_id
     and r.table_id = custom.rule_kernel_id();
  if v_rule is null then
    raise exception 'There is no such rule in this organization, so nothing was brought back.'
      using errcode = '02000', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_at is null then
    raise exception 'The rule "%" was not removed, so there was nothing to bring back.', custom.said(v_rule ->> 'name', 'that one')
      using errcode = '02000', hint = 'REC-23: it is already here.';
  end if;
  if v_table is not null and not exists (select 1 from custom.record t
                                          where t.organization_id = p_organization_id and t.id = v_table
                                            and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
    raise exception 'The rule "%" belongs to a table that is archived, so it cannot come back on its own.', custom.said(v_rule ->> 'name', 'that one')
      using errcode = '23514', hint = 'Restore the table from Trash first.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, p_rule_id, 'custom.rule_restore');

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id and id = p_rule_id
     and table_id = custom.rule_kernel_id() and deleted_at = v_at;
  return found;
end
$function$;

create or replace function custom.relation_restore(p_organization_id uuid, p_relation_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
-- lane STORE-RESTORE-DOORS. THE UNDO OF UNLINKING TWO RECORDS (custom.relation_uncarry archives the
-- link record; the association trigger withdraws its edge in the same statement). The rung is the
-- one unlinking climbs — editor on the record the link reaches. Both records must be here, and a
-- link made again since is not made twice.
declare
  v_rel   jsonb;
  v_at    timestamptz;
  v_from  uuid;
  v_to    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.relation_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_restore');

  select r.data, r.deleted_at, nullif(r.data ->> 'from', '')::uuid, nullif(r.data ->> 'to', '')::uuid
    into v_rel, v_at, v_from, v_to
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_relation_id
     and r.data_class = 'relation';
  if v_rel is null then
    raise exception 'There is no such link in this organization, so nothing was brought back.'
      using errcode = '02000', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_at is null then
    raise exception 'Those two records are still linked, so there was nothing to bring back.'
      using errcode = '02000', hint = 'REC-23: it is already here.';
  end if;
  if not exists (select 1 from custom.record x where x.organization_id = p_organization_id and x.id = v_from and x.deleted_at is null)
     or not exists (select 1 from custom.record x where x.organization_id = p_organization_id and x.id = v_to and x.deleted_at is null) then
    raise exception 'One of the two records this link joined is archived, so the link cannot come back on its own.'
      using errcode = '23514', hint = 'Restore that record from Trash first; then the link.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_to, 'custom.relation_restore',
                                          'editor'::public.permission_level, 'record');

  if exists (select 1 from custom.record x
              where x.organization_id = p_organization_id and x.data_class = 'relation' and x.deleted_at is null
                and x.data ->> 'from' = v_from::text and x.data ->> 'to' = v_to::text
                and coalesce(x.data ->> 'kind', 'referenced') = coalesce(v_rel ->> 'kind', 'referenced')) then
    raise exception 'These two records are linked that way again already, so the old link was left in Trash.'
      using errcode = '23505', hint = 'REL-9: one link of a kind between two records.';
  end if;

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id and id = p_relation_id
     and data_class = 'relation' and deleted_at = v_at;
  return found;
end
$function$;

create or replace function custom.doc_template_restore(p_organization_id uuid, p_template_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
-- lane STORE-RESTORE-DOORS. THE UNDO OF custom.doc_template_delete. A template is its Table's
-- wording, so bringing one back is an edit of the Table — editor on it, the rung the removal climbs.
declare
  v_table uuid;
  v_name  text;
  v_at    timestamptz;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_template_restore');

  select nullif(r.data ->> 'renders_table_id', '')::uuid, r.data ->> 'name', r.deleted_at
    into v_table, v_name, v_at
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_template_id
     and r.data_class = 'doc_template';
  if v_table is null then
    raise exception 'There is no document template % in this organization, so nothing was brought back.', p_template_id
      using errcode = '02000', hint = 'Organizations are hard walls (REC-29).';
  end if;
  if v_at is null then
    raise exception 'The template "%" was not removed, so there was nothing to bring back.', custom.said(v_name, 'that one')
      using errcode = '02000', hint = 'REC-23: it is already here.';
  end if;
  if not exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id and t.id = v_table
                    and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
    raise exception 'The template "%" belongs to a table that is archived, so it cannot come back on its own.', custom.said(v_name, 'that one')
      using errcode = '23514', hint = 'Restore the table from Trash first.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.doc_template_restore',
                                          'editor'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.doc_template_restore');

  update custom.record r
     set deleted_at = null, updated_at = now(), version = r.version + 1
   where r.organization_id = p_organization_id and r.id = p_template_id
     and r.data_class = 'doc_template' and r.deleted_at = v_at;
  return found;
end
$function$;

create or replace function custom.dashboard_restore(p_organization_id uuid, p_dashboard_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
-- lane STORE-RESTORE-DOORS. THE UNDO OF custom.dashboard_delete, on the same rung: admin on the
-- dashboard itself. Removing a dashboard removed nothing else, so bringing it back brings back only it.
declare
  v_at    timestamptz;
  v_name  text;
  v_table uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.dashboard_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_restore');

  select d.deleted_at, d.data ->> 'name', nullif(d.data ->> 'subject_table_id', '')::uuid
    into v_at, v_name, v_table
    from custom.record d
   where d.organization_id = p_organization_id and d.id = p_dashboard_id
     and d.table_id = custom.presentation_kernel_id()
     and d.data_class = custom.dashboard_class();
  if not found then
    raise exception 'There is no dashboard % in this organization, so nothing was brought back.', p_dashboard_id
      using errcode = '02000', hint = 'A dashboard id from another organization reads as absent (REC-29).';
  end if;
  if v_at is null then
    raise exception 'The dashboard "%" was not removed, so there was nothing to bring back.', custom.said(v_name, 'that one')
      using errcode = '02000', hint = 'REC-23: it is already here.';
  end if;
  if v_table is not null and not exists (select 1 from custom.record t
                                          where t.organization_id = p_organization_id and t.id = v_table
                                            and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
    raise exception 'The dashboard "%" counts a table that is archived, so it cannot come back on its own.', custom.said(v_name, 'that one')
      using errcode = '23514', hint = 'Restore the table from Trash first.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, p_dashboard_id, 'custom.dashboard_restore',
                                          'admin'::public.permission_level, 'dashboard');

  update custom.record
     set deleted_at = null, updated_at = now()
   where organization_id = p_organization_id and id = p_dashboard_id and deleted_at = v_at;
  return found;
end
$function$;

-- ── 2. THE MANDATE RESTORE DOOR ───────────────────────────────────────────────────────────────
create or replace function mandate.definition_restore(p_mandate_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
-- lane STORE-RESTORE-DOORS. An archived mandate comes back from Trash through THIS door, which asks
-- exactly what archiving one asks (mandate.definition's owner-writes policy): a platform admin, or —
-- for a mandate a person made, outside the system organization — admin on that mandate. The
-- declared cascade (platform._cascade_soft_delete) brings its bindings, treatments, exemplars and
-- notes back with it.
declare
  v_label  text;
  v_origin text;
  v_org    uuid;
  v_at     timestamptz;
  v_found  boolean;
begin
  select true, d.label, d.origin, d.organization_id, d.deleted_at
    into v_found, v_label, v_origin, v_org, v_at
    from mandate.definition d
   where d.id = p_mandate_id;
  if not coalesce(v_found, false) then
    raise exception 'There is no such mandate, so nothing was brought back.' using errcode = '02000';
  end if;
  if v_at is null then
    raise exception 'The mandate "%" is not archived, so there was nothing to bring back.', coalesce(nullif(btrim(v_label), ''), 'that one')
      using errcode = '02000';
  end if;
  if not (coalesce(public.is_platform_admin(), false)
          or coalesce(public.is_super_admin(), false)
          or (v_origin = 'user'
              and v_org is distinct from public.system_org_id('system')
              and iam.has_access('mandate', p_mandate_id, 'admin'::public.permission_level))) then
    raise exception 'Only someone who manages the mandate "%" can bring it back.', coalesce(nullif(btrim(v_label), ''), 'this')
      using errcode = '42501',
            hint = 'A mandate a person made is restored by whoever manages it; a mandate the platform ships is restored by a platform admin.';
  end if;

  update mandate.definition
     set deleted_at = null
   where id = p_mandate_id and deleted_at = v_at;
  return found;
end
$function$;

-- ── 3. THE LISTING PRIMITIVES ─────────────────────────────────────────────────────────────────
-- ONE predicate for the five store things, read by the listing AND the counts, so the two can never
-- disagree. Personal: what the person made, or removed (the removal stamps updated_by). Organization:
-- that organization's (optionally one member's), never another member's personal row. A thing is
-- listed while what it belongs to is live — a Field, Rule, template or dashboard its Table; a link both
-- of its records. One whose Table is archived comes back with the Table (or, removed before it, is
-- listed again once the Table is back) — the rule TRASH-TABLES set for a Record.
create or replace function public._trash_store_children(p_uid uuid, p_org uuid, p_member uuid, p_class text, p_window integer)
 returns table(id uuid, organization_id uuid, deleted_at timestamp with time zone, created_by uuid)
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
  select c.id, c.organization_id, c.deleted_at, c.created_by
    from (
      select r.id, r.organization_id, r.deleted_at, r.created_by, r.data,
             case r.data_class
               when 'field'        then nullif(r.data ->> 'entity_definition_id', '')::uuid
               when 'rule'         then nullif(r.data ->> 'scope_table_id', '')::uuid
               when 'doc_template' then nullif(r.data ->> 'renders_table_id', '')::uuid
               when 'dashboard'    then nullif(r.data ->> 'subject_table_id', '')::uuid
             end as parent_id
        from custom.record r
       where r.data_class = p_class
         and r.data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard')
         and r.deleted_at is not null
         and case when p_org is null
                  then (r.created_by = p_uid or r.updated_by = p_uid)
                  else r.organization_id = p_org
                       and (p_member is null or r.created_by = p_member)
                       and (r.visibility is distinct from 'personal'::platform.visibility or r.created_by = p_uid)
             end
    ) c
   where case when p_class = 'relation' then
               exists (select 1 from custom.record x
                        where x.organization_id = c.organization_id and x.id = nullif(c.data ->> 'from', '')::uuid
                          and x.deleted_at is null)
           and exists (select 1 from custom.record x
                        where x.organization_id = c.organization_id and x.id = nullif(c.data ->> 'to', '')::uuid
                          and x.deleted_at is null)
              when p_class = 'field' then
               exists (select 1 from custom.record t
                        where t.organization_id = c.organization_id and t.id = c.parent_id
                          and t.data_class = 'table' and t.deleted_at is null)
              else
               c.parent_id is null
            or exists (select 1 from custom.record t
                        where t.organization_id = c.organization_id and t.id = c.parent_id
                          and t.data_class = 'table' and t.deleted_at is null)
         end
   order by c.deleted_at desc, c.id
   limit p_window;
$function$;

-- What a person reads for one store row in Trash: "<name> (in <table>)", or "<record> → <record>".
create or replace function public._trash_store_title(p_organization_id uuid, p_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
  select left(case r.data_class
      when 'relation' then
        coalesce(nullif(btrim(custom.record_words(r.organization_id, nullif(r.data ->> 'from', '')::uuid)), ''), 'a record')
        || ' → ' ||
        coalesce(nullif(btrim(custom.record_words(r.organization_id, nullif(r.data ->> 'to', '')::uuid)), ''), 'a record')
      else
        coalesce(nullif(btrim(case r.data_class
                                when 'field' then coalesce(nullif(btrim(r.data ->> 'label'), ''), r.data ->> 'key')
                                else r.data ->> 'name' end), ''),
                 case r.data_class when 'field' then 'Untitled field' when 'rule' then 'Untitled rule'
                                   when 'doc_template' then 'Untitled template' when 'dashboard' then 'Untitled dashboard'
                                   else 'Untitled' end)
        || case when t.id is null then ''
                else ' (in ' || coalesce(nullif(btrim(t.data ->> 'name'), ''), 'a table') || ')' end
    end, 200)
    from custom.record r
    left join custom.record t
      on t.organization_id = r.organization_id and t.data_class = 'table'
     and t.id = case r.data_class
                  when 'field'        then nullif(r.data ->> 'entity_definition_id', '')::uuid
                  when 'rule'         then nullif(r.data ->> 'scope_table_id', '')::uuid
                  when 'doc_template' then nullif(r.data ->> 'renders_table_id', '')::uuid
                  when 'dashboard'    then nullif(r.data ->> 'subject_table_id', '')::uuid
                end
   where r.organization_id = p_organization_id and r.id = p_id;
$function$;

-- The door a Trash restore takes for a store row, by class. The row's own door decides the caller.
create or replace function public._trash_store_restore(p_organization_id uuid, p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_class text;
begin
  select r.data_class into v_class
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id;
  case v_class
    when 'field'        then perform custom.field_restore(p_organization_id, p_id);
    when 'rule'         then perform custom.rule_restore(p_organization_id, p_id);
    when 'relation'     then perform custom.relation_restore(p_organization_id, p_id);
    when 'doc_template' then perform custom.doc_template_restore(p_organization_id, p_id);
    when 'dashboard'    then perform custom.dashboard_restore(p_organization_id, p_id);
    else perform custom.record_restore(p_organization_id, p_id);
  end case;
end
$function$;

-- (No client grant: the DDL guard clears PUBLIC's default EXECUTE on a new SECURITY DEFINER function
-- at birth, and the three door rows below declare them server_only.)

-- ── 4. TRASH LISTS THEM, COUNTS THEM AND RESTORES THEM THROUGH THEIR DOORS ─────────────────────
create or replace function public._trash_kind_rows(p_uid uuid, p_org uuid, p_member uuid, p_kinds text[], p_limit integer, p_offset integer)
 RETURNS TABLE(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean, owner_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. The person (personal mode) or the organization (organization mode, gated by the
-- caller) is the filter; there is no per-row access check and no organization-wide walk here.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) is titled
-- "<title> (in <parent>)" — it is listed, never hidden, and its restore brings the parent back first.
-- A scope type's Field (context_item) carries no organization_id; in organization mode its
-- organization is its scope type's.
-- lane TRASH-COVERAGE-2 (second file): the "(in <parent>)" suffix is computed AFTER the page is cut —
-- an outer select over the limited rows — so it costs one parent lookup per LISTED row, never one per
-- candidate row (org_trash_list file for AI Matrx measured 890.7 ms with it inside the sort; ceiling 300).
-- lane TRASH-COVERAGE-2 (third file): Organization Trash reads a table that carries visibility as TWO
-- bounded index walks — the organization's shared rows, and the caller's own personal rows — instead
-- of one walk that filters out every member's personal row (AI Matrx: 75,540 archived personal files,
-- 3 shared; the one walk read all of them to find three).
-- lane STORE-RESTORE-DOORS: five more record-store kinds — a Field, a Rule, a link between Records, a
-- document template and a dashboard, each removed on its own — read through public._trash_store_children
-- (one predicate with the counts) and titled by public._trash_store_title; restored through their own
-- store door (public._trash_store_restore).
declare
  rec record;
  v_rel regclass;
  v_title text;
  v_org text;
  v_cols text;
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_window int;
  v_title_expr text;
  v_parented boolean;
  v_q text;
  v_wrap text;
  v_kind text[];
begin
  if p_uid is null then return; end if;
  v_window := v_limit + v_offset;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.title_column, e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null
       and e.is_active
       and (p_kinds is null or e.user_artifact_kind = any(p_kinds))
     order by e.user_artifact_kind
  loop
    begin
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        -- Vault credentials: the owner's own, only. Organization mode never lists them.
        if p_org is not null then continue; end if;
        return query execute format(
          'select %L::text, %L::text, %L::text, t.id, t.display_name::text,
                  t.deleted_at, t.organization_id, true, t.user_id
             from users.credential_items t
            where t.user_id = $1 and t.deleted_at is not null
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_limit, v_offset)
          using p_uid;
        continue;
      end if;

      v_title := null;
      -- A scope type's own name is its plural label ("Service areas"); its title_column is the slug.
      select a.attname into v_title
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['label_plural', coalesce(rec.title_column, '')])
       order by (a.attname <> 'label_plural')
       limit 1;
      if v_title is null then
        select a.attname into v_title
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
         order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
         limit 1;
      end if;
      v_org := null;
      select a.attname into v_org
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = 'organization_id'
       limit 1;

      v_title_expr := case when v_title is null then 'null::text' else format('left(t.%I::text, 200)', v_title) end;
      v_parented := rec.token in ('folder', 'file', 'hr_employment', 'workflow_trigger', 'processed_document')
        or exists (select 1 from platform.soft_delete_edge s
                    where s.child_schema = rec.sch and s.child_table = rec.tbl and s.action = 'cascade');
      v_wrap := null;
      if v_parented then
        v_wrap := format(
          'select y.a, y.b, y.c, y.id, '
          || 'coalesce((select coalesce(nullif(btrim(y.t), ''''), ''Untitled'') || '' (in '' || '
          || 'coalesce(nullif(btrim(ap.parent_title), ''''), ''an archived item'') || '')'' '
          || 'from platform.archived_parent_of(%L, y.id) ap limit 1), y.t), '
          || 'y.d, y.o, y.m, y.w from (%%s) y(a, b, c, id, t, d, o, m, w) order by y.d desc, y.id',
          rec.token);
      end if;

      if rec.token = 'context_item' and p_org is not null then
        v_q := format(
          'select %L::text, %L::text, %L::text, t.id, %s, t.deleted_at, st.organization_id, (t.%I = $1), t.%I
             from context.context_items t
             join context.scope_types st on st.id = t.scope_type_id
            where st.organization_id = $2 and t.deleted_at is not null
              and ($3::uuid is null or t.%I = $3)
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_title_expr, rec.owner_col, rec.owner_col, rec.owner_col,
          v_limit, v_offset);
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid, p_org, p_member;
        continue;
      end if;

      if p_org is not null and v_org is null then continue; end if;

      v_cols := format('%L::text, %L::text, %L::text, t.id, %s, t.deleted_at, %s, (t.%I = $1), t.%I',
        rec.kind, rec.token, rec.label,
        v_title_expr,
        case when v_org is null then 'null::uuid' else format('t.%I', v_org) end,
        rec.owner_col, rec.owner_col);

      if p_org is null then
        -- PERSONAL: what I own, plus what was named to me. Each branch is its own indexed read.
        v_q := format(
          'select * from (
             (select %1$s from %2$I.%3$I t
               where t.%4$I = $1 and t.deleted_at is not null
               order by t.deleted_at desc, t.id limit %5$s)
             union all
             (select %1$s from %2$I.%3$I t
               where t.deleted_at is not null
                 and t.%4$I is distinct from $1
                 and t.id in (select g.resource_id from iam.permissions g
                               where g.granted_to_user_id = $1
                                 and g.resource_type = %6$L
                                 and coalesce(g.status, ''active'') <> ''rejected''
                                 and (g.expires_at is null or g.expires_at > now()))
               order by t.deleted_at desc, t.id limit %5$s)
           ) x
           order by x.deleted_at desc, x.id
           limit %7$s offset %8$s',
          v_cols, rec.sch, rec.tbl, rec.owner_col, v_window, rec.token, v_limit, v_offset);
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid;
      else
        -- ORGANIZATION: this organization's archived rows, optionally one member's. The caller gated it.
        -- A PERSONAL row (visibility = personal) belongs to its owner alone — a member's private
        -- highlight or note never shows in the organization's Trash (verify RC-B11 round 3; access
        -- is personal, Arman 2026-09-23). Its owner still sees it in their own Trash.
        if iam.table_has_visibility(rec.sch, rec.tbl) then
          v_q := format(
            'select * from (
               (select %1$s from %2$I.%3$I t
                 where t.%4$I = $2 and t.deleted_at is not null
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility is distinct from ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
               union all
               (select %1$s from %2$I.%3$I t
                 where t.%5$I = $1 and t.deleted_at is not null
                   and t.%4$I = $2
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility = ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
             ) x
             order by x.deleted_at desc, x.id
             limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset, v_window);
        else
          v_q := format(
            'select %1$s from %2$I.%3$I t
              where t.%4$I = $2 and t.deleted_at is not null
                and ($3::uuid is null or t.%5$I = $3)
              order by t.deleted_at desc, t.id
              limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset);
        end if;
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid, p_org, p_member;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) ────────────────────────────────────────────────────
  -- One physical table (custom.record) holds every Table and Record, so the registry loop above
  -- cannot describe them. Same two modes, same person/organization filter, restored by
  -- custom.record_restore through entity_undelete / org_trash_restore (token `record`).
  if to_regclass('custom.record') is null then return; end if;

  if p_kinds is null or 'table' = any (p_kinds) then
    if p_org is null then
      return query
      select 'table'::text, 'record'::text, 'Table'::text, x.id,
             coalesce(nullif(btrim(x.data ->> 'name'), ''), 'Untitled table'),
             x.deleted_at, x.organization_id, (x.created_by = p_uid), x.created_by
        from (
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null
            order by t.deleted_at desc, t.id limit v_window)
          union all
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.data_class = 'table' and t.deleted_at is not null
              and t.created_by is distinct from p_uid
              and t.id in (select g.resource_id from iam.permissions g
                            where g.granted_to_user_id = p_uid
                              and g.resource_type = 'record'
                              and coalesce(g.status, 'active') <> 'rejected'
                              and (g.expires_at is null or g.expires_at > now()))
            order by t.deleted_at desc, t.id limit v_window)
        ) x
       order by x.deleted_at desc, x.id
       limit v_limit offset v_offset;
    else
      return query
      select 'table'::text, 'record'::text, 'Table'::text, t.id,
             coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
             t.deleted_at, t.organization_id, (t.created_by = p_uid), t.created_by
        from custom.record t
       where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
         and (p_member is null or t.created_by = p_member)
       order by t.deleted_at desc, t.id
       limit v_limit offset v_offset;
    end if;
  end if;

  if p_kinds is null or 'record' = any (p_kinds) then
    -- A Record archived on its own, while its Table is live. One inside an archived Table comes
    -- back with the Table, so it is not a second Trash row.
    return query
    select 'record'::text, 'record'::text, 'Record'::text, y.id,
           format('%s (in %s)',
                  coalesce(nullif(btrim(custom.record_words(y.organization_id, y.id)), ''), 'Untitled record'),
                  coalesce(nullif(btrim(y.table_name), ''), 'a table')),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (
        select x.id, x.deleted_at, x.organization_id, x.created_by, x.table_name
          from (
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name' as table_name
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.data_class = 'record' and r.deleted_at is not null
                and r.created_by is distinct from p_uid
                and r.id in (select g.resource_id from iam.permissions g
                              where g.granted_to_user_id = p_uid
                                and g.resource_type = 'record'
                                and coalesce(g.status, 'active') <> 'rejected'
                                and (g.expires_at is null or g.expires_at > now()))
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is not null
                and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
                and (p_member is null or r.created_by = p_member)
              order by r.deleted_at desc, r.id limit v_window)
          ) x
         order by x.deleted_at desc, x.id
         limit v_limit offset v_offset
      ) y
     order by y.deleted_at desc, y.id;
  end if;

  -- ── THE STORE'S OWN THINGS, removed on their own (lane STORE-RESTORE-DOORS) ──────────────────
  foreach v_kind slice 1 in array array[['field','Field'],['rule','Rule'],['relation','Link'],['doc_template','Document template'],['dashboard','Dashboard']] loop
    continue when p_kinds is not null and not (v_kind[1] = any (p_kinds));
    return query
    select v_kind[1], 'record'::text, v_kind[2], y.id,
           coalesce(public._trash_store_title(y.organization_id, y.id), 'Untitled'),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (select c.id, c.organization_id, c.deleted_at, c.created_by
              from public._trash_store_children(p_uid, p_org, p_member, v_kind[1], v_window) c
             order by c.deleted_at desc, c.id
             limit v_limit offset v_offset) y
     order by y.deleted_at desc, y.id;
  end loop;
end;
$function$;

create or replace function public._trash_kind_counts(p_uid uuid, p_org uuid, p_member uuid)
 RETURNS TABLE(artifact_kind text, label text, n bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. Mirrors public._trash_kind_rows row for row; no per-row access check.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: context_item's organization is its scope type's (it has no organization_id).
-- lane STORE-RESTORE-DOORS: the five store kinds, counted through the SAME predicate the listing reads
-- (public._trash_store_children).
declare
  rec record;
  v_rel regclass;
  v_org text;
  v_n bigint;
  v_kind text[];
begin
  if p_uid is null then return; end if;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null and e.is_active
     order by e.user_artifact_kind
  loop
    begin
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;
      v_n := 0;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        if p_org is not null then continue; end if;
        select count(*) into v_n from users.credential_items t
         where t.user_id = p_uid and t.deleted_at is not null;
      else
        v_org := null;
        select a.attname into v_org
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = 'organization_id'
         limit 1;
        if p_org is null then
          execute format(
            'select (select count(*) from %1$I.%2$I t where t.%3$I = $1 and t.deleted_at is not null)
                  + (select count(*) from %1$I.%2$I t
                      where t.deleted_at is not null and t.%3$I is distinct from $1
                        and t.id in (select g.resource_id from iam.permissions g
                                      where g.granted_to_user_id = $1
                                        and g.resource_type = %4$L
                                        and coalesce(g.status, ''active'') <> ''rejected''
                                        and (g.expires_at is null or g.expires_at > now())))',
            rec.sch, rec.tbl, rec.owner_col, rec.token)
            into v_n using p_uid;
        elsif rec.token = 'context_item' then
          select count(*) into v_n
            from context.context_items t
            join context.scope_types st on st.id = t.scope_type_id
           where st.organization_id = p_org and t.deleted_at is not null
             and (p_member is null or t.created_by = p_member);
        else
          if v_org is null then continue; end if;
          execute format(
            'select count(*) from %1$I.%2$I t
              where t.%3$I = $1 and t.deleted_at is not null
                and ($2::uuid is null or t.%4$I = $2)',
            rec.sch, rec.tbl, v_org, rec.owner_col)
            into v_n using p_org, p_member;
        end if;
      end if;

      if v_n > 0 then
        artifact_kind := rec.kind; label := rec.label; n := v_n; return next;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) — the same predicates as _trash_kind_rows ──────────
  if to_regclass('custom.record') is null then return; end if;

  if p_org is null then
    select (select count(*) from custom.record t
             where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null)
         + (select count(*) from custom.record t
             where t.data_class = 'table' and t.deleted_at is not null
               and t.created_by is distinct from p_uid
               and t.id in (select g.resource_id from iam.permissions g
                             where g.granted_to_user_id = p_uid and g.resource_type = 'record'
                               and coalesce(g.status, 'active') <> 'rejected'
                               and (g.expires_at is null or g.expires_at > now())))
      into v_n;
  else
    select count(*) into v_n from custom.record t
     where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
       and (p_member is null or t.created_by = p_member);
  end if;
  if v_n > 0 then
    artifact_kind := 'table'; label := 'Table'; n := v_n; return next;
  end if;

  if p_org is null then
    select (select count(*) from custom.record r
              join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                  and t.data_class = 'table' and t.deleted_at is null
             where r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null)
         + (select count(*) from custom.record r
              join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                  and t.data_class = 'table' and t.deleted_at is null
             where r.data_class = 'record' and r.deleted_at is not null
               and r.created_by is distinct from p_uid
               and r.id in (select g.resource_id from iam.permissions g
                             where g.granted_to_user_id = p_uid and g.resource_type = 'record'
                               and coalesce(g.status, 'active') <> 'rejected'
                               and (g.expires_at is null or g.expires_at > now())))
      into v_n;
  else
    select count(*) into v_n from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                          and t.data_class = 'table' and t.deleted_at is null
     where r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
       and (p_member is null or r.created_by = p_member);
  end if;
  if v_n > 0 then
    artifact_kind := 'record'; label := 'Record'; n := v_n; return next;
  end if;

  foreach v_kind slice 1 in array array[['field','Field'],['rule','Rule'],['relation','Link'],['doc_template','Document template'],['dashboard','Dashboard']] loop
    select count(*) into v_n from public._trash_store_children(p_uid, p_org, p_member, v_kind[1], null);
    if v_n > 0 then
      artifact_kind := v_kind[1]; label := v_kind[2]; n := v_n; return next;
    end if;
  end loop;
end;
$function$;

create or replace function public.entity_undelete(p_token text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- lane TRASH-TABLES: token `record` (custom.record — every Table and Record of the record store) is
-- restored by custom.record_restore(organization, id): the store's ladder decides (42501 when the
-- caller may not change it) and the archive event brings back exactly what it took. The organization
-- is read FROM THE ROW, never from the caller.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) brings the
-- parent back first, through this same door, so a child is never left live under a removed parent
-- (platform._guard_soft_delete_parent would refuse it anyway). Kinds with their own restore door go
-- through it and never a raw update: folder -> public.restore_folder (its subfolders and files),
-- scope type -> public.restore_scope_type, scope -> public.restore_scope, scope type Field ->
-- public.restore_context_item, library document -> rag.fn_restore_library_document (its chunks and
-- data-store memberships), HR employee -> public.hr_employee_restore (HR's gate and audit).
-- lane STORE-RESTORE-DOORS: a record-store row goes through its own class's door
-- (public._trash_store_restore: custom.field_restore, rule_restore, relation_restore, doc_template_restore,
-- dashboard_restore; a Table or Record custom.record_restore); a mandate through mandate.definition_restore.
declare
  v_s text;
  v_t text;
  v_feature_owned_restore boolean;
  v_n int;
  v_org uuid;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_at timestamptz;
  v_found boolean;
  v_res jsonb;
begin
  if p_token = 'record' then
    select r.organization_id into v_org
      from custom.record r
     where r.id = p_id and r.deleted_at is not null;
    if v_org is null then
      return false;
    end if;
    perform public._trash_store_restore(v_org, p_id);
    return true;
  end if;

  select schema_name, table_name, feature_owned_restore
    into v_s, v_t, v_feature_owned_restore
    from platform.entity_types
   where token = p_token;

  if v_s is null then
    raise exception 'unknown token %', p_token using errcode = '22023';
  end if;
  if coalesce(v_feature_owned_restore, false) then
    raise exception 'entity % requires feature-owned restoration', p_token using errcode = '42501';
  end if;
  execute format('select true, t.deleted_at from %I.%I t where t.id = $1', v_s, v_t)
    into v_found, v_at using p_id;
  if not coalesce(v_found, false) or v_at is null then
    return false;
  end if;

  -- The parent first: a child of an archived parent only comes back with it.
  for v_i in 1..8 loop
    v_pid := null;
    select ap.parent_token, ap.parent_id into v_ptok, v_pid
      from platform.archived_parent_of(p_token, p_id) ap limit 1;
    exit when v_pid is null;
    perform public.entity_undelete(v_ptok, v_pid);
  end loop;

  execute format('select t.deleted_at from %I.%I t where t.id = $1', v_s, v_t) into v_at using p_id;
  if v_at is null then
    -- It came back with its parent. A Field comes back in use.
    if p_token = 'context_item' then
      perform public.restore_context_item(p_id);
    end if;
    return true;
  end if;

  case p_token
    when 'folder' then perform public.restore_folder(p_id); return true;
    when 'scope_type' then perform public.restore_scope_type(p_id); return true;
    when 'scope' then perform public.restore_scope(p_id); return true;
    when 'context_item' then perform public.restore_context_item(p_id); return true;
    when 'processed_document' then perform rag.fn_restore_library_document(p_id); return true;
    when 'mandate' then perform mandate.definition_restore(p_id); return true;
    when 'hr_employee' then
      v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
      if not coalesce((v_res ->> 'ok')::boolean, false) then
        raise exception '%', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                      'HR did not allow this person to be restored.')
          using errcode = '42501';
      end if;
      return true;
    else null;
  end case;

  if not iam.has_access(p_token, p_id, 'editor') then
    raise exception 'access denied' using errcode = '42501';
  end if;

  execute format('UPDATE %I.%I SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL', v_s, v_t)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n > 0 and p_token = 'workflow' then
    perform workflow.restore_triggers_archived_with(p_id, v_at);
  end if;
  return v_n > 0;
end;
$function$;

create or replace function public.org_trash_restore(p_organization_id uuid, p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. An owner or admin of the organization restores one member's archived item that sits
-- in THIS organization. One audit row (iam.org_admin_audit, action trash.restore) and, when the item
-- is somebody else's, an in-app notice to its owner. Never a purge.
-- lane TRASH-TABLES: a record-store Table or Record (token `record`) is restored by
-- custom.record_restore, which asks the store's own ladder for the caller and brings back exactly what
-- its archive took; a refusal is returned as restored=false with the store's sentence.
-- lane TRASH-COVERAGE-2: a row whose parent is archived brings the parent back first, through this
-- same door (audited and noticed as the parent). Kinds with their own restore door go through it:
-- folder (public.restore_folder), scope type (public.restore_scope_type), scope (public.restore_scope),
-- scope type Field (public.restore_context_item), library document (rag.fn_restore_library_document),
-- HR employee (public.hr_employee_restore); a door's
-- refusal is restored=false with a sentence, never a raw update around it.
-- lane STORE-RESTORE-DOORS: a Field, Rule, link, document template or dashboard (token `record`) goes
-- through its own store door (public._trash_store_restore) and a mandate through
-- mandate.definition_restore; the door's own refusal sentence is the answer.
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  e record;
  v_rel regclass;
  v_title_col text;
  v_owner uuid;
  v_title text;
  v_label text;
  v_me_name text;
  v_org_name text;
  v_subject text;
  v_body text;
  v_class text;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_ptitle text;
  v_via_parent boolean := false;
  v_res jsonb;
  v_at timestamptz;
  v_title_expr text;
  v_found boolean;
  v_n int;
  v_why text;
begin
  if p_token = 'record' then
    select r.created_by, r.data_class,
           case when r.data_class = 'table'
                then coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled table')
                when r.data_class = 'record'
                then coalesce(nullif(btrim(custom.record_words(r.organization_id, r.id)), ''), 'Untitled record')
                else coalesce(public._trash_store_title(r.organization_id, r.id), 'Untitled') end
      into v_owner, v_class, v_title
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id
       and r.deleted_at is not null
       and r.data_class in ('table', 'record', 'field', 'rule', 'relation', 'doc_template', 'dashboard');
    if not found then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;
    begin
      perform public._trash_store_restore(p_organization_id, p_id);
    exception
      when insufficient_privilege then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      when check_violation or unique_violation or no_data_found or raise_exception then
        get stacked diagnostics v_why = message_text;
        return jsonb_build_object('restored', false, 'message', v_why);
    end;
    v_label := case v_class when 'table' then 'Table' when 'record' then 'Record' when 'field' then 'Field'
                            when 'rule' then 'Rule' when 'relation' then 'Link'
                            when 'doc_template' then 'Document template' else 'Dashboard' end;
    select 'record'::text as token, v_label as label into e;
  else
    select t.token, t.user_artifact_kind, t.label, t.schema_name, t.table_name,
           coalesce(t.retention_owner_column, 'created_by') as owner_col, t.title_column, t.feature_owned_restore
      into e
      from platform.entity_types t
     where t.token = p_token and t.is_active and t.user_artifact_kind is not null;
    if not found then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;
    if coalesce(e.feature_owned_restore, false) or e.token in ('credential_item', 'user_secret', 'credential_attachment') then
      raise exception 'Vault items are restored by their owner from their own Trash.' using errcode = '42501';
    end if;
    v_rel := to_regclass(format('%I.%I', e.schema_name, e.table_name));
    if v_rel is null then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;

    select a.attname into v_title_col from pg_attribute a
     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
       and a.attname = any (array['label_plural', coalesce(e.title_column, '')])
     order by (a.attname <> 'label_plural') limit 1;
    if v_title_col is null then
      select a.attname into v_title_col from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
       order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
       limit 1;
    end if;

    v_title_expr := case when v_title_col is null then 'null::text' else format('left(t.%I::text, 200)', v_title_col) end;

    -- The parent first: a child of an archived parent only comes back with it.
    for v_i in 1..8 loop
      v_pid := null;
      select ap.parent_token, ap.parent_id, ap.parent_title into v_ptok, v_pid, v_ptitle
        from platform.archived_parent_of(e.token, p_id) ap limit 1;
      exit when v_pid is null;
      if not exists (select 1 from platform.entity_types t
                      where t.token = v_ptok and t.is_active and t.user_artifact_kind is not null) then
        return jsonb_build_object('restored', false,
          'message', format('It is inside %s, which is archived and is not in this organization''s Trash. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_ptitle), ''), 'something')));
      end if;
      v_res := public.org_trash_restore(p_organization_id, v_ptok, v_pid);
      if not coalesce((v_res ->> 'restored')::boolean, false) then
        return v_res;
      end if;
      v_via_parent := true;
    end loop;

    -- The row, in THIS organization (a scope type's Field reads its organization from its scope type).
    if e.token = 'context_item' then
      select true, ci.created_by, left(ci.display_name::text, 200), ci.deleted_at
        into v_found, v_owner, v_title, v_at
        from context.context_items ci
        join context.scope_types st on st.id = ci.scope_type_id
       where ci.id = p_id and st.organization_id = p_organization_id;
    else
      execute format('select true, t.%I, %s, t.deleted_at from %I.%I t where t.id = $1 and t.organization_id = $2',
                     e.owner_col, v_title_expr, e.schema_name, e.table_name)
        into v_found, v_owner, v_title, v_at
        using p_id, p_organization_id;
    end if;
    if not coalesce(v_found, false) or (v_at is null and not v_via_parent) then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;

    if v_at is null then
      -- It came back with its parent (audited and noticed there). A Field comes back in use.
      if e.token = 'context_item' then
        perform public.restore_context_item(p_id);
      end if;
      return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
        'message', format('%s came back with %s.', coalesce(nullif(btrim(v_title), ''), e.label),
                          coalesce(nullif(btrim(v_ptitle), ''), 'what it sits in')));
    end if;

    if e.token in ('folder', 'scope_type', 'scope', 'context_item', 'processed_document', 'hr_employee', 'mandate') then
      begin
        case e.token
          when 'folder' then perform public.restore_folder(p_id);
          when 'scope_type' then perform public.restore_scope_type(p_id);
          when 'scope' then perform public.restore_scope(p_id);
          when 'context_item' then perform public.restore_context_item(p_id);
          when 'processed_document' then perform rag.fn_restore_library_document(p_id);
          when 'mandate' then perform mandate.definition_restore(p_id);
          when 'hr_employee' then
            v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
            if not coalesce((v_res ->> 'ok')::boolean, false) then
              return jsonb_build_object('restored', false,
                'message', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                    'Only someone HR allows to restore this person can bring them back.'));
            end if;
        end case;
      exception when insufficient_privilege or raise_exception or no_data_found then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      end;
    else
      execute format(
        'update %I.%I t set deleted_at = null
          where t.id = $1 and t.organization_id = $2 and t.deleted_at is not null
          returning t.%I, %s',
        e.schema_name, e.table_name, e.owner_col, v_title_expr)
        into v_owner, v_title
        using p_id, p_organization_id;
      get diagnostics v_n = row_count;

      -- (EXECUTE never sets FOUND; the row count is the answer.)
      if v_n = 0 then
        return jsonb_build_object('restored', false,
          'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
      end if;
      if e.token = 'workflow' then
        perform workflow.restore_triggers_archived_with(p_id, v_at);
      end if;
    end if;
    v_label := e.label;
  end if;

  perform iam._org_audit(p_organization_id, v_owner, 'trash.restore',
    jsonb_build_object('entity_token', e.token, 'id', p_id, 'label', v_label, 'title', v_title));

  if v_owner is not null and v_owner is distinct from v_me then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(btrim(u.email), ''), 'An organization admin')
      into v_me_name from auth.users u where u.id = v_me;
    select coalesce(nullif(btrim(o.name), ''), 'your organization') into v_org_name
      from iam.organizations o where o.id = p_organization_id;
    v_subject := format('%s restored your %s', coalesce(v_me_name, 'An organization admin'), lower(v_label));
    v_body := format('%s restored "%s" from %s''s Trash. It is back where it was.',
                     coalesce(v_me_name, 'An organization admin'),
                     coalesce(nullif(btrim(v_title), ''), 'Untitled'), coalesce(v_org_name, 'your organization'));
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
    values
      (p_organization_id, 'trash.restored_by_org_admin', 'in_app', v_owner, 'user',
       format('trash.restore:%s:%s:%s', e.token, p_id, extract(epoch from clock_timestamp())::bigint),
       v_subject, left(v_body, 600),
       jsonb_build_object('entity_token', e.token, 'id', p_id, 'by', v_me, 'source', 'org_trash_restore',
                          'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       e.token, p_id, null, 'personal'::platform.visibility)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
    'message', format('%s restored.', coalesce(nullif(btrim(v_title), ''), v_label)));
end;
$function$;

-- ── 5. THE DOOR ROWS, DECLARED BEFORE THE GRANTS (DD-223) ─────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select d.schema_name, d.function_name, iam.door_identity_args(d.fn), d.argtypes, d.reason,
       'migrations/campaign/storerestoredoors_a_removed_field_rule_link_template_dashboard_or_mandate_comes_back_from_trash.sql (lane STORE-RESTORE-DOORS)',
       d.non_client_lane, d.non_client_lane is null, false
  from (values
    ('custom', 'field_restore', 'custom.field_restore(uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid],
     'The undo of custom.field_retire, called from Trash through entity_undelete / org_trash_restore. custom.assert_client_may_reach refuses a caller outside p_organization_id (42501); p_field_id is narrowed to that organization (another tenant''s id reads as absent, 02000); then custom.assert_client_may_change(admin on the field''s Table) — the rung field_retire climbs. Brings back the set retired together, the Table''s declaration of it and the links withdrawn with it; the values never left the records.',
     null::text),
    ('custom', 'rule_restore', 'custom.rule_restore(uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid],
     'The undo of removing a Rule (custom.record_delete / a delete through custom.rule). Membership (custom.assert_client_may_reach), the Rule narrowed to p_organization_id (02000 otherwise), then custom.assert_client_may_change(editor on the Rule) — the rung removing it climbs. The Rule''s own guards judge it coming back.',
     null::text),
    ('custom', 'relation_restore', 'custom.relation_restore(uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid],
     'The undo of custom.relation_uncarry. Membership, the link narrowed to p_organization_id (02000 otherwise), both records live, then custom.assert_client_may_change(editor on the record the link reaches) — the rung unlinking climbs. A link made again since is not made twice (23505).',
     null::text),
    ('custom', 'doc_template_restore', 'custom.doc_template_restore(uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid],
     'The undo of custom.doc_template_delete. Membership, the template narrowed to p_organization_id (02000 otherwise), its Table live, then custom.assert_client_may_change(editor on the Table it renders) — the rung the removal climbs.',
     null::text),
    ('custom', 'dashboard_restore', 'custom.dashboard_restore(uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid],
     'The undo of custom.dashboard_delete. Membership, the dashboard narrowed to p_organization_id (02000 otherwise), then custom.assert_client_may_change(admin on the dashboard) — the rung dashboard_delete climbs.',
     null::text),
    ('mandate', 'definition_restore', 'mandate.definition_restore(uuid)'::regprocedure,
     array['uuid'::regtype::oid],
     'Brings an archived mandate back from Trash (entity_undelete / org_trash_restore). SECURITY DEFINER; asks what archiving one asks (mandate.definition owner-writes policy): a platform admin, or for a person-made mandate outside the system organization iam.has_access(mandate, id, admin); 42501 otherwise. The declared soft-delete cascade brings its bindings, treatments, exemplars and notes back.',
     null::text),
    ('public', '_trash_store_children', 'public._trash_store_children(uuid, uuid, uuid, text, integer)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'int4'::regtype::oid],
     'The one predicate for the five record-store Trash kinds (Field, Rule, link, document template, dashboard). Reads only.',
     'server_only: called only inside public._trash_kind_rows and public._trash_kind_counts, whose callers (trash_list / org_trash_list behind public._org_trash_gate) decide the seat; execute is revoked from every client role.'),
    ('public', '_trash_store_title', 'public._trash_store_title(uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid],
     'The words Trash shows for one record-store row. Reads only.',
     'server_only: called only inside public._trash_kind_rows and public.org_trash_restore; execute is revoked from every client role.'),
    ('public', '_trash_store_restore', 'public._trash_store_restore(uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid],
     'Routes a record-store Trash restore to its class''s own door, which decides the caller.',
     'server_only: called only inside public.entity_undelete and public.org_trash_restore; every door it calls decides the caller itself; execute is revoked from every client role.')
  ) as d(schema_name, function_name, fn, argtypes, reason, non_client_lane)
 where not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = d.schema_name and x.function_name = d.function_name
                      and x.identity_argtypes = d.argtypes);

-- ── 6. THE GRANTS ─────────────────────────────────────────────────────────────────────────────
grant execute on function custom.field_restore(uuid, uuid) to authenticated, service_role;
grant execute on function custom.rule_restore(uuid, uuid) to authenticated, service_role;
grant execute on function custom.relation_restore(uuid, uuid) to authenticated, service_role;
grant execute on function custom.doc_template_restore(uuid, uuid) to authenticated, service_role;
grant execute on function custom.dashboard_restore(uuid, uuid) to authenticated, service_role;
grant execute on function mandate.definition_restore(uuid) to authenticated, service_role;

-- ── 7. MANDATES ARE A TRASH KIND OF THEIR OWN ─────────────────────────────────────────────────
-- Mandates are their own thing (never under Agents): kind `mandate`, label "Mandate" (the registry
-- label read "Mandate Definition (new)", which no person should read in Trash).
update platform.entity_types
   set user_artifact_kind = 'mandate', label = 'Mandate'
 where token = 'mandate' and schema_name = 'mandate' and table_name = 'definition'
   and user_artifact_kind is null;
do $m$
begin
  if not exists (select 1 from platform.entity_types where token = 'mandate' and user_artifact_kind = 'mandate' and is_active) then
    raise exception 'storerestoredoors: the mandate registry row did not take its Trash kind';
  end if;
end
$m$;
