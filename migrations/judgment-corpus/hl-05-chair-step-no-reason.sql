-- expect: branch=refuse:header-chair-step-no-reason production=refuse:header-chair-step-no-reason
-- chair-step: because
--
-- A chair step that does not say why is not a chair step. Refused while the header is READ, so
-- the target does not come into it.
--
drop table public.zz_judgment_ordinary;
