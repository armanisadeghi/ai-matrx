-- Register the resource -> scope_type association pairs so the scope-type
-- page's Resources cards can actually attach.
--
-- QA F1 · feedback 35d311a9 (2026-08-30), second blocker behind the access fix
-- in entity_access_attrs_org_scoped_ownerless_tables.sql: with access resolved,
-- assoc_add then failed with
--     23514  Unknown association type: file -> scope_type ... Register it in
--            platform.association_types first.
-- `scope` has 14 registered source pairs; `scope_type` had ZERO, so every
-- attach on /organizations/[org]/scopes/[typeId] (Resources grid) was
-- impossible.
--
-- Per the canonical-associations skill: a NEW pair registers with
-- container_side='none' — whether an edge CONVEYS access is a human decision
-- made in /administration/relationships, never an agent default. So these rows
-- deliberately do NOT mirror the conveying 'target' rows of `scope`
-- (file -> scope conveys viewer); if scope-type attachments should convey,
-- that is Arman's call to flip per pair. Direction is canonical little -> big
-- (resource -> scope_type).
--
-- Source set = the same 14 sources registered for `scope`, the closest
-- product precedent for this container. The Resources grid offers more
-- tokens; further pairs get registered the same way when their cards are
-- exercised (loud "Unknown association type" errors now surface in the UI).
--
-- Applied live via Supabase MCP on 2026-08-30.
insert into platform.association_types (source_type, target_type, container_side, conveys_max, is_active, notes)
select s.source_type, 'scope_type', 'none', 'editor'::permission_level, true,
       'scope-type Resources grid attach (QA F1 2026-08-30). Registered non-conveying per canonical-associations skill; conveyance is a human decision.'
from (values
  ('agent'), ('assessment'), ('content_ir_kind_instance'), ('conversation'),
  ('fc_set'), ('file'), ('hr_employee'), ('note'), ('party'), ('project'),
  ('study_media'), ('task'), ('thread'), ('war_room')
) as s(source_type)
on conflict (source_type, target_type) do update
  set is_active = true,
      updated_at = now();
