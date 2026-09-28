-- Guest-to-account transfer under PostgREST's 8 s limit. Applied live 2026-09-28 (Claude Opus 5.5, standard lane),
-- one md5-guarded transaction (previous body md5 4b5918d13b999fb90009413edec6cf0f, see
-- p2pre_guest_transfer_reads_either_user_table.sql). Live md5s of pg_get_functiondef after apply:
--   public.transfer_guest_data_to_user   230f47abbfe42928a0ff383a8e6ecbba
--   users.guest_conversion_sweep         63d04ced9b210e6c235e9cfb1fa035ec
--   users.guest_transfer_link_columns    8233f6119cadbc050658e83b85bcfaae
--
-- Cause (measured): the transfer rewrote ~1,745 person-link columns, 946 of them with no leading index; 651 of
-- those are updated_by (the shape guard exempts updated_by from the FK-index rule) and hold 5.3 GB of heap
-- (chat.coding_session_entry.updated_by alone 2.2 GB). Every conversion full-scanned them: 3.7 s warm, 16-18 s
-- cold. The 296 Phase 2 indexes cover only 52 MB of that and do not change it.
-- Fix: link columns whose search needs a full scan of a table over 8 MB are deferred to users.guest_conversion_sweep
-- (pg_cron job guest-conversion-sweep, every 30 s); every other column is probed first and rewritten only on a hit.
-- Final rows moved are identical (every guest row moves, skipped {}); the audit row's transferred/total_rows
-- are completed by the sweep. Proof (rolled back): old 3.7 s warm, 7 keys; new 1.2 s in-request + 2.4 s sweep,
-- same 7 keys and counts. Log: common-docs/projects/database-estate-reduction/CHANGE-LOG.md.

-- Link columns a guest conversion rewrites, and which of them are too expensive to rewrite inside the sign-up
-- request. A column is DEFERRED when no valid, non-partial index leads with it AND its table (all partitions)
-- holds more than p_inline_max_bytes of heap: finding the guest's rows there means a full scan (the 2 GB
-- chat.coding_session_entry.updated_by alone took 1 s warm, most of a 16-18 s cold run). Deferred columns are
-- moved by users.guest_conversion_sweep() moments later; nothing is dropped.
CREATE OR REPLACE FUNCTION users.guest_transfer_link_columns(p_links_to text, p_inline_max_bytes bigint DEFAULT 8388608)
 RETURNS TABLE(sch name, tbl name, col name, deferred boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cols as (
    select distinct cl.oid as rel, n.nspname as sch, cl.relname as tbl, a.attnum, a.attname as col
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class cl on cl.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = cl.relnamespace
    join unnest(con.conkey) as ck(attnum) on true
    join pg_catalog.pg_attribute a on a.attrelid = cl.oid and a.attnum = ck.attnum
    where con.contype = 'f'
      and case p_links_to
            when 'person' then con.confrelid in ('auth.users'::pg_catalog.regclass, 'iam.users'::pg_catalog.regclass)
            when 'organization' then con.confrelid = 'iam.organizations'::pg_catalog.regclass
          end
      and n.nspname not in (
        'auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions', 'pgsodium', 'supabase_functions'
      )
  )
  select c.sch, c.tbl, c.col,
         not exists (select 1 from pg_catalog.pg_index i
                      where i.indrelid = c.rel and i.indkey[0] = c.attnum
                        and i.indisvalid and i.indpred is null)
         and greatest(pg_catalog.pg_relation_size(c.rel),  -- pg_partition_tree is empty for a plain table
                      (select coalesce(sum(pg_catalog.pg_relation_size(pt.relid)), 0)
                         from pg_catalog.pg_partition_tree(c.rel) pt)) > p_inline_max_bytes
  from cols c
  order by c.sch, c.tbl, c.col
$function$;

REVOKE ALL ON FUNCTION users.guest_transfer_link_columns(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION users.guest_transfer_link_columns(text, bigint) TO service_role;

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
  v_deferred jsonb := '[]'::jsonb;
  v_key text;
  v_hit boolean;
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
  -- guest created, and every other membership, passes to the converted account.
  select organization_id into v_target_org
  from users.profiles where id = p_new_user_id;
  if v_target_org is null then
    return jsonb_build_object('status', 'error', 'message',
      'the target account has no profile row, so there is no organization to move the guest rows into');
  end if;

  -- SPEED (2026-09-28): every link column is probed before it is rewritten, and a column that can only be
  -- searched by a full scan of a large table is DEFERRED to users.guest_conversion_sweep() (pg_cron, every
  -- 30 s) instead of being scanned inside this request. PostgREST cuts statements at 8 s; scanning ~650
  -- unindexed updated_by columns (5 GB) took 16-18 s cold. The deferred list rides on the audit row.
  for v_source_org in
    select o.id from iam.organizations o
    where o.created_by = p_anon_user_id
      and not exists (select 1 from iam.memberships m
                       where m.container_type = 'organization' and m.container_id = o.id
                         and m.user_id <> p_anon_user_id and m.deleted_at is null)
    order by o.created_at
  loop
    for v_col in
      select c.sch, c.tbl, c.col, c.deferred
      from users.guest_transfer_link_columns('organization') c
      where not (c.sch = 'iam' and c.tbl = 'memberships')
    loop
      v_key := format('guest_org.%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
      if v_col.deferred then
        v_deferred := v_deferred || jsonb_build_array(jsonb_build_object(
          'k', v_key, 's', v_col.sch, 't', v_col.tbl, 'c', v_col.col,
          'from', v_source_org.id, 'to', v_target_org));
        continue;
      end if;
      begin
        execute format('select exists (select 1 from %I.%I where %I = $1)',
                       v_col.sch, v_col.tbl, v_col.col)
          into v_hit using v_source_org.id;
        if v_hit then
          execute format(
            'update %I.%I set %I = $1 where %I = $2',
            v_col.sch, v_col.tbl, v_col.col, v_col.col
          ) using v_target_org, v_source_org.id;
          get diagnostics v_count = row_count;
          if v_count > 0 then
            v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
            v_total := v_total + v_count;
          end if;
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
    select c.sch, c.tbl, c.col, c.deferred
    from users.guest_transfer_link_columns('person') c
    where not (c.sch = 'public' and c.tbl = 'users.guest_executions')        -- kept verbatim from the previous
      and not (c.sch = 'public' and c.tbl = 'users.guest_conversion_audit')  -- body: these never match (see log)
      and not (c.sch = 'users' and c.tbl = 'profiles' and c.col = 'id')
      and not (c.sch = 'iam' and c.tbl = 'organizations' and c.col = 'created_by')
      and not (c.sch = 'iam' and c.tbl = 'memberships' and c.col = 'user_id')
      and not (c.sch = 'iam' and c.tbl = 'users' and c.col = 'id')
      and not (c.sch = 'billing' and c.tbl = 'user_plan' and c.col = 'user_id')
  loop
    v_key := format('%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
    if v_col.deferred then
      v_deferred := v_deferred || jsonb_build_array(jsonb_build_object(
        'k', v_key, 's', v_col.sch, 't', v_col.tbl, 'c', v_col.col,
        'from', p_anon_user_id, 'to', p_new_user_id));
      continue;
    end if;
    begin
      execute format('select exists (select 1 from %I.%I where %I = $1)',
                     v_col.sch, v_col.tbl, v_col.col)
        into v_hit using p_anon_user_id;
      if v_hit then
        execute format(
          'update %I.%I set %I = $1 where %I = $2',
          v_col.sch, v_col.tbl, v_col.col, v_col.col
        ) using p_new_user_id, p_anon_user_id;
        get diagnostics v_count = row_count;
        if v_count > 0 then
          v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
          v_total := v_total + v_count;
        end if;
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
    (anon_user_id, new_user_id, fingerprint, transferred, skipped, total_rows, organization_id, metadata)
  values
    (p_anon_user_id, p_new_user_id, p_fingerprint,
     v_transferred, v_skipped, v_total::integer, v_target_org,
     case when jsonb_array_length(v_deferred) > 0
          then jsonb_build_object('deferred', v_deferred, 'deferred_queued_at', now())
          else '{}'::jsonb end);
  return jsonb_build_object(
    'status', 'transferred', 'total_rows', v_total,
    'transferred', v_transferred, 'skipped', v_skipped,
    'deferred_columns', jsonb_array_length(v_deferred)
  );
end;
$function$;

-- Moves the deferred link columns of recent guest conversions (see transfer_guest_data_to_user). Runs from
-- pg_cron every 30 s as postgres. Works column by column within a time budget; a column interrupted by a lock
-- wait stays queued for the next tick; any other error lands in the audit row's `skipped`, exactly as the
-- in-request rewrite records it. Counts merge into the same audit row's `transferred` and `total_rows`.
CREATE OR REPLACE FUNCTION users.guest_conversion_sweep(p_budget_ms integer DEFAULT 15000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t0 timestamptz := clock_timestamp();
  v_audit record;
  v_item jsonb;
  v_left jsonb;
  v_transferred jsonb;
  v_skipped jsonb;
  v_total bigint;
  v_count bigint;
  v_done int := 0;
  v_rows bigint := 0;
  v_conversions int := 0;
begin
  for v_audit in
    select a.id, a.transferred, a.skipped, a.total_rows, a.metadata
    from users.guest_conversion_audit a
    where jsonb_typeof(a.metadata -> 'deferred') = 'array'
      and jsonb_array_length(a.metadata -> 'deferred') > 0
    order by a.created_at
    for update skip locked
  loop
    v_conversions := v_conversions + 1;
    v_left := '[]'::jsonb;
    v_transferred := v_audit.transferred;
    v_skipped := v_audit.skipped;
    v_total := v_audit.total_rows;
    for v_item in select value from jsonb_array_elements(v_audit.metadata -> 'deferred') loop
      if clock_timestamp() - v_t0 > make_interval(secs => p_budget_ms / 1000.0) then
        v_left := v_left || jsonb_build_array(v_item);
        continue;
      end if;
      begin
        execute format('update %I.%I set %I = $1 where %I = $2',
                       v_item->>'s', v_item->>'t', v_item->>'c', v_item->>'c')
          using (v_item->>'to')::uuid, (v_item->>'from')::uuid;
        get diagnostics v_count = row_count;
        v_done := v_done + 1;
        if v_count > 0 then
          v_transferred := v_transferred || jsonb_build_object(
            v_item->>'k', coalesce((v_transferred->>(v_item->>'k'))::bigint, 0) + v_count);
          v_total := v_total + v_count;
          v_rows := v_rows + v_count;
        end if;
      exception
        when lock_not_available or query_canceled then
          -- retried next tick; after 20 interrupted attempts it is recorded in skipped, never retried silently forever
          if coalesce((v_item->>'n')::int, 0) >= 19 then
            v_done := v_done + 1;
            v_skipped := v_skipped || jsonb_build_object(v_item->>'k', 'gave up after 20 interrupted attempts: ' || sqlerrm);
          else
            v_left := v_left || jsonb_build_array(v_item || jsonb_build_object('n', coalesce((v_item->>'n')::int, 0) + 1));
          end if;
        when undefined_table or undefined_column then
          v_done := v_done + 1;  -- the table or column is gone; nothing left to move
        when others then
          v_done := v_done + 1;
          v_skipped := v_skipped || jsonb_build_object(v_item->>'k', sqlerrm);
      end;
    end loop;
    update users.guest_conversion_audit
    set transferred = v_transferred, skipped = v_skipped, total_rows = v_total::integer,
        metadata = case when jsonb_array_length(v_left) > 0
                        then metadata || jsonb_build_object('deferred', v_left)
                        else (metadata - 'deferred') || jsonb_build_object('deferred_done_at', now())
                   end
    where id = v_audit.id;
  end loop;
  return jsonb_build_object('conversions', v_conversions, 'columns_done', v_done, 'rows_moved', v_rows,
                            'ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
end;
$function$;

REVOKE ALL ON FUNCTION users.guest_conversion_sweep(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION users.guest_conversion_sweep(integer) TO service_role;

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
VALUES ('users', 'guest_conversion_sweep', 'p_budget_ms integer', ARRAY['integer'::regtype]::oid[],
  'Takes no entity id: p_budget_ms is only a time budget (NULL means no time limit). It moves only the link columns that public.transfer_guest_data_to_user already decided for a conversion and wrote into that conversion''s own users.guest_conversion_audit row; it never chooses users itself.',
  'migrations/guest_transfer_defers_unindexed_large_columns.sql',
  'server_only: the body of the pg_cron job guest-conversion-sweep (every 30 s, as postgres). No client ever calls it: it rewrites person links across large tables as the definer.',
  false, false);

SELECT cron.schedule('guest-conversion-sweep', '30 seconds', 'select users.guest_conversion_sweep()');
