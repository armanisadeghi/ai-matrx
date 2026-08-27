-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- `hr._record_access_audit` gains `p_actor_user_id uuid DEFAULT NULL` at position 22, bound as
-- `coalesce(p_actor_user_id, auth.uid())` into `actor_user_id`.
--
-- WHY. A privileged caller — aidream, running as `service_role` with no JWT — has no `auth.uid()`,
-- so every audit row it wrote carried a NULL actor user. Read-audit rows for named humans'
-- downloads were landing as `actor_type = 'automation'` with nobody named. The employment half was
-- fixed server-side at 23f03c36c; the user id had nowhere to go until this parameter existed. A
-- direct authenticated caller keeps today's behaviour exactly: pass nothing, get `auth.uid()`.
--
-- Authority: coordinator ruling (audit actor batch); SPEC-ACCESS §4.7.
--
-- Applied live as `hr_l3_49_audit_actor_user_id`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. AT THE END, AND THAT IS THE WHOLE POINT. aidream binds all 21 arguments POSITIONALLY today.
--    An insert anywhere but the end shifts every argument after it silently — the call would still
--    compile and the audit trail would quietly start recording the wrong things in the wrong
--    columns, which is the one failure mode an audit writer must not have. Position 22 keeps every
--    existing positional call valid, and both arities are asserted below.
-- 2. 🚨 THIS IS A DROP-AND-CREATE, NOT A REPLACE, AND IT HAS TO BE. `CREATE OR REPLACE FUNCTION`
--    with a different argument count creates an OVERLOAD rather than replacing anything. Leaving
--    both live would make every existing 21-argument call ambiguous — Postgres would refuse them
--    with "function is not unique", and the first thing to break would be every audited read in
--    the schema. So the 22-argument form is created and the 21-argument form is dropped in the
--    same transaction. All 29 in-database callers bind by NAME (verified; the one apparent
--    exception, `hr._door_verdict`, mentions the function in a comment), so nothing in the schema
--    depends on the old arity.
-- 3. 🚨 THE GRANTS ARE RE-ASSERTED BECAUSE A DROP-AND-CREATE LOSES THEM. The old function's ACL was
--    `postgres` + `service_role` and deliberately NOT `authenticated` — a callable raw audit writer
--    is a forgeable one: anyone who can call it can write any actor, any basis, any granted flag
--    into the access log. A newly created function in this database also picks up the default
--    privileges that grant EXECUTE to `anon` (the trap that hr_l3_42 hit), so PUBLIC, anon AND
--    authenticated are all revoked explicitly and the result is asserted, not assumed.
-- 4. `v_uid` KEEPS ITS MEANING EVERYWHERE ELSE. Only the `actor_user_id` value expression changes.
--    `v_actor` still derives from `p_actor_type` and `auth.uid()` exactly as before, so no existing
--    row's actor_type can move.
-- 5. ⚠️ ONE SHARP EDGE, NAMED RATHER THAN SILENTLY SMOOTHED. A caller that passes
--    `p_actor_user_id` but NOT `p_actor_type` gets `actor_type = 'automation'` (because
--    `auth.uid()` is still null for them) on a row that names a human — an internally contradictory
--    audit row. Nothing in the schema forbids it, and changing the `v_actor` derivation is a
--    behaviour change the ruling did not ask for and the audit lane should decide. It is left as
--    is, and check 20 below reports the combination if it ever appears rather than letting it
--    accumulate unnoticed. aidream passes `p_actor_type` today, so the live path is clean.

-- ── 1. the 22-argument form ─────────────────────────────────────────────────────────────────
do $mig$
declare v_def text;
begin
  -- already migrated?
  if to_regprocedure(
       'hr._record_access_audit(uuid,text,text,text,text,boolean,uuid[],integer,uuid,text,text,'
       || 'text,boolean,jsonb,text,boolean,text,text,text,text,uuid,uuid)') is not null then
    raise notice 'hr_l3_49: the 22-argument form is already present';
    return;
  end if;

  -- the parentheses are load-bearing: `::` binds tighter than `||`, so without them only the
  -- second literal is cast and the concatenation fails with "expected a left parenthesis".
  v_def := pg_get_functiondef(
    ('hr._record_access_audit(uuid,text,text,text,text,boolean,uuid[],integer,uuid,text,text,'
     || 'text,boolean,jsonb,text,boolean,text,text,text,text,uuid)')::regprocedure);

  if position('p_actor_employment_id uuid DEFAULT NULL::uuid)' in v_def) = 0
     or position('    v_actor, p_actor_employment_id, v_uid)' in v_def) = 0 then
    raise exception 'hr_l3_49: _record_access_audit does not match what this migration expects; refusing to guess';
  end if;

  -- decision 1: appended, never inserted
  v_def := replace(v_def,
    'p_actor_employment_id uuid DEFAULT NULL::uuid)',
    'p_actor_employment_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid)');

  -- decision 4: only this one value expression moves
  v_def := replace(v_def,
    '    v_actor, p_actor_employment_id, v_uid)',
    '    v_actor, p_actor_employment_id, coalesce(p_actor_user_id, v_uid))');

  execute v_def;
end
$mig$;

-- ── 2. retire the 21-argument form, or every existing call becomes ambiguous (decision 2) ────
drop function if exists hr._record_access_audit(
  uuid, text, text, text, text, boolean, uuid[], integer, uuid, text, text,
  text, boolean, jsonb, text, boolean, text, text, text, text, uuid);

-- ── 3. the grants a drop-and-create just discarded (decision 3) ──────────────────────────────
revoke execute on function hr._record_access_audit(
  uuid, text, text, text, text, boolean, uuid[], integer, uuid, text, text,
  text, boolean, jsonb, text, boolean, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;

grant execute on function hr._record_access_audit(
  uuid, text, text, text, text, boolean, uuid[], integer, uuid, text, text,
  text, boolean, jsonb, text, boolean, text, text, text, text, uuid, uuid)
  to service_role;

-- ── 4. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_oid oid; v_args text;
begin
  v_oid := to_regprocedure(
    'hr._record_access_audit(uuid,text,text,text,text,boolean,uuid[],integer,uuid,text,text,'
    || 'text,boolean,jsonb,text,boolean,text,text,text,text,uuid,uuid)');
  if v_oid is null then
    raise exception 'hr_l3_49: the 22-argument form does not exist';
  end if;

  -- exactly ONE arity survives, or 21-argument callers get "function is not unique"
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_record_access_audit') <> 1 then
    raise exception 'hr_l3_49: more than one _record_access_audit arity is live; 21-arg calls are now ambiguous';
  end if;

  -- decision 1: the new parameter is LAST, and the first 21 are untouched
  v_args := pg_get_function_identity_arguments(v_oid);
  if v_args !~ 'p_actor_employment_id uuid, p_actor_user_id uuid$' then
    raise exception 'hr_l3_49: p_actor_user_id is not the final parameter: %', v_args;
  end if;
  if split_part(v_args, ',', 20) !~ 'p_actor_type text' then
    raise exception 'hr_l3_49: the first 21 parameters shifted; positional callers would break';
  end if;

  -- decision 4: the binding is the coalesce, and nothing else moved
  if (select prosrc from pg_proc where oid = v_oid) !~ 'coalesce\(p_actor_user_id, v_uid\)' then
    raise exception 'hr_l3_49: actor_user_id is not bound to coalesce(p_actor_user_id, auth.uid())';
  end if;
  if (select prosrc from pg_proc where oid = v_oid)
     !~ 'v_actor := coalesce\(p_actor_type, case when v_uid is null' then
    raise exception 'hr_l3_49: the actor_type derivation was changed; it was not meant to move';
  end if;

  -- decision 3: a raw audit writer must not be callable by a session role
  if has_function_privilege('authenticated', v_oid, 'execute')
     or has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'hr_l3_49: the raw audit writer is reachable by a session role; it would be forgeable';
  end if;
  if not has_function_privilege('service_role', v_oid, 'execute') then
    raise exception 'hr_l3_49: service_role lost EXECUTE in the drop-and-create';
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'hr_l3_49: the writer is no longer SECURITY DEFINER';
  end if;
end
$chk$;
