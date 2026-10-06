/**
 * INVOKED ACTIONS — capabilities code runs BY ID through the app's ONE action
 * registry (`@ai-matrx/alchemy`'s, created in `components/agent-copy/AlchemyHost`).
 *
 * A kind component's `runAction(key, input)` and an accepted assist chip are
 * not menu rows: nobody right-clicks them, code names them. They are still
 * Actions (Applets CONTRACTS §6: one registry, one runner), so they live on the
 * same registry as every menu action, contributed by a provider:
 *
 *  - `invocableAction` (alchemy) marks each one programmatic-only
 *    (`surfaces: ["invoke"]`): no menu, bar or palette ever resolves it.
 *  - The runners (`useKindActionRunner`, `useAssistRunner`) run it with
 *    alchemy's `invokeAction(registry, id, input, { ports, context })` — the
 *    one programmatic runner: never throws, an unknown id is `not_registered`,
 *    a handler throw is `action_failed` (captured + announced once there).
 *    The handler's own envelope comes back as the result's `data`.
 *
 * Pure (no React): the runners bind the registry, ports and context.
 */

import {
  invocableAction,
  staticActionProvider,
  type Action,
  type ActionCategory,
  type ActionProvider,
  type ActionRegistry,
} from "@ai-matrx/alchemy/actions";

/** One capability run by id. `I`/`C`/`R`: its input, context, envelope. */
export interface InvokedActionDefinition<I, C, R> {
  /** Registry id — globally unique; namespace it (`kind.trigger_agent`). */
  id: string;
  /** Short name; alchemy's runner names it when the handler throws. */
  label: string;
  description: string;
  category?: ActionCategory;
  handler: (input: I, context: C) => Promise<R>;
}

/** Wrap a definition as a programmatic-only alchemy Action; its envelope is the result's `data`. */
export function invokedAction<I, C, R>(
  def: InvokedActionDefinition<I, C, R>,
): Action {
  return invocableAction({
    id: def.id,
    label: def.label,
    description: def.description,
    category: def.category ?? "app",
    invoke: async (input, ctx) => ({
      ok: true,
      data: await def.handler(input as I, ctx.context as C),
    }),
  });
}

/** A T0 provider over invoked actions; ids are declared, so duplicates fail at registration. */
export function invokedActionProvider(
  providerId: string,
  defs: readonly InvokedActionDefinition<never, never, unknown>[],
): ActionProvider {
  return staticActionProvider(providerId, defs.map((d) => invokedAction(d)));
}

const REGISTERED = new WeakMap<object, Set<string>>();

/** Register a provider on a registry once (render-safe callers: layout effect or event time). */
export function ensureInvokedProvider(
  registry: Pick<ActionRegistry, "register" | "providers">,
  provider: ActionProvider,
): void {
  let seen = REGISTERED.get(registry);
  if (!seen) {
    seen = new Set();
    REGISTERED.set(registry, seen);
  }
  if (seen.has(provider.id)) return;
  seen.add(provider.id);
  if (registry.providers().includes(provider.id)) return;
  registry.register(provider);
}
