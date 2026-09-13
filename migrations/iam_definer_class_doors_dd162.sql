-- iam_definer_class_doors_dd162 — A DEFINER ASKS THE CLASS BEFORE IT READS OR MOVES A ROW
-- (DD-162; VISIBILITY-BY-CLASS §3.4 chokepoint 3, continuing DD-137c's gate and census.)
--
-- ═══ WHAT THE CENSUS SAID, AND WHAT WAS ACTUALLY TRUE ═════════════════════════════════════════
-- `pnpm check:definer-class` failed on FOUR client-callable SECURITY DEFINER functions that rewrite
-- an identity column "without asking the gate or the kernel":
--   platform._mirror_m2m_to_assoc, public.admin_manage_organization_membership,
--   public.edu_learn_doc_set_status, public.mbr_add
--
-- 🚨 THE FIRST THING THIS LANE DID WAS TRY TO EXPLOIT THEM, AS A REAL PLAIN MEMBER, IN A
-- TRANSACTION IT ROLLED BACK — because a finding nobody has tried to use is a guess. Measured
-- 2026-09-12 as `seo@titaniumsuccess.com` (a plain member of a real organization):
--   admin_manage_organization_membership('set_role', <their org>, <them>, 'owner')
--                                                       -> 42501 "Forbidden: Super Admin required"
--   edu_learn_doc_set_status(<someone else's doc>, true) -> 42501 "not authorized"
--   mbr_add('organization', <their org>, <them>, …, 'owner')
--                                                       -> 42501 "membership manager role required"
--   platform._mirror_m2m_to_assoc                       -> `returns trigger`: PostgREST cannot call
--                                                          it, and neither can anything else but a
--                                                          trigger firing. EXECUTE on a trigger
--                                                          function is not a door.
--
-- So there was no open hole. What there was is worse in the long run and is the reason DD-162 is a
-- SECURITY item anyway: **three functions each answered the question in their own bespoke way, and
-- the census could not tell an answer from a silence.** `asks_the_gate` matched the literal strings
-- `class_allows` and `has_access` and nothing else, so `is_super_admin()` — a real answer — read as
-- no answer, and a future edit that DELETED one of those three bespoke checks would not have moved
-- the number by one. A guard that cannot tell a fix from a regression is not a guard.
--
-- ═══ WHAT THIS FILE DOES ══════════════════════════════════════════════════════════════════════
-- 1. `iam.assert_may_transfer` — THE ONE door for moving a row to a different owner or a different
--    organization. It resolves every arm ITSELF from `auth.uid()` and never takes a caller's word
--    for what it already checked.
-- 2. `iam.assert_class_read` — THE ONE greppable name for "this definer asked the class before it
--    handed out rows it read with borrowed rights". A thin raising wrapper over the DD-137c gate, so
--    one `grep` finds every reader that asks and the census matches one string, not a family.
-- 3. `iam.definer_class_exemption` — the allowlist, in the database, with a REASON THAT CANNOT BE
--    "ok": a check constraint refuses a reason under 60 characters, and every row names who declared
--    it. An exemption without a sentence is how an allowlist becomes a place to hide.
-- 4. `iam.definer_class_census` v2 — it now asks the real question. Word-boundary table matching
--    (v1's `position()` matched `chat.conversation` inside `chat.conversation_message`), trigger
--    functions labelled as what they are instead of counted as doors, and three BINS that are
--    answers rather than silences: `narrows_to_caller`, `asks_an_admin`, `org_scoped`.
-- 5. The three real identity rewriters routed through the ONE door, keeping their own checks where
--    they are (belt AND braces: the bespoke check stays, and the class now also gets a say).
--
-- 🚨 WHAT IT DELIBERATELY DOES NOT DO, WITH THE NUMBER. The census still reports **~200** definer
-- functions that READ a classed table and explain themselves to nobody. They are not edited here.
-- Dropping `iam.assert_class_read` into a reader whose token is `private` makes it raise ALWAYS —
-- the gate refuses a blanket read on private/confidential by design — so a blind sweep would break
-- live product flows one function at a time, and a blind exemption sweep would turn the allowlist
-- into a wall of "ok". Both are the opposite of the class fix. What ships instead is a RATCHET:
-- `pnpm check:definer-class` fails if that number RISES, prints every function in it, and names the
-- campaign. See `scripts/definer-class-baseline.json`.

-- ═════════════════════════════════════════════════ 1. THE ONE DOOR FOR MOVING A ROW TO SOMEONE ELSE
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
  v_uid   uuid    := auth.uid();
  v_class text;
  v_why   text;
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
    declare v_kernel boolean;
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
  'auth.uid() — service role, platform admin, an owner/admin of the row''s own organization, a '
  'self-claim that moves nothing, or the owner handing their own row away when the data class '
  'allows it. Raises 42501 with a sentence and writes iam.access_audit on refusal. It never takes a '
  'caller''s word for a check the caller says it already did.';

revoke all on function iam.assert_may_transfer(text, uuid, uuid, uuid, text, uuid) from public;
-- Granted to NO client role on purpose: it is called from inside definer functions, which run as
-- their own owner. No `platform.client_callable_door` row, because there is no client door.

-- ══════════════════════════════════════════ 2. THE ONE GREPPABLE NAME FOR "THIS READER ASKED"
create or replace function iam.assert_class_read(
  p_token   text,
  p_row_org uuid default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Deliberately thin. Its whole value is that it is ONE name: `grep assert_class_read` answers
  -- "which definer readers ask the class?" and the census matches one string instead of a family.
  perform iam.assert_class_allows(p_token, 'read', p_row_org);
end
$function$;

comment on function iam.assert_class_read(text, uuid) is
  'DD-162 / §3.4. The ONE name a SECURITY DEFINER function calls before it hands out rows it read '
  'with borrowed rights. Raises 42501 on a private or confidential token — which is the point: on '
  'those classes there is no blanket read, and the function must ask iam.has_access per row '
  'instead. A thin wrapper over iam.assert_class_allows so one grep finds every reader that asks.';

revoke all on function iam.assert_class_read(text, uuid) from public;

-- ════════════════════════════════════════ 3. THE ALLOWLIST, WITH A REASON THAT CANNOT BE "ok"
create table if not exists iam.definer_class_exemption (
  id            uuid primary key default gen_random_uuid(),
  schema_name   text not null,
  function_name text not null,
  identity_args text not null default '',
  reason        text not null,
  declared_by   text not null,
  declared_at   timestamptz not null default now(),
  constraint definer_class_exemption_unique unique (schema_name, function_name, identity_args),
  -- 60 characters is roughly one real sentence. An allowlist whose entries can say "ok" is a place
  -- to hide a finding, not a place to explain one.
  constraint definer_class_exemption_reason_is_a_sentence check (length(btrim(reason)) >= 60)
);

comment on table iam.definer_class_exemption is
  'DD-162. Definer functions the definer-class census would otherwise report, each with a written '
  'reason and the agent or person who wrote it. The reason column is constrained to at least 60 '
  'characters on purpose: an exemption without a sentence is how an allowlist becomes a place to '
  'hide a finding.';

revoke all on table iam.definer_class_exemption from public;
grant select on table iam.definer_class_exemption to service_role;

-- ═══════════════════════════════════════════════════════ 4. THE CENSUS ASKS THE REAL QUESTION NOW
-- Column order and set change, so the view is dropped and rebuilt rather than replaced. No CASCADE:
-- if something depends on it, that dependency must be seen, not silently destroyed.
drop view if exists iam.definer_class_census;

create view iam.definer_class_census as
with client_definers as (
  select p.oid,
         n.nspname                                    as schema_name,
         p.proname                                    as function_name,
         pg_get_function_identity_arguments(p.oid)    as identity_args,
         p.prorettype = 'pg_catalog.trigger'::regtype as is_trigger,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
         p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public',
                           'pgsodium','vault','auth','storage','realtime','cron','net','pgbouncer',
                           'supabase_migrations')
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE'))
), classed as (
  select et.schema_name, et.table_name, et.token, et.data_class::text as data_class
    from platform.entity_types et
   where et.is_active and et.data_class::text in ('private','confidential')
), matched as (
  select cd.oid,
         (select coalesce(string_agg(distinct c.token, ', ' order by c.token), '')
            from classed c
           -- 🚨 WORD BOUNDARIES, NOT `position()`. v1 used a plain substring search, so
           -- `chat.conversation` matched `chat.conversation_message` and a function that never
           -- touches the classed table was counted as reading it. Measured on the 470 rows v1
           -- reported: 30 of them lost every match under this expression.
           where cd.prosrc ~ ('(^|[^a-zA-Z0-9_.])' || c.schema_name || '\.' || c.table_name
                              || '([^a-zA-Z0-9_]|$)'))                as classed_tokens
    from client_definers cd
)
select cd.schema_name,
       cd.function_name,
       cd.identity_args,
       -- 🚨 A TRIGGER FUNCTION IS NOT A DOOR AND IS NO LONGER CALLED ONE. PostgREST cannot invoke
       -- `returns trigger`, and firing a trigger does not consult EXECUTE at all. v1 counted the
       -- EXECUTE grant and reported 44 of them as client-callable.
       case when cd.is_trigger then 'trigger (not a client door)'
            when cd.auth_exec and cd.anon_exec then 'authenticated, anon'
            when cd.anon_exec then 'anon'
            else 'authenticated' end                                  as reachable_by,
       cd.is_trigger,
       (cd.prosrc ~* 'set\s+(created_by|user_id|owner_id|organization_id|visibility)\s*=')
                                                                      as writes_identity,
       (m.classed_tokens <> '')                                       as reads_classed,
       m.classed_tokens,
       -- THE GATE: the DD-137c gate, the DD-162 doors, or the per-row kernel. Any of the four is an
       -- answer; none of them is the finding.
       (cd.prosrc like '%class_allows%' or cd.prosrc like '%has_access%'
        or cd.prosrc like '%assert_class_read%' or cd.prosrc like '%assert_may_transfer%')
                                                                      as asks_the_gate,
       -- THE BINS. Each is an ANSWER the census used to read as a silence. They are text
       -- measurements of function bodies and so are a floor, never a ceiling — the guard says that
       -- on every run.
       (cd.prosrc ~* '(created_by|user_id|owner_id|actor_user_id|actor_id|recipient_user_id|student_user_id)\s*=\s*[^;]{0,40}(auth\.uid\(\)|v_uid|v_actor|v_user|v_caller|current_user_id)')
                                                                      as narrows_to_caller,
       (cd.prosrc ~* 'is_super_admin|is_platform_admin|_assert_admin|require_admin')
                                                                      as asks_an_admin,
       (cd.prosrc ~* 'iam\.my_orgs|iam\.is_org_manager|iam\.is_org_owner|iam\._container_authz|is_org_member')
                                                                      as org_scoped,
       exists (select 1 from platform.client_callable_door d
                where d.schema_name = cd.schema_name and d.function_name = cd.function_name)
                                                                      as declared,
       ex.reason                                                      as exempt_reason
  from client_definers cd
  join matched m on m.oid = cd.oid
  left join iam.definer_class_exemption ex
         on ex.schema_name = cd.schema_name
        and ex.function_name = cd.function_name
        and (ex.identity_args = '' or ex.identity_args = cd.identity_args);

comment on view iam.definer_class_census is
  'DD-137c/DD-162 / VISIBILITY-BY-CLASS §3.4 chokepoint 3. Every SECURITY DEFINER function a client '
  'role can execute, with whether it rewrites an identity column, whether it reads a private or '
  'confidential table, and — v2 — whether it ANSWERS: the class gate, the per-row kernel, an own-row '
  'predicate, an administrator check, or an organization predicate. Trigger functions are labelled '
  'as trigger, not counted as doors. Re-measured on every read. A text measurement of function '
  'bodies: a FLOOR on the problem, never a ceiling — dynamic SQL is invisible to it.';

revoke all on iam.definer_class_census from public;
grant select on iam.definer_class_census to service_role;

-- ════════════════════════════════════ 5. THE THREE REAL REWRITERS GO THROUGH THE ONE DOOR
-- Each keeps the check it already had. The door is ADDED, not substituted: two answers that agree
-- are a guard, one answer that was never asked twice is a habit.

-- 5a. education.learn_doc: publishing moves a row's `visibility` between `personal` and `public`.
create or replace function public.edu_learn_doc_set_status(p_id uuid, p_publish boolean)
returns education.learn_doc
language plpgsql
security definer
set search_path to 'public', 'education', 'platform'
as $function$
declare
  v_row education.learn_doc;
  v_owner uuid;
  v_org uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select created_by, organization_id into v_owner, v_org
    from education.learn_doc where id = p_id and deleted_at is null;
  if v_owner is null and v_org is null then
    raise exception 'learn_doc % not found', p_id;
  end if;

  -- DD-162: the class gets a say even when the administrator door is already open. Publishing a
  -- document changes who may read it, which is the same question as changing who owns it.
  perform iam.assert_may_transfer('learn_doc', v_owner, v_owner, v_org);

  update education.learn_doc set
    visibility = case when p_publish then 'public'::platform.visibility else 'personal'::platform.visibility end,
    published_at = case when p_publish then coalesce(published_at, now()) else published_at end
  where id = p_id and deleted_at is null
  returning * into v_row;
  if v_row.id is null then
    raise exception 'learn_doc % not found', p_id;
  end if;
  return v_row;
end;
$function$;

-- 5b. iam.memberships through the super-admin repair door. `p_role = 'owner'` is a transfer of the
-- organization itself; the door is asked about every branch, not only that one.
create or replace function public.admin_manage_organization_membership(p_action text, p_org_id uuid, p_user_id uuid, p_role text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_membership iam.memberships%rowtype;
  v_org iam.organizations%rowtype;
  v_previous_role text;
  v_owner_count integer;
  v_other_owner_count integer;
begin
  if v_actor is null or not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  if p_action not in ('add', 'set_role', 'remove') then
    raise exception 'Unsupported organization membership action: %', p_action
      using errcode = '22023';
  end if;

  select * into v_org
  from iam.organizations
  where id = p_org_id;

  if not found then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  -- DD-162: THE ONE DOOR. A super admin passes it through the administrator arm, and the census can
  -- now tell this function from one that asks nobody — which is the whole point, because the line
  -- above can be deleted by a future edit and this one cannot be deleted quietly.
  perform iam.assert_may_transfer('membership', v_org.created_by, p_user_id, p_org_id,
                                  'organization', p_org_id);

  -- DD-045 P3 owns these four branches; DD-048 leaves them exactly as they are.
  -- A personal organization belongs to its creator. Super-admin repair may
  -- restore that creator as owner or remove legacy extra members, but it may
  -- never turn the personal org into a shared org or remove its person.
  if coalesce(v_org.is_personal, false) then
    if p_action = 'add'
       and (p_user_id is distinct from v_org.created_by or p_role <> 'owner') then
      raise exception 'A personal organization may only add its creator as owner'
        using errcode = '23514';
    end if;
    if p_action = 'set_role'
       and (p_user_id is distinct from v_org.created_by or p_role <> 'owner') then
      raise exception 'A personal organization creator may only be restored to owner'
        using errcode = '23514';
    end if;
    if p_action = 'remove' and p_user_id is not distinct from v_org.created_by then
      raise exception 'Cannot remove the person from their personal organization'
        using errcode = '23514';
    end if;
  end if;

  if p_action in ('add', 'set_role') and p_role not in ('owner', 'admin', 'member') then
    raise exception 'Role must be owner, admin, or member' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  -- Serialize owner-count checks with other organization membership changes.
  perform 1
  from iam.memberships
  where container_type = 'organization'
    and container_id = p_org_id
    and deleted_at is null
  for update;

  -- R21, one owner: even a super admin may not mint a second one. The route is
  -- transfer_organization_ownership, which demotes the outgoing owner.
  if p_action in ('add', 'set_role') and p_role = 'owner' then
    select count(*)::integer
    into v_other_owner_count
    from iam.memberships
    where container_type = 'organization'
      and container_id = p_org_id
      and role = 'owner'
      and status = 'active'
      and deleted_at is null
      and user_id is distinct from p_user_id;

    if v_other_owner_count > 0 then
      raise exception
        'An organization can have exactly one owner. Use Transfer ownership to hand it to someone else.'
        using errcode = '23514';
    end if;
  end if;

  select * into v_membership
  from iam.memberships
  where container_type = 'organization'
    and container_id = p_org_id
    and user_id = p_user_id
    and deleted_at is null;

  v_previous_role := v_membership.role;

  if p_action = 'add' then
    insert into iam.memberships (
      container_type, container_id, organization_id, user_id, role, status, metadata,
      created_by, updated_by
    )
    values (
      'organization', p_org_id, p_org_id, p_user_id, p_role, 'active', '{}'::jsonb, v_actor, v_actor
    )
    on conflict (container_type, container_id, user_id)
    do update set
      organization_id = excluded.organization_id,
      role = excluded.role,
      status = 'active',
      deleted_at = null,
      updated_by = v_actor,
      updated_at = now()
    returning * into v_membership;

  elsif p_action = 'set_role' then
    if v_membership.id is null then
      raise exception 'Organization membership not found' using errcode = 'P0002';
    end if;

    if v_membership.role = 'owner' and p_role <> 'owner' then
      select count(*) into v_owner_count
      from iam.memberships
      where container_type = 'organization'
        and container_id = p_org_id
        and role = 'owner'
        and deleted_at is null;

      if v_owner_count <= 1 then
        raise exception 'Cannot demote the last organization owner'
          using errcode = '23514';
      end if;
    end if;

    update iam.memberships
    set role = p_role,
        updated_by = v_actor,
        updated_at = now()
    where id = v_membership.id
    returning * into v_membership;

  else
    if v_membership.id is null then
      raise exception 'Organization membership not found' using errcode = 'P0002';
    end if;

    if v_membership.role = 'owner' then
      select count(*) into v_owner_count
      from iam.memberships
      where container_type = 'organization'
        and container_id = p_org_id
        and role = 'owner'
        and deleted_at is null;

      if v_owner_count <= 1 then
        raise exception 'Cannot remove the last organization owner'
          using errcode = '23514';
      end if;
    end if;

    -- DD-044: a super admin removing the last membership would leave the person
    -- with no organization at all.
    if iam.is_last_organization(p_user_id, p_org_id) then
      raise exception
        'This person can''t be removed from their only organization. They need to join or create another one first.'
        using errcode = '23514';
    end if;

    update iam.memberships
    set deleted_at = now(),
        updated_by = v_actor,
        updated_at = now()
    where id = v_membership.id
    returning * into v_membership;
  end if;

  insert into iam.org_admin_audit (organization_id, actor_user_id, target_user_id, action, detail)
  values (
    p_org_id, v_actor, p_user_id, 'super_admin_membership_' || p_action,
    jsonb_build_object('previous_role', v_previous_role, 'role', v_membership.role,
                       'membership_id', v_membership.id)
  );

  return jsonb_build_object(
    'action', p_action, 'membership_id', v_membership.id, 'organization_id', p_org_id,
    'user_id', p_user_id, 'role', v_membership.role);
end;
$function$;

-- 5c. mbr_add — the membership door every client uses. Its own authorization block is unchanged and
-- runs first; the ONE door is asked immediately before the write, so it covers EVERY branch that
-- reaches the insert, including the service-role and bootstrap ones its own block waves through.
create or replace function public.mbr_add(p_container_type text, p_container_id uuid, p_user_id uuid, p_organization_id uuid, p_role text default 'member'::text, p_status text default 'active'::text, p_metadata jsonb default '{}'::jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_creator uuid;
  v_personal boolean;
  v_actor_role text;
  v_target_id uuid;
  v_target_role text;
  v_bootstrap boolean;
  v_id uuid;
begin
  if p_container_type not in ('organization', 'project') then
    raise exception 'unsupported membership container type %', p_container_type
      using errcode = '22023';
  end if;

  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid membership role %', p_role
      using errcode = '22023';
  end if;

  if p_status is distinct from 'active' then
    raise exception 'invalid membership status %', p_status
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_container_type || ':' || p_container_id::text, 0));

  select
    container.resource_org_id, container.resource_creator,
    container.resource_is_personal, container.actor_role
  into v_org, v_creator, v_personal, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid) as container;

  if not found or v_org is null then
    raise exception 'membership container not found' using errcode = 'P0002';
  end if;

  if p_organization_id is distinct from v_org then
    raise exception 'membership container/organization mismatch'
      using errcode = '42501';
  end if;

  select membership.id, membership.role
  into v_target_id, v_target_role
  from iam.memberships as membership
  where membership.container_type = p_container_type
    and membership.container_id = p_container_id
    and membership.organization_id = v_org
    and membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for update;

  v_bootstrap :=
    v_uid is not null
    and v_uid = v_creator
    and p_user_id = v_uid
    and p_role = 'owner'
    and not exists (
      select 1
      from iam.memberships as membership
      where membership.container_type = p_container_type
        and membership.container_id = p_container_id
        and membership.organization_id = v_org
        and membership.status = 'active'
        and membership.deleted_at is null
    );

  if not v_service and not v_bootstrap then
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    if v_actor_role = 'owner' then
      null;
    elsif v_actor_role = 'admin'
          and p_role in ('member', 'admin')
          and (v_target_role is null or v_target_role = 'member') then
      null;
    else
      raise exception 'membership manager role required'
        using errcode = '42501';
    end if;

    if p_container_type = 'project' and p_role = 'owner' then
      raise exception 'project owner role can only be established at bootstrap'
        using errcode = '42501';
    end if;
  end if;

  -- mbr_add is idempotent, not a second role-update surface. Existing live
  -- rows must go through mbr_update_role so last-owner rules cannot be bypassed.
  if v_target_id is not null then
    return v_target_id;
  end if;

  -- DD-162: THE ONE DOOR, asked about the write itself rather than about the branch that reached
  -- it. The bootstrap case lands on the "nothing actually moved" arm (the creator claiming their
  -- own first membership), the org-manager case on the organization arm, a project admin on the
  -- kernel arm, and the service role on its own.
  perform iam.assert_may_transfer('membership', v_creator, p_user_id, v_org,
                                  p_container_type, p_container_id);

  insert into iam.memberships (
    container_type, container_id, user_id, organization_id, role, status, metadata, created_by
  )
  values (
    p_container_type, p_container_id, p_user_id, v_org, p_role, 'active',
    coalesce(p_metadata, '{}'::jsonb), v_uid
  )
  on conflict (container_type, container_id, user_id)
  do update set
    organization_id = excluded.organization_id,
    role = excluded.role,
    status = 'active',
    metadata = excluded.metadata,
    deleted_at = null,
    updated_by = v_uid,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$;

-- 5d. platform._mirror_m2m_to_assoc is NOT touched, and that is the finding rather than an omission.
-- It `returns trigger`. PostgREST cannot call it; firing a trigger never consults EXECUTE. It was on
-- the guard's FAIL list because v1 of the census read an EXECUTE grant as a door. v2 labels it
-- `trigger (not a client door)` and the guard no longer fails on it. The EXECUTE grant behind it is
-- pointless but harmless, and removing grants is DD-152's subject, not this lane's.

-- ═══════════════════════════════════════════════════════════ 6. THE PROOF, AS REAL PEOPLE, BOTH WAYS
do $proof$
declare
  v_schema   text := 'zz_dd162_proof';
  v_victim   uuid;
  v_attacker uuid;
  v_org      uuid;
  v_row      uuid;
  v_after    uuid;
  v_state    text;
begin
  -- Two real accounts, and an organization the attacker is only a plain member of.
  select id into v_attacker from auth.users where email = 'seo@titaniumsuccess.com';
  select id into v_victim   from auth.users where email = 'projectmanager@titaniumsuccess.com';
  select m.container_id into v_org from iam.memberships m
   where m.user_id = v_attacker and m.container_type = 'organization'
     and m.status = 'active' and m.deleted_at is null and m.role = 'member' limit 1;
  if v_attacker is null or v_victim is null or v_org is null then
    raise exception 'dd162 proof: no real cast to run as (attacker=%, victim=%, org=%)',
      v_attacker, v_victim, v_org;
  end if;

  execute format('create schema %I', v_schema);
  execute format('create table %I.owned (id uuid primary key default gen_random_uuid(), '
                 'created_by uuid, organization_id uuid)', v_schema);
  execute format('insert into %I.owned(created_by, organization_id) values ($1,$2) returning id',
                 v_schema) using v_victim, v_org into v_row;

  -- ── RED ─────────────────────────────────────────────────────────────────────────────────────
  -- A definer function shaped exactly like the four the census named: client-callable, rewrites an
  -- identity column, asks nobody. Built here rather than by weakening a real one, because a RED
  -- proof must never put a weakened file or function in front of anybody else (B-37's lesson).
  execute format($f$create function %I.zz_take(p_id uuid) returns void language plpgsql
                     security definer set search_path to '' as $b$
                     begin update %I.owned set created_by = auth.uid() where id = p_id; end $b$
$f$,
                 v_schema, v_schema);
  execute format('grant usage on schema %I to authenticated', v_schema);
  -- 🚨 THE DECLARATION FIRST, OR THERE IS NOTHING TO MEASURE. `enforce_definer_client_grants`
  -- (db-rules §6d-4) revokes a client EXECUTE on an UNDECLARED SECURITY DEFINER function at
  -- `ddl_command_end`. Without this row the probe is refused 42501 by THAT guard and the RED half
  -- would be an accidental re-measurement of a different one.
  insert into platform.client_callable_door(schema_name, function_name, identity_args, declared_by, reason)
  values (v_schema, 'zz_take', 'p_id uuid', 'migration iam_definer_class_doors_dd162',
          'Throwaway probe built and dropped inside this migration to prove the transfer door RED then GREEN.');
  execute format('grant execute on function %I.zz_take(uuid) to authenticated', v_schema);

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_attacker, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select %I.zz_take($1)', v_schema) using v_row;
  execute 'reset role';
  execute format('select created_by from %I.owned where id = $1', v_schema) using v_row into v_after;
  if v_after is distinct from v_attacker then
    raise exception 'dd162 RED did not happen: a plain member could NOT take the row, so this proof '
                    'measures nothing (created_by = %)', v_after;
  end if;
  raise notice 'dd162 RED  — a plain member took another person''s row through an unguarded definer '
               '(created_by % -> %)', v_victim, v_after;

  -- put it back, so GREEN starts from the same state RED did
  execute format('update %I.owned set created_by = $1 where id = $2', v_schema) using v_victim, v_row;

  -- ── GREEN ───────────────────────────────────────────────────────────────────────────────────
  execute format($f$create or replace function %I.zz_take(p_id uuid) returns void language plpgsql
                     security definer set search_path to '' as $b$
                     declare v_owner uuid; v_org uuid;
                     begin
                       select created_by, organization_id into v_owner, v_org
                         from %I.owned where id = p_id;
                       perform iam.assert_may_transfer('note', v_owner, auth.uid(), v_org);
                       update %I.owned set created_by = auth.uid() where id = p_id;
                     end $b$
$f$, v_schema, v_schema, v_schema);

  execute 'set local role authenticated';
  begin
    execute format('select %I.zz_take($1)', v_schema) using v_row;
    execute 'reset role';
    raise exception 'dd162 GREEN failed: the door let a plain member take another person''s row';
  exception when insufficient_privilege then
    execute 'reset role';
    v_state := sqlerrm;
    raise notice 'dd162 GREEN — the same call is now refused 42501: %', v_state;
  end;
  execute format('select created_by from %I.owned where id = $1', v_schema) using v_row into v_after;
  if v_after is distinct from v_victim then
    raise exception 'dd162 GREEN failed: the row moved anyway (created_by = %)', v_after;
  end if;
  if v_state is null or position('not the owner' in v_state) = 0 then
    raise exception 'dd162 GREEN failed: the refusal carried no human sentence (%)', v_state;
  end if;

  -- ── AND THE DOOR STILL OPENS FOR THE PEOPLE IT SHOULD ───────────────────────────────────────
  -- The row's own owner, moving their own row on an `organization`-classed token.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_victim, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select %I.zz_take($1)', v_schema) using v_row;
  execute 'reset role';
  execute format('select created_by from %I.owned where id = $1', v_schema) using v_row into v_after;
  if v_after is distinct from v_victim then
    raise exception 'dd162: the owner could not move their own row (created_by = %)', v_after;
  end if;
  raise notice 'dd162 OPEN  — the row''s own owner still passes the door';

  -- A platform administrator.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', (select id from auth.users where email = 'admin@admin.com'),
                                       'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select %I.zz_take($1)', v_schema) using v_row;
  execute 'reset role';
  raise notice 'dd162 OPEN  — the platform administrator door still passes';

  perform set_config('request.jwt.claims', '', true);
  execute format('drop schema %I cascade', v_schema);
  delete from platform.client_callable_door where schema_name = v_schema;
end
$proof$;

-- ═════════════════════════════════════════════ 7. THE THREE REAL FUNCTIONS, STILL REFUSING, AFTER
do $after$
declare
  v_attacker uuid;
  v_org uuid;
  v_doc uuid;
  v_refusals int := 0;
begin
  select id into v_attacker from auth.users where email = 'seo@titaniumsuccess.com';
  select m.container_id into v_org from iam.memberships m
   where m.user_id = v_attacker and m.container_type = 'organization'
     and m.status = 'active' and m.deleted_at is null and m.role = 'member' limit 1;
  select id into v_doc from education.learn_doc
   where deleted_at is null and created_by is distinct from v_attacker limit 1;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_attacker, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.admin_manage_organization_membership('set_role', v_org, v_attacker, 'owner');
  exception when insufficient_privilege then v_refusals := v_refusals + 1;
  end;
  begin
    perform public.edu_learn_doc_set_status(v_doc, true);
  exception when insufficient_privilege then v_refusals := v_refusals + 1;
  end;
  begin
    perform public.mbr_add('organization', v_org, v_attacker, v_org, 'owner', 'active', '{}'::jsonb);
  exception when insufficient_privilege then v_refusals := v_refusals + 1;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  if v_refusals <> 3 then
    raise exception 'dd162: only % of the three rewriters refused a plain member after the change. '
                    'They all refused BEFORE it (measured), so this is a regression, not a finding.',
                    v_refusals;
  end if;
  raise notice 'dd162 — all three identity rewriters still refuse a plain member with 42501';
end
$after$;

-- ══════════════════════════════════════════════════════════════════ 8. THE NUMBERS, RECORDED
do $numbers$
declare
  v_total int; v_doors int; v_triggers int; v_writes_open int;
  v_reads int; v_reads_open int; v_names text;
begin
  select count(*),
         count(*) filter (where not is_trigger),
         count(*) filter (where is_trigger),
         count(*) filter (where writes_identity and not asks_the_gate and not is_trigger
                            and exempt_reason is null),
         count(*) filter (where reads_classed and not is_trigger),
         count(*) filter (where reads_classed and not is_trigger and not asks_the_gate
                            and not narrows_to_caller and not asks_an_admin and not org_scoped
                            and exempt_reason is null)
    into v_total, v_doors, v_triggers, v_writes_open, v_reads, v_reads_open
    from iam.definer_class_census;

  select string_agg(schema_name || '.' || function_name, ', ' order by schema_name, function_name)
    into v_names
    from iam.definer_class_census
   where writes_identity and not asks_the_gate and not is_trigger and exempt_reason is null;

  raise notice 'dd162 CENSUS v2: % rows (% client doors, % trigger functions); % rewrite an identity '
               'column and explain themselves to nobody (%); % read a private or confidential table, '
               '% of those unexplained',
               v_total, v_doors, v_triggers, v_writes_open, coalesce(v_names, 'none'),
               v_reads, v_reads_open;

  if v_writes_open <> 0 then
    raise exception 'dd162: % identity rewriters are still unexplained after this file: %',
      v_writes_open, v_names;
  end if;

  -- The census must still be able to SEE the thing it exists to find, or it is decoration.
  if not exists (select 1 from iam.definer_class_census
                  where schema_name = 'public' and function_name = 'mbr_add' and asks_the_gate) then
    raise exception 'dd162: the census cannot see that mbr_add now asks the door, so it cannot be '
                    'trusted to see that anything else does not.';
  end if;
  if not exists (select 1 from iam.definer_class_census where writes_identity) then
    raise exception 'dd162: the census found NOTHING that rewrites an identity column. A census that '
                    'finds nothing has stopped measuring.';
  end if;
end
$numbers$;
