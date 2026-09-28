-- lane: access-ladder T-11, step 1 (client half): the registry view every client list reads to
-- decide where it opens (lib/list-scope `resolveListScope`) now answers from the "Shown to by
-- default" knob instead of platform.entity_types.default_list_scope: a type whose knob is Only me
-- opens on `mine`; anything else on the organization. Same two columns, same values, so no client
-- changes shape. (The client word `organization` is the tab name, not the Shown-to value.)
-- One object locked: the view platform.list_scope_registry.
set local lock_timeout = '2s';

create or replace view platform.list_scope_registry as
  select k.key as token,
         case when coalesce(k.value, k.default_value) #>> '{}' = 'only_me'
              then 'mine' else 'organization' end::platform.list_scope as default_list_scope
    from platform.feature_knob k
   where k.feature = 'access.shown_to_default';

comment on view platform.list_scope_registry is
  'Access ladder T-11: where each type''s list opens, derived from the system rung of the knob '
  'access.shown_to_default/<token> (only_me -> mine, else organization). Read by lib/list-scope.';
