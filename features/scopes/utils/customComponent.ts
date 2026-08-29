// features/scopes/utils/customComponent.ts
//
// Narrow a `context.context_items.custom_component` jsonb column (bare `Json`
// in the generated row) to the Agent-Builder `VariableCustomComponent` shape
// `ContextValueInput` renders with. The column is authored ONLY by the agent
// builder's typed editor, so a present object IS that shape; anything else
// (null, primitives, arrays) renders as the plain primitive input.

import { isJsonObject } from "@/types/json";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";

export function customComponentOf(item: {
  custom_component: unknown;
}): VariableCustomComponent | null {
  if (!isJsonObject(item.custom_component)) return null;
  // Sanctioned two-step cast: the jsonb is written exclusively through the
  // typed VariableCustomComponent editor (see the file header) and
  // ContextValueInput degrades gracefully on unknown `type` values.
  return item.custom_component as unknown as VariableCustomComponent;
}
