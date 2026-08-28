-- hr_l3_98 — hr_l3_97 recreated a SECURITY DEFINER function and handed it back to PUBLIC.
--
-- PURPOSE
--   Two blocking checks went red the moment hr_l3_97 landed, and both are that migration's fault.
--   The conformance suite caught them, which is the whole reason it exists — but they are exactly
--   the defect this lane has spent the program closing, reintroduced by its own author.
--
--   1. `definer_helpers_are_not_client_reachable` (check 33). hr_l3_97 could not `CREATE OR REPLACE`
--      `hr.punch_correct` because the new `p_category` changes its arity, so it did DROP + CREATE.
--      A DROP takes the ACL with it, and a freshly created SECURITY DEFINER function carries the
--      IMPLICIT PUBLIC EXECUTE GRANT. The old three-argument body had been correctly revoked
--      (`authenticated` false, `anon` false); the new four-argument body came back reachable by
--      both. hr_l3_93's own recorded lesson, walked into from the other side: there the danger was
--      revoking only from `anon` and leaving PUBLIC, here it was recreating the function and
--      restoring PUBLIC. Same grant, same hole.
--
--      🚨 THE RULE THIS WRITES DOWN: a DROP-and-CREATE is not a replacement. `CREATE OR REPLACE`
--      preserves the ACL; DROP does not. Any migration that changes a definer function's ARITY must
--      re-issue its revokes in the same migration, because the function it creates is a new object
--      with default grants and nothing warns you.
--
--   2. `wrappers_authenticated_only` (check 12) reported `public.hr_punch_correct(uuid[],jsonb,text)`
--      as "missing". It is: the door legitimately became `(uuid[],jsonb,text,uuid)`. The check holds
--      five fully-typed signatures in an array, so an intended arity change reads as a deleted door.
--      The signature is corrected rather than the check loosened — this list is deliberately exact,
--      and a check that matched on name alone would stop noticing a door that lost its arguments.
--
-- Applied live as `hr_l3_98_recreating_a_definer_restores_the_public_grant`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · REVOKE FROM PUBLIC *AND* anon, in that order, for the reason hr_l3_93 recorded: on a function
--     whose `proacl` is NULL every role holds EXECUTE through the implicit PUBLIC grant, and
--     revoking `anon` alone merely MATERIALISES the ACL while changing nothing about reachability.
--   · `authenticated` IS NOT GRANTED ON THE INNER FUNCTION. It never was — `hr` is not exposed to
--     PostgREST and the public wrapper is the only door (TD-1). The inner body is reached by the
--     wrapper as its owner, so granting the client role here would widen the surface for no caller.

do $mig$
begin
  if to_regprocedure('hr.punch_correct(uuid[],jsonb,text,uuid)') is not null then
    revoke execute on function hr.punch_correct(uuid[], jsonb, text, uuid) from public;
    revoke execute on function hr.punch_correct(uuid[], jsonb, text, uuid) from anon;
    revoke execute on function hr.punch_correct(uuid[], jsonb, text, uuid) from authenticated;
  end if;
end
$mig$;

-- ── check 12's expected signature follows the door's real arity ──────────────────────────────────
do $chk12$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';
  if v_src is null then
    raise exception 'hr_l3_98: hr.punch_write_path_conformance not found';
  end if;
  if position($q$'public.hr_punch_correct(uuid[],jsonb,text)'$q$ in v_src) = 0 then
    return;   -- already corrected
  end if;
  v_new := replace(v_src,
    $q$'public.hr_punch_correct(uuid[],jsonb,text)'$q$,
    $q$'public.hr_punch_correct(uuid[],jsonb,text,uuid)'$q$);
  execute v_new;
end
$chk12$;

-- ── FALSIFICATION: both checks green, and the hole is actually shut ──────────────────────────────
do $verify$
declare v_bad integer; v_pub boolean; v_anon boolean; v_auth boolean;
begin
  select has_function_privilege('anon', 'hr.punch_correct(uuid[],jsonb,text,uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'hr.punch_correct(uuid[],jsonb,text,uuid)', 'EXECUTE')
    into v_anon, v_auth;
  if v_anon then
    raise exception 'hr_l3_98: anon STILL reaches the inner hr.punch_correct';
  end if;
  if v_auth then
    raise exception 'hr_l3_98: authenticated STILL reaches the inner hr.punch_correct';
  end if;

  -- The PUBLIC door must remain reachable by authenticated and closed to anon.
  if not has_function_privilege('authenticated',
        'public.hr_punch_correct(uuid[],jsonb,text,uuid)', 'EXECUTE') then
    raise exception 'hr_l3_98: over-revoked - authenticated lost the PUBLIC door';
  end if;
  if has_function_privilege('anon',
        'public.hr_punch_correct(uuid[],jsonb,text,uuid)', 'EXECUTE') then
    raise exception 'hr_l3_98: anon reaches the public door';
  end if;

  select count(*) into v_bad from hr.punch_write_path_conformance() where not ok;
  if v_bad <> 0 then
    raise exception 'hr_l3_98: % conformance check(s) still failing', v_bad;
  end if;
end
$verify$;
