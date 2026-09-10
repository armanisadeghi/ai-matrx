import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

// features/messaging/lib/messagingMandates.ts
//
// THE FOUR JOBS the messaging conversation pane runs, named once.
//
// `@ai-matrx/messaging` ships four conversation intelligences and holds no
// agent id and no prompt — an agent's definition lives in the DATABASE, and the
// codebase is only the connection. So the host names the JOB and the platform
// decides who fulfils it: these keys are `mandate.definition` rows, declared in
// aidream `services/mandates/client_mandates.py` (provision
// `messaging.conversation`), rebindable per organization and per user at
// `/mandates` with no deploy.
//
// This module is deliberately LEAF and UI-free: the surface manifest imports it
// to disclose the four jobs in the top Agents menu, and the provider hook
// imports it to resolve them. One list, two readers, no chance of the menu and
// the runtime naming different jobs.

/** The package's capability name → the platform Mandate that fulfils it. */
export const MESSAGING_MANDATE_KEYS = {
  catchUp: MANDATE_KEYS.messaging__conversation_catch_up,
  summarize: MANDATE_KEYS.messaging__conversation_summary,
  actionItems: MANDATE_KEYS.messaging__action_item_extraction,
  draftReply: MANDATE_KEYS.messaging__reply_drafting,
} as const;

export type MessagingCapability = keyof typeof MESSAGING_MANDATE_KEYS;

export const MESSAGING_MANDATE_KEY_LIST: readonly string[] = Object.values(
  MESSAGING_MANDATE_KEYS,
);

/**
 * What each job does ON THIS SURFACE, in product language — the sentence the
 * Agents menu shows beside the mandate. Not a description of the agent: the
 * Holder moves, the job does not.
 */
export const MESSAGING_MANDATE_ROLES: readonly {
  capability: MessagingCapability;
  name: string;
  label: string;
  description: string;
}[] = [
  {
    capability: "catchUp",
    name: "conversation_catch_up",
    label: "Catch me up",
    description:
      "Tells the reader what changed in the messages they have not seen yet.",
  },
  {
    capability: "summarize",
    name: "conversation_summary",
    label: "Summarize",
    description:
      "States what the open conversation was about, what was decided, and what is still open.",
  },
  {
    capability: "actionItems",
    name: "action_item_extraction",
    label: "Action items",
    description:
      "Lists the commitments and requests the open conversation contains, with the owner it names.",
  },
  {
    capability: "draftReply",
    name: "reply_drafting",
    label: "Draft a reply",
    description:
      "Writes the next message the reader could send, from the thread and the instruction they typed.",
  },
];

/** The org/user-configurable transcript cap behind all four jobs. */
export const MESSAGING_AI_KNOB_FEATURE = "messaging.conversation_ai";
export const MESSAGING_AI_TRANSCRIPT_CAP_KEY = "transcript_message_cap";
