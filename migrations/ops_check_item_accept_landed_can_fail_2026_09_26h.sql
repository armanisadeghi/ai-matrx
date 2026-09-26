-- based-on: ops.check_item_accept_finish(uuid, text, jsonb) 2536a3a2797b57dc2903b213a3a3b5dd377feaf4ffe33347052d02ae92b085e6
--
-- ops_check_item_accept_landed_can_fail_2026_09_26h.sql
--
-- MARK-OK-VERIFY D1 (common-docs/projects/checks-run-in-the-app/MARK-OK-VERIFY.md): a `landed`
-- Mark OK marker could never change again — `_finish` only moved a `committing` marker — so after
-- an accept that did not take (the check still reports the key at a commit that carries it) or a
-- revert, the page kept a Mark OK that answered "Already marked OK — landing" forever.
--
-- `ops.check_item_accept_finish` now also takes `landed → failed`: the server (aidream
-- aidream/services/platform_checks/accept.py) records the true state — "the allowlist entry does
-- not match what the check reads" or "the accept commit is no longer on main" — and a failed marker
-- is claimable again by `ops.check_item_accept_begin` (unchanged). The landed marker it replaces is
-- kept under `superseded` so the history of what landed is never lost. Every other transition is
-- refused exactly as before. Signature, grants and the client_callable_door row are unchanged.

create or replace function ops.check_item_accept_finish(p_item_id uuid, p_status text, p_detail jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_meta jsonb;
  v_pending jsonb;
  v_from text;
begin
  if p_status is null or p_status not in ('landed', 'failed') then
    raise exception 'check_item_accept_finish: status % is not landed|failed', p_status using errcode = '22023';
  end if;
  select metadata into v_meta from ops.check_item where id = p_item_id for update;
  if not found then
    raise exception 'check_item_accept_finish: no ops.check_item %', p_item_id using errcode = 'P0002';
  end if;
  v_pending := v_meta -> 'pending_accept';
  v_from := coalesce(v_pending ->> 'status', 'absent');
  if v_from = 'landed' and p_status = 'failed' then
    -- An accept that landed but did not take (or was reverted): the server says why; the landed
    -- record is kept beside it, and the failed marker can be claimed again.
    if coalesce(btrim(p_detail ->> 'error'), '') = '' then
      raise exception 'check_item_accept_finish: landed → failed needs detail.error (why the landed accept did not take)'
        using errcode = '22023';
    end if;
    v_pending := jsonb_build_object('status', 'failed', 'by', v_pending -> 'by', 'reason', v_pending -> 'reason',
                                    'at', v_pending -> 'at', 'superseded', v_pending)
                 || coalesce(p_detail, '{}'::jsonb)
                 || jsonb_build_object('status', 'failed', 'finished_at', now());
  elsif v_from = 'committing' then
    v_pending := v_pending || coalesce(p_detail, '{}'::jsonb)
                 || jsonb_build_object('status', p_status, 'finished_at', now());
  else
    raise exception 'check_item_accept_finish: item % has no accept in flight (pending_accept.status is %)',
      p_item_id, v_from using errcode = '55000';
  end if;
  perform set_config('app.user_id', '87a6e699-3622-4869-8843-d0867456c0dd', true);
  update ops.check_item
     set metadata = v_meta || jsonb_build_object('pending_accept', v_pending)
   where id = p_item_id;
  return v_pending;
end;
$function$;
