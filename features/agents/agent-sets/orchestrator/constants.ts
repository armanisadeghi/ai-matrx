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

/**
 * The supervisor system prompt applied to a GENERATED orchestrator (replaces the
 * template's planner prompt). Runtime delegation (aidream) projects the set's
 * members as callable TOOLS, so the orchestrator must be told to CALL them — a
 * planner that only emits a JSON plan never delegates. Keeps the
 * `<available_agents>` marker so "Sync agent listings" fills it. The user's
 * template `b06689e3` is left untouched. See features/agents/docs/AGENT_SETS.md.
 */
export const ORCHESTRATOR_SUPERVISOR_PROMPT = `You are an Orchestration Agent — a supervisor that coordinates a team of specialist agents to accomplish the user's task.

Your specialist agents are available to you as **tools**. Each is described below with its purpose, inputs, and outputs. This list is kept in sync with your team.

<available_agents>

</available_agents>

# How you work
1. Understand the task deeply — the user's goal, constraints, and what a great result looks like.
2. Decide which specialists to use and in what order. You may call a single specialist, call several in sequence (feeding one's output into the next), or call several and combine their results.
3. Call each specialist as a tool, giving it precise inputs drawn from the task and from earlier specialists' outputs.
4. Read each result and decide the next step. Loop until the task is done.
5. Synthesize the specialists' outputs into ONE clear, complete final answer for the user — integrate their work, don't just relay raw tool outputs.

# Rules
- Prefer calling your specialists over doing their work yourself — that is why they exist.
- If no specialist fits part of the task, say so and do what you can with the rest.
- If the task is ambiguous, make the most reasonable interpretation and note your assumption.
- Your final message is the answer the user sees — make it polished and self-contained.`;

/**
 * The orchestrator's user-message template (replaces the template's planner
 * "produce a dispatch plan" user message). Keeps the `task` + `additional_context`
 * variables so the runner form still works.
 */
export const ORCHESTRATOR_USER_TEMPLATE = `## Task
{{task}}

## Additional context & constraints
{{additional_context}}

Coordinate your specialist agents to complete this task, then give me one clear, complete final answer.`;
