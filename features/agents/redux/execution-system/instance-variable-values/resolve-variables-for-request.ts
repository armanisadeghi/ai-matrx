import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

/**
 * Variables to PUT ON THE REQUEST — and to freeze into the first-turn
 * transcript strip. Same three-tier merge the selectors use:
 * user-provided > scope-resolved > definition defaults.
 *
 * A scope-bound variable the user has not explicitly set is omitted so the
 * server can fill it from the active scope. Unbound defaults are included:
 * the server will apply them, so hiding them from the person is a lie.
 */
export function resolveVariablesForRequest(args: {
  definitions: readonly VariableDefinition[] | null | undefined;
  userValues: Record<string, unknown> | null | undefined;
  scopeValues: Record<string, unknown> | null | undefined;
}): Record<string, unknown> {
  const definitions = args.definitions ?? [];
  const userValues = args.userValues ?? {};
  const scopeValues = args.scopeValues ?? {};
  const out: Record<string, unknown> = {};

  for (const def of definitions) {
    const isBound = !!(def.binding?.itemKey || def.binding?.contextItemId);
    if (def.name in userValues) {
      out[def.name] = userValues[def.name];
      continue;
    }
    if (isBound) continue;
    if (def.name in scopeValues) {
      out[def.name] = scopeValues[def.name];
    } else if (def.defaultValue !== undefined && def.defaultValue !== null) {
      out[def.name] = def.defaultValue;
    } else {
      out[def.name] = null;
    }
  }

  for (const [name, value] of Object.entries(userValues)) {
    if (!(name in out)) out[name] = value;
  }

  return out;
}
