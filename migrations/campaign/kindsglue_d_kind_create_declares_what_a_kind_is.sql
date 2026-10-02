-- lane KINDS-GLUE wave 1b (2026-10-02) — the agent's kind_create tool declares disposition and child_dispositions.
--
-- WHY. aidream 6d91f976f3 made kind_create refuse every create without a disposition (and without child_dispositions
-- for each nested kind it would create). tool.definition.parameters is what the model is told the tool accepts, and
-- kind_create's carries additionalProperties:false — until the two args are declared here an agent can read the
-- refusal sentence but cannot pass them, so no agent can create a kind.
--
-- ORDER (aidream _generated_declarations.py, the loading_component note): land the code -> deploy -> THEN this file.
-- Applied BEFORE the deploy, an obedient agent passing disposition fails `extra inputs are not permitted` on the
-- running code. Verify the running aidream SHA contains 6d91f976f3 first.
-- The JSON is KindCreateArgs.model_json_schema() for the two properties, verbatim, so the boot tool-drift gate
-- (aidream startup/tools_check.py) sees code and row agree.
-- Locks: a row lock on one tool.definition row.
-- lane: KINDS-GLUE

select set_config('app.actor_system', 'migration/kindsglue_d', true);

update tool.definition
   set parameters = jsonb_set(parameters, '{properties}', (parameters -> 'properties') || $j${"disposition": {"anyOf": [{"enum": ["record", "envelope", "receipt", "proposal", "prose"], "type": "string"}, {"type": "null"}], "default": null, "description": "REQUIRED. What this kind's output is: record (structured fields a person filters by), prose (one text body), proposal (an offer awaiting review), receipt (says what a write saved or sent), envelope (a run wrapper whose keys differ every call). A create without it is refused.", "title": "Disposition"}, "child_dispositions": {"anyOf": [{"additionalProperties": {"enum": ["record", "envelope", "receipt", "proposal", "prose"], "type": "string"}, "type": "object"}, {"type": "null"}], "default": null, "description": "REQUIRED when the sample marks nested kinds this call will CREATE: {child_slug: disposition} for every new child kind. Existing children are reused untouched. A create missing one is refused before anything is written.", "title": "Child Dispositions"}}$j$::jsonb)
 where name = 'kind_create'
   and not (parameters -> 'properties' ? 'disposition');
