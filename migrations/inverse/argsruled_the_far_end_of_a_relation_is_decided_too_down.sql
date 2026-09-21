-- INVERSE of migrations/campaign/argsruled_the_far_end_of_a_relation_is_decided_too.sql.
--
-- It restores both bodies exactly as they stood before that file: platform.relation_label
-- reading the title of any row of any entity type with no access decision on p_target_id,
-- and platform.relation_history falling through to history.row_versions when the edge has
-- no record source. With this applied, scripts/campaign-tests/argsruled_red.sql passes
-- again — which is what makes the red-then-green a measurement rather than a story.
--
-- chair-step: it replaces two live client-door bodies.
--
-- based-on: platform.relation_label(uuid, text, uuid) eb1f85b2b34a367a4cc42f8879fb1ec0a3e8772e28e043ae7ff73d6e3b41b344
-- based-on: platform.relation_history(uuid, uuid) 7e1dad108ac84ef119c5797ee0a5ca20dd1e79826d7a1ee30febcf879e9b34ec

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION platform.relation_history(p_organization_id uuid, p_association_id uuid)
 RETURNS TABLE(version integer, operation text, at_time timestamp with time zone, actor_id uuid, role text, target_type text, target_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
$function$


;

CREATE OR REPLACE FUNCTION platform.relation_label(p_organization_id uuid, p_target_type text, p_target_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    if v_title is not null then
      v_title := custom._card_words(p_organization_id, v_title, 'record');
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
$function$
;
