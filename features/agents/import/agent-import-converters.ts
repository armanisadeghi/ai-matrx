/**
 * agent-import-converters.ts
 *
 * Pure conversion utilities for the Agent Import Window Panel.
 * No React, no Redux — easy to test and extend independently.
 *
 * Public surface:
 *   parsePasted(raw)                    → ParseResult
 *   agentJsonConverter                  → ImportConverter
 *   promptJsonConverter                 → ImportConverter
 *   comingSoonConverter(id, label)      → ImportConverter
 *   converterRegistry                   → Map<string, ImportConverter>
 */

import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type {
  ConversionResult,
  ImportConverter,
  ToolIndex,
} from "./import-types";
import {
  analyzeImportPaste,
  formatBlockingErrors,
  issuesToWarningStrings,
  sanitizeModelId,
} from "./agent-import-validation";
import { parsePasted } from "./agent-import-parse";

export { parsePasted } from "./agent-import-parse";

// ─── normalizeAgentKeys ───────────────────────────────────────────────────────

/** Map from DB snake_case top-level keys → camelCase AgentDefinition keys. */
const SNAKE_TO_CAMEL: Record<string, keyof AgentDefinition> = {
  variable_definitions: "variableDefinitions",
  model_id: "modelId",
  context_slots: "contextSlots",
  agent_type: "agentType",
  model_tiers: "modelTiers",
  output_schema: "outputSchema",
  custom_tools: "customTools",
  mcp_servers: "mcpServers",
  is_active: "isActive",
  is_public: "isPublic",
  is_archived: "isArchived",
  is_favorite: "isFavorite",
  is_version: "isVersion",
  parent_agent_id: "parentAgentId",
  version: "version",
  version_number: "version",
  changed_at: "changedAt",
  change_note: "changeNote",
  user_id: "userId",
  organization_id: "organizationId",
  project_id: "projectId",
  task_id: "taskId",
  source_agent_id: "sourceAgentId",
  source_snapshot_at: "sourceSnapshotAt",
  created_at: "createdAt",
  updated_at: "updatedAt",
  access_level: "accessLevel",
  is_owner: "isOwner",
  shared_by_email: "sharedByEmail",
};

/** Keys to strip from the input — runtime-only or readonly fields. */
const STRIP_KEYS = new Set([
  "id",
  "userId",
  "user_id",
  "organizationId",
  "organization_id",
  "projectId",
  "project_id",
  "taskId",
  "task_id",
  "sourceAgentId",
  "source_agent_id",
  "sourceSnapshotAt",
  "source_snapshot_at",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "isVersion",
  "is_version",
  "parentAgentId",
  "parent_agent_id",
  "version",
  "version_number",
  "changedAt",
  "changed_at",
  "changeNote",
  "change_note",
  "isOwner",
  "is_owner",
  "accessLevel",
  "access_level",
  "sharedByEmail",
  "shared_by_email",
]);

export function normalizeAgentKeys(
  raw: Record<string, unknown>,
): Partial<AgentDefinition> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (STRIP_KEYS.has(key)) continue;
    const camel = SNAKE_TO_CAMEL[key];
    if (camel) {
      out[camel] = value;
    } else {
      // Already camelCase or unknown key — pass through (unknown keys are ignored by TypeScript later)
      out[key] = value;
    }
  }
  return out as Partial<AgentDefinition>;
}

// ─── applyAgentDefaults ───────────────────────────────────────────────────────

export function applyAgentDefaults(
  partial: Partial<AgentDefinition>,
): Partial<AgentDefinition> {
  return {
    name: partial.name ?? "Imported Agent",
    description: partial.description ?? null,
    category: partial.category ?? null,
    tags: Array.isArray(partial.tags) ? partial.tags : [],
    agentType: partial.agentType ?? "user",
    isActive: partial.isActive ?? true,
    isPublic: partial.isPublic ?? false,
    isArchived: partial.isArchived ?? false,
    isFavorite: partial.isFavorite ?? false,
    modelId: sanitizeModelId(partial.modelId),
    messages: Array.isArray(partial.messages) ? partial.messages : [],
    variableDefinitions: partial.variableDefinitions ?? null,
    settings: partial.settings ?? ({} as AgentDefinition["settings"]),
    tools: Array.isArray(partial.tools) ? partial.tools : [],
    contextSlots: Array.isArray(partial.contextSlots)
      ? partial.contextSlots
      : [],
    modelTiers: partial.modelTiers ?? null,
    outputSchema: partial.outputSchema ?? null,
    customTools: Array.isArray(partial.customTools) ? partial.customTools : [],
    mcpServers: Array.isArray(partial.mcpServers) ? partial.mcpServers : [],
  };
}

// ─── resolveTools ─────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ToolResolutionResult {
  resolvedIds: string[];
  warnings: string[];
}

function resolveTools(
  toolValues: unknown[],
  toolIndex: ToolIndex,
): ToolResolutionResult {
  const resolvedIds: string[] = [];
  const warnings: string[] = [];

  for (const t of toolValues) {
    if (typeof t === "string" && UUID_RE.test(t)) {
      resolvedIds.push(t);
    } else if (typeof t === "string") {
      const id = toolIndex.get(t.toLowerCase());
      if (id) {
        resolvedIds.push(id);
      } else {
        warnings.push(
          `Tool '${t}' could not be resolved to an ID and was removed. You can add tools manually in the builder.`,
        );
      }
    } else if (t && typeof t === "object" && "name" in t) {
      const name = (t as { name: string }).name;
      const id = toolIndex.get(name.toLowerCase());
      if (id) {
        resolvedIds.push(id);
      } else {
        warnings.push(
          `Tool '${name}' could not be resolved to an ID and was removed. You can add tools manually in the builder.`,
        );
      }
    } else {
      warnings.push(`Unknown tool value '${JSON.stringify(t)}' was skipped.`);
    }
  }

  return { resolvedIds, warnings };
}

// ─── Converter: Agent JSON → Agent ────────────────────────────────────────────

export const agentJsonConverter: ImportConverter = {
  id: "agent-json",
  label: "Agent JSON",

  async convert(raw: string, toolIndex: ToolIndex): Promise<ConversionResult> {
    const analysis = analyzeImportPaste("agent-json", raw, toolIndex);
    if (analysis.status === "malformed") {
      return {
        success: false,
        error: analysis.error,
        warnings: analysis.parseWarnings,
      };
    }
    if (analysis.status === "analyzed" && !analysis.canConvert) {
      return {
        success: false,
        error: formatBlockingErrors(analysis.issues),
        warnings: issuesToWarningStrings(analysis.issues),
        issues: analysis.issues,
      };
    }

    const parseResult = parsePasted(raw);
    if (parseResult.success === false) {
      return { success: false, error: parseResult.error, warnings: [] };
    }

    const warnings =
      analysis.status === "analyzed"
        ? issuesToWarningStrings(analysis.issues)
        : [...parseResult.warnings];

    if (
      typeof parseResult.data !== "object" ||
      parseResult.data === null ||
      Array.isArray(parseResult.data)
    ) {
      return {
        success: false,
        error:
          "The pasted value is not a JSON object. Please paste a single agent object (not an array).",
        warnings,
      };
    }

    const normalized = normalizeAgentKeys(
      parseResult.data as Record<string, unknown>,
    );
    if (normalized.modelId !== undefined) {
      normalized.modelId = sanitizeModelId(normalized.modelId);
    }

    // Resolve tool names/IDs
    if (Array.isArray(normalized.tools) && normalized.tools.length > 0) {
      const { resolvedIds, warnings: toolWarnings } = resolveTools(
        normalized.tools,
        toolIndex,
      );
      normalized.tools = resolvedIds;
      if (analysis.status !== "analyzed") {
        warnings.push(...toolWarnings);
      }
    }

    if (!normalized.name && analysis.status !== "analyzed") {
      warnings.push(
        "The pasted agent is missing a `name` field. A default name 'Imported Agent' has been applied — you can rename it in the builder.",
      );
    }

    const partial = applyAgentDefaults(normalized);
    return { success: true, partial, warnings };
  },
};

// ─── Converter: Prompt JSON → Agent ───────────────────────────────────────────

export const promptJsonConverter: ImportConverter = {
  id: "prompt-json",
  label: "Prompt JSON",

  async convert(raw: string, toolIndex: ToolIndex): Promise<ConversionResult> {
    const analysis = analyzeImportPaste("prompt-json", raw, toolIndex);
    if (analysis.status === "malformed") {
      return {
        success: false,
        error: analysis.error,
        warnings: analysis.parseWarnings,
      };
    }
    if (analysis.status === "analyzed" && !analysis.canConvert) {
      return {
        success: false,
        error: formatBlockingErrors(analysis.issues),
        warnings: issuesToWarningStrings(analysis.issues),
        issues: analysis.issues,
      };
    }

    const parseResult = parsePasted(raw);
    if (parseResult.success === false) {
      return { success: false, error: parseResult.error, warnings: [] };
    }

    const warnings =
      analysis.status === "analyzed"
        ? issuesToWarningStrings(analysis.issues)
        : [...parseResult.warnings];

    if (
      typeof parseResult.data !== "object" ||
      parseResult.data === null ||
      Array.isArray(parseResult.data)
    ) {
      return {
        success: false,
        error:
          "The pasted value is not a JSON object. Please paste a single prompt object.",
        warnings,
      };
    }

    const src = parseResult.data as Record<string, unknown>;

    const partial: Partial<AgentDefinition> = {};

    // name, description, category, tags — pass through
    if (typeof src.name === "string") partial.name = src.name;
    if (typeof src.description === "string")
      partial.description = src.description;
    if (typeof src.category === "string") partial.category = src.category;
    if (Array.isArray(src.tags)) partial.tags = src.tags as string[];

    // messages — same structure
    if (Array.isArray(src.messages)) {
      partial.messages = src.messages as AgentDefinition["messages"];
    }

    // settings — pull out modelId, keep the rest
    const rawSettings = (src.settings ?? {}) as Record<string, unknown>;
    const modelId =
      rawSettings.model_id ??
      rawSettings.modelId ??
      src.model_id ??
      src.modelId;
    const sanitizedModelId = sanitizeModelId(modelId);
    if (sanitizedModelId) {
      partial.modelId = sanitizedModelId;
    }
    const { model_id: _a, modelId: _b, ...remainingSettings } = rawSettings;
    if (Object.keys(remainingSettings).length > 0) {
      partial.settings = remainingSettings as AgentDefinition["settings"];
    }

    // variableDefinitions — from variable_defaults / variableDefaults / variables
    const varSrc =
      src.variable_defaults ??
      src.variableDefaults ??
      src.variables ??
      src.variableDefinitions ??
      src.variable_definitions;
    if (Array.isArray(varSrc)) {
      partial.variableDefinitions = (varSrc as Record<string, unknown>[]).map(
        (v) => ({
          name: String(v.name ?? v.variable_name ?? ""),
          defaultValue: v.defaultValue ?? v.default_value ?? null,
          helpText: typeof v.helpText === "string" ? v.helpText : undefined,
          required: typeof v.required === "boolean" ? v.required : undefined,
          customComponent:
            v.customComponent as AgentDefinition["variableDefinitions"] extends Array<
              infer T
            >
              ? T extends { customComponent?: infer C }
                ? C
                : undefined
              : undefined,
        }),
      );
    }

    // outputSchema — from output_format / output_schema / outputSchema
    const outputSrc =
      src.output_schema ?? src.outputSchema ?? src.output_format;
    if (outputSrc != null) {
      partial.outputSchema = outputSrc as AgentDefinition["outputSchema"];
    }

    // tools — resolve names to UUIDs
    const toolSrc = Array.isArray(src.tools) ? src.tools : [];
    if (toolSrc.length > 0) {
      const { resolvedIds, warnings: toolWarnings } = resolveTools(
        toolSrc,
        toolIndex,
      );
      partial.tools = resolvedIds;
      if (analysis.status !== "analyzed") {
        warnings.push(...toolWarnings);
      }
    }

    if (!partial.name && analysis.status !== "analyzed") {
      warnings.push(
        "The pasted prompt is missing a `name` field. A default name 'Imported Agent' has been applied — you can rename it in the builder.",
      );
    }

    const withDefaults = applyAgentDefaults(partial);
    return { success: true, partial: withDefaults, warnings };
  },
};

// ─── Coming-soon stub factory ─────────────────────────────────────────────────

export function comingSoonConverter(
  id: string,
  label: string,
): ImportConverter {
  return {
    id,
    label,
    async convert(): Promise<ConversionResult> {
      return {
        success: false,
        error: `Converter for ${label} is not yet implemented. To import from ${label}, paste your Agent JSON directly using 'Agent JSON' in the meantime.`,
        warnings: [],
        comingSoon: true,
      };
    },
  };
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const converterRegistry = new Map<string, ImportConverter>([
  ["agent-json", agentJsonConverter],
  ["prompt-json", promptJsonConverter],
  // Playground
  [
    "openai-playground",
    comingSoonConverter("openai-playground", "OpenAI Playground"),
  ],
  [
    "anthropic-playground",
    comingSoonConverter("anthropic-playground", "Anthropic Playground"),
  ],
  [
    "google-playground",
    comingSoonConverter("google-playground", "Google Playground"),
  ],
  [
    "meta-playground",
    comingSoonConverter("meta-playground", "Meta Playground"),
  ],
  // Frameworks
  ["langgraph", comingSoonConverter("langgraph", "LangGraph")],
  ["crew-ai", comingSoonConverter("crew-ai", "CrewAI")],
  ["autogen", comingSoonConverter("autogen", "Microsoft AutoGen")],
  ["copilot-studio", comingSoonConverter("copilot-studio", "Copilot Studio")],
  [
    "openai-agent-kit",
    comingSoonConverter("openai-agent-kit", "OpenAI AgentKit"),
  ],
  [
    "google-vertex-adk",
    comingSoonConverter("google-vertex-adk", "Google Vertex ADK"),
  ],
  ["agentforce", comingSoonConverter("agentforce", "Salesforce Agentforce")],
  ["dify", comingSoonConverter("dify", "Dify")],
  ["langflow", comingSoonConverter("langflow", "Langflow")],
  ["buildship", comingSoonConverter("buildship", "BuildShip")],
  ["pydantic-ai", comingSoonConverter("pydantic-ai", "PydanticAI")],
  [
    "llamaindex-workflows",
    comingSoonConverter("llamaindex-workflows", "LlamaIndex Workflows"),
  ],
  ["mastra", comingSoonConverter("mastra", "Mastra")],
  ["super-agi", comingSoonConverter("super-agi", "SuperAGI")],
]);
