-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 CHECK 12 WENT RED ON A CORRECTLY-GRANTED DOOR, WHICH IS THE OTHER HALF OF THE GATE PROBLEM.
--
-- `public.hr_kiosk_pin_reset` gained `anon` EXECUTE, and check 12 reported "anon CAN execute a
-- non-kiosk door" — blocking. Measured before believing it: the door takes
-- `(p_session_token, p_new_pin)` and reads the employment FROM THE SESSION, never from an
-- argument. A person-bound session exists only because `hr_kiosk_session_open` accepted that
-- person's PIN moments earlier, so possession of the token IS the proof of identity. It is the
-- change-my-PIN-at-the-tablet flow, and a tablet has no Supabase user — anon reach is not a hole
-- here, it is the requirement. Until the grant landed, every kiosk PIN reset would have 403'd.
--
-- So the defect was in the GATE, not the door: check 12 tested anon reach against a hand-written
-- list of six door NAMES, and a seventh door that belongs to the same family was never added. A
-- name list cannot know that. It fails in both directions — it flags a correct grant (what
-- happened) and it would wave through an accidental one on any door somebody remembered to list.
--
-- Measured over all eleven live kiosk doors, the real rule is structural and holds exactly:
--
--   anon-reachable (7): every one takes a CREDENTIAL — p_session_token (punch, session_open,
--     session_close, session_heartbeat, pin_reset), p_device_secret (authenticate),
--     p_pairing_code (claim_pairing).
--   authenticated-only (4): every one takes an admin-side identifier and NO credential —
--     device_list, pairing_code_create (p_organization_id), device_set_capture, device_set_trust
--     (p_device_id, no secret).
--
-- The gate now asserts THAT: anon may reach a door only when the door carries its own credential.
-- It admits `hr_kiosk_pin_reset` on its shape rather than on its name, and it refuses
-- `hr_kiosk_device_set_trust` even if someone grants anon by accident — which the name list,
-- had that door been listed, would have permitted forever.
--
-- Authority: hr_l3_15's client-door contract (check 12); SPEC-TIME's kiosk session model.
--
-- Applied live as `hr_l3_70_anon_reach_is_a_credential_not_a_name_list`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. 🚨 THE FIX IS NOT "ADD THE NAME", AND THAT DISTINCTION IS THE WHOLE POINT. Appending
--    'hr_kiosk_pin_reset' to the list would have turned the gate green in one line and left the
--    next door in exactly the same trap. Widening an allowlist to silence a gate is how a gate
--    stops blocking; replacing the allowlist with the property it was approximating is how it
--    starts meaning something. This lane has already shipped one gate that stopped blocking on the
--    run that installed it (hr_l3_58/59) and it is not shipping a second.
-- 2. THE CREDENTIAL SET IS THE THREE THAT EXIST, NOT A WILDCARD. `p_session_token`,
--    `p_device_secret`, `p_pairing_code` — matched on the identity argument list. A future
--    credential argument must be added here deliberately, which is the correct amount of friction:
--    naming a new way to reach an anon door should be a decision somebody makes on purpose.
-- 3. `p_device_id` IS NOT A CREDENTIAL AND MUST NEVER BE TREATED AS ONE. Two admin doors take it
--    (`device_set_capture`, `device_set_trust`) and it is a public-ish identifier, not a secret.
--    `hr_kiosk_authenticate` qualifies on `p_device_secret`, which sits beside it — the secret is
--    the credential, the id is the subject. A rule keyed on `p_device_%` would have opened both
--    admin doors to anon.

begin;

do $mig$
declare
  v_def text := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  v_from text :=
    E'               when has_function_privilege(''anon'', p.oid, ''EXECUTE'')\n'
 || E'                    and p.proname not in (''hr_kiosk_authenticate'', ''hr_kiosk_claim_pairing'',\n'
 || E'                                          ''hr_kiosk_punch'', ''hr_kiosk_session_open'',\n'
 || E'                                          ''hr_kiosk_session_close'', ''hr_kiosk_session_heartbeat'')\n'
 || E'                 then ''anon CAN execute a non-kiosk door''';
  v_to text :=
    E'               when has_function_privilege(''anon'', p.oid, ''EXECUTE'')\n'
 || E'                    and pg_get_function_identity_arguments(p.oid)\n'
 || E'                        !~ ''(p_session_token|p_device_secret|p_pairing_code)''\n'
 || E'                 then ''anon CAN execute a door that carries no kiosk credential''';
begin
  if position(v_to in v_def) > 0 then
    return;                                     -- already structural; replay is a no-op
  end if;
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_70: check 12''s anon clause is not in the expected shape — refusing to guess';
  end if;
  execute replace(v_def, v_from, v_to);
end
$mig$;

do $chk$
declare v_n integer; v_12 boolean; v_src text;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  select ok into v_12 from hr.punch_write_path_conformance()
   where check_key = 'client_doors_well_formed';
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';

  if v_n <> 29 then
    raise exception 'hr_l3_70: expected 29 checks, found %', v_n;
  end if;
  -- the name list must be GONE, not merely supplemented
  if position('hr_kiosk_session_heartbeat''' in v_src) > 0
     and position('p_session_token|p_device_secret' in v_src) = 0 then
    raise exception 'hr_l3_70: the name list survived the rewrite';
  end if;
  if not v_12 then
    raise exception 'hr_l3_70: check 12 still failing after the rewrite';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_70: another check is failing';
  end if;
end
$chk$;

commit;
