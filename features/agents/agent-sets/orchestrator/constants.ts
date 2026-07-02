// features/agents/agent-sets/orchestrator/constants.ts
//
// "Generate an orchestrator" flow — the ids + markers that stitch the pieces
// together. See features/agents/docs/AGENT_SETS.md (Generating an orchestrator).

/**
 * The "Agent Orchestrator" template in `agent.template`. `agx_create_agent_from_template`
 * copies it verbatim (owner set to the caller server-side); its system prompt carries an
 * empty `<available_agents></available_agents>` block we fill with generated descriptions.
 */
export const ORCHESTRATOR_TEMPLATE_ID = "b06689e3-c651-443a-9059-7e11160d91b4";

/**
 * The "Agent Description Generator" builtin system agent. Given a JSON dump of the
 * selected agents (`{id,name,description,output_schema,variable_definitions}`), it
 * returns the `<agent>` blocks that go inside `<available_agents>`. Run headlessly via
 * `launchAgentExecution` (raw UUID; not in the FE SYSTEM_AGENTS registry).
 */
export const AGENT_DESCRIPTION_GENERATOR_ID = "62d56534-b4e2-47a4-9d97-d0759f68ee21";

/** The variable the Agent Description Generator reads (the agents dump JSON). */
export const GENERATOR_INPUT_VAR = "agent_config";

/**
 * The injection site in the orchestrator's system prompt. We replace everything
 * between the open/close tags with the generated agent blocks. If this marker is
 * absent the orchestrator prompt is not template-shaped → fail loudly, never write
 * garbage. Non-greedy so nested content can't run past the close tag.
 */
export const AVAILABLE_AGENTS_RE = /<available_agents>[\s\S]*?<\/available_agents>/;
export const AVAILABLE_AGENTS_OPEN = "<available_agents>";
export const AVAILABLE_AGENTS_CLOSE = "</available_agents>";

/** Columns fed to the generator for each selected agent (the "dump"). */
export const DUMP_COLUMNS = "id, name, description, output_schema, variable_definitions" as const;
