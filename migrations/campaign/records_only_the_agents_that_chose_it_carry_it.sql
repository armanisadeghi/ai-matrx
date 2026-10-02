-- chair-step: a data-only file. It rewrites agent.definition.tools on the agents named by the two
-- rules below (row UPDATEs; no DDL, no grant, no table altered). Its inverse restores every touched
-- row's exact prior tool array, snapshotted from production immediately before the apply.
--
-- WHY (Arman, 2026-10-02: "Remove it from all of those agents. Then, do a simple check to see what
-- agents had the db editing tool and give the tool to them."). The BEFORE INSERT trigger
-- zz_seed_org_default_tools (dropped by records_a_new_agent_is_never_seeded_with_a_tool.sql) put
-- `records` on every new agent saved with no tools. Those agents never chose it.
--
-- RULE 1 — STRIP THE SEEDED `records`. An agent's `records` came from the seed when ALL hold:
--   * it was created after the seed existed (its door was declared 2026-09-19 21:04:34Z);
--   * its FIRST version (agent.definition_version, lowest version_number) carried exactly
--     {records} — the trigger's output for a writer that sent nothing;
--   * the row was not marked metadata.tools_declared (the one writer the trigger skipped).
--   Archived agents included. Kept on purpose: "NAV-FIX records proof"
--   (942b90bc-0212-4746-af89-d08f8f78ac6b), whose whole instruction is to exercise the records tool.
--   Only `records` is removed; any tool added later (e.g. agent_call) stays.
--
-- RULE 2 — GIVE `records` TO THE AGENTS THAT EDIT DATA. A live (not archived, not deleted) agent
-- whose OWN tool list carries a tool that writes the person's tables or rows — data, data_action,
-- dataset, picklist, db_user, db_admin, sql — gets `records` appended, unless it already has it.
SELECT set_config('app.actor_system', 'migration:records_only_the_agents_that_chose_it_carry_it', true);

-- RULE 1
UPDATE agent.definition d
   SET tools = array_remove(d.tools, r.id)
  FROM (SELECT id FROM tool.definition WHERE name = 'records') r
 WHERE r.id = ANY (d.tools)
   AND d.id <> '942b90bc-0212-4746-af89-d08f8f78ac6b'::uuid
   AND d.created_at >= '2026-09-19 21:04:34+00'
   AND coalesce(d.metadata ->> 'tools_declared', '') <> 'true'
   AND (SELECT v.tools FROM agent.definition_version v
         WHERE v.agent_id = d.id ORDER BY v.version_number LIMIT 1) = ARRAY[r.id];

-- RULE 2
UPDATE agent.definition d
   SET tools = d.tools || r.id
  FROM (SELECT id FROM tool.definition WHERE name = 'records') r
 WHERE NOT coalesce(d.is_archived, false)
   AND d.deleted_at IS NULL
   AND NOT (r.id = ANY (coalesce(d.tools, '{}')))
   AND d.tools && (SELECT array_agg(t.id) FROM tool.definition t
                    WHERE t.name IN ('data', 'data_action', 'dataset', 'picklist',
                                     'db_user', 'db_admin', 'sql')
                      AND t.deleted_at IS NULL);
