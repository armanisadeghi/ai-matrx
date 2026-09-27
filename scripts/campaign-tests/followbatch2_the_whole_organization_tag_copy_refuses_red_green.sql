-- LANE FOLLOW-BATCH-2 — THE WHOLE-ORGANIZATION TAG COPY NO LONGER HOLDS THE SIGN-IN TABLE, measured RED
-- then GREEN on the dev clone. Plain SQL, one transaction, rolled back: nothing stays.
--
-- THE USE CASE. A peer's hand repair on the clone called custom.context_tag_copy(<Arman's Org>) and held
-- auth.users for more than five minutes: one transaction for 11,316 tag edges, every new copy's
-- created_by foreign key locking the sign-in table until COMMIT. The door must refuse in a sentence that
-- names the batch door a caller commits after each step, and the batch door must still copy.
--
--   T1  custom.context_tag_copy(admin's Workspace) refuses with 0A000, copies nothing, and its hint
--       names custom.context_tag_copy_batch               (RED before followbatch2_no_copy_holds_the_sign_in_table.sql: it copies)
--   T2  custom.context_tag_copy_batch(admin's Workspace, null, null) still answers a step with its counts
--   T3  the knobs copy/max_auth_lock_ms (1000) and copy/batch_records are seeded
begin;
do $$
declare
  v_org  uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin@admin.com's Workspace (test account)
  v_hint text; v_state text; v_msg text;
  r      jsonb;
begin
  begin
    r := custom.context_tag_copy(v_org);
    raise exception 'T1 RED: custom.context_tag_copy ran a whole organization in one transaction and answered %', left(r::text, 300);
  exception when feature_not_supported then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  end;
  if v_hint not like '%custom.context_tag_copy_batch%' or v_msg not like '%sign-in table%' then
    raise exception 'T1: the refusal does not name the batch door and why (% / %)', v_msg, v_hint;
  end if;

  r := custom.context_tag_copy_batch(v_org, null, null);
  if r is null or not (r ? 'made' and r ? 'next') then
    raise exception 'T2 RED: the batch door did not answer a step (%)', r;
  end if;

  if (select (value #>> '{}')::int from platform.feature_knob where feature = 'copy' and key = 'max_auth_lock_ms') is distinct from 1000
     or not exists (select 1 from platform.feature_knob where feature = 'copy' and key = 'batch_records') then
    raise exception 'T3 RED: the copy knobs are not seeded';
  end if;
  raise notice 'GREEN T1 T2 T3: refused (%), batch answered %', v_state, left(r::text, 200);
end $$;
rollback;
select 'GREEN' as result;
