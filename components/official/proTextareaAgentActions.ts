/**
 * ProTextarea "…" menu agent actions — shared ids, labels, and copy.
 * Each action runs an agent over the field text; Apply replaces the textarea value.
 */

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { SessionContextItem } from "@/features/transcript-studio/types";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";

/**
 * The JOB "Help with this…" runs when the host names none: the platform's
 * general conversational mandate. A MANDATE, never an agent id — the server
 * door (`POST /ai/mandates/{key}`) decides the Holder, so an organization or
 * person can rebind it from /mandates without a deploy. A host whose field has
 * a real job (the data-table formula box → `data.formula_writing`) passes its
 * own `helpMandateKey`.
 */
export const PRO_TEXTAREA_HELP_DEFAULT_MANDATE_KEY: AnyMandateKey =
  MANDATE_KEYS.chat__default_new_chat;

export type ProTextareaAgentActionId = "cleanup" | "help" | "customAgent";

/** Popover view state for ProTextarea's "…" menu. */
export type ProTextareaMenuMode =
  "menu" | "stats" | ProTextareaAgentActionId | "boundAgent";

export function isProTextareaAgentActionId(
  mode: ProTextareaMenuMode,
): mode is ProTextareaAgentActionId {
  return mode !== "menu" && mode !== "stats" && mode !== "boundAgent";
}

export interface ProTextareaAgentActionDefinition {
  id: ProTextareaAgentActionId;
  menuLabel: string;
  popoverTitle: string;
  /** When true, the action menu refuses to open without field text (Clean up). */
  requiresSourceText: boolean;
  emptyTextToast: string;
  chooseAgentToast: string;
  applySuccessToast: string;
  /**
   * The agent the action starts on when it runs by AGENT (Clean up: the
   * host's override or the cleanup surface's `clean` role). Null when the
   * action runs by mandate or waits for the person to pick.
   */
  resolveDefaultAgentId: (ctx: ProTextareaAgentActionContext) => string | null;
  /**
   * The JOB the action starts on when it runs by MANDATE. The embedded runner
   * resolves it for display and launches through the mandate door; a person
   * choosing another agent in the runner's picker replaces it for that run.
   */
  resolveDefaultMandateKey: (
    ctx: ProTextareaAgentActionContext,
  ) => AnyMandateKey | null;
}

export interface ProTextareaAgentActionContext {
  cleanupAgentId?: string | null;
  cleanupSurfaceAgentId?: string | null;
  helpMandateKey?: AnyMandateKey | null;
  customAgentMandateKey?: AnyMandateKey | null;
}

export interface ProTextareaAgentActionProps {
  /** AI "Clean up" in the "…" menu. ON by default. */
  enableCleanup?: boolean;
  cleanupAgentId?: string | null;
  cleanupContextItems?: SessionContextItem[];
  /** "Help with this…" — general-purpose agent assist. ON by default. */
  enableHelpWithThis?: boolean;
  /**
   * The JOB "Help with this…" runs. Defaults to the platform's general
   * mandate (`chat.default_new_chat`); a field with a real job passes its own.
   */
  helpMandateKey?: AnyMandateKey;
  /**
   * What the host holds for the help run. Each item travels BY ITS KEY as an
   * offered value of the mandate's Provision (`runtime.variables`) and as a
   * named context entry — never folded into the person's message.
   */
  helpContextItems?: SessionContextItem[];
  /** "Custom Agent" — pick any agent to run over the text. ON by default. */
  enableCustomAgent?: boolean;
  /** Optional JOB to preselect for "Custom Agent"; without it the person picks an agent. */
  customAgentMandateKey?: AnyMandateKey;
  customAgentContextItems?: SessionContextItem[];
}

export const PRO_TEXTAREA_AGENT_ACTIONS: Record<
  ProTextareaAgentActionId,
  ProTextareaAgentActionDefinition
> = {
  cleanup: {
    id: "cleanup",
    menuLabel: "Clean up",
    popoverTitle: "Clean up",
    requiresSourceText: true,
    emptyTextToast: "Add some text before cleaning it up",
    chooseAgentToast: "Choose a cleanup agent first",
    applySuccessToast: "Cleaned text applied",
    resolveDefaultAgentId: (ctx) =>
      ctx.cleanupAgentId ?? ctx.cleanupSurfaceAgentId ?? null,
    resolveDefaultMandateKey: () => null,
  },
  help: {
    id: "help",
    menuLabel: "Help with this…",
    popoverTitle: "Help with this…",
    requiresSourceText: false,
    emptyTextToast: "Add some text before asking for help",
    chooseAgentToast: "Choose an agent first",
    applySuccessToast: "Agent response applied",
    resolveDefaultAgentId: () => null,
    resolveDefaultMandateKey: (ctx) =>
      ctx.helpMandateKey ?? PRO_TEXTAREA_HELP_DEFAULT_MANDATE_KEY,
  },
  customAgent: {
    id: "customAgent",
    menuLabel: "Custom Agent",
    popoverTitle: "Custom Agent",
    requiresSourceText: false,
    emptyTextToast: "Add some text before running an agent",
    chooseAgentToast: "Choose an agent first",
    applySuccessToast: "Agent response applied",
    resolveDefaultAgentId: () => null,
    resolveDefaultMandateKey: (ctx) => ctx.customAgentMandateKey ?? null,
  },
};

/**
 * The launch payload for the host's items on an embedded run. By mandate, each
 * item is an offered value (the door's supplied offer) AND a context entry (so
 * a Holder that declares none of those names still sees them). By an agent the
 * person chose, the items ride context only — that agent has no Provision.
 * Blank values are dropped: a blank is missing, never an answer.
 */
export function proTextareaRunValues(
  items: readonly SessionContextItem[],
  byMandate: boolean,
): { variables?: Record<string, string>; context?: Record<string, string> } {
  const entries = items
    .filter((item) => item.key.trim() && item.value.trim())
    .map((item) => [item.key, item.value] as const);
  if (entries.length === 0) return {};
  const values = Object.fromEntries(entries);
  return byMandate
    ? { variables: values, context: { ...values } }
    : { context: values };
}

export function isEmbeddedProTextareaAgentAction(
  id: ProTextareaAgentActionId,
): boolean {
  return id === "help" || id === "customAgent";
}

export function isProTextareaAgentActionEnabled(
  id: ProTextareaAgentActionId,
  props: Pick<
    ProTextareaAgentActionProps,
    "enableCleanup" | "enableHelpWithThis" | "enableCustomAgent"
  >,
): boolean {
  switch (id) {
    case "cleanup":
      return props.enableCleanup !== false;
    // ON by default in every field (Arman, 2026-09-23: "it's not used
    // everywhere … but it should be"); a field that truly cannot take AI
    // opts out explicitly with `={false}`.
    case "help":
      return props.enableHelpWithThis !== false;
    case "customAgent":
      return props.enableCustomAgent !== false;
    default:
      return false;
  }
}
