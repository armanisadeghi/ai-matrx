-- access_ladder_t29_shown_to_context_once_per_transaction — the Shown to context is read once, not per call.
--
-- platform.shown_to_context(token) resolves, for every organization the viewer belongs to, the
-- "Shown to by default" knob and the viewer's teammates (~0.8 s for an account in ~50
-- organizations, measured 2026-09-27). Every *_list_scoped RPC reads it in DECLARE, and every
-- *_list_scope_counts calls its list RPC once per scope AND once per organization — so
-- agx_list_scope_counts recomputed it ~78 times: 82 s for admin@admin.com, a statement timeout on
-- /agents/all's tab counts. The answer cannot change inside one transaction that is only
-- reading, so it is computed once per transaction per (viewer, token) and kept in a
-- transaction-local setting. Same result, same inputs; only the repetition is gone.
set local lock_timeout = '2s';
-- based-on: platform.shown_to_context(text) 4b4a3f32d88c3ab1ab8cc5383cb6efc46e7bd54a1df74a0f6fc2a9d0504c25b7
SELECT set_config('app.actor_tier', 'code', true);
SELECT set_config('app.actor_system', 'migration:access_ladder_t29_shown_to_context_once_per_transaction', true);

create or replace function platform.shown_to_context(p_token text)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_key text := 'platform.shown_to_ctx_' || md5(coalesce(p_token, ''));
  v_cached jsonb;
  r record;
begin
  if v_uid is null then
    return v_out;
  end if;
  -- Once per transaction per (viewer, token): a counts RPC calls its list RPC dozens of times.
  v_cached := nullif(current_setting(v_key, true), '')::jsonb;
  if v_cached is not null and v_cached ->> 'u' = v_uid::text then
    return v_cached -> 'c';
  end if;
  for r in select om.organization_id from iam.organization_member om where om.user_id = v_uid loop
    v_out := v_out || jsonb_build_object(r.organization_id::text, jsonb_build_object(
      'd', platform.shown_to_default(p_token, r.organization_id, v_uid),
      't', to_jsonb(coalesce(iam.teammate_user_ids(v_uid, r.organization_id), array[v_uid]))));
  end loop;
  perform set_config(v_key, jsonb_build_object('u', v_uid, 'c', v_out)::text, true);
  return v_out;
end;
$function$;
