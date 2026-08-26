/**
 * Chat new-page configuration — the agents wired to the landing surface.
 *
 * Edit this file to change what shows up on `/chat/new` without touching any
 * component code. Each entry is a `{ mandateKey, label }` pair: the chip is a
 * MANDATE (`agent.mandate.mandate_key`, resolved at render time via
 * `useMandateSet` — system default → the user's binding) and the `label` is
 * what the user sees. No agent id lives here: swapping what a chip opens is a
 * rebind on `/agents/mandates`, never a code change. A chip whose mandate
 * cannot resolve (not yet seeded, disabled) renders DISABLED with the reason —
 * never a silent fallback to a UUID.
 *
 * Ordering reflects render order — first entry is leftmost (or topmost on
 * narrow widths). Remove or add entries freely; the chip grid will reflow.
 */

export interface ChatQuickAction {
  /** Canonical `agent.mandate.mandate_key` (`chat.quick_*`). */
  mandateKey: string;
  /** Chip label as the user sees it. */
  label: string;
  /** What this agent does on the landing, in plain user-facing language. */
  does: string;
}

/**
 * The default new-chat agent is a MANDATE — `chat.default_new_chat` — resolved at
 * run time (system default → the user's own binding) via
 * `features/agents/mandates` (`resolveMandate` / `useMandate` /
 * `resolveMandateServer`). Swapping the "default feel" of the chat surface
 * is a rebind in the admin mandate console (or a per-user binding on
 * `/agents/mandates`), never a code change.
 */
export const DEFAULT_NEW_CHAT_MANDATE_KEY = "chat.default_new_chat";

/**
 * SEED MIRROR of the mandate's system default — the id the mandate row was seeded
 * with, kept ONLY for static module-scope data that cannot resolve a mandate
 * (the ProTextarea "help" placeholder default). Everything on a runtime path
 * resolves `DEFAULT_NEW_CHAT_MANDATE_KEY` instead; adding a new read of this
 * constant is a defect (see features/agents/mandates/FEATURE.md — the manifest
 * seed-mirror ruling).
 */
export const DEFAULT_NEW_CHAT_AGENT_ID = "6b6b4e45-4699-4860-8dea-d8a60e07d69a";

/**
 * Primary chips — large, prominent, the headline "what you can do here" row.
 */
export const PRIMARY_QUICK_ACTIONS: readonly ChatQuickAction[] = [
  {
    mandateKey: "chat.quick_showcase",
    label: "Show off what you can do",
    does: "shows what AI Matrx can do",
  },
  {
    mandateKey: "chat.quick_fair_news",
    label: "I want fair news",
    does: "summarizes current events from multiple perspectives",
  },
  {
    mandateKey: "chat.quick_writing_partner",
    label: "Help me write something",
    does: "helps draft and revise writing",
  },
  {
    mandateKey: "chat.quick_flashcards",
    label: "Make me flashcards",
    does: "turns source material into flashcards",
  },
  {
    mandateKey: "chat.quick_org_chart",
    label: "Make an Org Chart",
    does: "builds organization charts",
  },
];

/**
 * Secondary chips — smaller, supplemental utilities row below the primaries.
 */
export const SECONDARY_QUICK_ACTIONS: readonly ChatQuickAction[] = [
  {
    mandateKey: "chat.quick_image",
    label: "Create an Image",
    does: "creates images from a description",
  },
  {
    mandateKey: "chat.quick_research",
    label: "Conduct Research",
    does: "conducts sourced research",
  },
  {
    mandateKey: "chat.quick_audio_plan",
    label: "Audio to Structured Plan",
    does: "turns audio into a structured plan",
  },
  {
    mandateKey: "chat.cx_default",
    label: "Customize Chat",
    does: "helps configure chat behavior",
  },
];
