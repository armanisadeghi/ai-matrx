import type { LucideIcon } from "lucide-react";
import {
  Code2,
  MousePointer2,
  PanelsTopLeft,
  TerminalSquare,
} from "lucide-react";

export const CODING_SESSION_PROVIDERS = [
  "claude_code",
  "codex",
  "cursor",
  "vscode",
] as const;

export type CodingSessionProvider = (typeof CODING_SESSION_PROVIDERS)[number];

export interface CodingSessionProviderMeta {
  provider: CodingSessionProvider;
  /**
   * The tool's slug as it appears in conversation `source_feature`. Every
   * mirrored conversation's `source_app` is `code-plugin`; the tool is the
   * smaller category beneath it (see features/ai-work/lib/providerSource.ts).
   */
  sourceFeature: "claude-code" | "codex" | "cursor" | "vscode";
  label: string;
  icon: LucideIcon;
  connection: string;
  docsHref: string;
  priority: "primary" | "secondary";
}

export const CODING_SESSION_PROVIDER_META: Record<
  CodingSessionProvider,
  CodingSessionProviderMeta
> = {
  claude_code: {
    provider: "claude_code",
    sourceFeature: "claude-code",
    label: "Claude Code",
    icon: TerminalSquare,
    connection: "AI Matrx plugin, OAuth MCP, and lifecycle hooks",
    docsHref: "https://code.claude.com/docs/en/plugins",
    priority: "primary",
  },
  codex: {
    provider: "codex",
    sourceFeature: "codex",
    label: "Codex",
    icon: Code2,
    connection: "AI Matrx plugin and remote MCP",
    docsHref: "https://developers.openai.com/codex/",
    priority: "secondary",
  },
  cursor: {
    provider: "cursor",
    sourceFeature: "cursor",
    label: "Cursor",
    icon: MousePointer2,
    connection: "AI Matrx plugin, MCP, skills, and hooks",
    docsHref: "https://cursor.com/docs/plugins",
    priority: "secondary",
  },
  vscode: {
    provider: "vscode",
    sourceFeature: "vscode",
    label: "VS Code",
    icon: PanelsTopLeft,
    connection: "AI Matrx extension and editor capabilities",
    docsHref:
      "https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview",
    priority: "secondary",
  },
};

export function isCodingSessionProvider(
  value: string,
): value is CodingSessionProvider {
  return CODING_SESSION_PROVIDERS.some((provider) => provider === value);
}

export function providerMeta(value: string): CodingSessionProviderMeta | null {
  return isCodingSessionProvider(value)
    ? CODING_SESSION_PROVIDER_META[value]
    : null;
}
