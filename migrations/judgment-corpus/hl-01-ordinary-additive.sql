-- expect: branch=refuse:branch-needs-target-header production=accept
--
-- THE CONTROL for the amnesty: an ordinary header-less migration, the shape ~3,567 landed
-- files have. It must keep working on production and must not reach the branch.
--
create table if not exists public.zz_judgment_ordinary (id bigint primary key);
