-- lane: DEAD-KEYS — inverse of deadkeys_three_reasons_named_a_reader_that_can_never_get_a_row.sql
-- chair-step: re-issues three GRANTs by construction. It restores the EXACT column ACLs the three
-- tables held before the withdrawal, read live from pg_attribute on 2026-09-22 and written out here
-- rather than inferred, so the undo cannot widen anything. It puts back a key that still opens no
-- door; it exists for rule 27 on the rehearsal branch, not as a repair.
set local lock_timeout = '5s';

grant select (id, url, captured_at, title) on extend.wbx_capture to anon;
grant select (id, surface_name, role_name, agent_id, kind, position, settings, scope_id, updated_at, deleted_at)
  on ui.ui_surface_agent_pref to anon;
grant select (id, surface_name, namespace, config, scope_id, updated_at, deleted_at)
  on ui.ui_surface_config to anon;
