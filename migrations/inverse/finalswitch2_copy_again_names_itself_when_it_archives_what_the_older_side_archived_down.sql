-- chair-step: INVERSE of migrations/campaign/finalswitch2_copy_again_names_itself_when_it_archives_what_the_older_side_archived.sql (lane FINAL-SWITCH-2). Puts back platform.cutover_carry_removals as LIST-COPY-PERMISSIVE / MOVER-DELETIONS left it (no system named for its own writes).
-- based-on: platform.cutover_carry_removals(uuid, uuid[]) 65cadc3f7d339758776d536ec226f8a7852c58c605980cfe8f3d4fe78e054b36
-- lane: FINAL-SWITCH-2

CREATE OR REPLACE FUNCTION platform.cutover_carry_removals(p_org uuid, p_tables uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r       record;
  v_done    jsonb := '{}'::jsonb;
  v_refused text[] := '{}';
  v_at      timestamptz := clock_timestamp();
  v_mark    jsonb;
  v_grant   jsonb;
  v_n       integer := 0;
  v_f       record;
  v_word    jsonb;
  v_key     text;
begin
  for v_r in select * from platform.cutover_older_removal_rows(p_org, p_tables)
              order by case when kind like '%\_back' escape '\' then 1 when kind in ('table', 'list') then 2 else 3 end, table_name, kind, record_id
  loop
    begin
      v_mark := jsonb_build_object('removed_on_older', jsonb_build_object(
                  'kind', v_r.kind, 'at', v_at,
                  'why', 'removed on the older side while it was the truth; copying again archived it here (lane MOVER-DELETIONS)'));
      if v_r.kind in ('row', 'choice') and v_r.kept_image then
        update platform.cutover_evaluation_write e
           set pre_image = jsonb_set(jsonb_set(e.pre_image, '{deleted_at}', to_jsonb(v_at)),
                                     '{metadata}', coalesce(e.pre_image -> 'metadata', '{}'::jsonb) || v_mark)
         where e.organization_id = p_org and e.record_id = v_r.record_id and e.replaced_at is null and not e.created;
      elsif v_r.kind in ('row', 'choice', 'table', 'list', 'column') then
        -- The mark goes on FIRST, while the record is live and its table still declares it: a retired
        -- column's record is no longer declared by its Table, and the field guard refuses any later
        -- write to it ("the table does not declare a field called truck" — the clone test, 2026-09-26).
        -- The savepoint takes the mark back if the door refuses.
        update custom.record set metadata = coalesce(metadata, '{}'::jsonb) || v_mark
         where organization_id = p_org and id = v_r.record_id;
        if v_r.kind = 'column' then
          perform custom.field_retire(p_org, v_r.record_id);
        else
          -- A table or list is archived with what it holds, as one archive event.
          perform custom.record_delete(p_org, v_r.record_id);
        end if;
      elsif v_r.kind = 'invented_choice' then
        -- LIST-COPY-PERMISSIVE. The copy never invents a choice: every column choosing from this
        -- list takes other values (the older lists did), the choice is archived (restorable, never
        -- deleted), and each cell that held it holds the words it came from, as an other value.
        -- Order matters: the setting first, so the rewritten cell is kept; the archive before the
        -- rewrite, so the words no longer resolve to a live choice.
        select coalesce(nullif(r.metadata ->> 'option_key', ''), '') , to_jsonb(coalesce(nullif(r.data ->> 'name', ''), r.data ->> 'title'))
          into v_key, v_word
          from custom.record r where r.organization_id = p_org and r.id = v_r.record_id;
        for v_f in
          select f.id, f.data ->> 'key' as k, (f.data ->> 'entity_definition_id')::uuid as tbl,
                 coalesce((f.data -> 'config' ->> 'allow_other')::boolean, false) as allows
            from custom.record f
           where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
             and f.data ->> 'type' = 'list'
             and f.data -> 'config' ->> 'options_table_id' = v_r.table_id::text
        loop
          if not v_f.allows then
            perform custom.field_update(p_org, v_f.id, jsonb_build_object('allow_other', true));
          end if;
        end loop;
        update custom.record set metadata = coalesce(metadata, '{}'::jsonb) || v_mark
         where organization_id = p_org and id = v_r.record_id;
        perform custom.record_delete(p_org, v_r.record_id);
        for v_f in
          select f.data ->> 'key' as k, (f.data ->> 'entity_definition_id')::uuid as tbl
            from custom.record f
           where f.organization_id = p_org and f.data_class = 'field' and f.deleted_at is null
             and f.data ->> 'type' = 'list'
             and f.data -> 'config' ->> 'options_table_id' = v_r.table_id::text
        loop
          update custom.record c
             set data = jsonb_set(c.data, array[v_f.k],
                   case when jsonb_typeof(c.data -> v_f.k) = 'array'
                        then (select jsonb_agg(case when e = to_jsonb(v_key) or e = to_jsonb(v_r.record_id::text) then v_word else e end order by o)
                                from jsonb_array_elements(c.data -> v_f.k) with ordinality x(e, o))
                        else v_word end)
           where c.organization_id = p_org and c.table_id = v_f.tbl and c.data_class = 'record'
             and v_key <> ''
             and (c.data -> v_f.k = to_jsonb(v_key) or c.data -> v_f.k = to_jsonb(v_r.record_id::text)
                  or (jsonb_typeof(c.data -> v_f.k) = 'array'
                      and (c.data -> v_f.k @> jsonb_build_array(v_key) or c.data -> v_f.k @> jsonb_build_array(v_r.record_id::text))));
        end loop;
      elsif v_r.kind = 'share' then
        select to_jsonb(p) into v_grant from iam.permissions p where p.id = v_r.record_id;
        perform custom.share_revoke(p_org, v_r.table_id, v_r.principal_kind,
                                    coalesce((v_grant ->> 'granted_to_user_id')::uuid, (v_grant ->> 'granted_to_organization_id')::uuid));
        update custom.record
           set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{shares_taken_back}',
                                    coalesce(metadata -> 'shares_taken_back', '[]'::jsonb)
                                    || jsonb_build_array(v_grant || jsonb_build_object('taken_back_at', v_at,
                                         'why', 'the older table no longer shares with them (lane MOVER-DELETIONS)')))
         where organization_id = p_org and id = v_r.table_id and data_class = 'table';
      elsif v_r.kind = 'column_back' then
        perform custom.field_restore(p_org, v_r.record_id);
        update custom.record set metadata = metadata - 'removed_on_older' where organization_id = p_org and id = v_r.record_id;
      elsif v_r.kind like '%\_back' escape '\' then
        perform custom.record_restore(p_org, v_r.record_id);
        update custom.record set metadata = metadata - 'removed_on_older' where organization_id = p_org and id = v_r.record_id;
      end if;
      v_done := jsonb_set(v_done, array[v_r.kind], to_jsonb(coalesce((v_done ->> v_r.kind)::int, 0) + 1));
    exception when others then
      v_refused := v_refused || format('%s — %s: %s', coalesce(v_r.table_name, 'a table'), v_r.what, sqlerrm);
    end;
  end loop;

  -- Whom each copied table's older table shares with, now: what the next run compares against.
  update custom.record t
     set metadata = jsonb_set(coalesce(t.metadata, '{}'::jsonb), '{older_shares_seen}', coalesce((
           select jsonb_agg(distinct coalesce(q.granted_to_user_id, q.granted_to_organization_id)::text)
             from iam.permissions q
            where q.resource_type = 'dataset' and q.resource_id = t.id and q.status = 'active'
              and not coalesce(q.is_public, false)), '[]'::jsonb))
    from workbench.udt_datasets d
   where t.organization_id = p_org and t.id = d.id and t.data_class = 'table' and t.deleted_at is null
     and d.organization_id = p_org and d.deleted_at is null
     and (p_tables is null or d.id = any (p_tables))
     and (platform._cutover_seam_last_done('older_tables', p_org)).direction is distinct from 'new'
     and t.metadata -> 'older_shares_seen' is distinct from coalesce((
           select jsonb_agg(distinct coalesce(q.granted_to_user_id, q.granted_to_organization_id)::text)
             from iam.permissions q
            where q.resource_type = 'dataset' and q.resource_id = t.id and q.status = 'active'
              and not coalesce(q.is_public, false)), '[]'::jsonb);
  get diagnostics v_n = row_count;

  return jsonb_build_object('carried', v_done, 'refused', to_jsonb(v_refused), 'share_marks', v_n, 'at', v_at);
end;
$function$;
