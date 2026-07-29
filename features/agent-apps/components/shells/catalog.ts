/**
 * Shell metadata catalog — kind/label/description ONLY, no component imports.
 * Split from index.ts (build-lab E2): the picker/settings surfaces need the
 * metadata but must NOT compile the shells themselves (FormToResultShell alone
 * drags SmartAgentInput -> ~1,500 modules into any page that renders the picker).
 */
import type { AgentAppShellKind } from "@/features/agent-apps/types";

export interface ShellMeta {
  kind: AgentAppShellKind;
  label: string;
  description: string;
}

/**
 * User-facing metadata for the shell picker. Currently lists only the
 * three shells implemented in Phase 1c; more shells (modal, sidebar,
 * floating bubble, card-stack, etc.) follow as we port from
 * features/agents/components/agent-widgets/.
 */
export const SHELL_CATALOG: ShellMeta[] = [
  {
    kind: "chat",
    label: "Chat",
    description:
      "Full chat-style runner with history, variables, streaming output.",
  },
  {
    kind: "form_to_result",
    label: "Form → Result",
    description:
      "Variables at top, response below. Optional follow-up conversation.",
  },
  {
    kind: "widget",
    label: "Widget / iframe",
    description:
      "Compact embed-friendly shell. Use for iframe deployments on third-party sites.",
  },
];
