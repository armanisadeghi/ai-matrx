/**
 * Canonical mapping from a scope `ContextItem` to the two agent-side shapes that
 * can bind to it: `VariableDefinition.binding` and `ContextPolicy.source` (kind
 * "ctx_item"). Used by the context-policy editor's "bind to a context item" flow
 * and by the scope batch-import tool — kept in one place so both never drift.
 */

import { sanitizeVariableName } from "@/features/agents/utils/variable-utils";
import {
  applyAgentEditAccess,
  type AgentEditAccess,
} from "@/features/agents/utils/agent-edit-access";
import type { ContextItem } from "@/features/scope-system/redux/contextItemsSlice";
import type {
  ContextObjectType,
  ContextPolicy,
  ContextPolicyPersist,
} from "@/features/agents/types/agent-api-types";
import type {
  VariableDefinition,
  ContextItemBinding,
} from "@/features/agents/types/agent-definition.types";

/** Loose mapping used to suggest a policy `type` when binding to a context item. */
export function contextItemValueTypeToPolicyType(
  valueType: ContextItem["value_type"],
): ContextObjectType {
  switch (valueType) {
    case "object":
    case "array":
      return "json";
    case "document":
      return "file_url";
    case "reference":
      return "db_ref";
    default:
      return "text";
  }
}

/** Suggests a `{{variable}}`/context-policy key from a context item's key or display name. */
export function suggestKeyFromContextItem(
  item: Pick<ContextItem, "key" | "display_name">,
): string {
  return sanitizeVariableName(item.key || item.display_name);
}

/**
 * Given a proposed key/name and the set already taken, appends `_2`, `_3`, … until unique.
 * Use when batch-creating several policies/variables in one pass where sanitized keys can collide.
 */
export function uniquifyKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** Builds a `ContextPolicy` bound to `item` via `source.kind = "ctx_item"`. */
export function buildContextPolicyFromItem(
  item: ContextItem,
  opts?: {
    key?: string;
    onMissing?: string;
    /** Whether the agent may change the value, or only read it. Defaults read-only. */
    access?: AgentEditAccess;
    /** Where an editable policy's edits go. Defaults conversation-only. */
    saveMode?: ContextPolicyPersist;
  },
): ContextPolicy {
  const policy: ContextPolicy = {
    key: opts?.key ?? suggestKeyFromContextItem(item),
    type: contextItemValueTypeToPolicyType(item.value_type),
    label: item.display_name,
    description: item.description || undefined,
    source: {
      kind: "ctx_item",
      id: item.id,
      scope_type_id: item.scope_type_id,
      item_key: item.key,
      on_missing: opts?.onMissing ?? "empty",
    },
  };
  return applyAgentEditAccess(policy, {
    access: opts?.access ?? "read_only",
    saveMode: opts?.saveMode ?? "never",
  });
}

/** Builds a `VariableDefinition` bound to `item` via `binding`. */
export function buildVariableFromItem(
  item: ContextItem,
  opts?: { name?: string; onMissing?: ContextItemBinding["onMissing"] },
): VariableDefinition {
  return {
    name: opts?.name ?? suggestKeyFromContextItem(item),
    defaultValue: "",
    helpText: item.description || undefined,
    binding: {
      contextItemId: item.id,
      scopeTypeId: item.scope_type_id,
      itemKey: item.key,
      onMissing: opts?.onMissing ?? "empty",
    },
  };
}
