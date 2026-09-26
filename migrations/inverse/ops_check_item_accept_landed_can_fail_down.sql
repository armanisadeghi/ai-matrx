-- chair-step: restores the 2026-09-26g body of ops.check_item_accept_finish (committing → landed|failed only), withdrawing the landed → failed transition of ops_check_item_accept_landed_can_fail_2026_09_26h.sql; a landed marker becomes permanent again (the MARK-OK-VERIFY D1 defect returns).
-- based-on: ops.check_item_accept_finish(uuid, text, jsonb) 46d65802c5a5afced1611eef9a56de21a340951f0d34f2856708f57446caa046
--
-- Inverse of migrations/ops_check_item_accept_landed_can_fail_2026_09_26h.sql (named without its date so the ledger slot guard reads no number).

create or replace function ops.check_item_accept_finish(p_item_id uuid, p_status text, p_detail jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_meta jsonb;
  v_pending jsonb;
begin
  if p_status is null or p_status not in ('landed', 'failed') then
    raise exception 'check_item_accept_finish: status % is not landed|failed', p_status using errcode = '22023';
  end if;
  select metadata into v_meta from ops.check_item where id = p_item_id for update;
  if not found then
    raise exception 'check_item_accept_finish: no ops.check_item %', p_item_id using errcode = 'P0002';
  end if;
  v_pending := v_meta -> 'pending_accept';
  if v_pending is null or v_pending ->> 'status' <> 'committing' then
    raise exception 'check_item_accept_finish: item % has no accept in flight (pending_accept.status is %)',
      p_item_id, coalesce(v_pending ->> 'status', 'absent') using errcode = '55000';
  end if;
  v_pending := v_pending || coalesce(p_detail, '{}'::jsonb)
               || jsonb_build_object('status', p_status, 'finished_at', now());
  perform set_config('app.user_id', '87a6e699-3622-4869-8843-d0867456c0dd', true);
  update ops.check_item
     set metadata = v_meta || jsonb_build_object('pending_accept', v_pending)
   where id = p_item_id;
  return v_pending;
end;
$function$;
