-- B3-15 guard: a strict choice column changed to Text and back is strict again.
\set ON_ERROR_STOP on
begin;
set local lock_timeout = '20s';
\if :{?with_fix}
\i :fix
\endif
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-databasics2b15"}', true);
do $t$
declare
  c_ws   constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  c_tbl  uuid;
  v_home uuid;
  v_st   uuid;
begin
  v_home := custom.record_write(c_ws, custom.person_kernel_id(), jsonb_build_object('name', 'Referral Triage Home'));
  c_tbl := custom.table_declare(c_ws, jsonb_build_object(
    'name', 'Referral triage', 'slug', 'referral_triage_databasics2_b315', 'type', 'entity',
    'label_singular', 'Referral', 'label_plural', 'Referrals', 'display', 'list', 'weight', 'light',
    'ordered', false, 'row_order', 'manual', 'title_field', 'patient', 'retention_days', 365,
    'agent_writable', true, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'patient', 'direction', 'asc')),
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient')), 'parent_id', v_home::text));
  perform custom.field_declare(c_ws, c_tbl, jsonb_build_object('key', 'patient', 'label', 'Patient', 'type', 'text'));
  v_st := custom.field_declare(c_ws, c_tbl, '{"key":"priority","label":"Priority","parity_type":"select","options":["Routine","Urgent","Elective"]}');
  perform custom.field_update(c_ws, v_st, '{"allow_other":false}');
  perform custom.field_update(c_ws, v_st, '{"type":"text"}');
  perform custom.field_update(c_ws, v_st, '{"parity_type":"select","options":["Routine","Urgent","Elective"]}');
  perform set_config('b315.st', v_st::text, true);
end
$t$;
reset role;
do $a$
declare
  d jsonb := (select data from custom.record where id = current_setting('b315.st')::uuid);
begin
  raise notice 'config after the round trip: %', d -> 'config';
  if coalesce((d -> 'config' ->> 'allow_other')::boolean, false) is distinct from false or not (d -> 'config' ? 'allow_other') then
    raise exception 'B3-15: Priority was strict, went to Text and back, and now allow_other = % (expected false)', d -> 'config' -> 'allow_other';
  end if;
  if d -> 'config' ? 'list_kept_allow_other' or d -> 'config' ? 'list_kept' then
    raise exception 'B3-15: the kept keys stayed on the choice column: %', d -> 'config';
  end if;
  raise notice 'GREEN: strict again';
end
$a$;
rollback;
