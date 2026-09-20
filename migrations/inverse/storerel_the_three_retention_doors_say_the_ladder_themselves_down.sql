-- STORE-REL 6b's inverse - the three doors back to the bodies that reached the ladder only
-- through custom.assert_organization_admin, which is what check:store-doors-decide calls red.

CREATE OR REPLACE FUNCTION custom.history_retention_set(p_organization_id uuid, p_table_id uuid, p_days integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_organization_admin(p_organization_id, 'custom.history_retention_set',
                                           'change how long a table keeps its history');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.history_retention_set');
  perform custom.assert_store_door(p_organization_id, 'custom.history_retention_set');
  -- The refusal T14 names - "History here is kept for at least 30 days, so this table cannot
  -- keep only 10" - is `history.retention_set`'s own sentence, unchanged. This door only
  -- decides who may ask.
  return history.retention_set(p_organization_id, p_table_id, p_days);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.history_retention_floor_raise(p_organization_id uuid, p_days integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_organization_admin(p_organization_id, 'custom.history_retention_floor_raise',
                                           'raise how long this organization keeps its history');
  perform custom.assert_store_door(p_organization_id, 'custom.history_retention_floor_raise');
  -- HIS-3: thirty is the platform minimum and an organization may only ever RAISE it. That
  -- rule lives in history.retention_floor_raise and is untouched here.
  return history.retention_floor_raise(p_organization_id, p_days);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.history_prune(p_organization_id uuid, p_scope text DEFAULT 'values'::text, p_table_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_organization_admin(p_organization_id, 'custom.history_prune',
                                           'prune this organization''s history');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.history_prune');
  end if;
  perform custom.assert_store_door(p_organization_id, 'custom.history_prune');
  -- EVERY RULE STAYS WHERE IT IS. HIS-4's refusal to prune the Migration log, the
  -- two-most-recent-versions policy, the retention cutoff and the guard over any row the
  -- Migration log names are all `history.prune`'s, and it answers with what it would take
  -- when p_dry_run is true - which is the shape T14's sixty-days-later clause needs.
  return history.prune(p_organization_id, p_scope, p_table_id, p_dry_run);
end;
$function$;

