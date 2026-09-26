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
  | { kind: "context-slot"; key: string };

export interface SendToAgentDestinationOption {
  /** Stable id for the radio group. */
  id: string;
  destination: SendToAgentDestination;
  label: string;
  description: string;
  group: "general" | "variables" | "context";
}

export const DEFAULT_DESTINATION_ID = "important-context";

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

/** Every destination the picked agent offers, default first. */
export function buildDestinationOptions(
  variables: readonly VariableDefinition[] | null | undefined,
  contextSlots: readonly ContextPolicy[] | null | undefined,
): SendToAgentDestinationOption[] {
  const options: SendToAgentDestinationOption[] = [
    {
      id: DEFAULT_DESTINATION_ID,
      destination: { kind: "important-context" },
      label: "Important context",
      description:
        "Attached for the agent to review, tagged as important. You type your own message.",
      group: "general",
    },
    {
      id: "user-text",
      destination: { kind: "user-text" },
      label: "Your message",
      description:
        "Placed in the message box as your own words, so you can edit it before sending.",
      group: "general",
    },
  ];
  for (const v of variables ?? []) {
    if (!v?.name) continue;
    const destination: SendToAgentDestination = { kind: "variable", name: v.name };
    options.push({
      id: destinationId(destination),
      destination,
      label: humanizeName(v.name),
      description: v.helpText?.trim() || "An input this agent asks for.",
      group: "variables",
    });
  }
  for (const slot of contextSlots ?? []) {
    if (!slot?.key || slot.key === IMPORTANT_CONTEXT_KEY) continue;
    const destination: SendToAgentDestination = { kind: "context-slot", key: slot.key };
    options.push({
      id: destinationId(destination),
      destination,
      label: slot.label?.trim() || slot.key,
      description:
        slot.description?.trim() || "Context this agent knows how to use.",
      group: "context",
    });
  }
  return options;
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
      return {
        runtime: { variables: { [destination.name]: content } },
        showVariablePanel: true,
      };
    case "context-slot":
      return {
        runtime: { context: { [destination.key]: content } },
        showVariablePanel: false,
      };
  }
}
