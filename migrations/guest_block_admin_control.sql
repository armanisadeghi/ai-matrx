-- guest_block_admin_control.sql
--
-- A super admin can BLOCK and UNBLOCK a guest (users.guest_executions row).
--
-- WHY: aidream 754ce7937 (2026-09-10) refuses a guest whose row has
-- is_blocked = true (and blocked_until unset or still in the future) at the
-- auth boundary with 403 `guest_blocked`, and public.check_guest_execution_limit
-- applies the same rule. Nothing on the platform ever SET the flag, so the
-- refusal could never fire and an abusive guest could not be stopped.
--
-- THE ONE WRITE PATH: public.admin_set_guest_block. SECURITY DEFINER, gated in
-- the body by public.is_super_admin() (42501 for anyone else, including the
-- signed-out and plain platform admins), row-locked, and it keeps its own
-- audit trail ON THE ROW in metadata.admin_block_history (who, when, what,
-- the reason, the end time, and the state it replaced; last 50 entries).
--   * admin.admin_audit_log is not the home: its target_user_id and
--     organization_id are NOT NULL and a guest row has neither, and its action
--     CHECK plus the admins page read only promote/update/revoke.
--   * No new table: the row is the subject, and history beside it is read by
--     the same admin projection that shows the block.
--
-- Unblocking clears blocked_until and blocked_reason; the history keeps them.
-- A block's end time must be in the future (a past end time would write a
-- block that never takes effect and read as "blocked" to a careless reader).
--
-- New function -> no `-- based-on:` line. Door row precedes the GRANT (§6d-4).
-- Idempotent.

create or replace function public.admin_set_guest_block(
  p_guest_id uuid,
  p_blocked boolean,
  p_reason text default null,
  p_blocked_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_guest users.guest_executions%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_metadata jsonb;
  v_history jsonb;
  v_len integer;
begin
  if v_actor is null or not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  if p_guest_id is null or p_blocked is null then
    raise exception 'A guest id and a blocked flag are required' using errcode = '22023';
  end if;

  if p_blocked and p_blocked_until is not null and p_blocked_until <= now() then
    raise exception 'A block must end in the future (got %)', p_blocked_until
      using errcode = '22023';
  end if;

  if not p_blocked and p_blocked_until is not null then
    raise exception 'Unblocking takes no end time' using errcode = '22023';
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'The reason is limited to 500 characters' using errcode = '22001';
  end if;

  select * into v_guest
  from users.guest_executions
  where id = p_guest_id
  for update;

  if not found then
    raise exception 'Guest not found' using errcode = 'P0002';
  end if;

  v_metadata := case
    when jsonb_typeof(v_guest.metadata) = 'object' then v_guest.metadata
    else '{}'::jsonb
  end;
  v_history := case
    when jsonb_typeof(v_metadata -> 'admin_block_history') = 'array'
      then v_metadata -> 'admin_block_history'
    else '[]'::jsonb
  end;
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'action', case when p_blocked then 'block' else 'unblock' end,
    'actor_user_id', v_actor,
    'at', now(),
    'reason', v_reason,
    'blocked_until', case when p_blocked then p_blocked_until end,
    'previous', jsonb_build_object(
      'is_blocked', coalesce(v_guest.is_blocked, false),
      'blocked_until', v_guest.blocked_until,
      'blocked_reason', v_guest.blocked_reason
    )
  ));
  v_len := jsonb_array_length(v_history);
  if v_len > 50 then
    select jsonb_agg(e order by ord)
    into v_history
    from jsonb_array_elements(v_history) with ordinality as t(e, ord)
    where ord > v_len - 50;
  end if;

  update users.guest_executions
  set is_blocked = p_blocked,
      blocked_until = case when p_blocked then p_blocked_until end,
      blocked_reason = case when p_blocked then v_reason end,
      metadata = jsonb_set(v_metadata, '{admin_block_history}', v_history, true)
  where id = p_guest_id
  returning * into v_guest;

  return jsonb_build_object(
    'guest_id', v_guest.id,
    'is_blocked', coalesce(v_guest.is_blocked, false),
    'block_active', coalesce(v_guest.is_blocked, false)
      and (v_guest.blocked_until is null or v_guest.blocked_until > now()),
    'blocked_until', v_guest.blocked_until,
    'blocked_reason', v_guest.blocked_reason,
    'updated_at', v_guest.updated_at
  );
end;
$function$;

comment on function public.admin_set_guest_block(uuid, boolean, text, timestamptz) is
  'Super-admin-only block/unblock of one users.guest_executions row. A block (optional future end time, optional reason) makes aidream refuse that fingerprint with 403 guest_blocked and check_guest_execution_limit refuse it. Appends metadata.admin_block_history (last 50). The ONE write path for is_blocked / blocked_until / blocked_reason.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers, anonymous_purpose)
values
  ('public', 'admin_set_guest_block',
   'p_guest_id uuid, p_blocked boolean, p_reason text, p_blocked_until timestamp with time zone',
   'guest blocking admin control (2026-09-15)',
   'SIGNED-IN door (authenticated only). Blocks or unblocks one guest registry row from /administration/users/acquisition; body refuses anyone who is not a super admin (public.is_super_admin()) with 42501.',
   false, null)
on conflict do nothing;

revoke all on function public.admin_set_guest_block(uuid, boolean, text, timestamptz) from public, anon;
grant execute on function public.admin_set_guest_block(uuid, boolean, text, timestamptz) to authenticated, service_role;
