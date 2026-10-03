-- chair-step: a data-only file. Puts `records` back on ONE agent, the Data Page Builder
-- (35e47f88-a074-435f-a627-ca71b0ab770f). A row UPDATE; no DDL, no grant. The inverse puts its
-- tool list back to the empty array it had after records_only_the_agents_that_chose_it_carry_it.sql.
--
-- WHY. records_only_the_agents_that_chose_it_carry_it.sql stripped the `records` the INSERT seed
-- had put on agents nobody gave it to. The Data Page Builder matched that signature (born
-- 2026-09-21 with exactly {records}) but it was chosen BECAUSE it carries `records`: it holds the
-- data.page_guidance mandate behind the table page's "Ask an agent" (Forms / Bookings / Portals /
-- Dashboards), which must build through the records tool (aidream client_mandates.py,
-- "data.page_guidance"; aidream campaign agent_builds_the_data_page_guide_can_build.sql). The
-- verifier caught the regression on 2026-10-02.
SELECT set_config('app.actor_system', 'migration:records_the_data_page_builder_keeps_its_tool', true);

UPDATE agent.definition d
   SET tools = coalesce(d.tools, '{}') || r.id
  FROM (SELECT id FROM tool.definition WHERE name = 'records') r
 WHERE d.id = '35e47f88-a074-435f-a627-ca71b0ab770f'::uuid
   AND NOT (r.id = ANY (coalesce(d.tools, '{}')));
