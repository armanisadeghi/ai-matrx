-- INVERSE of migrations/campaign/anonlanes_the_optin_withdraws_an_undeclared_lane.sql
-- (lane ANON-LANES)
--
-- Removes the withdrawal arm from `iam.apply_table_grants` by cutting the block back out of the
-- LIVE body — never by replacing the function from a file copy, for db-rules line 491's reason.
-- The pending-withdrawal column and its one row are left in place: they describe a measured fact
-- about platform.feature_knob that stays true whether or not the arm is installed, and dropping a
-- column is not something an inverse should do to a live registry table.

do $unpatch$
declare
  v_src text := pg_get_functiondef('iam.apply_table_grants'::regproc);
  v_start int;
  v_end int;
  v_anchor constant text := '  -- service_role is the server''s bypass lane and always needs full reach.';
  v_marker constant text := '  -- 🚨 THE SYMMETRIC HALF OF THE OPT-IN (lane ANON-LANES, DD-249 / R12).';
begin
  if position('anon_lane_pending_withdrawal_reason' in v_src) = 0 then
    raise notice 'iam.apply_table_grants does not carry the withdrawal arm — nothing to undo.';
    return;
  end if;
  v_start := position(v_marker in v_src);
  if v_start = 0 then
    raise exception 'iam.apply_table_grants: the withdrawal arm is present but its marker is not — the body has moved. Read it before cutting.'
      using errcode = '22023';
  end if;
  v_end := position(v_anchor in substr(v_src, v_start));
  if v_end = 0 then
    raise exception 'iam.apply_table_grants: no service_role anchor after the withdrawal arm — the body has moved.'
      using errcode = '22023';
  end if;
  execute substr(v_src, 1, v_start - 1) || substr(v_src, v_start + v_end - 1);
  raise notice 'iam.apply_table_grants: the withdrawal arm is removed.';
end
$unpatch$;
