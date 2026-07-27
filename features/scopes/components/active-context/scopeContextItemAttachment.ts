import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import type { ContextItemRow, OrgNode } from "@/features/scopes/types";
import { itemRef } from "./context-tree/model";

export const SCOPE_CONTEXT_ITEM_KEY_PREFIX = "attached_scope_item_";

interface ScopeContextItemSource {
  kind: "ctx_item";
  id: string;
  scope_id: string;
  scope_type_id: string;
  item_key: string;
  extra: {
    scope_name: string;
    item_label: string;
  };
}

interface ScopeContextItemValue {
  content: null;
  type: "text";
  label: string;
  description: string;
  mutable: false;
  persist: "never";
  source: ScopeContextItemSource;
}

export interface ScopeContextItemAttachment {
  key: string;
  label: string;
  value: ScopeContextItemValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scopeContextItemAttachmentKey(
  scopeId: string,
  itemId: string,
): string {
  return `${SCOPE_CONTEXT_ITEM_KEY_PREFIX}${scopeId}_${itemId}`;
}

export function attachedScopeContextItemRef(
  entry: InstanceContextEntry,
): string | null {
  if (!entry.key.startsWith(SCOPE_CONTEXT_ITEM_KEY_PREFIX)) return null;
  if (!isRecord(entry.value) || !isRecord(entry.value.source)) return null;
  const source = entry.value.source;
  if (
    source.kind !== "ctx_item" ||
    typeof source.scope_id !== "string" ||
    typeof source.id !== "string"
  ) {
    return null;
  }
  return itemRef(source.scope_id, source.id);
}

export function attachedScopeContextItemRefs(
  entries: InstanceContextEntry[],
): string[] {
  return entries
    .map(attachedScopeContextItemRef)
    .filter((ref): ref is string => ref !== null);
}

export function buildScopeContextItemAttachment(
  ref: string,
  organizations: OrgNode[],
  itemsByType: Record<string, ContextItemRow[]>,
): ScopeContextItemAttachment | null {
  const [scopeId, itemId] = ref.split("::");
  if (!scopeId || !itemId) return null;

  for (const organization of organizations) {
    for (const scopeType of organization.scope_types) {
      const scope = scopeType.scopes.find(
        (candidate) => candidate.id === scopeId,
      );
      if (!scope) continue;
      const item = (itemsByType[scopeType.id] ?? []).find(
        (candidate) => candidate.id === itemId,
      );
      if (!item) return null;
      const label = `${scope.name} — ${item.display_name}`;
      return {
        key: scopeContextItemAttachmentKey(scope.id, item.id),
        label,
        value: {
          content: null,
          type: "text",
          label,
          description: `Explicitly attached ${scopeType.label_singular} context field.`,
          mutable: false,
          persist: "never",
          source: {
            kind: "ctx_item",
            id: item.id,
            scope_id: scope.id,
            scope_type_id: scopeType.id,
            item_key: item.key,
            extra: {
              scope_name: scope.name,
              item_label: item.display_name,
            },
          },
        },
      };
    }
  }
  return null;
}
