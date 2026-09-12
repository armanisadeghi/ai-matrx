-- iam_definer_class_arm3b_fix_dd162d — THE CONTAINER ARM WAS OUT OF SCOPE AT RUN TIME
-- (DD-162, follow-up to iam_definer_class_doors_dd162.)
--
-- `iam.assert_may_transfer`'s kernel arm declared its result inside a nested block and tested it
-- after that block ended — out of scope. PL/pgSQL compiles a function body lazily, so nothing said a
-- word until the arm actually ran, and the migration's own proof never ran it: it called the door
-- without a container, so ARM 3b was skipped every time. What ran it was a live rehearsal, rolled
-- back, of the two flows mbr_add is on the critical path for — a person creating an organization and
-- claiming their first membership in it. It failed with `column "v_kernel" does not exist`, which
-- would have been every new organization on the platform.
--
-- The variable moves to the function's own DECLARE, and the proof below runs BOTH flows.

create or replace function iam.assert_may_transfer(
  p_token        text,
  p_row_owner    uuid,
  p_target_owner uuid,
  p_row_org      uuid default null,
  -- The container the row hangs off, when it is not the organization itself (a project, say).
  -- Passed as a QUESTION for the kernel, never as an assertion that the caller already checked.
  p_container_type text default null,
  p_container_id   uuid default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid    uuid    := auth.uid();
  v_class  text;
  v_why    text;
  -- 🚨 DECLARED HERE, NOT INSIDE THE IF. The first version declared it in a nested block and read it
  -- after that block's `end` — where it is out of scope. It compiled, and it failed at RUN time with
  -- `column "v_kernel" does not exist`, on the ONE arm the migration's own proof never exercised:
  -- the bootstrap path, where a person claims their first membership in an organization they just
  -- created. A live rehearsal of organization creation found it; the proof had not.
  v_kernel boolean;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'assert_may_transfer: no token. A door asked about nothing answers nothing.'
      using errcode = '22023';
  end if;

  -- ARM 1 — the server itself. A service-role caller is not a browser and is not subject to a
  -- browser's class gate; it is subject to the code that holds the key.
  if coalesce(auth.role() = 'service_role', false) then return; end if;

  -- ARM 2 — a platform administrator, through the admin door that already audits itself (DD-136).
  if public.is_super_admin() then return; end if;

  -- ARM 3 — an owner or admin OF THE ROW'S OWN ORGANIZATION. This is the answer the three bespoke
  -- checks were each spelling differently; it is resolved here from the kernel's own predicate.
  if p_row_org is not null and v_uid is not null and iam.is_org_manager(p_row_org, v_uid) then
    return;
  end if;

  -- ARM 3b — an admin of the CONTAINER the row hangs off, asked of the kernel (iam.has_access), not
  -- accepted from the caller. A project admin who is not an organization manager lands here.
  if p_container_type is not null and p_container_id is not null and v_uid is not null then
    begin
      v_kernel := iam.has_access(p_container_type, p_container_id, 'admin'::public.permission_level);
    exception when others then
      -- The kernel could not answer. That is NOT a pass and NOT a silent skip: the arm is closed and
      -- the reason travels with the refusal below.
      v_kernel := false;
      perform set_config('iam.transfer_door_kernel_error', sqlerrm, true);
    end;
    if v_kernel then return; end if;
  end if;

  -- ARM 4 — NOTHING ACTUALLY MOVED. A "transfer" whose two ends are the same person is a claim, not
  -- a transfer: creating your own first membership in the organization you just created lands here,
  -- and refusing it would mean nobody could ever own anything.
  if v_uid is not null and p_row_owner is not distinct from v_uid
                       and p_target_owner is not distinct from v_uid then
    return;
  end if;

  -- ARM 5 — the owner handing their OWN row to somebody else, which only the data class may allow.
  if v_uid is not null and p_row_owner is not distinct from v_uid then
    if iam.class_allows(p_token, 'rewrite_owner', p_row_org) then return; end if;
    -- `iam.class_allows` already wrote the audit row and the reason; re-raise it verbatim so the
    -- person reads the class's own sentence and not a second, vaguer one.
    raise exception 'Refused: %',
      coalesce(nullif(current_setting('iam.class_gate_last_reason', true), ''),
               format('the data class of %L does not allow this row to be handed to someone else',
                      p_token))
      using errcode = '42501',
            detail  = format('token=%s action=rewrite_owner row_owner=%s target=%s',
                             p_token, p_row_owner, p_target_owner),
            hint    = 'This is the data class of the table, not a permission you can be granted.';
  end if;

  -- Nothing allowed it. Say which question failed, not "denied".
  select et.data_class::text into v_class
    from platform.entity_types et where et.token = p_token and et.is_active;
  v_class := coalesce(v_class, 'private');
  v_why := format('you are not the owner of this %s row, not an owner or admin of the organization '
                  'it belongs to, and not a platform administrator, so you cannot change who owns it',
                  p_token);
  if nullif(current_setting('iam.transfer_door_kernel_error', true), '') is not null then
    v_why := v_why || format(' [the access kernel could not be asked about %s %s: %s]',
                             p_container_type, p_container_id,
                             current_setting('iam.transfer_door_kernel_error', true));
  end if;

  begin
    insert into iam.access_audit(
      action, target_token, data_class, purpose, basis, is_emergency_door, granted,
      denial_reason, actor_user_id, organization_id, request_context)
    values (
      'rewrite_owner', p_token, v_class, 'transfer_door', 'definer_function', false, false,
      v_why, v_uid, p_row_org,
      jsonb_build_object('door', 'iam.assert_may_transfer',
                         'row_owner', p_row_owner, 'target_owner', p_target_owner));
  exception when others then
    -- A refusal that cannot be recorded is still a refusal, and it says so in the same breath.
    v_why := v_why || format(' [the refusal could not be audited: %s]', sqlerrm);
  end;

  raise exception 'Refused: %', v_why
    using errcode = '42501',
          detail  = format('token=%s row_owner=%s target=%s row_organization=%s',
                           p_token, p_row_owner, p_target_owner, p_row_org),
          hint    = 'Ask an owner or admin of the organization that holds this row to move it.';
end
$function$;


comment on function iam.assert_may_transfer(text, uuid, uuid, uuid, text, uuid) is
  'DD-162 / VISIBILITY-BY-CLASS §3.4. THE one door a SECURITY DEFINER function goes through before '
  'it changes who owns a row or which organization holds it. Resolves every arm itself from '
  'auth.uid() — service role, platform admin, an owner/admin of the row''s own organization, an '
  'admin of the row''s container as the access kernel answers it, a self-claim that moves nothing, '
  'or the owner handing their own row away when the data class allows it. Raises 42501 with a '
  'sentence and writes iam.access_audit on refusal. It never takes a caller''s word for a check the '
  'caller says it already did.';

-- ═════════════════════════════════════════ the two flows the first proof never ran, run here
--
-- The rehearsal WRITES — a membership, an organization, an audit row — so it runs inside a PL/pgSQL
-- sub-transaction that is always aborted. `EXCEPTION` rolls back to the block's start, so every row
-- this proof creates is undone by construction rather than by a cleanup somebody has to maintain.
do $t$
declare
  v_owner uuid; v_org uuid; v_new uuid; v_id uuid; v_boot uuid; v_borg uuid;
  v_done boolean := false;
begin
  select m.user_id, m.container_id into v_owner, v_org
    from iam.memberships m join iam.organizations o on o.id = m.container_id
   where m.container_type='organization' and m.role='owner' and m.status='active'
     and m.deleted_at is null and coalesce(o.is_personal,false) = false limit 1;
  select id into v_new from auth.users
   where id not in (select user_id from iam.memberships where container_id = v_org and deleted_at is null)
   limit 1;
  if v_owner is null or v_new is null then
    raise exception 'dd162d: no real cast to rehearse with';
  end if;

  begin
    -- 1. a real organization owner adding a real person
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner,'role','authenticated')::text, true);
    execute 'set local role authenticated';
    v_id := public.mbr_add('organization', v_org, v_new, v_org, 'member', 'active', '{}'::jsonb);
    execute 'reset role';
    if v_id is null then raise exception 'dd162d: mbr_add returned no membership for a real owner'; end if;
    raise notice 'dd162d — mbr_add by a real organization owner still works (membership %)', v_id;

    -- 2. THE BOOTSTRAP: somebody creating an organization and claiming their first membership in it.
    --    This is the arm the first proof never ran, and the one that was broken.
    insert into iam.organizations(name, slug, created_by, is_personal)
    values ('zz dd162d rehearsal', 'zz-dd162d-'||substr(gen_random_uuid()::text,1,8), v_new, false)
    returning id into v_borg;
    perform set_config('request.jwt.claims', json_build_object('sub', v_new,'role','authenticated')::text, true);
    execute 'set local role authenticated';
    v_boot := public.mbr_add('organization', v_borg, v_new, v_borg, 'owner', 'active', '{}'::jsonb);
    execute 'reset role';
    if v_boot is null then raise exception 'dd162d: the bootstrap path returned no membership'; end if;
    raise notice 'dd162d — the bootstrap path (creator claims their own first membership) still works';

    -- 3. the super-admin repair door
    perform set_config('request.jwt.claims',
      json_build_object('sub',(select id from auth.users where email='admin@admin.com'),'role','authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.admin_manage_organization_membership('add', v_borg, v_owner, 'member');
    execute 'reset role';
    raise notice 'dd162d — the super-admin membership door still works';

    v_done := true;
    raise exception 'zz-dd162d-rehearsal-complete';
  exception when others then
    begin execute 'reset role'; exception when others then null; end;
    perform set_config('request.jwt.claims','',true);
    if sqlerrm <> 'zz-dd162d-rehearsal-complete' then
      raise exception 'dd162d rehearsal FAILED: % %', sqlstate, sqlerrm;
    end if;
  end;

  if not v_done then
    raise exception 'dd162d: the rehearsal did not reach the end, so it proved nothing';
  end if;
  raise notice 'dd162d — every row the rehearsal wrote was rolled back with its sub-transaction';
end $t$;
