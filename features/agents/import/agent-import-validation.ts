/**
 * Structural analysis for pasted agent / prompt JSON.
 * Pure functions — no React. Used for live paste feedback and pre-convert gates.
 */

import { VARIABLE_COMPONENT_TYPES } from "@/features/agents/types/agent-definition.types";
import type { ToolIndex } from "./import-types";
import { parsePasted } from "./agent-import-parse";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_AGENT_TYPES = new Set(["user", "builtin"]);
const VALID_MESSAGE_ROLES = new Set(["system", "user", "assistant"]);
const VALID_CONTENT_BLOCK_TYPES = new Set([
  "text",
  "image",
  "audio",
  "video",
  "youtube",
  "document",
]);

const REASONING_EFFORT = new Set([
  "auto",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

const REASONING_SUMMARY = new Set([
  "concise",
  "detailed",
  "never",
  "auto",
  "always",
]);

const COMPONENT_TYPES_NEEDING_OPTIONS = new Set([
  "radio",
  "pill-toggle",
  "selection-list",
  "buttons",
  "checkbox",
  "select",
]);

/** Top-level keys we recognize (snake_case or camelCase). */
const KNOWN_TOP_LEVEL_KEYS = new Set([
  "name",
  "description",
  "category",
  "tags",
  "agent_type",
  "agentType",
  "is_active",
  "isActive",
  "is_public",
  "isPublic",
  "is_archived",
  "isArchived",
  "is_favorite",
  "isFavorite",
  "model_id",
  "modelId",
  "messages",
  "variable_definitions",
  "variableDefinitions",
  "variable_defaults",
  "variableDefaults",
  "variables",
  "settings",
  "tools",
  "context_slots",
  "contextSlots",
  "model_tiers",
  "modelTiers",
  "output_schema",
  "outputSchema",
  "output_format",
  "custom_tools",
  "customTools",
  "mcp_servers",
  "mcpServers",
  "auto_tools_disabled",
  "autoToolsDisabled",
  "skill_config",
  "skillConfig",
  "default_rag_boost",
  "defaultRagBoost",
  // stripped at import — harmless if present
  "id",
  "user_id",
  "userId",
  "organization_id",
  "organizationId",
  "project_id",
  "projectId",
  "task_id",
  "taskId",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
  "version",
  "version_number",
  "is_version",
  "isVersion",
  "parent_agent_id",
  "parentAgentId",
  "source_agent_id",
  "sourceAgentId",
  "source_snapshot_at",
  "sourceSnapshotAt",
  "changed_at",
  "changedAt",
  "change_note",
  "changeNote",
  "access_level",
  "accessLevel",
  "is_owner",
  "isOwner",
  "shared_by_email",
  "sharedByEmail",
]);

export type ImportIssueSeverity = "error" | "warning" | "info";

export type ImportFixAction =
  | { kind: "pick-model" }
  | { kind: "set-name"; suggested?: string }
  | { kind: "set-agent-type" }
  | {
      kind: "set-settings-enum";
      field: "reasoning_effort" | "reasoning_summary";
      options: string[];
    }
  | {
      kind: "rename-var-field";
      varIndex: number;
      from: string;
      to: string;
    }
  | {
      kind: "fix-text-block";
      messageIndex: number;
      blockIndex: number;
    }
  | { kind: "strip-unresolved-tools"; toolIndex: ToolIndex };

export interface ImportValidationIssue {
  severity: ImportIssueSeverity;
  /** Human-readable explanation */
  message: string;
  /** Dot/bracket path when applicable, e.g. `messages[0].content` */
  path?: string;
  /** Concrete fix the user can apply manually */
  fix?: string;
  /** Inline fix the import UI can offer */
  fixAction?: ImportFixAction;
}

export type ImportAnalysisResult =
  | { status: "empty" }
  | { status: "incomplete" }
  | { status: "malformed"; error: string; parseWarnings: string[] }
  | {
      status: "analyzed";
      issues: ImportValidationIssue[];
      parseWarnings: string[];
      /** True when there are zero error-severity issues */
      canConvert: boolean;
    };

export function sanitizeModelId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLikelyIncompleteJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{")) return false;
  const open = (t.match(/{/g) ?? []).length;
  const close = (t.match(/}/g) ?? []).length;
  return open > close;
}

function pushIssue(
  issues: ImportValidationIssue[],
  issue: ImportValidationIssue,
): void {
  issues.push(issue);
}

function readModelId(raw: Record<string, unknown>): unknown {
  const settings = raw.settings;
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const s = settings as Record<string, unknown>;
    if (s.model_id !== undefined) return s.model_id;
    if (s.modelId !== undefined) return s.modelId;
  }
  if (raw.model_id !== undefined) return raw.model_id;
  if (raw.modelId !== undefined) return raw.modelId;
  return undefined;
}

function readVariableArray(
  raw: Record<string, unknown>,
  sourceId: string,
): unknown {
  if (sourceId === "prompt-json") {
    return (
      raw.variable_defaults ??
      raw.variableDefaults ??
      raw.variables ??
      raw.variableDefinitions ??
      raw.variable_definitions
    );
  }
  return raw.variable_definitions ?? raw.variableDefinitions;
}

function analyzeMessages(
  messages: unknown,
  issues: ImportValidationIssue[],
): void {
  if (messages === undefined) {
    pushIssue(issues, {
      severity: "warning",
      path: "messages",
      message: "No `messages` array — the agent will have no priming context.",
      fix: "Add a `messages` array with at least a system and/or user turn.",
    });
    return;
  }

  if (!Array.isArray(messages)) {
    pushIssue(issues, {
      severity: "error",
      path: "messages",
      message: "`messages` must be an array.",
      fix: 'Use `"messages": [ { "role": "system", "content": [...] } ]`.',
    });
    return;
  }

  if (messages.length === 0) {
    pushIssue(issues, {
      severity: "warning",
      path: "messages",
      message: "`messages` is empty — no priming turns will be imported.",
    });
    return;
  }

  let systemCount = 0;

  messages.forEach((msg, i) => {
    const path = `messages[${i}]`;
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
      pushIssue(issues, {
        severity: "error",
        path,
        message: "Each message must be an object with `role` and `content`.",
      });
      return;
    }

    const m = msg as Record<string, unknown>;
    const role = m.role;
    if (typeof role !== "string") {
      pushIssue(issues, {
        severity: "error",
        path: `${path}.role`,
        message: "Message is missing a string `role`.",
        fix: 'Use `"system"`, `"user"`, or `"assistant"`.',
      });
    } else if (!VALID_MESSAGE_ROLES.has(role)) {
      pushIssue(issues, {
        severity: "error",
        path: `${path}.role`,
        message: `Invalid role \`${role}\`.`,
        fix: 'Priming messages only support `"system"`, `"user"`, and `"assistant"`.',
      });
    } else if (role === "system") {
      systemCount += 1;
    }

    const content = m.content;
    const contentPath = `${path}.content`;

    if (content === undefined || content === null) {
      pushIssue(issues, {
        severity: "error",
        path: contentPath,
        message: "Message is missing `content`.",
        fix: 'Use `"content": [{ "type": "text", "text": "..." }]` or a plain string.',
      });
      return;
    }

    if (typeof content === "string") {
      pushIssue(issues, {
        severity: "info",
        path: contentPath,
        message:
          "String `content` is accepted — it will be converted to a text block on import.",
      });
      return;
    }

    if (!Array.isArray(content)) {
      pushIssue(issues, {
        severity: "error",
        path: contentPath,
        message: "`content` must be a string or an array of content blocks.",
      });
      return;
    }

    if (content.length === 0) {
      pushIssue(issues, {
        severity: "warning",
        path: contentPath,
        message: "`content` array is empty.",
      });
    }

    content.forEach((block, bi) => {
      const blockPath = `${contentPath}[${bi}]`;
      if (!block || typeof block !== "object" || Array.isArray(block)) {
        pushIssue(issues, {
          severity: "error",
          path: blockPath,
          message: "Content block must be an object.",
        });
        return;
      }
      const b = block as Record<string, unknown>;
      const type = b.type;
      if (typeof type !== "string") {
        pushIssue(issues, {
          severity: "error",
          path: `${blockPath}.type`,
          message: "Content block is missing `type`.",
          fix: 'For text, use `{ "type": "text", "text": "..." }`.',
        });
        return;
      }
      if (!VALID_CONTENT_BLOCK_TYPES.has(type)) {
        pushIssue(issues, {
          severity: "error",
          path: `${blockPath}.type`,
          message: `Unsupported content block type \`${type}\` in priming messages.`,
        });
        return;
      }
      if (type === "text") {
        if (typeof b.text === "string") return;
        if (b.content !== undefined) {
          pushIssue(issues, {
            severity: "error",
            path: blockPath,
            message: "Text block uses `content` — Matrx expects `text`.",
            fix: 'Rename `"content"` to `"text"`.',
            fixAction: {
              kind: "fix-text-block",
              messageIndex: i,
              blockIndex: bi,
            },
          });
          return;
        }
        pushIssue(issues, {
          severity: "error",
          path: `${blockPath}.text`,
          message: "Text block is missing a string `text` field.",
        });
      }
    });
  });

  if (systemCount > 1) {
    pushIssue(issues, {
      severity: "warning",
      path: "messages",
      message: `Found ${systemCount} system messages — only one is recommended.`,
    });
  }
}

function analyzeVariables(
  variables: unknown,
  issues: ImportValidationIssue[],
): void {
  if (variables === undefined || variables === null) return;

  if (!Array.isArray(variables)) {
    pushIssue(issues, {
      severity: "error",
      path: "variable_definitions",
      message: "Variable definitions must be an array.",
    });
    return;
  }

  const seenNames = new Set<string>();

  variables.forEach((v, i) => {
    const path = `variable_definitions[${i}]`;
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      pushIssue(issues, {
        severity: "error",
        path,
        message: "Each variable definition must be an object.",
      });
      return;
    }

    const def = v as Record<string, unknown>;
    const name = def.name ?? def.variable_name;
    if (typeof name !== "string" || !name.trim()) {
      pushIssue(issues, {
        severity: "error",
        path: `${path}.name`,
        message: "Variable is missing a non-empty `name`.",
      });
    } else if (seenNames.has(name)) {
      pushIssue(issues, {
        severity: "warning",
        path: `${path}.name`,
        message: `Duplicate variable name \`${name}\`.`,
      });
    } else {
      seenNames.add(name);
    }

    if (def.help_text !== undefined && def.helpText === undefined) {
      pushIssue(issues, {
        severity: "warning",
        path: `${path}.help_text`,
        message:
          "Use `helpText` (camelCase) — `help_text` is not read by the builder UI.",
        fix: 'Rename `"help_text"` to `"helpText"`.',
        fixAction: {
          kind: "rename-var-field",
          varIndex: i,
          from: "help_text",
          to: "helpText",
        },
      });
    }

    if (def.default_value !== undefined && def.defaultValue === undefined) {
      pushIssue(issues, {
        severity: "warning",
        path: `${path}.default_value`,
        message:
          "Use `defaultValue` (camelCase) — `default_value` is not read by the builder UI.",
        fix: 'Rename `"default_value"` to `"defaultValue"`.',
        fixAction: {
          kind: "rename-var-field",
          varIndex: i,
          from: "default_value",
          to: "defaultValue",
        },
      });
    }

    const cc = def.customComponent ?? def.custom_component;
    if (cc === undefined || cc === null) return;

    if (typeof cc !== "object" || Array.isArray(cc)) {
      pushIssue(issues, {
        severity: "error",
        path: `${path}.customComponent`,
        message: "`customComponent` must be an object.",
      });
      return;
    }

    const comp = cc as Record<string, unknown>;
    const compType = comp.type;
    if (typeof compType !== "string") {
      pushIssue(issues, {
        severity: "error",
        path: `${path}.customComponent.type`,
        message: "`customComponent.type` must be a string.",
      });
      return;
    }

    if (
      !VARIABLE_COMPONENT_TYPES.includes(
        compType as (typeof VARIABLE_COMPONENT_TYPES)[number],
      )
    ) {
      pushIssue(issues, {
        severity: "error",
        path: `${path}.customComponent.type`,
        message: `Unknown variable component type \`${compType}\`.`,
        fix: `Valid types include: ${VARIABLE_COMPONENT_TYPES.slice(0, 8).join(", ")}, …`,
      });
      return;
    }

    if (COMPONENT_TYPES_NEEDING_OPTIONS.has(compType)) {
      const options = comp.options;
      if (!Array.isArray(options) || options.length === 0) {
        pushIssue(issues, {
          severity: "warning",
          path: `${path}.customComponent.options`,
          message: `\`${compType}\` variables should include a non-empty \`options\` array.`,
        });
      }
    }
  });
}

function analyzeSettings(
  settings: unknown,
  issues: ImportValidationIssue[],
): void {
  if (settings === undefined || settings === null) return;

  if (typeof settings !== "object" || Array.isArray(settings)) {
    pushIssue(issues, {
      severity: "error",
      path: "settings",
      message: "`settings` must be an object.",
    });
    return;
  }

  const s = settings as Record<string, unknown>;

  if (s.model_id !== undefined || s.modelId !== undefined) {
    pushIssue(issues, {
      severity: "info",
      path: "settings.model_id",
      message: "Model belongs in top-level `model_id`, not inside `settings`.",
      fix: 'Move the model UUID to `"model_id"` at the root of the object.',
    });
  }

  const effort = s.reasoning_effort ?? s.reasoningEffort;
  if (
    effort !== undefined &&
    effort !== null &&
    typeof effort === "string" &&
    !REASONING_EFFORT.has(effort)
  ) {
    pushIssue(issues, {
      severity: "error",
      path: "settings.reasoning_effort",
      message: `Invalid reasoning_effort \`${effort}\`.`,
      fix: `Use one of: ${[...REASONING_EFFORT].join(", ")}.`,
      fixAction: {
        kind: "set-settings-enum",
        field: "reasoning_effort",
        options: [...REASONING_EFFORT],
      },
    });
  }

  const summary = s.reasoning_summary ?? s.reasoningSummary;
  if (
    summary !== undefined &&
    summary !== null &&
    typeof summary === "string" &&
    !REASONING_SUMMARY.has(summary)
  ) {
    pushIssue(issues, {
      severity: "error",
      path: "settings.reasoning_summary",
      message: `Invalid reasoning_summary \`${summary}\`.`,
      fix: `Use one of: ${[...REASONING_SUMMARY].join(", ")}.`,
      fixAction: {
        kind: "set-settings-enum",
        field: "reasoning_summary",
        options: [...REASONING_SUMMARY],
      },
    });
  }
}

function analyzeTools(
  tools: unknown,
  toolIndex: ToolIndex,
  issues: ImportValidationIssue[],
): void {
  if (tools === undefined || tools === null) return;

  if (!Array.isArray(tools)) {
    pushIssue(issues, {
      severity: "error",
      path: "tools",
      message: "`tools` must be an array of tool UUIDs or tool names.",
    });
    return;
  }

  let unresolvedToolCount = 0;

  tools.forEach((t, i) => {
    const path = `tools[${i}]`;
    if (typeof t === "string") {
      if (UUID_RE.test(t)) return;
      const resolved = toolIndex.get(t.toLowerCase());
      if (!resolved) {
        unresolvedToolCount += 1;
        pushIssue(issues, {
          severity: "warning",
          path,
          message: `Tool \`${t}\` was not found in the registry.`,
          fix: "Use a valid tool UUID, a registered tool name, or remove it and add tools in the builder.",
        });
      }
      return;
    }
    if (t && typeof t === "object" && "name" in t) {
      const name = String((t as { name: unknown }).name);
      if (!toolIndex.get(name.toLowerCase())) {
        unresolvedToolCount += 1;
        pushIssue(issues, {
          severity: "warning",
          path,
          message: `Tool \`${name}\` was not found in the registry.`,
        });
      }
      return;
    }
    unresolvedToolCount += 1;
    pushIssue(issues, {
      severity: "warning",
      path,
      message: `Unrecognized tool entry — expected UUID string or { "name": "..." }.`,
    });
  });

  if (unresolvedToolCount > 0) {
    pushIssue(issues, {
      severity: "warning",
      path: "tools",
      message: `${unresolvedToolCount} unresolved tool(s) will be dropped on import unless you remove them now.`,
      fixAction: { kind: "strip-unresolved-tools", toolIndex },
    });
  }
}

function analyzeTopLevelShape(
  raw: Record<string, unknown>,
  sourceId: string,
  toolIndex: ToolIndex,
  issues: ImportValidationIssue[],
): void {
  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      pushIssue(issues, {
        severity: "info",
        path: key,
        message: `Unknown top-level field \`${key}\` — it will be ignored on import.`,
      });
    }
  }

  const name = raw.name;
  if (name === undefined) {
    pushIssue(issues, {
      severity: "warning",
      path: "name",
      message: 'Missing `name` — default "Imported Agent" will be used.',
      fixAction: { kind: "set-name", suggested: "Imported Agent" },
    });
  } else if (typeof name !== "string") {
    pushIssue(issues, {
      severity: "error",
      path: "name",
      message: "`name` must be a string.",
    });
  } else if (!name.trim()) {
    pushIssue(issues, {
      severity: "error",
      path: "name",
      message: "`name` cannot be empty.",
      fixAction: { kind: "set-name", suggested: "Imported Agent" },
    });
  }

  const agentType = raw.agent_type ?? raw.agentType;
  if (
    agentType !== undefined &&
    (typeof agentType !== "string" || !VALID_AGENT_TYPES.has(agentType))
  ) {
    pushIssue(issues, {
      severity: "error",
      path: "agent_type",
      message: `Invalid agent_type \`${String(agentType)}\`.`,
      fix: 'Use `"user"` or `"builtin"`.',
      fixAction: { kind: "set-agent-type" },
    });
  }

  const modelRaw = readModelId(raw);

  if (modelRaw !== undefined) {
    if (typeof modelRaw === "string" && modelRaw.trim() === "") {
      pushIssue(issues, {
        severity: "error",
        path: "model_id",
        message:
          "`model_id` is an empty string — import will fail against the database.",
        fixAction: { kind: "pick-model" },
      });
    } else if (typeof modelRaw === "string" && !UUID_RE.test(modelRaw.trim())) {
      pushIssue(issues, {
        severity: "error",
        path: "model_id",
        message: `\`model_id\` \`${modelRaw}\` is not a valid UUID.`,
        fixAction: { kind: "pick-model" },
      });
    }
  } else {
    pushIssue(issues, {
      severity: "warning",
      path: "model_id",
      message:
        "No `model_id` — pick a model below (optional, but required to run).",
      fixAction: { kind: "pick-model" },
    });
  }

  if (raw.tags !== undefined && !Array.isArray(raw.tags)) {
    pushIssue(issues, {
      severity: "error",
      path: "tags",
      message: "`tags` must be an array of strings.",
    });
  }

  if (sourceId === "prompt-json") {
    const hasPromptVarKeys =
      raw.variable_defaults !== undefined ||
      raw.variableDefaults !== undefined ||
      raw.variables !== undefined ||
      raw.variableDefinitions !== undefined;
    const onlySnakeVarDefs =
      raw.variable_definitions !== undefined && !hasPromptVarKeys;
    if (onlySnakeVarDefs) {
      pushIssue(issues, {
        severity: "warning",
        path: "variable_definitions",
        message:
          "Prompt JSON reads `variable_defaults`, `variableDefaults`, or `variables` — not `variable_definitions` alone.",
        fix: 'Rename to `"variable_definitions"` when using Agent JSON, or switch import source to Agent JSON.',
      });
    }
  }

  analyzeMessages(raw.messages, issues);
  analyzeVariables(readVariableArray(raw, sourceId), issues);
  analyzeSettings(raw.settings, issues);
  analyzeTools(raw.tools, toolIndex, issues);

  const arrayFields: Array<[string, unknown]> = [
    ["context_slots", raw.context_slots ?? raw.contextSlots],
    ["custom_tools", raw.custom_tools ?? raw.customTools],
    ["mcp_servers", raw.mcp_servers ?? raw.mcpServers],
  ];
  for (const [field, value] of arrayFields) {
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      pushIssue(issues, {
        severity: "error",
        path: field,
        message: `\`${field}\` must be an array.`,
      });
    }
  }
}

/**
 * Analyze pasted import JSON for a given source. Returns instantly —
 * malformed/unparseable input yields a single error; parseable objects get
 * a structured issue list.
 */
export function analyzeImportPaste(
  sourceId: string,
  raw: string,
  toolIndex: ToolIndex,
): ImportAnalysisResult {
  if (!raw.trim()) {
    return { status: "empty" };
  }

  if (isLikelyIncompleteJson(raw)) {
    const parseResult = parsePasted(raw);
    if (parseResult.success === false) {
      return { status: "incomplete" };
    }
  }

  const parseResult = parsePasted(raw);
  if (parseResult.success === false) {
    return {
      status: "malformed",
      error: parseResult.error,
      parseWarnings: parseResult.warnings,
    };
  }

  const { data, warnings: parseWarnings } = parseResult;

  if (Array.isArray(data)) {
    return {
      status: "analyzed",
      parseWarnings,
      issues: [
        {
          severity: "error",
          message:
            "Expected a single JSON object, not an array. Wrap your agent in `{ ... }`.",
        },
      ],
      canConvert: false,
    };
  }

  if (typeof data !== "object" || data === null) {
    return {
      status: "analyzed",
      parseWarnings,
      issues: [
        {
          severity: "error",
          message: "Expected a JSON object at the top level.",
        },
      ],
      canConvert: false,
    };
  }

  const issues: ImportValidationIssue[] = [];
  analyzeTopLevelShape(
    data as Record<string, unknown>,
    sourceId,
    toolIndex,
    issues,
  );

  for (const w of parseWarnings) {
    pushIssue(issues, { severity: "info", message: w });
  }

  const canConvert = !issues.some((i) => i.severity === "error");

  return {
    status: "analyzed",
    issues,
    parseWarnings,
    canConvert,
  };
}

/** Issues handled by the Quick fixes panel — omit from the error/warning lists. */
export function isQuickFixableIssue(issue: ImportValidationIssue): boolean {
  return issue.fixAction != null;
}

export function issuesForDisplay(
  issues: ImportValidationIssue[],
): ImportValidationIssue[] {
  return issues.filter((i) => !isQuickFixableIssue(i));
}

/** Blocking errors with no inline fix — shown in the red list. */
export function blockingErrorsWithoutFix(
  issues: ImportValidationIssue[],
): ImportValidationIssue[] {
  return issues.filter(
    (i) => i.severity === "error" && !isQuickFixableIssue(i),
  );
}

/** True when convert is blocked but every error has a quick fix. */
export function blockedOnlyByQuickFixes(
  issues: ImportValidationIssue[],
  canConvert: boolean,
): boolean {
  if (canConvert) return false;
  const errors = issues.filter((i) => i.severity === "error");
  return errors.length > 0 && errors.every(isQuickFixableIssue);
}

/** Flatten analyzed issues into legacy warning strings for convert preview. */
export function issuesToWarningStrings(
  issues: ImportValidationIssue[],
): string[] {
  return issues
    .filter((i) => i.severity !== "error")
    .map((i) => {
      const prefix = i.path ? `${i.path}: ` : "";
      const fix = i.fix ? ` ${i.fix}` : "";
      return `${prefix}${i.message}${fix}`;
    });
}

/** Primary error message when convert is blocked by validation errors. */
export function formatBlockingErrors(issues: ImportValidationIssue[]): string {
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length === 0) {
    return "Fix the errors below before converting.";
  }
  if (errors.length === 1) {
    const e = errors[0];
    return e.path ? `${e.path}: ${e.message}` : e.message;
  }
  return `${errors.length} issues must be fixed before import. See the list below.`;
}
