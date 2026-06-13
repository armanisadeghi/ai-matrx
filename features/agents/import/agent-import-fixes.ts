/**
 * Patch helpers for the import window — mutate parsed agent JSON and re-stringify.
 */

import { parsePasted } from "./agent-import-parse";
import type { ImportFixAction } from "./agent-import-validation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseImportObject(raw: string): Record<string, unknown> | null {
  const result = parsePasted(raw);
  if (!result.success) return null;
  const data = result.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  return data as Record<string, unknown>;
}

export function stringifyImportObject(obj: Record<string, unknown>): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export function readModelIdFromObject(raw: Record<string, unknown>): unknown {
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

/** Valid UUID model id from pasted JSON, or null. */
export function readValidModelIdFromPaste(raw: string): string | null {
  const obj = parseImportObject(raw);
  if (!obj) return null;
  const id = readModelIdFromObject(obj);
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function prefersSnakeCase(
  obj: Record<string, unknown>,
  snake: string,
): boolean {
  const camel = snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return snake in obj || !(camel in obj);
}

function varDefinitionsKey(obj: Record<string, unknown>): string {
  if (obj.variable_definitions !== undefined) return "variable_definitions";
  if (obj.variableDefinitions !== undefined) return "variableDefinitions";
  return prefersSnakeCase(obj, "variable_definitions")
    ? "variable_definitions"
    : "variableDefinitions";
}

export function patchModelId(
  obj: Record<string, unknown>,
  modelId: string,
): void {
  const snake = prefersSnakeCase(obj, "model_id");
  if (snake) {
    obj.model_id = modelId;
    delete obj.modelId;
  } else {
    obj.modelId = modelId;
    delete obj.model_id;
  }

  if (
    obj.settings &&
    typeof obj.settings === "object" &&
    !Array.isArray(obj.settings)
  ) {
    const s = obj.settings as Record<string, unknown>;
    delete s.model_id;
    delete s.modelId;
  }
}

export function patchName(obj: Record<string, unknown>, name: string): void {
  obj.name = name;
}

export function patchAgentType(
  obj: Record<string, unknown>,
  agentType: "user" | "builtin",
): void {
  if (prefersSnakeCase(obj, "agent_type")) {
    obj.agent_type = agentType;
    delete obj.agentType;
  } else {
    obj.agentType = agentType;
    delete obj.agent_type;
  }
}

export function patchSettingsField(
  obj: Record<string, unknown>,
  field: string,
  value: string,
): void {
  if (
    !obj.settings ||
    typeof obj.settings !== "object" ||
    Array.isArray(obj.settings)
  ) {
    obj.settings = {};
  }
  (obj.settings as Record<string, unknown>)[field] = value;
}

export function patchRenameVarField(
  obj: Record<string, unknown>,
  varIndex: number,
  from: string,
  to: string,
): void {
  const key = varDefinitionsKey(obj);
  const arr = obj[key];
  if (!Array.isArray(arr) || !arr[varIndex]) return;
  const v = arr[varIndex] as Record<string, unknown>;
  if (from in v) {
    v[to] = v[from];
    delete v[from];
  }
}

export function patchTextBlockField(
  obj: Record<string, unknown>,
  messageIndex: number,
  blockIndex: number,
): void {
  const messages = obj.messages;
  if (!Array.isArray(messages) || !messages[messageIndex]) return;
  const msg = messages[messageIndex] as Record<string, unknown>;
  const content = msg.content;
  if (!Array.isArray(content) || !content[blockIndex]) return;
  const block = content[blockIndex] as Record<string, unknown>;
  if (block.content !== undefined) {
    block.text = block.content;
    delete block.content;
  }
}

export function patchStripUnresolvedTools(
  obj: Record<string, unknown>,
  toolIndex: import("./import-types").ToolIndex,
): void {
  const tools = obj.tools;
  if (!Array.isArray(tools)) return;

  obj.tools = tools.filter((t) => {
    if (typeof t === "string" && UUID_RE.test(t)) return true;
    if (typeof t === "string") return toolIndex.has(t.toLowerCase());
    if (t && typeof t === "object" && "name" in t) {
      return toolIndex.has(String((t as { name: unknown }).name).toLowerCase());
    }
    return false;
  });
}

export function applyFixToObject(
  obj: Record<string, unknown>,
  action: ImportFixAction,
  value?: string,
): void {
  switch (action.kind) {
    case "pick-model":
      if (value) patchModelId(obj, value);
      break;
    case "set-name":
      if (value?.trim()) patchName(obj, value.trim());
      break;
    case "set-agent-type":
      if (value === "user" || value === "builtin") patchAgentType(obj, value);
      break;
    case "set-settings-enum":
      if (value) patchSettingsField(obj, action.field, value);
      break;
    case "rename-var-field":
      patchRenameVarField(obj, action.varIndex, action.from, action.to);
      break;
    case "fix-text-block":
      patchTextBlockField(obj, action.messageIndex, action.blockIndex);
      break;
    case "strip-unresolved-tools":
      patchStripUnresolvedTools(obj, action.toolIndex);
      break;
  }
}

export function applyImportFix(
  raw: string,
  action: ImportFixAction,
  value?: string,
): string | null {
  const obj = parseImportObject(raw);
  if (!obj) return null;
  applyFixToObject(obj, action, value);
  return stringifyImportObject(obj);
}

/** Apply every one-click fix action from the issue list (no user value required). */
export function applyAutoFixes(
  raw: string,
  actions: ImportFixAction[],
): string | null {
  const obj = parseImportObject(raw);
  if (!obj) return null;

  const seen = new Set<string>();
  for (const action of actions) {
    if (
      action.kind === "pick-model" ||
      action.kind === "set-name" ||
      action.kind === "set-agent-type" ||
      action.kind === "set-settings-enum"
    ) {
      continue;
    }
    const key = JSON.stringify(action);
    if (seen.has(key)) continue;
    seen.add(key);
    applyFixToObject(obj, action);
  }
  return stringifyImportObject(obj);
}
