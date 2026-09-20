-- STORE-ASOF (3a of 4) — THE INVERSE. `history.grant_capture` goes back to asking the
-- platform value, which is what made a real person's share invisible to history. Verbatim
-- the body that stood on the main database before this lane.

set lock_timeout = '5s';
set statement_timeout = '180s';

CREATE OR REPLACE FUNCTION history.grant_capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
  v_op  text;
begin
  -- THE GUARD, through the one predicate. `iam.permissions` is a LIVE table with eight other
  -- triggers on it, so this body is inert — never raising — while the campaign's switch is
  -- off. custom/row_versions_guard is what turns it on.
  if not history.capture_is_open(null) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_row := to_jsonb(old); v_op := 'DELETE';
  else
    v_row := to_jsonb(new);
    v_op  := case when tg_op = 'INSERT' then 'INSERT' else 'UPDATE' end;
  end if;

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier)
  values ('iam.permissions', (v_row ->> 'id')::uuid,
          nullif(v_row ->> 'granted_to_organization_id', '')::uuid,
          1, v_op, v_row,
          coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
          platform.actor_tier());

  insert into history.capture_window (entity_type, note)
  values ('iam.permissions', 'VIS-16: W3-HIST''s grant capture — "who could see R on date D" is replayed from these rows')
  on conflict (entity_type) do nothing;

  return coalesce(new, old);
end;
$function$

;

