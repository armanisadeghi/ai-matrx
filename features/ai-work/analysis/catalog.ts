/**
 * Conversation-analysis catalog — the five platform reviewers a user can run
 * over ANY canonical conversation (an AI Matrx chat or a provider mirror).
 *
 * Each entry is an agent SLOT, not a hardcoded agent id: the slot resolves at
 * click time (`resolveAgentSlot` inside `launchAgentExecution`), so the agent
 * behind each analysis is swappable from the admin slots console with no
 * deploy. The slots are seeded by
 * `migrations/agent_slots_conversation_analysis_seed.sql`, each defaulting to
 * its purpose-built conversation-analysis agent (category
 * "conversation-analysis" in agent.definition). Every one of those agents
 * declares a `conversation_id` variable and carries the registered
 * `conversations` tool, so the launch passes exactly one runtime variable.
 *
 * Labels are plain language on purpose — the person clicking is a
 * non-technical expert, not an AI engineer. No "extractor", "auditor", or
 * "ledger" jargon reaches the UI.
 */

export interface ConversationAnalysisKind {
  /** Stable key — LiveRunWindow instance ids and React keys. */
  key: string;
  /** The agent slot resolved at launch time. */
  slotKey: string;
  /** Short human label on the run button. */
  label: string;
  /** One-line explainer of exactly what will happen — shown BEFORE it runs. */
  description: string;
}

export const CONVERSATION_ANALYSIS_KINDS: readonly ConversationAnalysisKind[] =
  [
    {
      key: "vision",
      slotKey: "conversation.vision_extractor",
      label: "What you asked for",
      description:
        "Collects everything you said you wanted in this conversation, and shows which of it was done and which was not.",
    },
    {
      key: "outcomes",
      slotKey: "conversation.outcome_summarizer",
      label: "What came out of it",
      description:
        "Summarizes the end results: what was produced, what was decided, and the facts this conversation established.",
    },
    {
      key: "open-items",
      slotKey: "conversation.action_auditor",
      label: "What's still open",
      description:
        "Finds unfinished work, promises that were made, and decisions still waiting on someone.",
    },
    {
      key: "decisions",
      slotKey: "conversation.decision_ledger",
      label: "Decisions and why",
      description:
        "Lists each decision that was made, the reasoning behind it, and the alternatives that were turned down.",
    },
    {
      key: "drift",
      slotKey: "conversation.drift_auditor",
      label: "Ask vs. delivered",
      description:
        "Compares your original request with what was actually delivered, and names where the work drifted.",
    },
  ];
