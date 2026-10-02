// features/agents/components/custom-agent/custom-agent-plan.ts
//
// "Custom agent…" — the pure half. The right-click menu captured a scope
// (selected text, the whole content, the text around it, every surface
// value). The person maps any of those onto the picked agent's inputs — its
// variables and the message — or leaves an input on "Skip". The whole scope
// still rides as context either way; the mapping only fills inputs.
//
// THE USER-INPUT LAW: machine content reaches `user_input` only because the
// person explicitly mapped it there, and it lands in the composer where they
// can edit it before sending.

import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import type { AgentExecutionRuntime } from "@/features/agents/types/agent-execution-config.types";
import type { ValueMappingMap } from "@/features/surfaces/types";
import { humanizeName } from "@/features/agents/components/send-to-agent/send-to-agent-plan";

/** A value the menu captured that the person can map onto an input. */
export interface CustomAgentValueSource {
  id: string;
  label: string;
  value: string;
}

/** Scope keys that describe the app, not the content — never offered. */
const AMBIENT_KEYS = new Set([
  "active_organization_id",
  "active_scope_ids",
  "surface_name",
  "context",
]);

const KNOWN_LABELS: Record<string, string> = {
  selection: "Selected text",
  content: "Whole content",
  text_before: "Text before",
  text_after: "Text after",
};

const ORDER = ["selection", "content", "text_before", "text_after"];

/**
 * Every non-empty text value in the captured scope, known keys first.
 * `fallbackContent` stands in for `content` when the scope has none (a bar
 * rather than the right-click menu).
 */
export function buildValueSources(
  scope: ApplicationScope | null | undefined,
  fallbackContent?: string | null,
): CustomAgentValueSource[] {
  const entries = new Map<string, string>();
  for (const [key, raw] of Object.entries(scope ?? {})) {
    if (AMBIENT_KEYS.has(key)) continue;
    const value =
      typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : null;
    if (value === null || value.trim() === "") continue;
    entries.set(key, value);
  }
  if (!entries.has("content") && fallbackContent?.trim()) {
    entries.set("content", fallbackContent);
  }
  const keys = [
    ...ORDER.filter((k) => entries.has(k)),
    ...[...entries.keys()].filter((k) => !ORDER.includes(k)).sort(),
  ];
  // A surface often emits one value under two spellings (`conversation_id`
  // and `conversationId`): one row per label, first spelling wins.
  const seen = new Set<string>();
  const sources: CustomAgentValueSource[] = [];
  for (const key of keys) {
    const label = KNOWN_LABELS[key] ?? humanizeName(key).replace(/\bId\b|\bid\b/g, "ID");
    if (seen.has(label)) continue;
    seen.add(label);
    sources.push({ id: key, label, value: entries.get(key) ?? "" });
  }
  return sources;
}

export const USER_INPUT_ROW_ID = "user-input";
export const SKIP = "skip";

export interface CustomAgentInputRow {
  /** `user-input`, or the variable name. */
  id: string;
  label: string;
  /** The agent's own help text for this input. */
  description?: string;
  /** Why this input cannot take a mapped value — shown, never hidden. */
  disabledReason?: string;
}

/** The message, then every variable the agent declares. */
export function buildInputRows(
  variables: readonly VariableDefinition[] | null | undefined,
): CustomAgentInputRow[] {
  const rows: CustomAgentInputRow[] = [
    { id: USER_INPUT_ROW_ID, label: "Message" },
  ];
  for (const v of variables ?? []) {
    if (!v?.name) continue;
    const help = v.helpText?.trim();
    const disabledReason = v.control
      ? "Model setting"
      : v.binding
        ? "Filled automatically"
        : undefined;
    rows.push({
      id: v.name,
      label: humanizeName(v.name),
      ...(help ? { description: help } : {}),
      ...(disabledReason ? { disabledReason } : {}),
    });
  }
  return rows;
}

/**
 * The launch runtime. Each mapped variable becomes one entry of a
 * `ValueMappingMap` — the same language a shortcut and a surface binding
 * speak — and the launch resolves it with the one resolver against the
 * captured scope ("Skip" = `unmapped`, so the input is left alone). Saved on
 * a shortcut, this exact map is that shortcut's mapping.
 *
 * The message is the one input a mapping never reaches (THE USER-INPUT LAW):
 * the person chose it here, so it lands in `userInput`, editable before send.
 */
export function buildMappedRuntime(
  mapping: Readonly<Record<string, string>>,
  sources: readonly CustomAgentValueSource[],
  rows: readonly CustomAgentInputRow[],
  scope: ApplicationScope | null | undefined,
): AgentExecutionRuntime {
  const byId = new Map(sources.map((s) => [s.id, s.value]));
  const enabled = new Set(rows.filter((r) => !r.disabledReason).map((r) => r.id));
  const valueMappings: ValueMappingMap = {};
  let userInput: string | undefined;
  for (const [rowId, sourceId] of Object.entries(mapping)) {
    if (sourceId === SKIP || !enabled.has(rowId) || !byId.has(sourceId)) continue;
    if (rowId === USER_INPUT_ROW_ID) userInput = byId.get(sourceId);
    else valueMappings[rowId] = { mapType: "surface_value", target: sourceId };
  }
  // Every offered value rides the scope under its own key — including a
  // `content` that came from the bar rather than the captured scope — so
  // each mapping target resolves.
  const applicationScope: ApplicationScope = {
    ...(scope ?? {}),
    ...Object.fromEntries(sources.map((s) => [s.id, s.value])),
  };
  return {
    applicationScope,
    ...(userInput !== undefined ? { userInput } : {}),
    ...(Object.keys(valueMappings).length > 0 ? { valueMappings } : {}),
  };
}
