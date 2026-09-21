-- lane: SECURITY-SWEEP — the inverse of
-- migrations/campaign/secsweep_eleven_tables_no_client_writes.sql
-- Re-opens direct client writes on eleven tables whose user_id the generated policies pin
-- nothing about. Run only to prove the pair reverses (rule 27).
do $$
declare r record;
begin
  for r in select * from (values
      ('dictionary','dict_entries'),('dictionary','dict_settings'),
      ('canvas','canvas_comments'),('canvas','canvas_likes'),('canvas','canvas_views'),
      ('canvas','canvas_scores'),('canvas','canvas_comment_likes'),
      ('public','app_settings'),('public','app_sync_status'),
      ('users','user_bookmarks'),('users','user_stats')
    ) as t(schema_name, table_name)
  loop
    execute format('drop policy if exists %I on %I.%I', r.table_name || '_client_insert_refused', r.schema_name, r.table_name);
    execute format('drop policy if exists %I on %I.%I', r.table_name || '_client_update_refused', r.schema_name, r.table_name);
    execute format('drop policy if exists %I on %I.%I', r.table_name || '_client_delete_refused', r.schema_name, r.table_name);
  end loop;
end $$;
