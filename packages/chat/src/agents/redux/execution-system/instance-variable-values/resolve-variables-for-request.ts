import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import {
  contextItemBindingOf,
  isCustomDataBinding,
} from "@/features/agents/utils/variable-binding";

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
    // Bound to the author's custom data (`override_policy: "shown_locked"`): the
    // server resolves it every turn and nothing the client holds may overwrite it.
    if (isCustomDataBinding(def.binding)) continue;
    const scope = contextItemBindingOf(def.binding);
    const isBound = !!(scope?.itemKey || scope?.contextItemId);
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

  // A name bound to custom data is never sent, even when a value sits in
  // userValues: reopening a conversation stamps `chat.conversation.variables`
  // back, and the server seeds that row with the saved default ("") before the
  // binding resolves (A01, 2026-10-01).
  const customDataBound = new Set(
    definitions.filter((d) => isCustomDataBinding(d.binding)).map((d) => d.name),
  );
  for (const [name, value] of Object.entries(userValues)) {
    if (!(name in out) && !customDataBound.has(name)) out[name] = value;
  }

  return out;
}
