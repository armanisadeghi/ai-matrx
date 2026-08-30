-- hr_l3_118 — THE REMEDY TEXT READS AS A WRITE, SO THE NOTICE GOES VOLATILE.
--
-- THE FINDING (seam guard, 2026-08-29): `hr.stable_doors_that_write()` returns exactly one row —
--   platform.definer_guard_revoke_notice · IMMUTABLE · reaches: self: INSERT · depth 0.
--
-- THE PREMISE, CORRECTED AGAINST THE LIVE BODY BEFORE DESIGNING (this matters for the next
--   reader): the work order said this function is "IMMUTABLE while inserting into
--   platform.ddl_guard_log". It is not. Verified live 2026-08-29: the body is the pure format()
--   message builder hr_l3_110 shipped — it writes NOTHING. The durable ddl_guard_log INSERT lives
--   in its caller, platform.enforce_definer_client_grants, which is VOLATILE plpgsql. The feared
--   scenario — the planner caching away the guard's durable record — cannot occur, because the
--   record is not written here.
--
-- WHY THE SEAM GUARD FLAGS IT ANYWAY, AND WHY THE GUARD IS RIGHT TO: the message this function
--   formats contains the copy-pasteable remedy
--       'INSERT INTO platform.client_callable_door (…) VALUES (…)'
--   — write-shaped SQL inside a string literal. The seam guard strips COMMENTS before scanning
--   (hr_l3_78: comments cannot call anything) but deliberately does NOT strip string literals,
--   because literals CAN write: `execute 'insert into …'` is a real write path, and blinding the
--   scanner to literals would blind it to every dynamically composed write. The scanner therefore
--   cannot — and should not try to — tell remedy prose from an EXECUTE payload.
--
-- THE RESOLUTION: declare the function VOLATILE.
--   · It is the conservative side of the volatility ladder — VOLATILE is always a safe
--     declaration; IMMUTABLE is the one that lets the planner skip calls.
--   · The cost is nil: the function is called at most twice per actual revoke event, inside an
--     event trigger; nothing indexes it, nothing folds it.
--   · The alternative — teaching the seam guard to ignore literals — trades a one-keyword
--     declaration on one function for a permanent blind spot in a security detector. And every
--     FUTURE loud message that quotes its own remedy SQL (the house pattern!) either goes
--     VOLATILE the same way or gets caught by the same guard; that is the guard working.
--
-- ALTER, NOT CREATE OR REPLACE: prosrc does not change, so the hr.function_contract pins are
--   untouched by construction (none exist on this function; hr_l3_110's pins are on the CALLER,
--   whose body this migration does not touch — asserted below).
--
-- ⚠️ RE-EMIT HAZARD, KNOWN AND COVERED: re-running hr_l3_110 (idempotent, CREATE OR REPLACE …
--   IMMUTABLE) would revert this — the exact way hr_l10_04 silently reverted hr_l1_12 until
--   hr_l10_05 repaired it. hr_l3_110's file bytes cannot be amended (its ledger checksum pins
--   them), so the cover is: the seam guard re-finds the row the moment it reverts, and the
--   function's COMMENT (below) tells the re-emitter why the keyword differs from the old file.
--
-- Idempotent (ALTER to a state, guarded self-check). Applied live 2026-08-29.

alter function platform.definer_guard_revoke_notice(text, text, text, text) volatile;

comment on function platform.definer_guard_revoke_notice(text,text,text,text) is
  'The exact wording platform.enforce_definer_client_grants screams and stores when it revokes a '
  'client grant (hr_l3_110). Change it here and both the WARNING and the platform.ddl_guard_log '
  'row change together; keep it in step with common-docs /systems/platform/db-rules/FEATURE.md. '
  'VOLATILE since hr_l3_118 — NOT because it writes (it is a pure format()), but because its '
  'message quotes remedy SQL ("INSERT INTO platform.client_callable_door…") and the seam guard '
  'hr.stable_doors_that_write() rightly reads literals as reachable code (EXECUTE makes them so). '
  'Do not re-declare it IMMUTABLE, and do not re-emit it from the hr_l3_110 file text.';

-- ── SELF-CHECK ──────────────────────────────────────────────────────────────────────────────────
do $chk$
declare v_vol "char"; v_findings int; v_broken int;
begin
  select p.provolatile into v_vol
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform' and p.proname = 'definer_guard_revoke_notice'
     and pg_get_function_identity_arguments(p.oid)
         = 'p_schema text, p_name text, p_identity_args text, p_signature text';
  if v_vol is distinct from 'v' then
    raise exception 'hr_l3_118: platform.definer_guard_revoke_notice is not VOLATILE';
  end if;

  -- The work order's acceptance bar: the seam guard goes fully green, not merely this-door green.
  select count(*) into v_findings from hr.stable_doors_that_write();
  if v_findings <> 0 then
    raise exception 'hr_l3_118: hr.stable_doors_that_write() still returns % row(s)', v_findings;
  end if;

  -- The caller's hr_l3_110 announcement contract must be untouched by this migration.
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname = 'platform.enforce_definer_client_grants';
  if v_broken <> 0 then
    raise exception 'hr_l3_118: the guard''s announcement contract went red — this migration must not touch the caller';
  end if;
end
$chk$;
