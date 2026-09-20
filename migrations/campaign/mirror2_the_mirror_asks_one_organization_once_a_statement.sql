-- chair-step: it adds the one function the RLS mirror on custom.record names and GRANTs a signed-in client EXECUTE on it, which the production allow-list refuses by name — correctly, because a grant is how a schema opens. The grant is the point: an RLS policy expression is evaluated as the QUERYING role, so the role reading custom.record must be able to execute what the policy names, exactly as it already executes iam.accessible_entity_ids, iam.has_access and iam.unnest_uuids in that same policy. It is declared first in platform.client_callable_door as a SIGNED-IN door (anonymous_callers = false, so the DDL guard takes anon and PUBLIC back), it takes NO principal and answers only about (select auth.uid()), and its body decides on custom.visible_set / custom.has_visibility before it reads anything — platform.definer_body_decides_access() says so. Nothing live is replaced: all three functions are new. Its inverse is migrations/inverse/mirror2_the_mirror_asks_one_organization_once_a_statement_down.sql.
-- based-on: custom.visible_set(uuid, uuid, uuid, permission_level) d82d8f6ef5a20aa2234123115fd01064ad55a81d2029a72363e0a39dd17bbb27
-- based-on: custom.visible_predicate_sql(uuid, uuid, uuid, permission_level, text) 64940bbe02edc01cf793690e471344b67982060007a38cf4e86e7efc22e2c961
-- based-on: custom.has_visibility(uuid, text, uuid, permission_level) a62d4e0e3499c9c104702b7cabaa0ce6e311173c32e6672f9affe53643acbf00
-- based-on: custom.visible_record_ids(uuid, permission_level) a99682186e83ae0581e5708b4d9cfe5f9c2af9f7c17b8a10a4289aeab8c6d5b1
-- based-on: iam.accessible_entity_ids(text, permission_level, integer, boolean) 39549ac07b9be3bdaf99c57ebe54c776d924a75f4a7044ec9ebb78817b7ee7eb
--
-- MIRROR-2, FILE 1 — THE STATEMENT-SCOPED MEMO, WITH ITS OWN FENCE.
--
-- THE DEFECT, measured on the main database 2026-09-20 14:4xZ and root-caused by LADDER-PERF §7.
-- The RLS mirror's last arm is
--
--     id in (select iam.unnest_uuids(iam.accessible_entity_ids('record','viewer',0,true))
--            union ...) and iam.has_access('record', id, 'viewer')
--
-- and `iam.accessible_entity_ids('record', …)` — while the `custom/accessible_entity_ids_guard`
-- knob resolves true — is `custom.visible_record_ids(uid, required)`, which loops over the
-- store's (organization, Table) groups for the WHOLE DATABASE. That subquery is uncorrelated,
-- so the planner hoists it and computes it exactly ONCE per statement (loops=1, MIRROR-PERF §6)
-- — but once over 554 groups, 1,185 ladder calls, 5,873 ms in `custom.visible_set`. A member
-- asking for 100 records of ONE organization pays for every organization on the database:
--
--     select r.id from custom.record r where r.organization_id = '4352d061-…' limit 100
--       as test@test.com, role authenticated, real claims      6,729.602 ms
--
-- The organization is in the query's own WHERE and the mirror threw it away.
--
-- WHAT THIS FILE DOES. It gives the mirror a function it can ask about the ROW's organization —
-- `iam.record_visible_in_org` — and a memo so the answer is computed ONCE PER STATEMENT per
-- (principal, organization, Table, level), not once per row. A member of several organizations
-- pays once per organization the statement actually touches.
--
-- NOTHING NEW DECIDES ANYTHING. `custom.visible_set` is still the only thing that decides how
-- few times to ask, `custom.has_visibility` is still the only thing that decides, and the four
-- arms below are `custom.visible_predicate_sql`'s four arms character for character — the same
-- text `custom.visible_record_ids` puts in the WHERE of its per-group scan. That is why the
-- answer cannot move by one row: for a LIVE record of (organization, Table),
--
--     iam.record_visible_in_org(org, tbl, id, vis, created_by, req)   -- the caller is auth.uid()
--       ===  id in (select * from custom.visible_record_ids(u, req))
--
-- holds by construction, because a record lives in exactly one (organization, Table) group and
-- `custom.visible_record_ids` evaluates exactly this predicate on exactly that group.
--
-- THE FENCE (LADDER-PERF §7 asked for it by name). A memo is only safe while the thing it
-- remembers cannot have moved underneath it. The epoch is
--
--     statement_timestamp() / backend pid / (the transaction's xid, or 'ro' if it has not
--                                            written)
--
-- and the memo is re-read from the key and DISCARDED unless the stored epoch matches.
--   * A new statement has a new `statement_timestamp()`, so nothing survives a statement — the
--     memo is statement-scoped, which is exactly what "once per statement" means.
--   * A transaction that WRITES gets an xid assigned the moment it does, so every entry taken
--     before the write is thrown away by the epoch, and the read after the write recomputes.
--   * Within ONE statement a write cannot change the answer: a data-modifying CTE's own writes
--     are invisible to the reading part of the same statement (same snapshot), so the value the
--     memo holds is the value that statement must see.
--   * The key carries the PRINCIPAL, so a pooled backend serving a different person cannot read
--     another person's memo even if the GUC outlived the transaction (it does not: is_local).
--
-- THE KNOB IS STILL THE SWITCH, AT RUNTIME. `iam.accessible_entity_ids`' own record arm is
-- gated on `custom/accessible_entity_ids_guard` at RUNTIME, so the mirror's answer follows the
-- knob without regenerating a policy. This function reads the same knob the same way and, when
-- it resolves false, hands the question straight back to `iam.accessible_entity_ids` — the OFF
-- path is the old behaviour rather than a copy of it.
--
-- ITS RED TWIN is scripts/campaign-tests/mirror2_red.sql, which executes the real bytes of
-- migrations/inverse/mirror2_*_down.sql and shows the read at 6.7 s again.

-- ── THE FENCE ────────────────────────────────────────────────────────────────────────────────
create function iam.statement_memo_epoch()
returns text
language sql
stable
set search_path to ''
as $function$
  -- Three things, and each of them is load-bearing:
  --   statement_timestamp()  a new statement is a new epoch, so the memo is STATEMENT-scoped.
  --   pg_backend_pid()       a GUC is per backend; naming the backend makes that explicit.
  --   xid-if-assigned        'ro' until this transaction writes; the moment it writes, every
  --                          entry taken before the write stops matching and is recomputed.
  select pg_catalog.statement_timestamp()::text
      || '/' || pg_catalog.pg_backend_pid()::text
      || '/' || coalesce(pg_catalog.pg_current_xact_id_if_assigned()::text, 'ro');
$function$;

comment on function iam.statement_memo_epoch() is
  'MIRROR-2: the fence a statement-scoped visibility memo is keyed on — statement, backend, and whether this transaction has written yet.';

-- ── THE MEMO ─────────────────────────────────────────────────────────────────────────────────
create function iam.record_visible_in_org(
  p_organization_id uuid,
  p_table_id        uuid,
  p_id              uuid,
  p_visibility      platform.visibility,
  p_created_by      uuid,
  p_required        public.permission_level default 'viewer'::public.permission_level
) returns boolean
language plpgsql
stable
security definer
set search_path to ''
parallel unsafe          -- set_config, and iam.has_access is PARALLEL UNSAFE already
as $function$
declare
  -- THE CALLER, AND ONLY THE CALLER. This function takes no principal ON PURPOSE — exactly like
  -- `iam.accessible_entity_ids`, which it stands in for. A signed-in person handed a principal
  -- argument could ask what SOMEBODY ELSE can see, and a mirror helper that answers that is a
  -- disclosure door nobody declared.
  v_user  uuid := (select auth.uid());
  v_key   text;
  v_raw   text;
  v_epoch text;
  v_set   record;
  v_parts text[];
  v_vis   platform.visibility[];
  v_ga    uuid[];
  v_gv    uuid[];
  v_cv    uuid[];
begin
  -- NO PRINCIPAL, NO SET — the same first line `custom.visible_record_ids` opens with, so the
  -- mirror's arm is false for an unauthenticated read exactly as the set form is empty for one.
  if v_user is null or p_organization_id is null then
    return false;
  end if;

  -- THE KNOB, AT RUNTIME. Off => the question goes back to the function the mirror used to ask,
  -- whole-database set and all. This is the OFF path, not a copy of it.
  if not coalesce(
           platform.knob_resolve('custom', 'accessible_entity_ids_guard', null)::text::boolean,
           false)
  then
    return p_id = any (iam.accessible_entity_ids('record', p_required, 0, true));
  end if;

  v_epoch := iam.statement_memo_epoch();
  -- ONE SLOT PER (principal, organization, Table, level) — the epoch lives in the VALUE, so a
  -- new statement overwrites the slot instead of leaking a new one. A GUC name is 63 bytes;
  -- 'custom_memo.v' plus md5 is 45.
  v_key := 'custom_memo.v' || pg_catalog.md5(
             v_user::text || '|' || p_organization_id::text || '|'
             || coalesce(p_table_id::text, '-') || '|' || p_required::text);

  v_raw := pg_catalog.current_setting(v_key, true);

  if v_raw is null or pg_catalog.split_part(v_raw, '~', 1) is distinct from v_epoch then
    -- THE ONE COMPUTATION THIS WHOLE FILE EXISTS TO DO ONCE.
    v_set := custom.visible_set(v_user, p_organization_id, p_table_id, p_required);
    v_raw := v_epoch
          || '~' || (case when v_set.o_fallback   then 'F' else '-' end)
          || '~' || (case when v_set.o_all_visible then 'A' else '-' end)
          || '~' || pg_catalog.array_to_string(v_set.o_true_visibility::text[], ',')
          || '~' || pg_catalog.array_to_string(v_set.o_granted_all, ',')
          || '~' || pg_catalog.array_to_string(v_set.o_granted_visible, ',')
          || '~' || pg_catalog.array_to_string(v_set.o_carried_visible, ',');
    perform pg_catalog.set_config(v_key, v_raw, true);
  end if;

  v_parts := pg_catalog.string_to_array(v_raw, '~');

  -- THE PER-ROW LADDER, VERBATIM — the same sentence `custom.visible_predicate_sql` falls back
  -- to, for exactly the groups it falls back for.
  if v_parts[2] = 'F' then
    return coalesce(custom.has_visibility(v_user, 'record', p_id, p_required), false);
  end if;

  -- THE WHOLE GROUP IS VISIBLE — `custom.visible_predicate_sql` returns the literal `true`.
  if v_parts[3] = 'A' then
    return true;
  end if;

  v_vis := coalesce(
             pg_catalog.string_to_array(nullif(v_parts[4], ''), ',')::platform.visibility[],
             '{}'::platform.visibility[]);
  v_ga  := coalesce(
             pg_catalog.string_to_array(nullif(v_parts[5], ''), ',')::uuid[], '{}'::uuid[]);
  v_gv  := coalesce(
             pg_catalog.string_to_array(nullif(v_parts[6], ''), ',')::uuid[], '{}'::uuid[]);
  v_cv  := coalesce(
             pg_catalog.string_to_array(nullif(v_parts[7], ''), ',')::uuid[], '{}'::uuid[]);

  -- THE FOUR ARMS, IN `custom.visible_predicate_sql`'S OWN ORDER AND WITH ITS OWN OPERATORS.
  return coalesce(
           p_created_by = v_user
        or (p_visibility = any (v_vis) and not (p_id = any (v_ga)))
        or p_id = any (v_gv)
        or p_id = any (v_cv), false);
end;
$function$;

comment on function iam.record_visible_in_org(uuid, uuid, uuid, platform.visibility, uuid, public.permission_level) is
  'MIRROR-2: the RLS mirror asks custom.visible_set about the ROW''s organization, once per statement (memo keyed on principal, organization, Table, level; fenced by iam.statement_memo_epoch()). Equal by construction to `id in (select custom.visible_record_ids(user, level))` for a live record.';

-- ── THE DOOR ROW ─────────────────────────────────────────────────────────────────────────────
-- A SECURITY DEFINER function that holds a client EXECUTE grant is a door, declared or taken
-- back (ddl_guard[definer_client_grant_revoked]). This one is declared for the same reason
-- `iam.accessible_entity_ids` is: an RLS policy expression is evaluated as the QUERYING role, so
-- the role reading `custom.record` must be able to execute what that policy names. It must come
-- BEFORE the grant or the grant does not stick.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('iam', 'record_visible_in_org',
        'p_organization_id uuid, p_table_id uuid, p_id uuid, p_visibility visibility, p_created_by uuid, p_required permission_level',
        array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'platform.visibility'::regtype,
              'uuid'::regtype, 'public.permission_level'::regtype]::oid[],
        'SIGNED-IN door, and a predicate rather than a reader: it returns one boolean and no row. It takes NO principal — it answers only about (select auth.uid()) and returns false to a caller with no session — and it decides that answer on custom.visible_set / custom.has_visibility, the store''s one ladder, before it looks at anything. It exists because the RLS mirror on custom.record names it, and an RLS predicate runs as the querying role: this is exactly the lane iam.accessible_entity_ids holds for the same policy, narrowed to one organization. p_organization_id, p_table_id and p_id name the row being judged; a foreign or invented id answers false the same way.',
        'mirror2_the_mirror_asks_one_organization_once_a_statement.sql (lane MIRROR-2)',
        true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- THE MIRROR'S OWN HELPER LIVES WHERE THE MIRROR'S OTHER HELPERS LIVE. An RLS policy
-- expression is evaluated as the QUERYING role, so `authenticated` must hold EXECUTE on
-- anything the policy names — exactly as it does on `iam.accessible_entity_ids`, `iam.has_access`
-- and `iam.unnest_uuids`, which this replaces in that policy. Schema `custom` is declared CLOSED
-- (platform.schema_client_exposure) and its client lanes are DOORS that decide for a caller;
-- this is not a door and does not pretend to be one, so it belongs in `iam` beside the kernel it
-- calls, and the store's closed-schema guard stays untouched.
-- PUBLIC's default EXECUTE is taken back by the DDL guard itself, because the door row above
-- carries anonymous_callers = false; schema `iam` is protected, so this file issues no REVOKE
-- of its own and lets the platform's guard do what it exists to do.
grant execute on function iam.statement_memo_epoch() to authenticated, service_role;
grant execute on function iam.record_visible_in_org(uuid, uuid, uuid, platform.visibility, uuid, public.permission_level) to authenticated, service_role;

-- ── THE CENSUS ───────────────────────────────────────────────────────────────────────────────
-- A policy that still asks for the WHOLE-DATABASE record set is the defect this file closes.
-- It names them; `pnpm check:store-doors-decide` and the green suite turn it into a failure.
create function custom.mirror_asks_the_whole_database()
returns table(schema_name text, table_name text, policy_name text, why text)
language sql
stable
set search_path to ''
as $function$
  select p.schemaname::text, p.tablename::text, p.policyname::text,
         'this policy still bounds itself with iam.accessible_entity_ids(''record'', …), which '
      || 'is custom.visible_record_ids over EVERY organization on the database. REMEDY: bound '
      || 'the arm to the row''s own organization with iam.record_visible_in_org, the way '
      || 'mirror2_the_mirror_asks_the_rows_own_organization.sql does for custom.record.'
    from pg_catalog.pg_policies p
   where p.qual ~ 'accessible_entity_ids\(''record'''
   order by 1, 2, 3;
$function$;

comment on function custom.mirror_asks_the_whole_database() is
  'MIRROR-2 census: every RLS policy whose own text still computes the record visible set for every organization on the database.';
