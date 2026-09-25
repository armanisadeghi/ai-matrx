-- chair-step: removes the app -> scope association type registered by
--   hierarchycascade_an_agent_app_can_be_tagged_with_scopes.sql. Run only if no app -> scope
--   association row exists (the enforce trigger would otherwise orphan them).
delete from platform.association_types
where source_type = 'app' and target_type = 'scope' and label is null
  and not exists (
    select 1 from platform.associations a where a.source_type = 'app' and a.target_type = 'scope'
  );
