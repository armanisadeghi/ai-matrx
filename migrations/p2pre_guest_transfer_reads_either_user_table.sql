-- Phase 2 prerequisite (estate reduction, re-point auth.users links to iam.users), applied live 2026-09-28
-- by the P2-PRE executor. Mirror of the live body; md5 of pg_get_functiondef = 4b5918d13b999fb90009413edec6cf0f
-- (sha256 d7002f768d1ec37b538350a802c6800602162cec657846c6362fc9cfa6d95dab). Previous live body md5
-- fc4b2df01d47ae06433525b29b35eb3c (sha256 1a6595eb1e9ed711662d85a365d5bf3deb00324d1802a9019672cfd379778a8c).
--
-- Changes against the previous live body (applied as exact, count-asserted replacements):
--   1. Person-link discovery reads FKs into auth.users OR iam.users (was: auth.users only, so every table
--      re-pointed in Phase 2 — and the 52 columns already linked only to iam.users — would silently stop moving).
--   2. Discovery is DISTINCT per (schema, table, column): a column linked twice (the T1-T3 overlap) is rewritten once.
--   3. iam.users.id and billing.user_plan.user_id are excluded (one row per person; the move always hit the
--      target's own row and was swallowed into the audit's `skipped` list).
--   4. The audit row carries organization_id = the converted account's organization. The column became NOT NULL
--      with no default, so every conversion aborted at the audit insert and moved nothing (23502).
-- Plan: common-docs/projects/database-estate-reduction/CERTIFICATION-WAVES.md section 8.2-2.
-- Proofs (rolled back): /Users/armanisadeghi/db-estate-backups/2026-09-28/phase2/P2-PRE/transfer-proof.md

CREATE OR REPLACE FUNCTION public.transfer_guest_data_to_user(p_anon_user_id uuid, p_new_user_id uuid, p_fingerprint text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_anon_is_anonymous boolean;
  v_new_is_anonymous boolean;
  v_target_org uuid;
  v_source_org record;
  v_col record;
  v_count bigint;
  v_total bigint := 0;
  v_transferred jsonb := '{}'::jsonb;
  v_skipped jsonb := '{}'::jsonb;
  v_key text;
  v_guest_row_id uuid;
begin
  if p_anon_user_id is null or p_new_user_id is null then
    return jsonb_build_object('status', 'error', 'message', 'both user ids are required');
  end if;
  if p_anon_user_id = p_new_user_id then
    return jsonb_build_object('status', 'noop', 'message', 'source and target are the same user');
  end if;

  select is_anonymous into v_anon_is_anonymous from auth.users where id = p_anon_user_id;
  if v_anon_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'anon user not found');
  end if;
  if v_anon_is_anonymous is not true then
    return jsonb_build_object('status', 'error', 'message', 'source user is not anonymous');
  end if;
  select is_anonymous into v_new_is_anonymous from auth.users where id = p_new_user_id;
  if v_new_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'target user not found');
  end if;
  if v_new_is_anonymous is true then
    return jsonb_build_object('status', 'error', 'message', 'target user is anonymous');
  end if;

  select id into v_guest_row_id from users.guest_executions
  where auth_user_id = p_anon_user_id for update;

  -- THE CONVERTED ACCOUNT'S OWN PROFILE ROW ANSWERS. Rows in the guest's own organization
  -- (one the guest created and is the ONLY member of — a fact about membership, not an
  -- organization type) move to the organization the permanent account already carries; that
  -- guest organization and its membership stay with the guest. Every other organization the
  -- guest created, and every other membership, passes to the converted account. It used to
  -- RESOLVE-OR-CREATE an organization for the target here, which meant a conversion could
  -- invent one for an account whose provisioning had failed and move real rows into it.
  select organization_id into v_target_org
  from users.profiles where id = p_new_user_id;
  if v_target_org is null then
    return jsonb_build_object('status', 'error', 'message',
      'the target account has no profile row, so there is no organization to move the guest rows into');
  end if;
  for v_source_org in
    select o.id from iam.organizations o
    where o.created_by = p_anon_user_id
      and not exists (select 1 from iam.memberships m
                       where m.container_type = 'organization' and m.container_id = o.id
                         and m.user_id <> p_anon_user_id and m.deleted_at is null)
    order by o.created_at
  loop
    for v_col in
      select n.nspname as sch, cl.relname as tbl, a.attname as col
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refn on refn.oid = ref.relnamespace
      join unnest(con.conkey) as ck(attnum) on true
      join pg_attribute a on a.attrelid = cl.oid and a.attnum = ck.attnum
      where con.contype = 'f'
        and refn.nspname = 'iam' and ref.relname = 'organizations'
        and not (n.nspname = 'iam' and cl.relname = 'memberships')
        and n.nspname not in (
          'auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions',
          'pgsodium', 'supabase_functions'
        )
      order by n.nspname, cl.relname, a.attname
    loop
      v_key := format('guest_org.%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
      begin
        execute format(
          'update %I.%I set %I = $1 where %I = $2',
          v_col.sch, v_col.tbl, v_col.col, v_col.col
        ) using v_target_org, v_source_org.id;
        get diagnostics v_count = row_count;
        if v_count > 0 then
          v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
          v_total := v_total + v_count;
        end if;
      exception when others then
        v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
      end;
    end loop;

    begin
      update platform.associations set source_id = v_target_org
      where source_type = 'organization' and source_id = v_source_org.id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_key := 'guest_org.platform.associations.source_id';
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
      update platform.associations set target_id = v_target_org
      where target_type = 'organization' and target_id = v_source_org.id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_key := 'guest_org.platform.associations.target_id';
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object(
        'guest_org.platform.associations', sqlerrm
      );
    end;
  end loop;

  -- Transfer every ordinary person FK (into auth.users or iam.users; each column once; the person
  -- rows iam.users.id and billing.user_plan.user_id stay with the guest), but never the guest's own organization's
  -- ownership or its owner membership.
  for v_col in
    select distinct n.nspname as sch, cl.relname as tbl, a.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace refn on refn.oid = ref.relnamespace
    join unnest(con.conkey) as ck(attnum) on true
    join pg_attribute a on a.attrelid = cl.oid and a.attnum = ck.attnum
    where con.contype = 'f'
      and con.confrelid in ('auth.users'::regclass, 'iam.users'::regclass)
      and n.nspname not in (
        'auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions',
        'pgsodium', 'supabase_functions'
      )
      and not (n.nspname = 'public' and cl.relname = 'users.guest_executions')
      and not (n.nspname = 'public' and cl.relname = 'users.guest_conversion_audit')
      and not (n.nspname = 'users' and cl.relname = 'profiles' and a.attname = 'id')
      and not (n.nspname = 'iam' and cl.relname = 'organizations' and a.attname = 'created_by')
      and not (n.nspname = 'iam' and cl.relname = 'memberships' and a.attname = 'user_id')
      and not (n.nspname = 'iam' and cl.relname = 'users' and a.attname = 'id')
      and not (n.nspname = 'billing' and cl.relname = 'user_plan' and a.attname = 'user_id')
    order by n.nspname, cl.relname, a.attname
  loop
    v_key := format('%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
    begin
      execute format(
        'update %I.%I set %I = $1 where %I = $2',
        v_col.sch, v_col.tbl, v_col.col, v_col.col
      ) using p_new_user_id, p_anon_user_id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
    end;
  end loop;

  -- Every other organization the guest created, and every other membership, belongs to the
  -- converted account.
  update iam.organizations o set created_by = p_new_user_id
  where o.created_by = p_anon_user_id
    and exists (select 1 from iam.memberships m
                 where m.container_type = 'organization' and m.container_id = o.id
                   and m.user_id <> p_anon_user_id and m.deleted_at is null);
  get diagnostics v_count = row_count;
  if v_count > 0 then
    v_transferred := v_transferred || jsonb_build_object(
      'iam.organizations.created_by.shared', v_count
    );
    v_total := v_total + v_count;
  end if;

  update iam.memberships as membership set user_id = p_new_user_id
  where membership.user_id = p_anon_user_id
    and not exists (
      select 1 from iam.organizations as organization
      where organization.id = membership.organization_id
        and organization.created_by = p_anon_user_id
        and not exists (select 1 from iam.memberships other
                         where other.container_type = 'organization'
                           and other.container_id = organization.id
                           and other.user_id <> p_anon_user_id and other.deleted_at is null)
    );
  get diagnostics v_count = row_count;
  if v_count > 0 then
    v_transferred := v_transferred || jsonb_build_object(
      'iam.memberships.user_id.shared', v_count
    );
    v_total := v_total + v_count;
  end if;

  if v_guest_row_id is not null then
    update users.guest_executions
    set converted_to_user_id = p_new_user_id, converted_at = now(), auth_user_id = null
    where id = v_guest_row_id;
  end if;
  insert into users.guest_conversion_audit
    (anon_user_id, new_user_id, fingerprint, transferred, skipped, total_rows, organization_id)
  values
    (p_anon_user_id, p_new_user_id, p_fingerprint,
     v_transferred, v_skipped, v_total::integer, v_target_org);
  return jsonb_build_object(
    'status', 'transferred', 'total_rows', v_total,
    'transferred', v_transferred, 'skipped', v_skipped
  );
end;
$function$;
