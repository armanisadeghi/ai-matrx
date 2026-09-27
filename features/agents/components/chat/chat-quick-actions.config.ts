import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

/**
 * Chat new-page configuration — the agent that owns `/chat/new`.
 *
 * The quick-action row under the splash composer is DATA, not code: the
 * `agents.chat_composer.quick_actions` knob (`{ label, mandateKey }[]`, system
 * default seeded by `migrations/chat_composer_knobs_2026_09_27.sql`,
 * overridable per organization and per person), rendered by
 * `ComposerQuickActions`. Changing the row is a knob edit, never a code change.
 */

/**
 * The default new-chat agent is a MANDATE — `chat.default_new_chat` — resolved at
 * run time (system default → the user's own binding) via
 * `features/mandates` (`resolveMandate` / `useMandate` /
 * `resolveMandateServer`). Swapping the "default feel" of the chat surface
 * is a rebind in the admin mandate console (or a per-user binding on
 * `/mandates`), never a code change.
 */
export const DEFAULT_NEW_CHAT_MANDATE_KEY = MANDATE_KEYS.chat__default_new_chat;

/**
 * SEED MIRROR of the mandate's system default — the id the mandate row was seeded
 * with, kept ONLY for static module-scope data that cannot resolve a mandate
 * (the ProTextarea "help" placeholder default). Everything on a runtime path
 * resolves `DEFAULT_NEW_CHAT_MANDATE_KEY` instead; adding a new read of this
 * constant is a defect (see features/mandates/FEATURE.md — the manifest
 * seed-mirror ruling).
 */
export const DEFAULT_NEW_CHAT_AGENT_ID = "6b6b4e45-4699-4860-8dea-d8a60e07d69a";
