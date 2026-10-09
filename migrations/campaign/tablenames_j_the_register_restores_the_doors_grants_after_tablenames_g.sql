-- chair-step: tablenames_h ran before tablenames_g could land (g was refused on the view); this puts the signed-in-only grants back on the functions g recreated (a policy-class step, so alone in its file)
-- lane: TABLE-NAMES-CLEANUP
-- lock: custom
--
select platform.reopen_declared_doors('custom');
