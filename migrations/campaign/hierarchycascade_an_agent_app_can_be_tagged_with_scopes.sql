-- additive: yes
--
-- An agent app can be tagged with scopes. The app settings' scope tags write
-- `assoc_set_targets('app', <app id>, 'scope', …)` (the canonical association edge through
-- scopesService.setEntityScopes); `platform.enforce_known_association` refused every one with
-- 23514 "Unknown association type: app -> scope", because the pair was never registered when the
-- `agent_app` token was renamed `app`. Found by lane HIERARCHY-CASCADE's headless walk
-- (2026-09-25). Mirrors the agent -> scope and note -> scope rows (container_side target,
-- conveys at most viewer). Inverse: migrations/inverse/hierarchycascade_an_agent_app_can_be_tagged_with_scopes_down.sql
insert into platform.association_types
  (source_type, target_type, label, container_side, conveys_max, is_active, notes, allows_loops)
values
  ('app', 'scope', null, 'target', 'viewer', true,
   'An agent app tagged with scopes (app settings, EntityEngagementPicker). Registered 2026-09-25, lane HIERARCHY-CASCADE.',
   false)
on conflict do nothing;
