-- LANE 9 SCOPES-ON-THE-STORE — THE SCOPE DOORS REFUSE IN WORDS A MEMBER CAN ACT ON, measured RED then GREEN on the dev
-- clone (migrations/campaign/scopesrefusals_the_scope_doors_refuse_in_plain_words.sql).
--
-- THE USE CASE. Dana Okafor, an office manager at Cedar Ridge Physical Therapy, follows a link a colleague sent her to
-- the scopes screen of Castellano & Reyes, LLP, a firm she does not belong to, and tries to add a scope type "Insurers"
-- there. She must be told, in one plain sentence she can act on, that she is not a member and what to do. Until this
-- file she was told "You are not a member of that organization, so custom.context_type_write has nothing to do there."
-- (a function name), and the engine's own sentences in the scope doors named custom.context_values, create_scope_type,
-- ensure_slug and dataset_template.
--
-- THE BREAK THIS CATCHES (closed-door rule, CHAIR-GUIDANCE): any scope door whose MESSAGE carries a function, schema or
-- helper name; or a refusal whose developer sentence is lost instead of moved to DETAIL.
-- WHAT MUST HOLD:
--   T1  CENSUS. Every `raise exception '<literal>'` in the lane-9 doors (custom.context_*, custom._ctx_*,
--       custom._context_*, custom.assert_scope_door) has a literal free of schema-qualified names (custom.x, public.x,
--       platform.x, iam.x, context.x), of `_ctx`, and of any snake_case word. (The archive/restore, item and value write
--       doors are censused too: a sublane that names a function there turns this red and fixes its own door.)
--   T2  A non-member, on each of two seats (test@test.com refused at Castellano & Reyes; admin@admin.com refused at an
--       organization she is not in), is refused by custom.context_type_write, custom.context_scope_write and
--       custom.context_archived_types with SQLSTATE 42501, the ONE plain sentence, and the door's own name in DETAIL.
--   T3  No organization named: the ladder's 22004 is re-said as "Choose an organization before working with scopes."
--   T4  A member of the organization is NOT refused (admin at Cedar Ridge reads custom.context_archived_types).
-- RED before the migration (T1 lists the offending messages; T2/T3 hear the door's name); GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesrefusals_the_scope_doors_refuse_in_plain_words_red_green.sql'
\set expect 'clone'
\set requires 'function:custom.context_type_write|function:custom.assert_scope_door'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $suite$
declare
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_cedar constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy
  c_castellano constant uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';   -- Castellano & Reyes, LLP
  c_plain constant text := 'You are not a member of this organization, so you cannot work with its scopes. Ask an owner of it to add you.';
  v_bad text[] := '{}';
  v_foreign_admin uuid;
  v_seat record;
  v_door record;
  v_state text; v_msg text; v_detail text; v_ok boolean;
  v_n integer;
begin
  -- ══ T1: the census of every literal a lane-9 door raises ══
  select coalesce(array_agg(f || ' -> ' || m), '{}') into v_bad
    from (
      select p.proname as f, (regexp_matches(p.prosrc, 'raise\s+exception\s+''((?:[^'']|'''')*)''', 'gi'))[1] as m
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'custom'
         and (p.proname like 'context\_%' or p.proname like '\_ctx\_%' or p.proname like '\_context\_%' or p.proname = 'assert_scope_door')
    ) x
   where m ~* '(custom|public|platform|iam|context|rag)\.[a-z_]+' or m ~* '_ctx' or m ~ '\m[a-z]+_[a-z0-9_]+\M';
  if cardinality(v_bad) > 0 then
    raise exception 'T1 RED: % scope-door refusal message(s) name a function, schema or helper, e.g. %', cardinality(v_bad), v_bad[1:6];
  end if;

  -- an organization admin is not in
  select o.id into v_foreign_admin from iam.organizations o
   where not exists (select 1 from iam.organization_member om where om.organization_id = o.id and om.user_id = c_admin)
   order by o.created_at limit 1;
  if v_foreign_admin is null or c_castellano is null or exists (select 1 from iam.organization_member om where om.organization_id = c_castellano and om.user_id = c_test) then
    raise exception 'scopesrefusals: precondition — the organizations the suite names are not as it expects on this copy';
  end if;

  -- ══ T2: a non-member is refused in words, on two seats, at three doors ══
  for v_seat in select * from (values ('test', c_test, c_castellano), ('admin', c_admin, v_foreign_admin)) s(name, uid, org) loop
    for v_door in select * from (values
        ('type_write'), ('scope_write'), ('archived_types')) d(name) loop
      v_state := null; v_msg := null; v_detail := null;
      begin
        perform set_config('request.jwt.claims', jsonb_build_object('sub', v_seat.uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        if v_door.name = 'type_write' then
          perform custom.context_type_write(v_seat.org, null, '{"label_singular":"Insurer","label_plural":"Insurers"}'::jsonb);
        elsif v_door.name = 'scope_write' then
          perform custom.context_scope_write(v_seat.org, null, gen_random_uuid(), '{"name":"Blue Cross PPO"}'::jsonb);
        else
          perform custom.context_archived_types(v_seat.org);
        end if;
        perform set_config('role', 'none', true);
        raise exception 'T2 RED: % was let into %''s scopes through %', v_seat.name, v_seat.org, v_door.name;
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
        perform set_config('role', 'none', true);
      end;
      if v_msg like 'T2 RED:%' then raise exception '%', v_msg; end if;
      if v_state <> '42501' or v_msg is distinct from c_plain
         or v_detail is null or v_detail not like '%custom.context_' || v_door.name || '%' then
        raise exception 'T2 RED: % at % through %: state %, message [%], detail [%]', v_seat.name, v_seat.org, v_door.name, v_state, v_msg, v_detail;
      end if;
    end loop;
  end loop;

  -- ══ T3: no organization named ══
  begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    perform custom.context_archived_types(null);
    perform set_config('role', 'none', true);
    raise exception 'T3 RED: a null organization was let through';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    perform set_config('role', 'none', true);
  end;
  if v_msg like 'T3 RED:%' then raise exception '%', v_msg; end if;
  if v_state <> '22004' or v_msg is distinct from 'Choose an organization before working with scopes.' then
    raise exception 'T3 RED: no organization named: state %, message [%]', v_state, v_msg;
  end if;

  -- ══ T4: a member is not refused ══
  v_ok := false;
  begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    perform custom.context_archived_types(c_cedar);
    v_ok := true;
    perform set_config('role', 'none', true);
  exception when others then
    perform set_config('role', 'none', true);
  end;
  if not v_ok then raise exception 'T4 RED: a member of Cedar Ridge was refused its archived scope types'; end if;

  raise notice 'GREEN T1-T4: no scope-door message names a function, a non-member is told in one plain sentence (two seats, three doors), a missing organization is asked for in words, a member is let in.';
end
$suite$;

rollback;
