/**
 * The ONE reading of `VariableDefinition.binding`'s two kinds.
 *
 * A stored binding with no `kind` is a context-item (scope/system) binding —
 * that shape predates the union. `kind: "merge_field"` binds the variable to the
 * author's own custom data and is resolved only by the server:
 * the scope resolver, the bound-variable chips and the scope write-back never
 * touch it.
 */

import type {
  ContextItemBinding,
  CustomDataBinding,
  VariableBinding,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";

export function isCustomDataBinding(
  binding: VariableBinding | null | undefined,
): binding is CustomDataBinding {
  return binding?.kind === "merge_field";
}

/** The binding when it is a context-item binding; `undefined` otherwise. */
export function contextItemBindingOf(
  binding: VariableBinding | null | undefined,
): ContextItemBinding | undefined {
  if (!binding || binding.kind === "merge_field") return undefined;
  return binding;
}

/**
 * "Fill automatically" switched on with nothing chosen yet: a context-item
 * binding with no item, or a custom-data binding with no table. It is a DRAFT —
 * shown as incomplete on the variable, never blocking a save, and never written
 * to the agent as if it were a real binding (`persistableVariableDefinitions`).
 */
export function isEmptyBinding(
  binding: VariableBinding | null | undefined,
): boolean {
  if (!binding) return false;
  if (binding.kind === "merge_field") return !binding.table_id;
  return !binding.contextItemId;
}

/** The variables as they are saved: an empty binding draft is dropped, the variable kept. */
export function persistableVariableDefinitions(
  definitions: VariableDefinition[] | null,
): VariableDefinition[] | null {
  if (!definitions) return definitions;
  return definitions.map((d) => {
    if (!isEmptyBinding(d.binding)) return d;
    const next = { ...d };
    delete next.binding;
    return next;
  });
}
