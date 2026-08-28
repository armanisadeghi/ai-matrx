-- hr_l3_102 — a whole new hr.* family shipped with the implicit PUBLIC grant; the sweep closes it.
--
-- PURPOSE
--   Check 33 (`definer_helpers_are_not_client_reachable`, blocking) went red on a jurisdiction-rules
--   / law-portal admin family that appeared since the campaign closed the class at zero. Six inner
--   functions, three of them WRITERS, each SECURITY DEFINER with `proacl = NULL` — so each carries
--   the implicit PUBLIC EXECUTE grant and runs as its owner for anyone who can reach it:
--
--     hr._jurisdiction_rule_status_authority_gate   (internal helper)
--     hr.jurisdiction_rule_set_status               (writer)
--     hr.jurisdiction_rules_admin_data              (read)
--     hr.law_portal_data                            (read)
--     hr.org_jurisdiction_rule_deactivate           (writer)
--     hr.org_jurisdiction_rule_save                 (writer)
--
--   `hr` is not in `pgrst.db_schemas`, so this is latent, not live-exploitable the way hr_l3_101's
--   exposed `communication.*` senders were — but the grant is the hole regardless of today's
--   exposure, which is exactly why check 33 flags the GRANT and not the exposure.
--
--   Every one of the six is reached the correct way already: five through a `public.hr_*` wrapper
--   that is SECURITY DEFINER and anon-clean (verified), and the one internal helper only by other
--   `hr.*` definers. In every case the caller reaches the body AS THE OWNER, so the body needs no
--   client grant — the shape the campaign left every other hr.* helper in.
--
-- THE DOOR SET IS DERIVED, NOT HARDCODED. It is exactly `hr.definer_functions_client_reachable()`
--   minus the baseline (`hr.definer_grant_baseline`) — check 33's own predicate. A hardcoded list
--   would miss the seventh function this same lane adds next week; deriving it means the sweep closes
--   whatever the check can see, and the check's post-condition (count = 0) proves it did.
--
-- Applied live as `hr_l3_102_three_new_definer_helpers_left_public`. Idempotent (a second run finds
--   an empty set and changes nothing).
--
-- RECORDED TECHNICAL DECISIONS
--   · REVOKE FROM PUBLIC, anon AND authenticated (hr_l3_93's law: on a NULL-acl function only the
--     PUBLIC revoke closes reachability; the other two are written for completeness). The public
--     wrappers keep their own grants and reach the inner bodies as owner, so no door breaks.
--   · THE BASELINE IS RESPECTED. `hr.capability` and any other intentionally-granted definer sits in
--     `hr.definer_grant_baseline`; the sweep never touches a baselined function.
--   · NOT FOLDED INTO hr_l3_101. That migration's subject is the P0 communication senders; this is a
--     different schema and a different (latent) severity. One migration, one nameable thing.

do $mig$
declare r record;
begin
  for r in
    select ('hr.' || quote_ident(split_part(d.qname, '.', 2))
            || '(' || d.identity_args || ')') as sig
      from hr.definer_functions_client_reachable() d
     where not d.baselined
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from authenticated', r.sig);
  end loop;
end
$mig$;

-- ── FALSIFICATION ────────────────────────────────────────────────────────────────────────────────
do $verify$
declare v_left integer;
begin
  select count(*) into v_left from hr.definer_functions_client_reachable() where not baselined;
  if v_left <> 0 then
    raise exception 'hr_l3_102: % non-baselined client-reachable definer(s) remain', v_left;
  end if;
  -- the wrappers must still be reachable by a real caller: they are DEFINER and reach the inner as
  -- owner, so revoking the inner grant must not have touched them.
  if not has_function_privilege('authenticated',
        'public.hr_org_jurisdiction_rule_save(uuid,jsonb,boolean)', 'EXECUTE') then
    raise exception 'hr_l3_102: a public wrapper lost its own authenticated grant';
  end if;
  if (select count(*) filter (where not ok) from hr.punch_write_path_conformance()) <> 0 then
    raise exception 'hr_l3_102: a conformance check is still failing after the sweep';
  end if;
end
$verify$;
