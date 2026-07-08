-- guest_oauth_data_transfer.sql
--
-- D20: a guest who signs up via OAuth (Google/GitHub/Apple) gets a NEW
-- auth.users UUID from the provider flow, orphaning everything the guest
-- created under the server-minted anonymous UUID. Email/password signup
-- promotes the anon row IN PLACE (lib/services/guest-promotion.ts), but no
-- server-side API exists to attach an OAuth identity to an existing user —
-- so for OAuth the fix is a one-time ownership TRANSFER: repoint every row
-- owned by the anon UUID to the new real UUID.
--
-- Design: the transfer function discovers ALL foreign-key columns that
-- reference auth.users(id) at runtime (pg_constraint), so any table added
-- later is covered automatically — the class of failure (a new guest-writable
-- table missed by a hardcoded list) is structurally impossible. Each
-- column is transferred in its own exception scope: a unique-violation on
-- one table (e.g. one-row-per-user aggregates) skips that column and is
-- recorded in the audit row, never aborting the whole transfer.
--
-- Explicitly skipped:
--   * public.guest_executions — the fingerprint→anon mapping itself
--     (handled explicitly: converted_to_user_id stamped, auth_user_id
--     nulled so the Python guest registry mints a FRESH anon identity for
--     future guest activity on that device — see
--     aidream/packages/matrx-ai/matrx_ai/db/_guest_registry_impl.py).
--   * users.profiles.id — PK-as-FK identity row; the new user has their own.
--   * auth / storage / graveyard / system schemas.
--
-- Security: SECURITY DEFINER, EXECUTE revoked from anon/authenticated —
-- callable ONLY by service_role (the Next.js server admin client). Even if
-- misgranted, the function refuses unless the source user is genuinely
-- is_anonymous and the target is a real (non-anonymous) user.
--
-- Idempotent: re-running with the same pair transfers 0 rows (nothing left
-- owned by the anon UUID) and re-stamps the same conversion.

-- Audit trail: one row per transfer attempt. Service-role only (RLS enabled,
-- zero policies).
create table if not exists public.guest_conversion_audit (
  id uuid primary key default gen_random_uuid(),
  anon_user_id uuid not null,
  new_user_id uuid not null,
  fingerprint text,
  transferred jsonb not null default '{}'::jsonb,
  skipped jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.guest_conversion_audit enable row level security;
revoke all on public.guest_conversion_audit from anon, authenticated;

create or replace function public.transfer_guest_data_to_user(
  p_anon_user_id uuid,
  p_new_user_id uuid,
  p_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anon_is_anonymous boolean;
  v_new_is_anonymous boolean;
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
    -- Never drain a real account. This also blocks abuse if grants drift.
    return jsonb_build_object('status', 'error', 'message', 'source user is not anonymous');
  end if;

  select is_anonymous into v_new_is_anonymous from auth.users where id = p_new_user_id;
  if v_new_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'target user not found');
  end if;
  if v_new_is_anonymous is true then
    return jsonb_build_object('status', 'error', 'message', 'target user is anonymous');
  end if;

  -- Serialize concurrent transfers for the same guest (double-click, two tabs).
  select id into v_guest_row_id
  from public.guest_executions
  where auth_user_id = p_anon_user_id
  for update;

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
      and refn.nspname = 'auth' and ref.relname = 'users'
      and n.nspname not in ('auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions', 'pgsodium', 'supabase_functions')
      and not (n.nspname = 'public' and cl.relname = 'guest_executions')
      and not (n.nspname = 'public' and cl.relname = 'guest_conversion_audit')
      and not (n.nspname = 'users' and cl.relname = 'profiles' and a.attname = 'id')
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
      -- Loud but partial-tolerant: one conflicting table (unique aggregate
      -- rows, restrictive trigger) must not sink the whole transfer.
      v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
    end;
  end loop;

  -- Retire the mapping: stamp the conversion and free the fingerprint so the
  -- Python guest registry mints a fresh anon identity on the next guest visit.
  if v_guest_row_id is not null then
    update public.guest_executions
    set converted_to_user_id = p_new_user_id,
        converted_at = now(),
        auth_user_id = null
    where id = v_guest_row_id;
  end if;

  insert into public.guest_conversion_audit
    (anon_user_id, new_user_id, fingerprint, transferred, skipped, total_rows)
  values
    (p_anon_user_id, p_new_user_id, p_fingerprint, v_transferred, v_skipped, v_total::integer);

  return jsonb_build_object(
    'status', 'transferred',
    'total_rows', v_total,
    'transferred', v_transferred,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.transfer_guest_data_to_user(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.transfer_guest_data_to_user(uuid, uuid, text) to service_role;
