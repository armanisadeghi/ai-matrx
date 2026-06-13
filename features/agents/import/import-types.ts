import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { DatabaseTool } from "@/utils/supabase/tools-service";
import type { ImportValidationIssue } from "./agent-import-validation";

// ─── Tool Index ───────────────────────────────────────────────────────────────

/** Map of lowercase tool name → tool UUID. Built once from the DB. */
export type ToolIndex = Map<string, string>;

/** Build a ToolIndex from the DB tools list. */
export function buildToolIndex(tools: DatabaseTool[]): ToolIndex {
  const map: ToolIndex = new Map();
  for (const t of tools) {
    map.set(t.name.toLowerCase(), t.id);
  }
  return map;
}
// NOTE: pre-2026 we also indexed by `function_path` tail (so pastes like
// `matrx_ai.tools.weather` would resolve). That column was dropped — the
// executor now owns the implementation path internally. Tools resolve by
// `name` only.

// ─── Import Source ─────────────────────────────────────────────────────────────

export type ImportStatus = "active" | "coming-soon";

export interface ImportSource {
  id: string;
  label: string;
  category: "Matrx System" | "Playground" | "Frameworks";
  status: ImportStatus;
  description?: string;
}

export const IMPORT_SOURCES: ImportSource[] = [
  // Matrx System — active
  {
    id: "agent-json",
    label: "Agent JSON",
    category: "Matrx System",
    status: "active",
    description: "Paste a Matrx agent JSON (DB or frontend format)",
  },
  {
    id: "prompt-json",
    label: "Prompt JSON",
    category: "Matrx System",
    status: "active",
    description: "Convert a Matrx prompt into an agent",
  },
  // Playground — coming soon
  {
    id: "openai-playground",
    label: "OpenAI Playground",
    category: "Playground",
    status: "coming-soon",
  },
  {
    id: "anthropic-playground",
    label: "Anthropic Playground",
    category: "Playground",
    status: "coming-soon",
  },
  {
    id: "google-playground",
    label: "Google Playground",
    category: "Playground",
    status: "coming-soon",
  },
  {
    id: "meta-playground",
    label: "Meta Playground",
    category: "Playground",
    status: "coming-soon",
  },
  // Frameworks — coming soon
  {
    id: "langgraph",
    label: "LangGraph",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "crew-ai",
    label: "CrewAI",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "autogen",
    label: "Microsoft AutoGen",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "copilot-studio",
    label: "Copilot Studio",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "openai-agent-kit",
    label: "OpenAI AgentKit",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "google-vertex-adk",
    label: "Google Vertex ADK",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "agentforce",
    label: "Salesforce Agentforce",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "dify",
    label: "Dify",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "langflow",
    label: "Langflow",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "buildship",
    label: "BuildShip",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "pydantic-ai",
    label: "PydanticAI",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "llamaindex-workflows",
    label: "LlamaIndex Workflows",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "mastra",
    label: "Mastra",
    category: "Frameworks",
    status: "coming-soon",
  },
  {
    id: "super-agi",
    label: "SuperAGI",
    category: "Frameworks",
    status: "coming-soon",
  },
];

// ─── Conversion Result ─────────────────────────────────────────────────────────

/** When a tool name couldn't be resolved to an ID. */
export interface UnresolvedTool {
  originalValue: string;
  reason: "name-not-found" | "invalid-uuid-format";
}

export interface NeedsUserInputHint {
  unresolvedTools?: UnresolvedTool[];
}

export type ConversionResult =
  | {
      success: true;
      partial: Omit<Partial<AgentDefinition>, "id">;
      warnings: string[];
    }
  | {
      success: false;
      error: string;
      warnings: string[];
      issues?: ImportValidationIssue[];
      comingSoon?: boolean;
      needsUserInput?: NeedsUserInputHint;
    };

// ─── Converter Interface ───────────────────────────────────────────────────────

export interface ImportConverter {
  id: string;
  label: string;
  convert(raw: string, toolIndex: ToolIndex): Promise<ConversionResult>;
}

// ─── Parse Result ─────────────────────────────────────────────────────────────

export type ParseResult =
  | { success: true; data: unknown; warnings: string[] }
  | { success: false; error: string; warnings: string[] };
