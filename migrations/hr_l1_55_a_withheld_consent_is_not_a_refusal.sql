-- hr_l1_55_a_withheld_consent_is_not_a_refusal.sql
--
-- 🚨 `granted` IS A RESERVED WORD IN THE RESPONSE ENVELOPE, AND THIS DOOR USED IT FOR
-- SOMETHING ELSE.
-- Platform-wide, `granted:false` on an HR door response means "you were not permitted"
-- (`features/hr/service.ts` — `isRefusal()` returns true on `v.granted === false`, and the
-- envelope strips `granted` off successful payloads). `public.hr_verification_consent`
-- returned `granted` meaning "the subject agreed to disclose their pay".
--
-- Those two meanings collide exactly on a DECLINE. Caught as a render, not by reading code:
-- the subject clicked "Do not share it", the door did its job —
--   HTTP 200  {"ok": true, "state": "denied", "granted": false, "audit_id": "cf707f0f…"}
--   row -> state 'denied', denial_basis 'consent_withheld', decided by the subject
-- — and the client read `granted:false` as a permission refusal and rendered
-- **"Recording your decision is not available to you here."** over a decision that had just
-- been recorded successfully. The one moment where a person exercises the right this whole
-- feature exists to protect, and the product told them it was not theirs to exercise.
--
-- The domain answer is renamed to `consent_granted`, which is what it has always meant. The
-- refusal envelope keeps `granted` to itself. Both keys are NOT emitted together: a response
-- carrying a domain `granted` is the bug, so there is nothing to be compatible with — this
-- door had no working caller until today (hr_l1_53 found it was PGRST202 on every call).
--
-- Applied live 2026-08-28 and ledgered. Re-proven through the UI afterwards: the decline
-- renders as the decided state, with no failure sentence.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_verification_consent(uuid,boolean,text)'::regprocedure);
  if position('consent_granted' in v_def) > 0 then
    raise notice 'hr_l1_55: already applied'; return;
  end if;

  -- 🚨 `'granted', p_granted` -> `'consent_granted', p_granted`. The parameter keeps its name;
  -- only the RESPONSE key moves, because only the response collides with the envelope.
  v_new := replace(v_def,
    E'\'granted\', p_granted,',
    E'-- `granted` is the envelope''s word for "you were permitted". A withheld consent is a\n'
    || E'    -- SUCCESSFUL decision, not a refusal, so the domain answer is named for what it is.\n'
    || E'    \'consent_granted\', p_granted,');
  if v_new = v_def then raise exception 'hr_l1_55: granted-key anchor not found'; end if;
  execute v_new;
end $mig$;

update hr.function_contract
   set must_contain = must_contain || array['consent_granted'],
       must_not_contain = must_not_contain || array['''granted'', p_granted'],
       reason = reason || ' ALSO: the response must never carry a domain `granted` key — the '
         || 'envelope reserves `granted` for "you were permitted", so a withheld consent read '
         || 'as a permission refusal and the subject was told "Recording your decision is not '
         || 'available to you here." over a decision that had just succeeded (hr_l1_55).'
 where schema_name = 'public' and function_name = 'hr_verification_consent';

do $verify$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_verification_consent';
  if v_src !~ 'consent_granted' then
    raise exception 'hr_l1_55: the response key was not renamed';
  end if;
  if v_src ~ '''granted'', p_granted' then
    raise exception 'hr_l1_55: the colliding key is still emitted';
  end if;
end $verify$;
