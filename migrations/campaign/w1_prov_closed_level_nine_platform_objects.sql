-- target: branch
--
-- w1_prov_closed_level_nine_platform_objects — LEVELLING, NOT A MIGRATION REPLAY.
--
-- Lane W1-PROV-CLOSED, 2026-09-17. BUILD-BOOK §36: the rehearsal branch is a
-- schema-only transplant and production keeps moving under it, so an object
-- production holds and the branch lacks is a green nobody can spend. On this date
-- `pnpm -s check:branch-schema-drift` exited 1 naming NINE production-only objects
-- in `platform` — the schema this campaign RULES on, which carries no standing
-- exception (§36): the door-contract reader (four functions plus the view that
-- reads them) and the provisioning-grant operator lane (four functions).
--
-- This file carries those nine onto the branch and NOTHING else. It is not a replay
-- of the migrations that built them on production — the branch's ledger holds no
-- production history and every historical file is header-less, which `--target
-- branch` refuses by name (§36, §4.8b). Every body below was READ, on 2026-09-17,
-- out of PRODUCTION's own catalogue inside `begin transaction read only` —
-- `pg_get_functiondef` for the eight functions, `pg_get_viewdef(…, true)` for the
-- view — and pasted here byte for byte, blank lines and comments included. Nothing
-- was retyped and nothing was reconstructed. Production was read and never written:
-- this file's one command targets the branch, and the DO block below refuses to run
-- on production at all.
--
-- The sha256 of production's own definition text, so a later reader can prove what
-- this file carries without trusting it:
--
-- carries: platform.door_arg_rule_findings(p_field text, p_arg text, p_type text, p_entry jsonb) 01835b2d1c98708ccacd48146ae4838e4690fa3850de1429e163773dba48e60d
-- carries: platform.door_rules_normalize(p_args text, p_arg_checks jsonb) 733754e59716e5a60020cf0d40e72c82c63d634f5df9c01b3c9b469090a2f2c9
-- carries: platform.door_split_args(p_args text) 2682db5b6eef9f403622ba339315161d89e4487dde2d2659539650cc0b4ecbb1
-- carries: platform.is_sqlstate(p_code text) 66bc65653e18e1bd5572327d26e203d3db8b66fe13dd9a5efbc2d280bac2dec4
-- carries: platform.provision_grant_assert_operator(p_verb text) 3c15119d90eaa7afa9cd4e61f2fc72bb93d81da93de2057fea38ff7dcfe85578
-- carries: platform.provision_grant_close(p_organization_id uuid, p_schema_name text, p_reason text) 085b9f6ccaa6b35f51b5f72c3196470da22d6ca900c3535aab418ec65f24b000
-- carries: platform.provision_grant_list(p_organization_id uuid) 2620239b80c4b9c2e7fcb79944061bcf576d6cf6319048f3063bfc65dcc4f94c
-- carries: platform.provision_grant_open(p_organization_id uuid, p_schema_name text, p_reason text) 042fda772d6fd303829336419bab5208f29e616ebfd74de630ee14c758dcde81
-- carries: platform.door_argument_rule[v] (pg_get_viewdef) 64e7881ae64966aa67d4fac437d30b29568c7af0d7c7b4b9630e12eb16fee1d9
--
-- THE GRANTS COME WITH THE BODIES. `check:branch-schema-drift`'s second clause fails
-- a function EXECUTE grant the BRANCH has and production does not, for `anon`,
-- `authenticated` or `service_role`, so a body landed with PostgreSQL's default ACL
-- (which is `PUBLIC`) would be looser than production. Production's ACLs, read the
-- same way, are reproduced exactly below: PUBLIC revoked everywhere; the four door
-- readers to `dashboard_user`, `service_role` and `svc_seo`; the three grant verbs to
-- `authenticated`; `provision_grant_assert_operator` to the owner alone — it is the
-- thing the other three ask permission of, so a client that could call it directly
-- would be asking itself. `svc_seo` does not exist on the branch, so its grant is
-- guarded rather than dropped: the file stays production's ACL, and the branch takes
-- the part of it the branch can hold.
--
-- TWO PREREQUISITES, AND NEITHER IS AN OBJECT.
--
-- FIRST, FOUR ROWS. The four `provision_grant_*` functions are SECURITY DEFINER, and
-- this branch's `provision_shape_guard` refuses at COMMIT (23514) any SECURITY DEFINER
-- function that reached it with no access decision declared in
-- `platform.client_callable_door`; a second guard takes their `authenticated` grants
-- straight back off until the same rows exist. Production already holds all four rows
-- and the branch's copy of the table held none — a missing ROW is not an object, so no
-- absence check measured it. The four are carried in section 1b, every column value
-- read from production in the same read-only transaction as the bodies.
--
-- SECOND, ONE COLUMN, AND TWO THINGS NEED IT. `platform.door_argument_rule` selects
-- `d.argument_rules` from `platform.client_callable_door`. Production's copy of that
-- table carries the column; the branch's does not, and no column-level check measures
-- it, so the drift gate never said so. The column is added here — nullable, jsonb,
-- with production's own COMMENT — because without it the view cannot be created at
-- all. LEFT BEHIND, DELIBERATELY: production's `client_callable_door` also carries
-- `contract_probe jsonb`, which the branch lacks and nothing in these nine objects
-- reads. It is real drift, it is outside this lane's brief, and it is written down
-- here rather than silently swept in.
--
--   pnpm db:apply migrations/campaign/w1_prov_closed_level_nine_platform_objects.sql \
--     --source campaign --target branch --lane W1-PROV-CLOSED
--
-- Inverse: migrations/inverse/w1_prov_closed_level_nine_platform_objects_down.sql

set lock_timeout = '2s';
set statement_timeout = '300s';

do $$
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %). These nine objects are '
      'production''s ORIGINALS — this file is the copy that levels the rehearsal '
      'branch up to them, and running it here would overwrite the source with itself.',
      (pg_control_system()).system_identifier;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1 / THE EIGHT FUNCTION BODIES — production's `pg_get_functiondef`, verbatim.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION platform.door_arg_rule_findings(p_field text, p_arg text, p_type text, p_entry jsonb)
 RETURNS jsonb[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f         jsonb[] := '{}'::jsonb[];
  v_is_uuid boolean := p_type ~ '\muuid\M';
  v_is_json boolean := p_type ~ '\mjsonb?\M';
  v_nr      jsonb;
  v_fg      jsonb;
  v_kinds   int;
begin
  -- Prose is no longer a declaration.
  if jsonb_typeof(p_entry) <> 'object' then
    return array[platform.provision_finding('functions.arg_checks.unstructured', p_field, null,
             format('argument %L declares %s', p_arg, jsonb_typeof(p_entry)))];
  end if;

  if (v_is_uuid or v_is_json) and btrim(coalesce(p_entry->>'check', '')) = '' then
    f := f || platform.provision_finding('functions.arg_checks.missing', p_field, null,
           format('argument %L has no declared access check', p_arg));
  end if;

  -- NULL is an argument — for EVERY argument, whatever its type.
  v_nr := p_entry->'null_rule';
  if v_nr is null or jsonb_typeof(v_nr) = 'null' then
    f := f || platform.provision_finding('functions.arg_checks.null_rule_missing',
           p_field || '.null_rule', null,
           format('argument %L does not say what its NULL means', p_arg));
  elsif jsonb_typeof(v_nr) <> 'object' then
    f := f || platform.provision_finding('functions.arg_checks.null_rule_shape',
           p_field || '.null_rule', null, format('null_rule is %s', jsonb_typeof(v_nr)));
  else
    v_kinds := (case when v_nr ? 'sqlstate' then 1 else 0 end)
             + (case when v_nr ? 'means'    then 1 else 0 end)
             + (case when v_nr ? 'default'  then 1 else 0 end);
    if v_kinds <> 1 then
      f := f || platform.provision_finding('functions.arg_checks.null_rule_shape',
             p_field || '.null_rule', null,
             format('%s of sqlstate | means | default', v_kinds));
    elsif v_nr ? 'sqlstate' and not platform.is_sqlstate(v_nr->>'sqlstate') then
      f := f || platform.provision_finding('functions.arg_checks.null_rule_shape',
             p_field || '.null_rule', null,
             format('%L is not a SQLSTATE', v_nr->>'sqlstate'));
    end if;
  end if;

  -- A uuid either names an entity somebody owns, or the declaration says why not.
  if v_is_uuid then
    if not (p_entry ? 'entity') then
      f := f || platform.provision_finding('functions.arg_checks.entity_missing',
             p_field || '.entity', null, format('argument %L', p_arg));
    elsif jsonb_typeof(p_entry->'entity') = 'null' then
      if btrim(coalesce(p_entry->>'entity_reason','')) = '' then
        f := f || platform.provision_finding('functions.arg_checks.entity_missing',
               p_field || '.entity_reason', null,
               format('argument %L says it names no entity and does not say what it names instead', p_arg));
      end if;
    else
      if not exists (select 1 from platform.entity_types e where e.token = p_entry->>'entity') then
        f := f || platform.provision_finding('functions.arg_checks.entity_missing',
               p_field || '.entity', null,
               format('%L is not a platform.entity_types token', p_entry->>'entity'));
      end if;
      if coalesce(p_entry->>'access','') not in ('viewer','editor','admin') then
        f := f || platform.provision_finding('functions.arg_checks.access_missing',
               p_field || '.access', null, coalesce(p_entry->>'access','(not set)'));
      end if;
      v_fg := p_entry->'foreign';
      if jsonb_typeof(v_fg) <> 'object' or not platform.is_sqlstate(v_fg->>'sqlstate') then
        f := f || platform.provision_finding('functions.arg_checks.foreign_missing',
               p_field || '.foreign', null,
               coalesce(v_fg #>> '{}', '(not set)'));
      elsif coalesce((v_fg->>'same_as_invented')::boolean, false) is not true then
        f := f || platform.provision_finding('functions.arg_checks.oracle_declared',
               p_field || '.foreign.same_as_invented', null,
               coalesce(v_fg->>'same_as_invented','(not set)'));
      end if;
    end if;
  end if;

  return f;
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.door_rules_normalize(p_args text, p_arg_checks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_args     jsonb := '{}'::jsonb;
  v_arg      text;
  v_head     text;
  v_name     text;
  v_type     text;
  v_optional boolean;
  v_pos      int := 0;
  v_entry    jsonb;
  v_key      text;
begin
  if jsonb_typeof(p_arg_checks) is distinct from 'object' then
    return null;
  end if;
  for v_arg in
    select a from unnest(platform.door_split_args(coalesce(p_args, ''))) a
  loop
    if lower(v_arg) ~ '^out\s' then continue; end if;
    v_arg      := regexp_replace(v_arg, '^(in|inout|variadic)\s+', '', 'i');
    v_pos      := v_pos + 1;
    v_optional := lower(v_arg) ~ '\sdefault\s' or v_arg ~ '\s=\s';
    v_head     := btrim(regexp_replace(v_arg, '\s+(default|=)\s+.*$', '', 'i'));
    v_name     := split_part(v_head, ' ', 1);
    v_type     := lower(btrim(substr(v_head, length(v_name) + 1)));
    if v_type = '' then v_type := lower(v_name); end if;
    v_entry := coalesce(p_arg_checks->v_name, '{}'::jsonb);
    v_args := v_args || jsonb_build_object(v_name,
      v_entry || jsonb_build_object('position', v_pos, 'type', v_type, 'optional', v_optional));
  end loop;
  -- Ids declared by path inside a jsonb argument keep their own entries verbatim.
  for v_key in select k from jsonb_object_keys(p_arg_checks) k where k like '%.%' loop
    v_args := v_args || jsonb_build_object(v_key,
      (p_arg_checks->v_key) || jsonb_build_object('type', 'uuid', 'nested', true));
  end loop;
  return jsonb_build_object('version', 1, 'arguments', v_args);
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.door_split_args(p_args text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  out_args text[]  := '{}'::text[];
  cur      text    := '';
  depth    int     := 0;
  inq      boolean := false;
  ch       text;
  i        int;
begin
  for i in 1 .. coalesce(length(p_args), 0) loop
    ch := substr(p_args, i, 1);
    if ch = chr(39) then
      inq := not inq;
    elsif not inq then
      if ch in ('(', '[') then
        depth := depth + 1;
      elsif ch in (')', ']') then
        depth := depth - 1;
      elsif ch = ',' and depth = 0 then
        if btrim(cur) <> '' then out_args := out_args || btrim(cur); end if;
        cur := '';
        continue;
      end if;
    end if;
    cur := cur || ch;
  end loop;
  if btrim(cur) <> '' then out_args := out_args || btrim(cur); end if;
  return out_args;
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.is_sqlstate(p_code text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Five characters, and at least one digit. Every PostgreSQL SQLSTATE satisfies this
  -- (22023, 42501, P0002, 0A000); no English word does, which is the whole point:
  -- `MEANS` is five upper-case letters and reached a sqlstate field once already.
  select p_code ~ '^[0-9A-Z]{5}$' and p_code ~ '[0-9]';
$function$
;

CREATE OR REPLACE FUNCTION platform.provision_grant_assert_operator(p_verb text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if not public.is_platform_admin() then
    -- Decided BEFORE anything is read, so this is an oracle for nothing: an
    -- organization that exists and one that does not answer identically.
    raise exception 'provision_grant_denied: % is a platform act. Your account is not a '
                    'platform administrator, so nothing was read and nothing was written.',
                    p_verb
      using errcode = '42501';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.provision_grant_close(p_organization_id uuid, p_schema_name text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_by    text := coalesce(auth.uid()::text, current_setting('role', true), session_user);
  v_hit   int;
begin
  perform platform.provision_grant_assert_operator('closing a schema to an organization');

  if p_organization_id is null then
    raise exception 'provision_grant_close: p_organization_id is required.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_schema_name, '')) = '' then
    raise exception 'provision_grant_close: p_schema_name is required.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 20 then
    raise exception 'provision_grant_close: p_reason must say, in at least 20 characters, why '
                    'this organization may no longer create tables in %L.', p_schema_name
      using errcode = '22023';
  end if;

  update platform.provision_grant g
     set revoked_at = now(), revoked_by = v_by, revoked_reason = btrim(p_reason)
   where g.organization_id = p_organization_id and g.schema_name = p_schema_name
     and g.revoked_at is null;
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    -- Not an error and never silent: say which of the two it was.
    return jsonb_build_object(
      'ok', true, 'changed', false,
      'organization_id', p_organization_id, 'schema_name', p_schema_name,
      'note', 'that schema was not open to this organization, so nothing changed. The '
              'tables it already created are untouched — closing a grant stops NEW '
              'declarations, it never removes what exists.');
  end if;

  insert into platform.activity_log (organization_id, action, actor_id, metadata)
  values (p_organization_id, 'provision_grant.closed', v_actor,
          jsonb_build_object('schema_name', p_schema_name, 'reason', btrim(p_reason),
                             'by', v_by));

  return jsonb_build_object(
    'ok', true, 'changed', true,
    'organization_id', p_organization_id, 'schema_name', p_schema_name,
    'note', 'no new declaration may name that schema. Tables already created there are '
            'untouched, and the grant row is kept as the record that it was open.');
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.provision_grant_list(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(organization_id uuid, organization_name text, schema_name text, granted_by text, granted_at timestamp with time zone, reason text, revoked_at timestamp with time zone, revoked_by text, revoked_reason text, open boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  perform platform.provision_grant_assert_operator('reading the provisioning grants');
  return query
    select g.organization_id, o.name::text, g.schema_name, g.granted_by, g.granted_at,
           g.reason, g.revoked_at, g.revoked_by, g.revoked_reason, (g.revoked_at is null)
      from platform.provision_grant g
      join iam.organizations o on o.id = g.organization_id
     where p_organization_id is null or g.organization_id = p_organization_id
     order by o.name, g.schema_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.provision_grant_open(p_organization_id uuid, p_schema_name text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor  uuid := auth.uid();
  v_by     text := coalesce(auth.uid()::text, current_setting('role', true), session_user);
  v_legal  boolean;
  v_reopen boolean;
begin
  perform platform.provision_grant_assert_operator('opening a schema to an organization');

  if p_organization_id is null then
    raise exception 'provision_grant_open: p_organization_id is required — a grant with no '
                    'organization would open the schema to nobody and read as success.'
      using errcode = '22023';
  end if;
  if btrim(coalesce(p_schema_name, '')) = '' then
    raise exception 'provision_grant_open: p_schema_name is required.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 20 then
    raise exception 'provision_grant_open: p_reason must say, in at least 20 characters, why '
                    'this organization may create tables in %L. The reason is the only thing '
                    'a later reader has.', p_schema_name
      using errcode = '22023';
  end if;

  if not exists (select 1 from iam.organizations o where o.id = p_organization_id) then
    raise exception 'provision_grant_open: no such organization.' using errcode = 'P0002';
  end if;

  select true into v_legal
    from platform.provision_legal_schemas(null) s
   where s.schema_name = p_schema_name;
  if not coalesce(v_legal, false) then
    raise exception 'provision_grant_open: %L is not a schema this platform may provision '
                    'into. A schema is legal only when BOTH repository generate lists carry '
                    'it (aidream db/matrx_orm.yaml and matrx-frontend package.json db-types); '
                    'otherwise a table created there is invisible to every model, type and '
                    'registry. Legal schemas: %.',
                    p_schema_name,
                    (select string_agg(s.schema_name, ', ' order by s.schema_name)
                       from platform.provision_legal_schemas(null) s)
      using errcode = 'check_violation';
  end if;

  select (g.revoked_at is not null) into v_reopen
    from platform.provision_grant g
   where g.organization_id = p_organization_id and g.schema_name = p_schema_name;

  insert into platform.provision_grant
    (organization_id, schema_name, granted_by, granted_at, reason)
  values (p_organization_id, p_schema_name, v_by, now(), btrim(p_reason))
  on conflict (organization_id, schema_name) do update
    set granted_by = excluded.granted_by,
        granted_at = excluded.granted_at,
        reason = excluded.reason,
        revoked_at = null, revoked_by = null, revoked_reason = null;

  insert into platform.activity_log (organization_id, action, actor_id, metadata)
  values (p_organization_id,
          case when coalesce(v_reopen, false) then 'provision_grant.reopened'
               else 'provision_grant.opened' end,
          v_actor,
          jsonb_build_object('schema_name', p_schema_name, 'reason', btrim(p_reason),
                             'by', v_by));

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'schema_name', p_schema_name,
    'reopened', coalesce(v_reopen, false),
    'note', format('%s may now declare tables in %L through the restricted lane. Nothing '
                   'else changed: the lane still refuses SQL text, still writes only into '
                   'this organization, and still certifies every table it creates.',
                   (select o.name from iam.organizations o where o.id = p_organization_id),
                   p_schema_name));
end;
$function$
;


COMMENT ON FUNCTION platform.is_sqlstate(p_code text) IS 'A SQLSTATE is five of [0-9A-Z] AND carries at least one digit. Added 0797 after a prose parser stored the word MEANS as a refusal code on 26 door arguments.';


-- ---------------------------------------------------------------------------
-- 1a / THE ONE COLUMN — `platform.client_callable_door.argument_rules`, production's
--      definition: jsonb, nullable, no default. FIRST, because two things below need it:
--      section 1b writes production's four door rows into it, and section 4's view
--      SELECTs it. See the header for why the drift gate never named it.
-- ---------------------------------------------------------------------------

alter table platform.client_callable_door add column if not exists argument_rules jsonb;

COMMENT ON COLUMN platform.client_callable_door.argument_rules IS 'The per-argument door contract as DATA (lessons ledger 27+28): version, then one entry per argument with its type, whether it is optional, the entity token it names and the access level that entity demands, the NULL rule as a SQLSTATE or a named meaning, and the rule that a foreign id and an invented id answer identically. Written by platform.provision from the spec''s functions[].arg_checks; read by db/generate_door_contract_test.py, which emits a live pytest contract from it.';

-- ---------------------------------------------------------------------------
-- 1b / THE FOUR DOOR DECLARATIONS THE FOUR SECURITY DEFINER FUNCTIONS OWE.
--
--      Landed BEFORE the grants and in this same transaction, because that is what
--      the branch's own guards demand and they are right to:
--        · `provision_shape_guard` / `_provision_shape_settled` raises 23514 at COMMIT
--          for a SECURITY DEFINER function that reached it "with no access decision
--          declared" — measured on the branch on 2026-09-17, on the first apply of
--          this file, for all four `provision_grant_*` functions;
--        · the `definer_client_grant_revoked` DDL guard takes a client GRANT straight
--          back off an undeclared SECURITY DEFINER function, so section 2's three
--          `authenticated` grants do not stick until these rows exist.
--
--      These rows are DATA, and production already holds all four — they were read
--      out of production's `platform.client_callable_door` on 2026-09-17 in the same
--      read-only transaction as the bodies, and every column value below, `reason`
--      and `argument_rules` included, is production's own text. No absence check
--      measures a missing ROW, so the drift gate never named them; without them the
--      nine objects cannot land at all.
--
--      `where not exists` rather than a bare INSERT, so `--reapply` is a no-op here
--      instead of a duplicate.
-- ---------------------------------------------------------------------------

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   gate_predicate, signed_in_callers, anonymous_callers, anonymous_purpose, non_client_lane,
   probe_args, argument_rules)
select 'platform', 'provision_grant_assert_operator', 'p_verb text',
       '{25}'::oid[],
       'migration 0799',
       'PRIVATE HELPER — no client lane. It IS the access decision behind platform.provision_grant_open / _close / _list: it raises 42501 unless the caller is public.is_platform_admin(), and it does so before any organization or schema is read, so none of the three is an existence oracle. It takes no entity id: p_verb is the sentence the refusal says out loud.',
       null, 'f', 'f', null,
       'server_only: called only from the three platform.provision_grant_* functions, in the same transaction, as the first statement of each; no client ever calls it and it is revoked from PUBLIC, authenticated and anon above.',
       null, '{"version": 1, "arguments": {"p_verb": {"type": "text", "check": "not an id — the words the refusal uses", "optional": false, "position": 1, "null_rule": {"means": "the refusal names no verb; the caller is still refused"}}}}'::jsonb
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'platform' and d.function_name = 'provision_grant_assert_operator' and d.identity_args = 'p_verb text');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   gate_predicate, signed_in_callers, anonymous_callers, anonymous_purpose, non_client_lane,
   probe_args, argument_rules)
select 'platform', 'provision_grant_close', 'p_organization_id uuid, p_schema_name text, p_reason text',
       '{2950,25,25}'::oid[],
       'migration 0799',
       'WRITE, platform operators only. Closes one schema to one organization: no NEW declaration may name it, and everything already created there is untouched. The grant row is kept, carrying who closed it and why — the table is the record. Refuses anyone who is not public.is_platform_admin() with 42501, decided before anything is read. A grant that was not open answers ok with changed=false and says so in words rather than failing silently.',
       null, 't', 'f', null,
       null,
       null, '{"version": 1, "arguments": {"p_reason": {"type": "text", "check": "why the lane is being taken away; kept on the row", "optional": false, "position": 3, "null_rule": {"sqlstate": "22023"}}, "p_schema_name": {"type": "text", "check": "the schema to close; an unopened one is reported, never raised", "optional": false, "position": 2, "null_rule": {"sqlstate": "22023"}}, "p_organization_id": {"type": "uuid", "check": "platform administrator; the organization itself is never asked", "access": "admin", "entity": "organization", "foreign": {"note": "a non-operator is refused before either id is read", "sqlstate": "42501", "same_as_invented": true}, "optional": false, "position": 1, "null_rule": {"sqlstate": "22023"}}}}'::jsonb
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'platform' and d.function_name = 'provision_grant_close' and d.identity_args = 'p_organization_id uuid, p_schema_name text, p_reason text');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   gate_predicate, signed_in_callers, anonymous_callers, anonymous_purpose, non_client_lane,
   probe_args, argument_rules)
select 'platform', 'provision_grant_list', 'p_organization_id uuid',
       '{2950}'::oid[],
       'migration 0799',
       'READ, platform operators only. Every provisioning grant the platform has ever opened, open and closed alike, with who and why. Refuses anyone who is not public.is_platform_admin() with 42501 before a row is read. An organization reads its OWN open schemas through provision_options(''schemas''), which is what the restricted lane is granted — never through this.',
       null, 't', 'f', null,
       null,
       null, '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "check": "platform administrator; narrows the listing, decides nothing", "access": "admin", "entity": "organization", "foreign": {"note": "a non-operator is refused before any row is read", "sqlstate": "42501", "same_as_invented": true}, "optional": true, "position": 1, "null_rule": {"means": "every organization"}}}}'::jsonb
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'platform' and d.function_name = 'provision_grant_list' and d.identity_args = 'p_organization_id uuid');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   gate_predicate, signed_in_callers, anonymous_callers, anonymous_purpose, non_client_lane,
   probe_args, argument_rules)
select 'platform', 'provision_grant_open', 'p_organization_id uuid, p_schema_name text, p_reason text',
       '{2950,25,25}'::oid[],
       'migration 0799',
       'WRITE, platform operators only. Opens ONE schema to ONE organization so its agents may declare tables through the restricted lane. Refuses anyone who is not public.is_platform_admin() with 42501, decided BEFORE the organization or the schema is read, so it is an existence oracle for neither. Refuses a schema both repository generate lists do not carry, naming them. Re-opening a closed grant clears the revocation and is recorded as such in platform.activity_log.',
       null, 't', 'f', null,
       null,
       null, '{"version": 1, "arguments": {"p_reason": {"type": "text", "check": "the only account a later reader has of why this was opened", "optional": false, "position": 3, "null_rule": {"sqlstate": "22023"}}, "p_schema_name": {"type": "text", "check": "must be a schema BOTH repository generate lists carry (W2-G1)", "optional": false, "position": 2, "null_rule": {"sqlstate": "22023"}}, "p_organization_id": {"type": "uuid", "check": "platform administrator; the organization itself is never asked", "access": "admin", "entity": "organization", "foreign": {"note": "a non-operator is refused before either id is read", "sqlstate": "42501", "same_as_invented": true}, "optional": false, "position": 1, "null_rule": {"sqlstate": "22023"}}}}'::jsonb
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'platform' and d.function_name = 'provision_grant_open' and d.identity_args = 'p_organization_id uuid, p_schema_name text, p_reason text');


-- ---------------------------------------------------------------------------
-- 2 / THE EIGHT FUNCTIONS' ACLs — production's `proacl`, reproduced.
--     Read on 2026-09-17 from production's pg_proc:
--       door_arg_rule_findings   postgres=X/postgres dashboard_user=X/postgres service_role=X/postgres svc_seo=X/postgres
--       door_rules_normalize     postgres=X/postgres dashboard_user=X/postgres service_role=X/postgres svc_seo=X/postgres
--       door_split_args          postgres=X/postgres dashboard_user=X/postgres service_role=X/postgres svc_seo=X/postgres
--       is_sqlstate              postgres=X/postgres dashboard_user=X/postgres service_role=X/postgres svc_seo=X/postgres
--       provision_grant_assert_operator  postgres=X/postgres
--       provision_grant_close    postgres=X/postgres authenticated=X/postgres
--       provision_grant_list     postgres=X/postgres authenticated=X/postgres
--       provision_grant_open     postgres=X/postgres authenticated=X/postgres
--     PUBLIC appears in none of them, so PUBLIC is revoked first — a CREATE FUNCTION
--     with no ACL work leaves PUBLIC holding EXECUTE, which is every role on earth.
-- ---------------------------------------------------------------------------

revoke all on function platform.door_arg_rule_findings(p_field text, p_arg text, p_type text, p_entry jsonb) from public;
revoke all on function platform.door_rules_normalize(p_args text, p_arg_checks jsonb) from public;
revoke all on function platform.door_split_args(p_args text) from public;
revoke all on function platform.is_sqlstate(p_code text) from public;
revoke all on function platform.provision_grant_assert_operator(p_verb text) from public;
revoke all on function platform.provision_grant_close(p_organization_id uuid, p_schema_name text, p_reason text) from public;
revoke all on function platform.provision_grant_list(p_organization_id uuid) from public;
revoke all on function platform.provision_grant_open(p_organization_id uuid, p_schema_name text, p_reason text) from public;

grant execute on function platform.door_arg_rule_findings(p_field text, p_arg text, p_type text, p_entry jsonb) to dashboard_user, service_role;
grant execute on function platform.door_rules_normalize(p_args text, p_arg_checks jsonb) to dashboard_user, service_role;
grant execute on function platform.door_split_args(p_args text) to dashboard_user, service_role;
grant execute on function platform.is_sqlstate(p_code text) to dashboard_user, service_role;

-- AND `authenticated` COMES BACK OFF THE FOUR DOOR READERS. This branch's
-- `anon_function_execute_closed_at_birth` DDL guard fires at CREATE FUNCTION, takes
-- PUBLIC's implicit EXECUTE away and re-issues it EXPLICITLY to every signed-in role
-- that held it a moment ago — which is right for a new function and wrong for a copy
-- of an old one. Production's ACL for these four names `dashboard_user`,
-- `service_role` and `svc_seo` and NOT `authenticated`, so the guard's replacement
-- left the branch LOOSER than production on exactly the axis
-- `check:branch-schema-drift`'s second clause fails: measured after the first apply on
-- 2026-09-17, all four read `authenticated=X/postgres`. Revoked here so the branch
-- answers 42501 where production answers 42501.
revoke execute on function platform.door_arg_rule_findings(p_field text, p_arg text, p_type text, p_entry jsonb) from authenticated, anon;
revoke execute on function platform.door_rules_normalize(p_args text, p_arg_checks jsonb) from authenticated, anon;
revoke execute on function platform.door_split_args(p_args text) from authenticated, anon;
revoke execute on function platform.is_sqlstate(p_code text) from authenticated, anon;

grant execute on function platform.provision_grant_close(p_organization_id uuid, p_schema_name text, p_reason text) to authenticated;
grant execute on function platform.provision_grant_list(p_organization_id uuid) to authenticated;
grant execute on function platform.provision_grant_open(p_organization_id uuid, p_schema_name text, p_reason text) to authenticated;

-- `svc_seo` is a production role the rehearsal branch was never given. Production's
-- ACL is still what this file says; the branch simply has no such grantee, and a bare
-- GRANT would fail with 42704 on a role nobody here can create.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'svc_seo') then
    execute 'grant execute on function platform.door_arg_rule_findings(p_field text, p_arg text, p_type text, p_entry jsonb) to svc_seo';
    execute 'grant execute on function platform.door_rules_normalize(p_args text, p_arg_checks jsonb) to svc_seo';
    execute 'grant execute on function platform.door_split_args(p_args text) to svc_seo';
    execute 'grant execute on function platform.is_sqlstate(p_code text) to svc_seo';
  else
    raise notice 'svc_seo does not exist on this server; production''s four svc_seo EXECUTE grants are not reproducible here and are recorded in this file instead.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4 / THE VIEW — production's `pg_get_viewdef(…, true)`, verbatim.
--     Production's pg_class for it, read the same day: relkind `v`, owner `postgres`,
--     reloptions `security_invoker=true`, relrowsecurity false, no policies, and a
--     DEFAULT relacl — owner only, no anon / authenticated / service_role SELECT.
--     So there is nothing to grant here, and granting anything would be looser than
--     production. `security_invoker=true` is carried because without it the view would
--     read `platform.client_callable_door` as `postgres` for every caller.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW platform.door_argument_rule
  WITH (security_invoker = true)
AS
 SELECT d.schema_name,
    d.function_name,
    d.identity_args,
    k.key AS argument,
    (k.value ->> 'position'::text)::integer AS "position",
    k.value ->> 'type'::text AS arg_type,
    COALESCE((k.value ->> 'optional'::text)::boolean, false) AS optional,
    k.value ->> 'entity'::text AS entity_token,
    k.value ->> 'access'::text AS access_level,
    k.value ->> 'check'::text AS check_note,
    k.value -> 'null_rule'::text AS null_rule,
    k.value -> 'foreign'::text AS foreign_rule,
    d.signed_in_callers,
    d.anonymous_callers
   FROM platform.client_callable_door d
     CROSS JOIN LATERAL jsonb_each(d.argument_rules -> 'arguments'::text) k(key, value)
  WHERE d.argument_rules IS NOT NULL;

COMMENT ON VIEW platform.door_argument_rule IS 'One row per doored argument: the structured door contract, queryable. A door whose rules are still prose-only is absent from this view.';
