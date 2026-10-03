-- draft: ONE-HOME DD-067 prerequisite of onehome_b2 — APPLIED to production 2026-10-03 00:28Z through the Supabase MCP (body md5 320bb25cd411e9a346c54e7cfe2b6314, same as the clone proof); kept as draft so no runner re-applies it (idempotent anyway)
-- chair-step: lane ONE-HOME wave 3, DD-067 / no-db-assigned-org — agent.enforce_surface_binding_scope_integrity()
--   stops reading through the temporary `workspace` alias (projects.projects / projects.tasks) and stops CHOOSING
--   the edge's organization: it used to overwrite NEW.organization_id with the scope's organization; now the
--   caller names it (matrx-frontend bindAgentToSurface sends the scope's own organization) and the trigger refuses
--   a binding filed under any other one (23514, by name). Law: the initiating operation provides organization_id;
--   no trigger may choose it (platform._ddl_guard refuses a body that assigns NEW.organization_id).
-- Census 2026-10-03 (production): 43 agent->surface bindings — 8 global, 6 org, 29 user, 0 project, 0 task;
--   0 org bindings filed under another organization. No row relies on the old overwrite.
-- Live body read in this transaction; each fragment asserted present exactly once (refused by name otherwise);
--   CREATE OR REPLACE keeps the OID, owner, ACL, SECURITY DEFINER and search_path. Idempotent: an already
--   rewritten body is skipped.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_def text;
  v_n int;
  r record;
begin
  v_def := pg_get_functiondef('agent.enforce_surface_binding_scope_integrity()'::regprocedure);
  if position('NEW.organization_id :=' in v_def) = 0 and position('workspace.' in v_def) = 0 then
    raise notice 'surface binding scope integrity: already checks and never assigns — nothing to do';
    return;
  end if;
  for r in select * from (values
    ('FROM workspace.projects p', 'FROM projects.projects p'),
    ('FROM workspace.tasks t', 'FROM projects.tasks t'),
    (E'  -- BEFORE UPDATE may change columns omitted by an ON CONFLICT DO UPDATE list.\n' ||
     E'  -- This repairs an old malformed row on its next upsert as well as protecting\n' ||
     E'  -- all new writes while generic assoc_add derives an endpoint org.\n' ||
     E'  IF v_expected_org_id IS NOT NULL THEN\n' ||
     E'    NEW.organization_id := v_expected_org_id;\n' ||
     E'  END IF;',
     E'  -- The caller names the edge''s organization (no-db-assigned-org): an org binding lives in that\n' ||
     E'  -- organization, a project or task binding in its project''s or task''s. Checked here, never chosen here.\n' ||
     E'  IF v_expected_org_id IS NOT NULL\n' ||
     E'     AND NEW.organization_id IS DISTINCT FROM v_expected_org_id THEN\n' ||
     E'    RAISE EXCEPTION\n' ||
     E'      ''surface binding % belongs to organization %, not % — send the organization its scope lives in'',\n' ||
     E'      NEW.role, v_expected_org_id, NEW.organization_id\n' ||
     E'      USING ERRCODE = ''23514'';\n' ||
     E'  END IF;')
  ) t(old_frag, new_frag)
  loop
    v_n := (length(v_def) - length(replace(v_def, r.old_frag, ''))) / length(r.old_frag);
    if v_n <> 1 then
      raise exception 'surface binding scope integrity: expected fragment found % times, not once — the body moved; re-read it: %', v_n, left(r.old_frag, 60);
    end if;
    v_def := replace(v_def, r.old_frag, r.new_frag);
  end loop;
  execute v_def;
end $$;
