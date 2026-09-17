-- expect: branch=refuse:branch-needs-target-header production=accept
--
-- The oldest of the four, and the only one that ever worked: a commented-out statement.
-- create index concurrently zz_judgment_idx on public.zz_judgment_ordinary (id);
/* vacuum public.zz_judgment_ordinary; */
--
create table if not exists public.zz_judgment_commented (id bigint primary key);
