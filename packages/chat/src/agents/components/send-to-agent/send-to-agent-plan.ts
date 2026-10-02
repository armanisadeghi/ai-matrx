// features/agents/components/send-to-agent/send-to-agent-plan.ts
//
// "Send this response to another agent" — the pure half. Given the agent the
// person picked, it lists every place the content can go (the agent's own
// variables and context slots, plus "Important context" and "Your message"),
// and turns the chosen place into the `runtime` a launch carries.
//
// THE USER-INPUT LAW: machine content never rides `user_input` on its own. The
// ONE exception here is the "Your message" destination, which the person picks
// explicitly and then edits in the composer before sending — it IS their text.
// Every other destination is a variable or a context entry.

import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { ContextPolicy } from "@/features/agents/types/agent-api-types";
import type { AgentExecutionRuntime } from "@/features/agents/types/agent-execution-config.types";

/** The ad-hoc context key the default destination lands under. */
export const IMPORTANT_CONTEXT_KEY = "user_tagged_context";

/** What the receiving model is told the default destination is. */
export const IMPORTANT_CONTEXT_DESCRIPTION =
  "Important context specifically tagged by the user for your review. Read it carefully and take it into account in your response.";

/**
 * Up to this many characters, "Important context" is placed directly in the
 * prompt. Longer content is still sent, but the server lists it and the agent
 * reads it through its context tool (aidream `context_objects.should_inline`).
 */
export const IMPORTANT_CONTEXT_INLINE_CHARS = 10_000;

export type SendToAgentDestination =
  | { kind: "important-context" }
  | { kind: "user-text" }
  | { kind: "variable"; name: string }
  /** `label` is the slot's own — sent back so the sender never overwrites it. */
  | { kind: "context-slot"; key: string; label?: string };

export interface SendToAgentDestinationOption {
  /** Stable id for the radio group. */
  id: string;
  destination: SendToAgentDestination;
  label: string;
  /** The agent's own help text for this input/slot, when it has one. */
  description?: string;
  /** Why this destination cannot take the text — shown, never hidden. */
  disabledReason?: string;
  group: "general" | "variables" | "context";
}

export function destinationId(d: SendToAgentDestination): string {
  switch (d.kind) {
    case "important-context":
    case "user-text":
      return d.kind;
    case "variable":
      return `variable:${d.name}`;
    case "context-slot":
      return `context:${d.key}`;
  }
}

/**
 * Every destination, always in the same place. One that cannot take the text
 * is still listed, disabled, with a one-line reason:
 * - "Important context" when the agent's "Allow automated context injection"
 *   is off (`auto_context_disabled`) — the server drops undeclared keys;
 * - a variable that is a model control (`control`) or filled at run time
 *   (`binding`).
 */
export function buildDestinationOptions(
  variables: readonly VariableDefinition[] | null | undefined,
  contextSlots: readonly ContextPolicy[] | null | undefined,
  opts: { autoContextDisabled?: boolean } = {},
): SendToAgentDestinationOption[] {
  const options: SendToAgentDestinationOption[] = [
    {
      id: "important-context",
      destination: { kind: "important-context" },
      label: "Important context",
      group: "general",
      ...(opts.autoContextDisabled
        ? { disabledReason: "Automated context injection is off for this agent" }
        : {}),
    },
    {
      id: "user-text",
      destination: { kind: "user-text" },
      label: "Your message",
      group: "general",
    },
  ];
  for (const v of variables ?? []) {
    if (!v?.name) continue;
    const destination: SendToAgentDestination = { kind: "variable", name: v.name };
    const help = v.helpText?.trim();
    const disabledReason = v.control
      ? "Model setting"
      : v.binding
        ? "Filled automatically"
        : undefined;
    options.push({
      id: destinationId(destination),
      destination,
      label: humanizeName(v.name),
      group: "variables",
      ...(help ? { description: help } : {}),
      ...(disabledReason ? { disabledReason } : {}),
    });
  }
  for (const slot of contextSlots ?? []) {
    if (!slot?.key || slot.key === IMPORTANT_CONTEXT_KEY) continue;
    const slotLabel = slot.label?.trim();
    const destination: SendToAgentDestination = {
      kind: "context-slot",
      key: slot.key,
      ...(slotLabel ? { label: slotLabel } : {}),
    };
    const help = slot.description?.trim();
    options.push({
      id: destinationId(destination),
      destination,
      label: slotLabel || slot.key,
      group: "context",
      ...(help ? { description: help } : {}),
    });
  }
  return options;
}

/** The option selected when the person has not chosen: the first enabled one. */
export function defaultDestination(
  options: readonly SendToAgentDestinationOption[],
): SendToAgentDestinationOption | undefined {
  return options.find((o) => !o.disabledReason);
}

export interface SendToAgentLaunchPlan {
  runtime: AgentExecutionRuntime;
  /** Open the variable panel so the person sees the value they are sending. */
  showVariablePanel: boolean;
}

/** "research_question" → "Research question" — a variable's name as a label. */
export function humanizeName(name: string): string {
  const words = name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() : name;
}

/**
 * The launch `runtime` for content going to the chosen destination.
 *
 * `surfaceName: null` is the explicit ambient-context opt-out: the person
 * chose exactly what this agent receives, so the page it was launched from
 * (e.g. the whole source transcript on /chat) must not ride along unasked.
 */
export function buildLaunchPlan(
  destination: SendToAgentDestination,
  content: string,
): SendToAgentLaunchPlan {
  const plan = buildDestinationRuntime(destination, content);
  return { ...plan, runtime: { ...plan.runtime, surfaceName: null } };
}

function buildDestinationRuntime(
  destination: SendToAgentDestination,
  content: string,
): SendToAgentLaunchPlan {
  switch (destination.kind) {
    case "important-context":
      return {
        runtime: {
          context: {
            // The rich-envelope form the server reads (`ContextManifest.build`):
            // description + inline ceiling travel with the content itself.
            [IMPORTANT_CONTEXT_KEY]: {
              content,
              type: "text",
              label: "Important context from the user",
              description: IMPORTANT_CONTEXT_DESCRIPTION,
              max_inline_chars: IMPORTANT_CONTEXT_INLINE_CHARS,
            },
          },
        },
        showVariablePanel: false,
      };
    case "user-text":
      return { runtime: { userInput: content }, showVariablePanel: false };
    case "variable":
      // The shortcut mapping language: a fixed value for one variable.
      return {
        runtime: {
          valueMappings: {
            [destination.name]: { mapType: "direct_value", target: content },
          },
        },
        showVariablePanel: true,
      };
    case "context-slot":
      return {
        runtime: {
          context: {
            // Envelope with NO type/description: the server keeps the slot's
            // own declared type and description, and the label is the slot's
            // own — a bare value would be re-sent as {type:"text", label:key}
            // and overwrite both (sender values win server-side).
            [destination.key]: {
              content,
              ...(destination.label ? { label: destination.label } : {}),
            },
          },
        },
        showVariablePanel: false,
      };
  }
}
