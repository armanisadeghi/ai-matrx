-- chair-step: the REVOKEs withdraw EXECUTE from public/anon/authenticated on the two functions this same file creates (server-only, declared in platform.client_callable_door); nothing that existed before is narrowed.
--
-- ops_check_item_accept_marker_2026_09_26g.sql
--
-- THE ONE-CLICK "MARK OK" MARKER. The admin page /administration/reporting/check-findings calls the
-- server (aidream POST /admin/checks/accept, super admin only), which commits the accept to the
-- check's OWN allowlist on main through the GitHub API (PLAN.md C1 — an accept lives with the
-- check). Until the next ingested run reads that allowlist and marks the item `accepted`, the page
-- must say "Marked OK — landing", and a failed commit must say so loudly. That in-between state is
-- `ops.check_item.metadata.pending_accept`, written ONLY by these two functions:
--
--   ops.check_item_accept_begin(item, by, reason)   claims the accept (idempotent: a second click
--       while one is committing, or after one landed, is a no-op that returns the first one);
--   ops.check_item_accept_finish(item, status, detail)   records `landed` (commit sha/url) or
--       `failed` (error + remedy). A failed accept can be claimed again.
--
-- The transition function (ops.check_items_apply_run) never touches `pending_accept` (it merges
-- metadata with `||` / `-` of other keys), so once the run marks the item accepted the page reads
-- `state` first and the marker is history. Both functions are server-only, like the six before them.
-- Design: common-docs/projects/checks-run-in-the-app/P2-COMMANDS.md § "Mark OK from the app".

create or replace function ops.check_item_accept_begin(p_item_id uuid, p_by jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  i ops.check_item%rowtype;
  c ops.proof_check%rowtype;
  v_pending jsonb;
  v_item jsonb;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'check_item_accept_begin: a reason is required' using errcode = '22023';
  end if;
  if p_by is null or coalesce(btrim(p_by ->> 'user_id'), '') = '' then
    raise exception 'check_item_accept_begin: the accepting admin (by.user_id) is required' using errcode = '22023';
  end if;
  select * into i from ops.check_item where id = p_item_id for update;
  if not found then
    raise exception 'check_item_accept_begin: no ops.check_item %', p_item_id using errcode = 'P0002';
  end if;
  select * into c from ops.proof_check where id = i.check_id;
  v_item := jsonb_build_object('id', i.id, 'check_id', i.check_id, 'item_key', i.item_key, 'state', i.state,
                               'repo', c.repo, 'stable_id', c.stable_id);
  if i.item_key in ('__check__', '__summary__', '__malformed__') then
    return jsonb_build_object('outcome', 'reserved', 'item', v_item);
  end if;
  if i.state = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted', 'item', v_item);
  end if;
  if i.state not in ('open', 'handed_off') then
    return jsonb_build_object('outcome', 'not_open', 'item', v_item);
  end if;
  v_pending := i.metadata -> 'pending_accept';
  if v_pending ->> 'status' = 'landed' then
    return jsonb_build_object('outcome', 'already_landed', 'item', v_item, 'pending', v_pending);
  end if;
  if v_pending ->> 'status' = 'committing' and (v_pending ->> 'at')::timestamptz > now() - interval '5 minutes' then
    return jsonb_build_object('outcome', 'in_flight', 'item', v_item, 'pending', v_pending);
  end if;
  v_pending := jsonb_build_object('status', 'committing', 'by', p_by, 'reason', btrim(p_reason), 'at', now());
  perform set_config('app.user_id', '87a6e699-3622-4869-8843-d0867456c0dd', true);
  update ops.check_item
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('pending_accept', v_pending)
   where id = i.id;
  return jsonb_build_object('outcome', 'claimed', 'item', v_item, 'pending', v_pending);
end;
$function$;

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

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'ops.check_item_accept_begin(uuid, jsonb, text)',
    'ops.check_item_accept_finish(uuid, text, jsonb)'
  ] loop
    insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                               reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
           (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
           'Checks store: the one-click Mark OK marker (metadata.pending_accept). The item id is checked against ops.check_item by the function itself; the accepting admin is proven by the server route (require_super_admin) before it calls.',
           'matrx-frontend/migrations/ops_check_item_accept_marker_2026_09_26g.sql',
           'server_only: aidream/services/platform_checks/accept.py (POST /admin/checks/accept, super admin only, as the service connection) is the only caller; findings are platform-admin-only internal records, so no browser or signed-in client ever writes them.',
           false, false
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.oid = f::regprocedure
       and not exists (select 1 from platform.client_callable_door d
                        where d.schema_name = n.nspname and d.function_name = p.proname
                          and d.identity_args = pg_get_function_identity_arguments(p.oid));
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;
