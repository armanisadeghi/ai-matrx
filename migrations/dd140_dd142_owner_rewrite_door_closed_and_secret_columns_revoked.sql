-- DD-140 + DD-142 — two live doors from the visibility attack, closed.
-- (B-32, Data Doctrine adoption program, 2026-09-12. Findings F-1 and F-12 of
--  common-docs/projects/data-doctrine-adoption/discovery/ATTACK-VISIBILITY.md.)
--
-- DD-141 (the cross-organization read of `seo.keyword`) is NOT in this migration. It is
-- diagnosed in the B-32 report and blocked on one owner ruling; the obvious generator repair was
-- measured and FALSIFIED here before it was written, so it is deliberately absent rather than
-- guessed. See the report for the evidence and the question.
--
--
-- ══ DD-140 — `public.org_admin_reassign_member_resources`: the fourth door ═════════════════
--
-- WHAT WAS MEASURED, LIVE, BEFORE ANY CHANGE (2026-09-12):
--
--   select prosecdef, has_function_privilege('authenticated', oid, 'EXECUTE')
--     from pg_proc where proname = 'org_admin_reassign_member_resources';
--   -->  prosecdef = true, authenticated EXECUTE = true, owner = postgres,
--        client_callable_door rows = NONE, definer_client_grant_grandfather rows = 1
--
-- The function is `SECURITY DEFINER` owned by `postgres`, gated ONLY on `public.is_org_admin`,
-- and it walks `platform.shareable_resource_registry` executing
--   update <schema>.<table> set <owner column> = $1 where organization_id = $2 and <owner> = $3
-- over every registered shareable table — `chat.conversation`, `communication.dm_conversations`,
-- `hr_restricted_note`, `hr_i9`, `hr_tax_withholding`, `hr_background_check`, `hr_compensation`,
-- `browser_profile`, `interview_session`, `working_document`, `agent_run`, `sandbox_instance` —
-- every one of them registered `personal`. There is no `visibility` test, no time box, no
-- notification and no per-row consent, and `p_to_user` may be the CALLER: the only check on the
-- target is that they are a member of the organization, which an org admin satisfies.
--
-- `iam._guard_governance_columns` — the trigger whose whole job is to refuse an ownership
-- rewrite ("Ownership … cannot be transferred by editing it") — never fires, because its first
-- statement is `if current_user <> 'authenticated' then return NEW; end if;` and inside a
-- `SECURITY DEFINER` function owned by `postgres`, `current_user` IS `postgres`.
--
-- So one RPC call makes an organization admin the CREATOR of a colleague's private AI
-- conversations, DMs and HR records, after which the ordinary owner arm of every generated
-- `std_select` hands them over. Every visibility class is defeated by one call. NOT EXECUTED —
-- this is proven from the function body, its owner, its grants, the registry contents and the
-- trigger's early return, all read live.
--
-- 🚨 AND THE SECOND WAY IN. `public.org_admin_remove_member(p_org_id, p_user_id, p_reassign_to)`
-- is ALSO `SECURITY DEFINER`, ALSO granted to `authenticated`, and calls
-- `org_admin_reassign_member_resources` internally when `p_reassign_to` is supplied — a nested
-- call inside a definer owned by `postgres` is privilege-checked as `postgres`, so revoking the
-- client grant on the first function alone would leave the identical capability reachable through
-- the second, one extra argument away. `p_reassign_to` is unconstrained there too: it may be
-- `auth.uid()`. **The safe path beside the unsafe one is not a fix** — both lanes close here.
--
-- WHAT THIS MIGRATION DOES, AND WHY THAT SHAPE:
--   1. Revokes client EXECUTE (`public`, `anon`, `authenticated`) and keeps `service_role`, the
--      DD-110 class-N shape. No `platform.client_callable_door` row is written: that table is the
--      ALLOWLIST the §6d-4 guard reads, and a row in it is what makes a client grant STICK. A
--      closed door is declared by having no door row and no grandfather row — writing one to
--      record "closed" would re-open the class the moment anyone re-issued the grant. The reason
--      lives here and in the DD-140 register row instead.
--   2. Deletes the `platform.definer_client_grant_grandfather` row (the DD-098/DD-110 class fix).
--      A grandfather row makes the §6d-4 guard stand down for that function FOREVER, so any path
--      that re-establishes a client grant would silently re-open this door.
--   3. Refuses `p_to_user = auth.uid()` inside the body — defence in depth for the remaining
--      `service_role` lane, because "the admin makes themselves the owner" is the whole attack.
--   4. Makes `org_admin_remove_member` REFUSE a non-null `p_reassign_to` with a human sentence
--      naming what to do instead. Removing a member still works. Nothing fails silently and
--      nothing is silently transferred.
--
-- The legitimate offboarding transfer is a FUTURE audited door (DD-137): per-table class rules,
-- a time box, an audit row AND a notification to the subject. It is not this function.
--
-- Live surface (must not become a dead button — handled in the same commit):
--   matrx-frontend/features/organizations/admin/service.ts  reassignMemberResources()
--   matrx-frontend/features/organizations/admin/components/ReassignResourcesDialog.tsx
--   matrx-frontend/features/organizations/admin/components/MemberDetailView.tsx
--   matrx-frontend/features/organizations/admin/components/MemberResourcesView.tsx
--
--
-- ══ DD-142 — declared column-exclusion designs that are NOT IN FORCE ══════════════════════
--
-- The attack found `users.user_secrets.value_encrypted` table-granted to `authenticated` with
-- only a RESTRICTIVE policy in front of the ciphertext. The census this lane ran found that it is
-- not one column — it is a CLASS, and it is the exact D231 mechanism db-rules §6d-2 already
-- named: **in Postgres a column-level ACL cannot subtract from a table-level grant.** Every one of
-- these tables still carries its per-column `authenticated` ACLs; a table-level grant was laid on
-- top of them and silently swallowed the design whole.
--
-- MEASURED LIVE, 2026-09-12 — `has_table_privilege('authenticated', …, 'SELECT')` TRUE while the
-- table declares (or documents) an exclusion:
--
--   registered, declared in platform.entity_types.client_excluded_columns, DESIGN DEAD:
--     esign.signing_key          secret_key                                    (the e-sign signing key)
--     platform.actor_token       token_hash, verification_code_hash, verification_target
--     platform.actor_session     session_hash
--     hr.provider_binding        credential_ref, webhook_secret_ref, connector
--     hr.calculation_snapshot    resolution, applicability_facts, inputs, outputs, clamps
--   unregistered (no entity_types row, so nowhere to declare — db-rules §6d-2 names all three),
--   DESIGN DEAD:
--     users.user_secrets            value_encrypted                            ← DD-142 as filed
--     users.credential_attachments  value_encrypted
--     users.integration_connections vault_secret_key, credential_item_id
--
--   Counter-example proving the mechanism rather than a coincidence: docproc.processed_documents,
--   files.files, files.file_versions, rag.library_docs and the six other declared designs have NO
--   table-level SELECT and their excluded columns are correctly unreadable.
--
-- WHY NOT SIMPLY RE-RUN `iam.apply_table_grants` (the generator) ON ALL EIGHT:
-- because for the `restricted`/`ledger` tables it would WIDEN live write access. `platform.
-- actor_token` and `hr.calculation_snapshot` hold `authenticated=r` today; `apply_table_grants`
-- issues `select, insert, update, delete` for every non-ledger variant, so the generator would
-- close a read channel and open three write channels in the same statement. A security fix that
-- widens anything is not a security fix. This migration therefore performs the narrowing
-- directly: **it re-issues exactly the privilege kinds the table already grants, restricted to
-- the non-excluded columns.** It can only ever narrow. The registered tables keep their
-- `client_excluded_columns` declaration, so the next `apply_rls` regenerates the design
-- correctly; the surgery here only repairs the state the table-level grant destroyed.
--
-- THE EXCLUSION SETS BELOW ARE DECLARED, NEVER INFERRED (§6d-2: `ADD COLUMN` leaves `attacl`
-- NULL, so a new column and a deliberately-excluded one are indistinguishable in the catalog).
-- The five registered sets are read from `platform.entity_types.client_excluded_columns`; the
-- three unregistered ones are written out literally here, from the §6d-2 census table.
--
-- AND THE GUARD. What let every one of these die quietly is that nothing looked. This migration
-- adds `platform.client_excluded_column_report()` — one row per declared-or-documented exclusion
-- whose column is STILL readable by `authenticated` — and asserts it is empty at the end. It is
-- proven RED before the fix and GREEN after, in the same run.
--
-- Applied through the repository's canonical `pnpm db:apply` path. No BEGIN/COMMIT — the runner
-- owns the transaction.


-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 0. THE DECLARATION — every exclusion this migration is responsible for, in one place.
-- ══════════════════════════════════════════════════════════════════════════════════════════

create table if not exists platform.client_excluded_column_unregistered (
  schema_name  text not null,
  table_name   text not null,
  column_name  text not null,
  reason       text not null,
  declared_at  timestamptz not null default now(),
  primary key (schema_name, table_name, column_name)
);

comment on table platform.client_excluded_column_unregistered is
  'db-rules §6d-2: the column-exclusion designs whose table has NO platform.entity_types row, so '
  'client_excluded_columns has nowhere to live. Declared, never inferred. Read by '
  'platform.client_excluded_column_report(). (DD-142, 2026-09-12.)';

insert into platform.client_excluded_column_unregistered (schema_name, table_name, column_name, reason)
values
  ('users','user_secrets','value_encrypted',
   'Credential ciphertext. Never served to a client: the plaintext lane is the vault''s own SECURITY DEFINER door. aidream 0235_credential_vault_phase1.sql; db-rules §6d-2.'),
  ('users','credential_attachments','value_encrypted',
   'Credential-attachment ciphertext. Same vault family, same rule. aidream 0264; db-rules §6d-2.'),
  ('users','integration_connections','vault_secret_key',
   'The Supabase Vault key name that dereferences the stored secret — handing it to a client hands over the pointer to the secret. Vault family; db-rules §6d-2.'),
  ('users','integration_connections','credential_item_id',
   'Vault-family exclusion recorded in db-rules §6d-2 alongside vault_secret_key.')
on conflict (schema_name, table_name, column_name) do nothing;


-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE GUARD — a declared exclusion that stopped excluding anything is now visible.
-- ══════════════════════════════════════════════════════════════════════════════════════════

create or replace function platform.client_excluded_column_report()
returns table(schema_name text, table_name text, column_name text, source text, still_readable boolean)
language sql stable security invoker set search_path = pg_catalog, public as $$
  with declared as (
    select et.schema_name, et.table_name, x as column_name, 'entity_types'::text as source
    from platform.entity_types et, unnest(et.client_excluded_columns) x
    where coalesce(array_length(et.client_excluded_columns, 1), 0) > 0
    union all
    select u.schema_name, u.table_name, u.column_name, 'unregistered'::text
    from platform.client_excluded_column_unregistered u
  )
  select d.schema_name, d.table_name, d.column_name, d.source,
         has_column_privilege('authenticated',
           format('%I.%I', d.schema_name, d.table_name)::regclass, d.column_name, 'SELECT')
  from declared d
  join pg_class c on c.oid = format('%I.%I', d.schema_name, d.table_name)::regclass
  join pg_attribute a on a.attrelid = c.oid and a.attname = d.column_name
                     and a.attnum > 0 and not a.attisdropped
  where has_column_privilege('authenticated',
          format('%I.%I', d.schema_name, d.table_name)::regclass, d.column_name, 'SELECT');
$$;

comment on function platform.client_excluded_column_report() is
  'db-rules §6d-2 conformance: every DECLARED client column exclusion that `authenticated` can '
  'still SELECT. Empty means every design is in force. A row means a table-level grant was laid '
  'over a column-level design and swallowed it (the D231 mechanism). (DD-142, 2026-09-12.)';


-- ── RED, proven in this run, before anything is narrowed. ────────────────────────────────
do $$
declare v_n int; v_rows text;
begin
  select count(*), string_agg(schema_name||'.'||table_name||'.'||column_name, ', ' order by schema_name, table_name, column_name)
    into v_n, v_rows from platform.client_excluded_column_report();
  raise notice 'dd142 RED: % declared exclusion(s) are NOT in force: %', v_n, v_rows;
  if v_n = 0 then
    raise exception 'dd142: the RED state is already gone — this migration was written against 8 live leaks and found none. Re-measure before applying: someone else changed these grants.';
  end if;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 2. DD-142 — narrow every dead design back to its declared shape. Never widens.
-- ══════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  r record;
  v_rel regclass;
  v_excl text[];
  v_kept text;
  v_privs text[];
  v_grant text;
  v_had_delete boolean;
  v_stale text;
  v_fixed int := 0;
begin
  for r in
    select schema_name, table_name, array_agg(distinct column_name) as cols
    from (
      select et.schema_name, et.table_name, x as column_name
      from platform.entity_types et, unnest(et.client_excluded_columns) x
      where coalesce(array_length(et.client_excluded_columns, 1), 0) > 0
      union all
      select u.schema_name, u.table_name, u.column_name
      from platform.client_excluded_column_unregistered u
    ) d
    group by 1, 2
    order by 1, 2
  loop
    v_rel := format('%I.%I', r.schema_name, r.table_name)::regclass;
    v_excl := r.cols;

    -- Only act where the design is actually dead. A living design is left strictly alone.
    if not has_table_privilege('authenticated', v_rel, 'SELECT') then
      continue;
    end if;

    -- A declared name that is not a live column is a stale declaration, and a stale declaration
    -- is how an exclusion quietly stops excluding anything (§6d-2's own rule).
    select string_agg(x, ', ') into v_stale
    from unnest(v_excl) x
    where not exists (select 1 from pg_attribute a
                      where a.attrelid = v_rel and a.attname = x
                        and a.attnum > 0 and not a.attisdropped);
    if v_stale is not null then
      raise exception 'dd142: % declares client_excluded_columns that do not exist: % — fix the declaration (db-rules §6d-2).',
        v_rel::text, v_stale;
    end if;

    -- The privilege kinds `authenticated` holds TODAY at table level. We re-issue exactly
    -- these and nothing more, so this statement can only ever remove reach.
    v_privs := array[]::text[];
    if has_table_privilege('authenticated', v_rel, 'SELECT') then v_privs := v_privs || 'select'::text; end if;
    if has_table_privilege('authenticated', v_rel, 'INSERT') then v_privs := v_privs || 'insert'::text; end if;
    if has_table_privilege('authenticated', v_rel, 'UPDATE') then v_privs := v_privs || 'update'::text; end if;
    -- DELETE has no column form and needs none: removing a row you are already permitted to
    -- remove reveals nothing about an excluded column (apply_table_grants' own reasoning).
    v_had_delete := has_table_privilege('authenticated', v_rel, 'DELETE');

    -- The kept column list: every live column that is not declared excluded.
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_kept
    from pg_attribute a
    where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
      and not (a.attname = any (v_excl));

    if v_kept is null then
      raise exception 'dd142: % declares every column excluded — refusing.', v_rel::text;
    end if;

    execute format('revoke all on %s from authenticated', v_rel::text);

    if array_length(v_privs, 1) is not null then
      select string_agg(p || ' (' || v_kept || ')', ', ') into v_grant from unnest(v_privs) p;
      execute format('grant %s on %s to authenticated', v_grant, v_rel::text);
    end if;

    if v_had_delete then
      execute format('grant delete on %s to authenticated', v_rel::text);
    end if;

    v_fixed := v_fixed + 1;
    raise notice 'dd142: % — table grant removed, % re-granted on every column except %',
      v_rel::text, array_to_string(v_privs, ','), array_to_string(v_excl, ', ');
  end loop;

  raise notice 'dd142: % table(s) narrowed', v_fixed;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 3. DD-140 — close both lanes onto the owner rewrite.
-- ══════════════════════════════════════════════════════════════════════════════════════════

-- 3a. The body refuses the attack outright, for the `service_role` lane that remains.
create or replace function public.org_admin_reassign_member_resources(
  p_org_id uuid, p_from_user uuid, p_to_user uuid, p_resource_types text[] default null
)
returns table(resource_type text, reassigned bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_owner text; v_sql text; v_n bigint; v_total bigint := 0;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;

  -- 🚨 DD-140. An organization admin naming THEMSELVES as the recipient is not an offboarding
  -- transfer, it is a takeover: this function rewrites the owner column of every shareable
  -- registered table, including private conversations, DMs and HR records, and the new owner then
  -- reads them through the ordinary owner arm of every std_select.
  if p_to_user = auth.uid() then
    raise exception 'An organization admin cannot reassign another member''s resources to themselves. An offboarding transfer goes through the audited transfer door, which records who moved what and tells the person whose work moved.'
      using errcode = '42501';
  end if;

  if p_from_user = p_to_user then
    raise exception 'Source and target users must differ' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org_id and om.user_id = p_to_user
  ) then
    raise exception 'Target user is not a member of this organization' using errcode = '23503';
  end if;

  for r in
    select reg.resource_type,
           coalesce(reg.schema_name, 'public') as schema_name,
           reg.table_name,
           reg.owner_column
    from public.shareable_resource_registry reg
    where coalesce(reg.is_active, true)
      and (p_resource_types is null or reg.resource_type = any (p_resource_types))
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = r.schema_name and c.table_name = r.table_name and c.column_name = 'organization_id'
    ) then
      continue;
    end if;

    v_owner := iam._resolve_owner_column(r.schema_name, r.table_name, r.owner_column);
    if v_owner is null then continue; end if;

    v_sql := format('update %I.%I set %I = $1 where organization_id = $2 and %I = $3',
                    r.schema_name, r.table_name, v_owner, v_owner);
    execute v_sql using p_to_user, p_org_id, p_from_user;
    get diagnostics v_n = row_count;

    if v_n > 0 then
      resource_type := r.resource_type;
      reassigned    := v_n;
      v_total       := v_total + v_n;
      return next;
    end if;
  end loop;

  perform iam._org_audit(p_org_id, p_from_user, 'resources.reassign',
                         jsonb_build_object('to', p_to_user, 'types', p_resource_types, 'total', v_total));
end;
$$;

-- 3b. The door itself. DD-110 class N: no client grant, no door row, no grandfather row.
revoke all on function public.org_admin_reassign_member_resources(uuid, uuid, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.org_admin_reassign_member_resources(uuid, uuid, uuid, text[])
  to service_role;

delete from platform.definer_client_grant_grandfather
where schema_name = 'public' and function_name = 'org_admin_reassign_member_resources';

delete from platform.client_callable_door
where schema_name = 'public' and function_name = 'org_admin_reassign_member_resources';

-- 3c. THE SECOND LANE. `org_admin_remove_member` reached the same rewrite through its own
--     definer privileges. Removing a member still works; silently moving their work does not.
create or replace function public.org_admin_remove_member(
  p_org_id uuid, p_user_id uuid, p_reassign_to uuid default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text; v_owner_count int;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use leave organization to remove yourself' using errcode = '42501';
  end if;

  -- 🚨 DD-140. This argument called org_admin_reassign_member_resources, which rewrites the owner
  -- column of every shareable registered table — private conversations, DMs and HR records
  -- included — and a nested call inside a SECURITY DEFINER owned by postgres is privilege-checked
  -- as postgres, so closing the direct RPC alone would have left the identical capability here.
  if p_reassign_to is not null then
    raise exception 'Removing a member no longer transfers their work. Transferring another person''s resources is an audited action with its own door, because it changes who owns their private conversations and records — remove the member without a transfer, and ask for the offboarding transfer door if you need their work moved.'
      using errcode = '42501';
  end if;

  select om.role::text into v_role
  from public.organization_members om
  where om.organization_id = p_org_id and om.user_id = p_user_id;
  if v_role is null then
    raise exception 'User is not a member of this organization' using errcode = '23503';
  end if;
  if v_role = 'owner' then
    select count(*) into v_owner_count
    from public.organization_members
    where organization_id = p_org_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'Cannot remove the last owner' using errcode = '42501';
    end if;
  end if;

  delete from public.organization_members where organization_id = p_org_id and user_id = p_user_id;
  delete from iam.org_member_controls     where organization_id = p_org_id and user_id = p_user_id;

  perform iam._org_audit(p_org_id, p_user_id, 'member.remove',
                         jsonb_build_object('reassigned_to', null, 'reassigned', '[]'::jsonb));

  return jsonb_build_object('removed', true, 'reassigned', '[]'::jsonb);
end;
$$;

grant execute on function public.org_admin_remove_member(uuid, uuid, uuid) to authenticated;


-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 4. ASSERTIONS. A migration that cannot prove its own end state is not a fix.
-- ══════════════════════════════════════════════════════════════════════════════════════════

do $$
declare v_n int; v_rows text; v_oid oid;
begin
  -- DD-142 GREEN: not one declared exclusion is still readable.
  select count(*), string_agg(schema_name||'.'||table_name||'.'||column_name, ', ')
    into v_n, v_rows from platform.client_excluded_column_report();
  if v_n > 0 then
    raise exception 'dd142: % declared exclusion(s) STILL readable by authenticated: %', v_n, v_rows;
  end if;

  -- …and the eight specific columns, named, so a future rename cannot make this vacuous.
  if has_column_privilege('authenticated','users.user_secrets','value_encrypted','SELECT') then
    raise exception 'dd142: users.user_secrets.value_encrypted is still readable by authenticated';
  end if;
  if has_column_privilege('authenticated','esign.signing_key','secret_key','SELECT') then
    raise exception 'dd142: esign.signing_key.secret_key is still readable by authenticated';
  end if;
  if has_column_privilege('authenticated','platform.actor_token','token_hash','SELECT') then
    raise exception 'dd142: platform.actor_token.token_hash is still readable by authenticated';
  end if;

  -- …and nothing was WIDENED: a non-excluded column of each repaired table is still readable.
  if not has_column_privilege('authenticated','users.user_secrets','key','SELECT') then
    raise exception 'dd142: users.user_secrets.key LOST the read it is supposed to keep';
  end if;
  if not has_column_privilege('authenticated','platform.actor_token','id','SELECT') then
    raise exception 'dd142: platform.actor_token.id LOST the read it is supposed to keep';
  end if;
  if has_table_privilege('authenticated','platform.actor_token','INSERT') then
    raise exception 'dd142: platform.actor_token GAINED INSERT — this migration must only narrow';
  end if;

  -- DD-140 GREEN: the door is shut on both lanes and stands on nothing.
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'org_admin_reassign_member_resources';
  if has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'dd140: org_admin_reassign_member_resources is STILL authenticated-executable';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'dd140: org_admin_reassign_member_resources is STILL anon-executable';
  end if;
  if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'dd140: service_role LOST EXECUTE — the server lane must survive';
  end if;

  select count(*) into v_n from platform.definer_client_grant_grandfather
   where schema_name = 'public' and function_name = 'org_admin_reassign_member_resources';
  if v_n > 0 then raise exception 'dd140: the grandfather row survived — the §6d-4 guard is still standing down for this function'; end if;

  select count(*) into v_n from platform.client_callable_door
   where schema_name = 'public' and function_name = 'org_admin_reassign_member_resources';
  if v_n > 0 then raise exception 'dd140: a client_callable_door row exists — a closed door must not be on the allowlist'; end if;

  -- The remove lane still exists and is still callable; only the transfer argument is refused.
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'org_admin_remove_member';
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'dd140: org_admin_remove_member LOST authenticated EXECUTE — removing a member must still work';
  end if;
  if pg_get_functiondef(v_oid) not like '%p_reassign_to is not null%' then
    raise exception 'dd140: org_admin_remove_member does not refuse p_reassign_to — the second lane is still open';
  end if;

  raise notice 'dd140/dd142: all assertions passed';
end $$;
