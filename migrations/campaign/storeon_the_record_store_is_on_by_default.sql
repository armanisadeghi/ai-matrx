-- based-on: platform.feature_knob_set(text, text, jsonb) 52c2c697e3862230d12c81b2a7be054e24a3af4dfd1a461513b99b7e04101c46
--
-- STORE-ON — THE RECORD STORE IS ON BY DEFAULT, AND SO ARE RELATION COLUMNS.
--
-- OWNER RULING, Arman, 2026-09-23, live: *"the record store switch that defaults an
-- organization to OFF -- so an organization has no custom data access until someone turns it
-- on -- is wrong. The default is ON."*
--
-- LIMITS-FIX (2026-09-21) fixed half of this and said so in its own header: it made an
-- organization BORN from that day carry its own `custom/system_enabled = true` override, and
-- it deliberately did NOT move the platform default, so the 515 organizations that already
-- existed kept resolving to false. The owner has now ruled on the half that was left: the
-- platform default itself is ON. An organization is OFF only when it has said so.
--
-- WHAT THE PLATFORM DEFAULT IS, precisely. `platform.knob_resolve_uncached` reads
-- `coalesce(value, default_value)` from `platform.feature_knob`, and `value` is NOT NULL, so
-- `value` IS the default every reader resolves and `default_value` is the factory reset that
-- `platform.feature_knob_set(…, null)` returns it to. A ruling that moved only one of them
-- would be undone by the next reset, so BOTH move, and both move through a door.
--
-- THREE KNOBS, one ruling:
--   * `custom` / `system_enabled`                       — the record store itself.
--   * `custom` / `code_paths_enabled`                   — THE SAME SWITCH'S OTHER HALF, the
--     one aidream's server kill switch reads. NAV-FIX ruled the store is ONE switch and
--     FIX-11A gave the override table a trigger that keeps the two halves in step — but that
--     trigger mirrors OVERRIDE ROWS and reconciles nothing at the platform default. Moving
--     `system_enabled`'s default alone would put every organization with no override of its
--     own into exactly the state FIX-11A found on Greenline Landscaping Crew: every screen
--     saying on while the server refused. The one switch moves as one switch.
--   * `data_tables.relation` / `relation_columns_enabled` — OLD-TABLES-2 shipped the older
--     store's relation columns default FALSE as a rollout knob; the same ruling turns it on.
--
-- WHY `platform.feature_knob_set` IS TOUCHED AT ALL. The knob register's own door is
-- `public.is_admin()`-only, which reads `auth.uid()` — null on a migration lane and null on
-- the server. So the platform could not change its own platform defaults through its own
-- door, and every previous change to this table was a raw INSERT or UPDATE. The arm added
-- here is the SAME one `platform.may_operate_unified_data_ramp` already uses, read from the
-- catalogue rather than as a role literal: whoever owns `platform.feature_knob` owns the
-- register, and that is the campaign's migrations and the database owner. It admits no
-- client: `anon`, `authenticated` and `service_role` are not members of that role, and the
-- table's RESTRICTIVE policies refuse them a write regardless.
--
-- `platform.feature_knob_default_set` is NEW, and is the missing half of the register's door:
-- the factory reset had no door at all. Same gate, same validation, same history trigger.
--
-- INVERSE: `migrations/inverse/storeon_the_record_store_is_on_by_default_down.sql` puts both
-- knobs' `value` and `default_value` back to false through the same two doors, and restores
-- `platform.feature_knob_set` to the body named in `-- based-on:` above.
--
-- This file is HEADER-LESS on purpose. A `-- target:` header naming production is judged by
-- the allow-list (JUDGMENT.md §4), which enumerates no `SELECT`, so a file that CALLS a door
-- cannot carry one. The deny-list judges it instead: it carries no DROP, REVOKE, UPDATE,
-- DELETE, TRUNCATE, ALTER TYPE, ALTER POLICY or GRANT.

CREATE OR REPLACE FUNCTION platform.feature_knob_set(p_feature text, p_key text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'public'
AS $function$
declare
  v_row platform.feature_knob%rowtype;
  v_num numeric;
begin
  -- STORE-ON 2026-09-23: the register's OWNER is admitted alongside a platform admin.
  -- `current_user` is the definer in here and answers "the owner" for everybody, so the
  -- caller is read the way platform.may_operate_unified_data_ramp reads it: the role GUC
  -- PostgREST sets per request, falling back to the role the connection authenticated as.
  -- Read the owner from the catalogue, never as a role literal (rule 15).
  if not public.is_admin()
     and not pg_catalog.pg_has_role(
       coalesce(nullif(pg_catalog.current_setting('role', true), 'none'),
                session_user)::name,
       (select c.relowner from pg_catalog.pg_class c
         where c.oid = 'platform.feature_knob'::regclass),
       'member') then
    raise exception 'platform.feature_knob_set: admin only' using errcode = '42501';
  end if;

  select * into v_row from platform.feature_knob where feature = p_feature and key = p_key;
  if v_row.feature is null then
    raise exception 'platform.feature_knob_set: unknown knob %.%', p_feature, p_key
      using errcode = '22023';
  end if;

  if p_value is null or jsonb_typeof(p_value) = 'null' then
    update platform.feature_knob
       set value = default_value, set_by = 'agent',
           updated_by = auth.uid(), updated_at = now()
     where feature = p_feature and key = p_key
     returning * into v_row;
    return to_jsonb(v_row);
  end if;

  if v_row.value_type in ('number','integer') then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'platform.feature_knob_set: %.% expects a number, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
    v_num := (p_value #>> '{}')::numeric;
    if v_row.value_type = 'integer' and v_num <> trunc(v_num) then
      raise exception 'platform.feature_knob_set: %.% expects a whole number, got %',
        p_feature, p_key, v_num using errcode = '22023';
    end if;
    if v_row.min_value is not null and v_num < v_row.min_value then
      raise exception 'platform.feature_knob_set: %.% must be >= % (got %)',
        p_feature, p_key, v_row.min_value, v_num using errcode = '22023';
    end if;
    if v_row.max_value is not null and v_num > v_row.max_value then
      raise exception 'platform.feature_knob_set: %.% must be <= % (got %)',
        p_feature, p_key, v_row.max_value, v_num using errcode = '22023';
    end if;
  elsif v_row.value_type = 'boolean' then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'platform.feature_knob_set: %.% expects a boolean, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
  elsif v_row.value_type = 'json' then
    -- jsonb has already parsed the value. Objects, arrays, and scalar JSON are
    -- all valid for a registry key declared as json; SQL null above is reset.
    if jsonb_typeof(p_value) not in ('object', 'array', 'string', 'number', 'boolean') then
      raise exception 'platform.feature_knob_set: %.% expects JSON, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
  elsif v_row.value_type = 'secret' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'vault_adapter_required',
      'feature', p_feature,
      'key', p_key,
      'detail', 'Secret settings must be changed through the dedicated Vault contract; raw values are never accepted here.'
    );
  else
    if jsonb_typeof(p_value) <> 'string' then
      raise exception 'platform.feature_knob_set: %.% expects a string, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
    if v_row.allowed_values is not null
       and not (v_row.allowed_values @> jsonb_build_array(p_value)) then
      raise exception 'platform.feature_knob_set: %.% must be one of %',
        p_feature, p_key, v_row.allowed_values::text using errcode = '22023';
    end if;
  end if;

  update platform.feature_knob
     set value = p_value, set_by = 'human',
         updated_by = auth.uid(), updated_at = now()
   where feature = p_feature and key = p_key
   returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

-- THE FACTORY RESET HAD NO DOOR. `platform.feature_knob_set(…, null)` returns a knob to
-- `default_value`, and nothing could change `default_value` except a raw write — so a ruling
-- about what a knob's default IS could only be recorded halfway. Same gate as the door above,
-- same type validation, and the same `_knob_history_capture` trigger records the move.
CREATE OR REPLACE FUNCTION platform.feature_knob_default_set(p_feature text, p_key text, p_default jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'public'
AS $function$
declare
  v_row platform.feature_knob%rowtype;
  v_num numeric;
begin
  if not public.is_admin()
     and not pg_catalog.pg_has_role(
       coalesce(nullif(pg_catalog.current_setting('role', true), 'none'),
                session_user)::name,
       (select c.relowner from pg_catalog.pg_class c
         where c.oid = 'platform.feature_knob'::regclass),
       'member') then
    raise exception 'platform.feature_knob_default_set: admin only' using errcode = '42501';
  end if;

  if p_default is null or jsonb_typeof(p_default) = 'null' then
    raise exception 'platform.feature_knob_default_set: %.% needs the value its factory reset returns it to. A knob with no default is a knob that resolves to nothing.',
      p_feature, p_key using errcode = '22004';
  end if;

  select * into v_row from platform.feature_knob where feature = p_feature and key = p_key;
  if v_row.feature is null then
    raise exception 'platform.feature_knob_default_set: unknown knob %.%', p_feature, p_key
      using errcode = '22023';
  end if;

  if v_row.value_type in ('number','integer') then
    if jsonb_typeof(p_default) <> 'number' then
      raise exception 'platform.feature_knob_default_set: %.% expects a number, got %',
        p_feature, p_key, jsonb_typeof(p_default) using errcode = '22023';
    end if;
    v_num := (p_default #>> '{}')::numeric;
    if v_row.value_type = 'integer' and v_num <> trunc(v_num) then
      raise exception 'platform.feature_knob_default_set: %.% expects a whole number, got %',
        p_feature, p_key, v_num using errcode = '22023';
    end if;
    if v_row.min_value is not null and v_num < v_row.min_value then
      raise exception 'platform.feature_knob_default_set: %.% must be >= % (got %)',
        p_feature, p_key, v_row.min_value, v_num using errcode = '22023';
    end if;
    if v_row.max_value is not null and v_num > v_row.max_value then
      raise exception 'platform.feature_knob_default_set: %.% must be <= % (got %)',
        p_feature, p_key, v_row.max_value, v_num using errcode = '22023';
    end if;
  elsif v_row.value_type = 'boolean' then
    if jsonb_typeof(p_default) <> 'boolean' then
      raise exception 'platform.feature_knob_default_set: %.% expects a boolean, got %',
        p_feature, p_key, jsonb_typeof(p_default) using errcode = '22023';
    end if;
  elsif v_row.value_type = 'json' then
    if jsonb_typeof(p_default) not in ('object', 'array', 'string', 'number', 'boolean') then
      raise exception 'platform.feature_knob_default_set: %.% expects JSON, got %',
        p_feature, p_key, jsonb_typeof(p_default) using errcode = '22023';
    end if;
  elsif v_row.value_type = 'secret' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'vault_adapter_required',
      'feature', p_feature,
      'key', p_key,
      'detail', 'A secret''s factory value lives in the Vault contract; raw values are never accepted here.'
    );
  else
    if jsonb_typeof(p_default) <> 'string' then
      raise exception 'platform.feature_knob_default_set: %.% expects a string, got %',
        p_feature, p_key, jsonb_typeof(p_default) using errcode = '22023';
    end if;
    if v_row.allowed_values is not null
       and not (v_row.allowed_values @> jsonb_build_array(p_default)) then
      raise exception 'platform.feature_knob_default_set: %.% must be one of %',
        p_feature, p_key, v_row.allowed_values::text using errcode = '22023';
    end if;
  end if;

  update platform.feature_knob
     set default_value = p_default, updated_by = auth.uid(), updated_at = now()
   where feature = p_feature and key = p_key
   returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

-- THE DOOR IS DECLARED IN DATA, in this same transaction, because a SECURITY DEFINER
-- function that reaches COMMIT without one is refused by `provision_shape_guard` (23514).
-- No client role is granted EXECUTE on it, so it is a non-client lane and says so.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
VALUES
  ('platform', 'feature_knob_default_set', 'p_feature text, p_key text, p_default jsonb',
   ARRAY['text','text','jsonb']::regtype[]::oid[],
   'The knob register''s factory-reset door. It names no entity id: p_feature and p_key address a row of platform.feature_knob by its own primary key and p_default is the value that row''s reset returns it to, so there is nothing here to check a caller against. The gate is the same one platform.feature_knob_set carries — public.is_admin(), or the role that owns platform.feature_knob, read from the catalogue.',
   'STORE-ON storeon_the_record_store_is_on_by_default.sql',
   'server_only: no client role holds EXECUTE on this function and none ever will. A platform default is not one organization''s setting — the client door for what an organization chooses is platform.knob_override_set, and the client door for the live platform value is platform.feature_knob_set. This one moves the FACTORY value the whole platform falls back to, which only a migration lane and the database owner may do.',
   false, false)
ON CONFLICT (schema_name, function_name, identity_argtypes) DO NOTHING;

COMMENT ON FUNCTION platform.feature_knob_default_set(text, text, jsonb) IS
  'The knob register''s factory-reset door: sets platform.feature_knob.default_value, the value platform.feature_knob_set(…, null) returns a knob to. Same gate as feature_knob_set — a platform admin, or the role that owns platform.feature_knob (the campaign''s migrations and the database owner). Added by STORE-ON 2026-09-23 so an owner ruling about what a knob''s DEFAULT is can be recorded through a door instead of a raw write.';

-- ── THE RULING, THROUGH THE DOORS ────────────────────────────────────────────────────────
SELECT platform.feature_knob_set('custom', 'system_enabled', 'true'::jsonb);
SELECT platform.feature_knob_default_set('custom', 'system_enabled', 'true'::jsonb);
SELECT platform.feature_knob_set('custom', 'code_paths_enabled', 'true'::jsonb);
SELECT platform.feature_knob_default_set('custom', 'code_paths_enabled', 'true'::jsonb);
SELECT platform.feature_knob_set('data_tables.relation', 'relation_columns_enabled', 'true'::jsonb);
SELECT platform.feature_knob_default_set('data_tables.relation', 'relation_columns_enabled', 'true'::jsonb);
