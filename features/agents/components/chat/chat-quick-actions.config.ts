/**
 * Chat new-page configuration — the agents wired to the landing surface.
 *
 * Edit this file to change what shows up on `/chat/new` without touching any
 * component code. Each entry is an `{ id, label }` pair; the `id` is the
 * `agx_agent.id` and the `label` is what the user sees on the chip.
 *
 * Ordering reflects render order — first entry is leftmost (or topmost on
 * narrow widths). Remove or add entries freely; the chip grid will reflow.
 */

export interface ChatQuickAction {
  /** Canonical `agx_agent.id`. */
  id: string;
  /** Chip label as the user sees it. */
  label: string;
}

/**
 * The agent that owns the input bar when the user first lands on `/chat/new`.
 * Picked so that typing-and-submitting without choosing a chip routes through
 * a reasonable general-purpose agent. Change this to swap the "default" feel
 * of the chat surface for everyone.
 *
 * Also the default agent for the floating **Chat** window panel when opened
 * from general entry points (shell tools grid, context menu) — not when another
 * surface opens the panel with an explicit `initialAgentId`.
 */
export const DEFAULT_NEW_CHAT_AGENT_ID = "6b6b4e45-4699-4860-8dea-d8a60e07d69a";

/**
 * Primary chips — large, prominent, the headline "what you can do here" row.
 */
export const PRIMARY_QUICK_ACTIONS: readonly ChatQuickAction[] = [
  {
    id: "9650acee-e21f-4cea-a0dd-b826908a0815", // Confirmed.
    label: "Show off what you can do",
  },
  {
    id: "3d1da24e-8907-442a-a4d9-0db9428c1ece",
    label: "I want fair news",
  },
  {
    id: "96b75336-5447-4277-b5ec-0336241cffe2",
    label: "Help me write something",
  },
  {
    id: "8b205923-3efa-4018-bb68-2088af362e4c",
    label: "Make me flashcards",
  },
  {
    id: "edb51696-ed8b-4a36-ae64-8c837d0c6c0b",
    label: "Make an Org Chart",
  },
];

/**
 * Secondary chips — smaller, supplemental utilities row below the primaries.
 */
export const SECONDARY_QUICK_ACTIONS: readonly ChatQuickAction[] = [
  {
    id: "bcc69216-d4fa-4e28-a090-8a7749123bc5",
    label: "Create an Image",
  },
  {
    id: "11fcc4f0-62a0-4b39-a75e-fd2adf395192",
    label: "Conduct Research",
  },
  {
    id: "a6f1dac1-8155-4813-8e56-3bdb201b0fe3",
    label: "Audio to Structured Plan",
  },
  {
    id: "ce7c5e71-cbdc-4ed1-8dd9-a7eac930b6b8",
    label: "Customize Chat",
  },
];
