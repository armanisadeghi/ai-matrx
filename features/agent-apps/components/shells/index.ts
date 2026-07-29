/**
 * Shell registry for agent-apps.
 *
 * Maps `aga_apps.shell_kind` → React component. The renderer reads the
 * row's shell_kind and looks up the right shell here. `fully_custom` is
 * intentionally NOT in this registry — it's handled by the Babel-sandbox
 * path inside `AgentAppPublicRendererImpl`.
 *
 * To add a new shell:
 *   1. Create the component (consumes `useAgentApp`).
 *   2. Add the shell_kind value to the CHECK constraint on aga_apps.shell_kind.
 *   3. Register here.
 */

import { AgentAppChatShell } from "./AgentAppChatShell";
import { AgentAppFormToResultShell } from "./AgentAppFormToResultShell";
import { AgentAppWidgetShell } from "./AgentAppWidgetShell";
import type {
  AgentAppShellKind,
  PublicAgentApp,
} from "@/features/agent-apps/types";

interface ShellComponentProps {
  app: PublicAgentApp;
}

type ShellComponent = (props: ShellComponentProps) => React.ReactNode;

export const SHELL_REGISTRY: Partial<Record<AgentAppShellKind, ShellComponent>> = {
  chat: AgentAppChatShell,
  form_to_result: AgentAppFormToResultShell,
  widget: AgentAppWidgetShell,
};

export { type ShellMeta, SHELL_CATALOG } from "./catalog";

export {
  AgentAppChatShell,
  AgentAppFormToResultShell,
  AgentAppWidgetShell,
};
