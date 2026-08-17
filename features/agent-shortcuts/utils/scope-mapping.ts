/**
 * Scope Mapping — agent-shortcut variant.
 *
 * Ported from `features/prompt-builtins/utils/execution.ts::mapScopeToVariables`
 * for the prompts → agents migration (Phase 1, Task 1.8).
 *
 * Responsibility: take the scope data provided by the current UI context
 * (selection, page content, arbitrary custom scopes), plus the shortcut's
 * `scope_mappings` JSON field, plus the target agent's variable definitions,
 * and produce a flat `{ variableName → value }` map ready to be merged into
 * an execution instance.
 *
 * Contract:
 *   - Defaults are seeded first from `agentVariableDefs[].defaultValue`.
 *   - Each `[scopeKey → variableName]` entry in `scopeMappings` then overrides
 *     the default **only when** the source value is neither `null` nor
 *     `undefined` — a missing source never stringifies to the word
 *     "undefined" or overwrites a default with nothing.
 *   - When `scopeMappings` targets a variable name that the agent does not
 *     declare, the mapping is skipped and a warning is emitted via the
 *     supplied logger. We never throw — mappings drift as agents evolve and
 *     every context-menu click must still execute gracefully.
 *   - The `custom` key on `scopeData` is merged **on top** of the top-level
 *     scope keys (named scopes lose to custom). This allows a caller to inject
 *     per-invocation overrides without rebuilding the whole scope object.
 *
 * Hot-path notes: this runs for every context-menu execution. Keep it
 * allocation-light and synchronous. Avoid throwing.
 */

import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

/**
 * Keys of the shortcut's `scope_mappings` JSON column.
 * See `AgentShortcut.scopeMappings` in `features/agents/redux/agent-shortcuts/types.ts`.
 *
 * Keys are *source* scope names provided by the UI.
 * Values are *target* names on the agent — either a variable name (mapped
 * into the returned record) or a context policy / ad-hoc context key (ignored
 * here; handled by `mapScopeToInstance`).
 */
export type ScopeMappings = Record<string, string> | null | undefined;

/**
 * Runtime data the UI supplies. `selection` and `content` are the well-known
 * structural keys shared across every context. `custom` is a bag of
 * per-invocation overrides that win over the top-level keys when both are
 * present. Any other top-level key is treated as a custom scope.
 */
export interface ScopeData {
  selection?: string | null;
  content?: unknown;
  custom?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type AgentVariableDefs =
  | ReadonlyArray<VariableDefinition>
  | null
  | undefined;

export interface ScopeMappingLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

const noopLogger: ScopeMappingLogger = {
  warn: () => {},
};

/**
 * Reads a scope value, merging `scopeData.custom` on top of the named scopes.
 * A present-but-`null`/`undefined` custom value still wins (explicit erasure
 * is rare but a conscious caller choice).
 */
function readScopeValue(scopeData: ScopeData, key: string): unknown {
  const custom = scopeData.custom;
  if (custom && Object.prototype.hasOwnProperty.call(custom, key)) {
    return custom[key];
  }
  return scopeData[key];
}

/**
 * Maps shortcut `scope_mappings` against a UI-provided `ScopeData` bag and
 * returns the resolved variable values for the target agent.
 *
 * See file header for the full contract.
 */
export function mapScopeToAgentVariables(
  scopeData: ScopeData,
  scopeMappings: ScopeMappings,
  agentVariableDefs: AgentVariableDefs,
  logger: ScopeMappingLogger = noopLogger,
): Record<string, unknown> {
  const variables: Record<string, unknown> = {};
  const defs = agentVariableDefs ?? [];
  const variableNames = new Set<string>();

  // Seed defaults from agent variable definitions. Only set when the default
  // is explicitly provided (not `undefined`) so that a missing default never
  // pollutes the result.
  for (const def of defs) {
    if (!def || typeof def.name !== "string" || def.name === "") continue;
    variableNames.add(def.name);
    if (def.defaultValue !== undefined) {
      variables[def.name] = def.defaultValue;
    }
  }

  if (!scopeMappings) {
    return variables;
  }

  for (const [scopeKey, targetName] of Object.entries(scopeMappings)) {
    if (!targetName) continue;

    // Mapping targets something the agent doesn't declare. Degrade gracefully:
    // skip the assignment and emit a single warning so callers/tests can catch
    // drift, without blowing up the context-menu execution path.
    if (!variableNames.has(targetName)) {
      logger.warn(
        `[mapScopeToAgentVariables] scope "${scopeKey}" maps to unknown agent variable "${targetName}" — skipping`,
        { scopeKey, targetName },
      );
      continue;
    }

    const value = readScopeValue(scopeData, scopeKey);
    // Preserve legacy semantics: null/undefined sources never overwrite —
    // they fall through to the seeded default (or leave the key absent).
    if (value === null || value === undefined) continue;

    variables[targetName] = value;
  }

  return variables;
}
