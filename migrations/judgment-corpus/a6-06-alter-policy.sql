-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- Shape 6.
-- A file that NAMES production is judged by the allow-list on EVERY run, its branch rehearsal
-- included: the contract binds the FILE, not the run, so the rehearsal returns the verdict production will.
--
alter policy associations_select on platform.associations using (true);
