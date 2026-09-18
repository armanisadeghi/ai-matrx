-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- Shape 4.
-- A file that NAMES production is judged by the allow-list on EVERY run, its branch rehearsal
-- included: the contract binds the FILE, not the run, so the rehearsal returns the verdict production will.
--
alter table platform.associations no force row level security;
