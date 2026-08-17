// features/agents/orchestras/orchestrator/constants.ts
//
// "Generate an orchestrator" flow — the ids + markers that stitch the pieces
// together. See features/agents/docs/ORCHESTRAS.md (Generating an orchestrator).

/**
 * The "Agent Orchestrator" template in `agent.template`. `agx_create_agent_from_template`
 * copies it verbatim (owner set to the caller server-side); its system prompt carries an
 * empty `<available_agents></available_agents>` block we fill with generated descriptions.
 */
export const ORCHESTRATOR_TEMPLATE_ID = "b06689e3-c651-443a-9059-7e11160d91b4";

/**
 * The mandate for the "Orchestra Role Describer". "Sync agent listings" runs it
 * once per click over the WHOLE set: it reads every member's current config
 * (name, description, system prompt, inputs, output) AND its current set role
 * (`current_role_title` / `current_gap`), then returns a strict JSON array of
 * `{id,role_title,gap}` for EVERY member — filling the ones that are blank,
 * fixing the ones that are wrong, and confirming/keeping the ones already
 * accurate. The result is written to each member EDGE (not the agent) and is
 * the source of truth for the `<available_agents>` listing.
 *
 * Run headlessly via `launchAgentExecution({ mandateKey })`. A raw UUID lived here
 * until 2026-08-16; the mandate is declared in aidream
 * `services/agent_slots/client_slots.py` and is the only sanctioned way to name
 * this agent from code.
 */
export const ORCHESTRA_ROLE_DESCRIBER_MANDATE_KEY = "orchestras.role_describer";

/** The variable the Orchestra Role Describer reads (the members dump JSON). */
export const ROLE_DESCRIBER_INPUT_VAR = "agent_config";

/**
 * Columns read per member to build the describer dump AND the listing block —
 * the agent's identity, system prompt (`messages`, the strongest signal for the
 * role), declared inputs (`variable_definitions`), and output shape.
 */
export const MEMBER_CONFIG_COLUMNS =
  "id, name, description, messages, variable_definitions, output_schema" as const;

/**
 * The injection site in the orchestrator's system prompt. We replace everything
 * between the open/close tags with the generated agent blocks. If this marker is
 * absent the orchestrator prompt is not template-shaped → fail loudly, never write
 * garbage. Non-greedy so nested content can't run past the close tag.
 */
export const AVAILABLE_AGENTS_RE = /<available_agents>[\s\S]*?<\/available_agents>/;
export const AVAILABLE_AGENTS_OPEN = "<available_agents>";
export const AVAILABLE_AGENTS_CLOSE = "</available_agents>";

/**
 * 🚨 THE ORCHESTRATOR'S DEFINITION IS THE TEMPLATE, NOT THIS FILE.
 *
 * Until 2026-08-16 two constants lived here — ORCHESTRATOR_SUPERVISOR_PROMPT
 * and ORCHESTRATOR_USER_TEMPLATE — and `useCreateOrchestrator` wrote them over
 * the system + user messages of every orchestrator it created, because the
 * template above still shipped an obsolete "emit a JSON dispatch plan" planner
 * prompt that never delegated. The codebase was therefore the real definition
 * of every orchestrator in the product, and the template row was decorative: a
 * user editing it saw no effect.
 *
 * The template itself was corrected in the live DB instead (supervisor prompt,
 * `<available_agents>` marker intact, {{task}} / {{additional_context}} user
 * message), so a fresh copy is right at birth and editing the template is once
 * again how you change what orchestrators say. The constants are deleted; do
 * not reintroduce a code-side prompt override.
 */
