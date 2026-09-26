-- chair-step: lane MOVER-DELETIONS, second file (found by the clone test on the first). REPLACES platform.cutover_carry_removals(uuid,uuid[]): a removed column's mark is written BEFORE custom.field_retire, because a retired column's record is no longer declared by its Table and the field guard refused the mark afterwards, so a column removed on the older table was named but never archived on the copy. REPLACES platform.cutover_difference_sentence(text,jsonb): the shares sentence said "Copying again carries the share the copy is missing" for a share the rerun now TAKES BACK; it now says both. No row of any table is written. No lock beyond two function definitions.
-- based-on: platform.cutover_carry_removals(uuid, uuid[]) d2da3ff8191bdf94ec56730e0264b544b55113a12d47c4668ee6678739e79f08
-- based-on: platform.cutover_difference_sentence(text, jsonb) 734b253104919664ce43e5245eb0b8dcbf7271ce017ef85de04e33210048a7ad
-- lane: MOVER-DELETIONS
-- INVERSE: migrations/inverse/moverdeletions_c_a_removed_column_is_marked_before_it_is_retired_down.sql

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

CREATE OR REPLACE FUNCTION platform.cutover_difference_sentence(p_kind text, p_part jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- MOVER-CARRY-TAILS: the one sentence a Data tables switch check says about one kind of difference
-- (colours, checks, formats, shares) — what differs, and for each difference whether copying again
-- clears it or what to do instead. Read by platform._cutover_seam_readiness.
declare
  v_n      integer := coalesce((p_part ->> 'count')::int, 0);
  v_clears integer := least(coalesce((p_part ->> 'clears')::int, 0), coalesce((p_part ->> 'count')::int, 0));
  v_ex     text := (select string_agg(x, '; ') from jsonb_array_elements_text(coalesce(p_part -> 'examples', '[]'::jsonb)) x);
  v_left   text := (select string_agg(x, '; ') from jsonb_array_elements_text(coalesce(p_part -> 'leaves', '[]'::jsonb)) x);
  v_head   text;
  v_all    text;
  v_rest   text;
begin
  if v_n = 0 then
    return case p_kind
      when 'colours' then 'Every row, column and cell colour, colour-by and colour rule matches its older table.'
      when 'checks' then format('The older tables'' writes of the last 30 days and every row edited since its copy (%s judged%s) would all be taken by the copies.',
                                coalesce(p_part ->> 'judged', '0'),
                                case when coalesce((p_part ->> 'capped')::boolean, false) then ', the newest first' else '' end)
      when 'formats' then 'Every column keeps its format (currency, percent, email, choice, date and the rest).'
      else 'Everyone who holds an older table holds its copy at the same level, and nobody else does.' end;
  end if;

  v_head := case p_kind
    when 'colours' then format('%s %s, in %s %s', v_n, case when v_n = 1 then 'colour differs' else 'colours differ' end,
                               coalesce(p_part ->> 'tables', '1'), case when coalesce(p_part ->> 'tables', '1') = '1' then 'table' else 'tables' end)
    when 'checks' then format('%s %s the older tables took would be refused by the copies', v_n, case when v_n = 1 then 'kind of write' else 'kinds of write' end)
    when 'formats' then format('%s %s', v_n, case when v_n = 1 then 'column differs' else 'columns differ' end)
    else format('%s %s', v_n, case when v_n = 1 then 'share differs' else 'shares differ' end) end;

  v_all := case p_kind
    when 'colours' then 'Copying again brings the older table''s colours.'
    when 'checks' then 'Copying again brings the older tables'' newer choices and takes off a check the older table never enforced.'
    when 'formats' then 'Copying again brings the older table''s format.'
    else 'Copying again makes the copy''s shares match the older table''s: it carries a share the copy is missing and takes back one the older table no longer gives.' end;

  if v_clears >= v_n then
    v_rest := v_all;
  elsif v_clears = 0 and v_left is not null then
    -- Nothing here clears: each difference is named once, with what to do instead.
    return v_head || '. ' || case when v_n = 1 then 'Copying again does not change it: ' else 'Copying again does not change these: ' end
           || v_left || '.';
  elsif v_clears = 0 then
    v_rest := 'Copying again does not change these.';
  else
    v_rest := format('Copying again clears %s of them; for the other %s: %s.', v_clears, v_n - v_clears, coalesce(v_left, 'see each one above'));
  end if;
  return v_head || coalesce(': ' || v_ex, '') || '. ' || v_rest;
end;
$function$;
