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
