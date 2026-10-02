import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";

/**
 * THE MODEL A NEW AGENT STARTS ON.
 *
 * Every "make me an agent" path in this repo pinned
 * `e2150d2f-7dd3-4fad-9d81-6e6ea41d4afd` — `gemini-3-flash-preview`, which is
 * `is_deprecated = true` in `ai.model_definition` and is a small fast model.
 * A brand-new agent carries the organization's tools and is expected to run a
 * tool loop on its first day, and a small model is the wrong seat for that
 * (common-docs: model selection — agentic work never gets a small model).
 *
 * Claude Sonnet 5 (`is_primary`, not deprecated, not premium) is the capable
 * default. It is ONE constant so a retirement is one edit, not a hunt.
 */
export const DEFAULT_AGENT_MODEL_ID = "617abdcd-79e2-4a4b-be76-4a9960cdffa1";

/**
 * THE BLANK AGENT — what "Create Manually" gives a person.
 *
 * 🚨 WHY THIS EXISTS. "Create Manually" used to hand everybody
 * `TEMPLATE_DATA`: an agent called "New Agent Template" whose own user turn
 * is *"Do you know about {{city}}? I'm looking for {{what}} there."*, with
 * three sample variables (`city` = New York City, `what` = Luxury Shopping,
 * `response_format`). The sixth independent pass of the unified-data
 * verification asked such an agent to do a real records job and got back a
 * list of luxury shops in Manhattan — the demo's prompt won over the person's
 * instruction, and nothing was written. An agent made the manual way could not
 * do the job it was made for.
 *
 * So the manual path creates NOTHING it did not have to: no sample
 * instruction, no sample user turn, no sample variables, no sample knowledge
 * or context policy. Templates are still available, honestly labelled, behind
 * "Start from a template" on `/agents/new`.
 *
 * `tools` is an EMPTY ARRAY on purpose, not a list. `agent.definition`'s
 * `zz_seed_org_default_tools` trigger seeds the organization's default tool
 * set (which carries Records where the store is on) for exactly the writer who
 * "said nothing about tools" — `new.tools is null or cardinality = 0`. Naming
 * any tool here would silently opt the agent OUT of its organization's set.
 */
export const BLANK_AGENT_SEED: Omit<Partial<AgentDefinition>, "id"> = {
  agentType: "user",
  name: "Untitled Agent",
  description: null,
  messages: [
    {
      role: "system",
      content: [{ text: "", type: "text" }],
    },
  ],
  variableDefinitions: [],
  modelId: DEFAULT_AGENT_MODEL_ID,
  settings: { stream: true },
  tools: [],
  customTools: [],
  contextPolicies: [],
  category: null,
  tags: [],
  isActive: true,
  isArchived: false,
  isFavorite: false,
  mcpServers: [],
};
