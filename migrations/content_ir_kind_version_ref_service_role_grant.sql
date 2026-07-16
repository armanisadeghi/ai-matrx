-- content_ir.kind_version_ref lost its service_role SELECT grant when the view
-- was recreated (wf_017/wf_020 era). The kind_example recompute trigger reads
-- it via resolve_kind_version, so EVERY service-role kind_example write died
-- with 42501. Pin-resolution stays service_role-only (SHAPE_SYSTEM 2026-07-05).
grant select on content_ir.kind_version_ref to service_role;
