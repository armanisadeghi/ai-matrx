-- expect: branch=accept production=accept
-- chair-step: the teardown drops the campaign's own object; it runs with the campaign stopped and the chair awake
--
-- The same contract with a DROP. ATTACK-7 reported this pair as PASSES/REFUSED across the two
-- runners; it is one verdict now, and it is `accept` — the control is the terminal, not the judge.
--
drop table public.zz_judgment_ordinary;
