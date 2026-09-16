-- expect: branch=refuse:branch-needs-target-header production=refuse:headerless-non-additive
--
-- ATTACK-5 finding 3: a header-less unledgered file with a DROP used to reach production with
-- nothing between it and the database.
--
drop table public.zz_judgment_ordinary;
