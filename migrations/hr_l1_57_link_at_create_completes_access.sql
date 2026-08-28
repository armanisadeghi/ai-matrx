-- hr_l1_57_link_at_create_completes_access.sql
--
-- 🚨 ARMAN RULED THE LINK-AT-CREATE QUESTION: CARRY THE LOGIN OVER.
-- When `hr_employee_create` links an existing org member who ALREADY has a login, that
-- person's access COMPLETES in the same act — it is no longer deferred to an invite.
-- (Attention board, 2026-08-28: "CARRY THE LOGIN OVER … the existing-member-with-login case
-- completes access in the same act.")
--
-- WHAT WAS ALREADY TRUE — MEASURED, not assumed.
-- The door already wrote `login_user_id` from `link_user_id` in the employee INSERT, and the
-- round-46 guard (`hr_l1_44`) already refused a link to a NON-member (`link_without_membership`),
-- so no unreachable person could be produced. Reproduced on a purpose-made member-with-login
-- BEFORE this migration: the create linked them, `hr_my_context` listed the employer, `active`
-- resolved, and three derived-grant rows existed. So the member-with-login case ALREADY
-- completed self-access — the "interim refuse-by-name → invite" this ruling replaces was never
-- in the code for this case (the only by-name refusal is for a NON-member).
--
-- WHY A COMPLETION BLOCK ANYWAY — the two entry modes derive through DIFFERENT functions.
-- Grants derive on the create path through the employment/position INSERT triggers
-- (`hr._derive_on_employment` / `hr._derive_on_position`), because the login is already on the
-- employee row when the spell inserts. The invite-acceptance path instead UPDATEs
-- `login_user_id` on an already-built employee, firing `hr._derive_on_employee_login`, a
-- SEPARATE function. The ruling's words are "completes access in the same act" — EQUIVALENT to
-- invite-acceptance — and nothing structurally guarantees those two derive functions produce
-- the identical grant set. So this block makes the guarantee the ruling names EXPLICIT rather
-- than emergent:
--   (1) ensure the org membership row exists — the dispatch's literal instruction — via the
--       same canonical door the repair function `hr_employee_grant_missing_membership` uses;
--       idempotent (a linked member already has the row), and it also covers a login-bearing
--       REHIRE, whose new spell never runs the link guard; and
--   (2) derive grants for the new spell through `hr.derive_grants_bulk` — the SAME function the
--       invite-accept trigger funnels to — so link-at-create lands byte-for-byte where
--       invite-accept lands, not merely "close enough" via a different trigger. Idempotent: the
--       triggers already call it, so a second call recomputes to the same rows.
-- The trap stays closed by COMPLETION, not refusal: a linked member is reachable NOW. The
-- other cases are unchanged — a non-member link is still refused above, and a kiosk-only hire
-- (no login) has nothing to complete.
--
-- Applied live 2026-08-28 and ledgered. Falsified as doors in the register.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_employee_create(jsonb)'::regprocedure);
  if position('LINK-AT-CREATE COMPLETES ACCESS' in v_def) > 0 then
    raise notice 'hr_l1_57: already applied'; return;
  end if;

  -- 🚨 Insert the completion block right before the audit line, so both the new-employee and
  -- rehire branches have already produced `v_employment`, and read the login off the row that
  -- now exists (covers a login-bearing rehire too, not only the fresh link).
  v_new := replace(
    v_def,
    E'  v_audit := hr._l1_write_audit(v_org, ''hr_employee'', ''create'', ARRAY[v_employee],',
    E'  -- 🚨 LINK-AT-CREATE COMPLETES ACCESS IN THE SAME ACT (Arman''s ruling 2026-08-28).\n'
    || E'  -- Read the login off the settled employee row (covers a fresh link AND a\n'
    || E'  -- login-bearing rehire). For a login-bearing employee, make the completion EXPLICIT\n'
    || E'  -- rather than emergent: ensure the membership row exists (idempotent — a linked\n'
    || E'  -- member already has one), and derive grants through hr.derive_grants_bulk, the SAME\n'
    || E'  -- function the invite-accept trigger (hr._derive_on_employee_login) funnels to. The\n'
    || E'  -- create path already derives via the employment/position INSERT triggers, but those\n'
    || E'  -- are DIFFERENT functions; deriving here guarantees link-at-create lands exactly\n'
    || E'  -- where invite-acceptance lands. A non-member link was refused above; a kiosk-only\n'
    || E'  -- hire has no login and nothing to complete.\n'
    || E'  declare v_login uuid;\n'
    || E'  begin\n'
    || E'    select login_user_id into v_login from hr.employee where id = v_employee;\n'
    || E'    if v_login is not null then\n'
    || E'      perform public.mbr_add(''organization'', v_org, v_login, v_org,\n'
    || E'                             ''member'', ''active'',\n'
    || E'                             jsonb_build_object(''granted_by'', ''hr_employee_create'',\n'
    || E'                                               ''reason'', ''link_at_create_completes_access''));\n'
    || E'      perform hr.derive_grants_bulk(ARRAY[v_employment]::uuid[]);\n'
    || E'    end if;\n'
    || E'  end;\n\n'
    || E'  v_audit := hr._l1_write_audit(v_org, ''hr_employee'', ''create'', ARRAY[v_employee],');
  if v_new = v_def then raise exception 'hr_l1_57: audit anchor not found'; end if;
  execute v_new;
end $mig$;

-- The round-46 guard's comment described this overlap as "on the attention board as a ruling,
-- not decided here." It IS decided now — rewrite that one clause so the door does not tell a
-- future reader the opposite of what it does.
do $mig2$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_employee_create(jsonb)'::regprocedure);
  if position('that overlap is genuinely silent' in v_def) = 0 then
    raise notice 'hr_l1_57: round-46 comment already updated or absent'; return;
  end if;
  v_new := replace(
    v_def,
    E'  -- What it does NOT say is whether a picked org member''s EXISTING login carries over at\n'
    || E'  -- create or is routed through the invite gate anyway — that overlap is genuinely silent\n'
    || E'  -- and is on the attention board as a ruling, not decided here. This guard settles only\n'
    || E'  -- the part that is absolute: the state where a link produces somebody nobody can reach\n'
    || E'  -- is refused BY NAME, and pointed at the flow that does confer access.',
    E'  -- The overlap the spec left silent — whether a picked member''s EXISTING login carries\n'
    || E'  -- over at create — was RULED by Arman on 2026-08-28: CARRY IT OVER. The completion\n'
    || E'  -- block near the end of this function does exactly that for a member-with-login. This\n'
    || E'  -- guard keeps settling only the absolute part: a link to a NON-member (which cannot\n'
    || E'  -- confer access on its own — SPEC-ACCESS 1.1) is refused BY NAME and pointed at the\n'
    || E'  -- invite flow that does grant access.');
  -- Cosmetic-only: if the comment text has drifted, do not fail the migration — the behavior
  -- lives in the block above, already applied. Report and move on.
  if v_new = v_def then raise notice 'hr_l1_57: round-46 comment anchor not matched — left as is'; return; end if;
  execute v_new;
end $mig2$;

-- Contract row. One active contract per function: retire the prior (hr_l1_44) row and land a
-- fresh one carrying EVERY prior guarantee (location, department, the round-46
-- `link_without_membership` refusal) PLUS this round's completion, so nothing is lost and a
-- later `create or replace` cannot drop the carry-over.
update hr.function_contract
   set is_active = false
 where schema_name = 'public' and function_name = 'hr_employee_create' and is_active = true;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values
  ('public', 'hr_employee_create', 'hr_l1_57_link_at_create_completes_access.sql',
   array['A position needs a location',
         'A position needs a department',
         'link_without_membership',
         'LINK-AT-CREATE COMPLETES ACCESS',
         'hr.derive_grants_bulk(ARRAY[v_employment]::uuid[])',
         'public.mbr_add(''organization'', v_org, v_login'],
   array[]::text[],
   'Arman ruled CARRY THE LOGIN OVER (2026-08-28): linking an existing member-with-login at '
   || 'create completes access in the same act, EQUIVALENT to invite-acceptance. The create path '
   || 'derives grants via the employment/position INSERT triggers (_derive_on_employment/'
   || '_derive_on_position); invite-accept derives via _derive_on_employee_login, a DIFFERENT '
   || 'function. This completion makes membership + grant-derivation (through the same '
   || 'derive_grants_bulk the invite path funnels to) EXPLICIT so the two entry modes land '
   || 'identically and cannot silently diverge. Retains hr_l1_43''s location/department '
   || 'named-refusals and hr_l1_44''s link_without_membership trap (non-member links still cannot '
   || 'confer access -- SPEC-ACCESS 1.1).')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain,
      must_not_contain = excluded.must_not_contain,
      reason = excluded.reason,
      is_active = true;

do $verify$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_employee_create';
  if v_src !~ 'LINK-AT-CREATE COMPLETES ACCESS' then
    raise exception 'hr_l1_57: completion block missing';
  end if;
  if v_src !~ 'derive_grants_bulk' then
    raise exception 'hr_l1_57: grant derivation missing';
  end if;
end $verify$;
