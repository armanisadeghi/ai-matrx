/**
 * INVOKED ACTIONS — capabilities code runs BY ID through the app's ONE action
 * registry (`@ai-matrx/alchemy`'s, created in `components/agent-copy/AlchemyHost`).
 *
 * A kind component's `runAction(key, input)` and an accepted assist chip are
 * not menu rows: nobody right-clicks them, code names them. They are still
 * Actions (Applets CONTRACTS §6: one registry, one runner), so they live on the
 * same registry as every menu action, contributed by a provider:
 *
 *  - Eligibility: ABSENT at every click target (they never appear in a menu,
 *    bar or palette) EXCEPT the invocation target this module builds for
 *    exactly that id. "Absent unless invoked" is the whole rule.
 *  - Running: `invokeRegisteredAction` resolves the registry at the invocation
 *    target, finds the Action by id and runs it through alchemy's ONE run path
 *    (`runAction`: failure capture + notify live there once). The handler's
 *    input and its capability-scoped context ride the target's opaque `host`
 *    slot; the handler's envelope comes back through the same slot.
 *
 * Pure (no React): the runners (`useKindActionRunner`, `useAssistRunner`) bind
 * the registry, ports and context. `invokeRegisteredAction` never throws.
 */

import {
  createClickTarget,
  runAction,
  staticActionProvider,
  type Action,
  type ActionCategory,
  type ActionProvider,
  type ActionRegistry,
  type ClickTarget,
  type RunActionOptions,
} from "@ai-matrx/alchemy/actions";

const INVOCATION = Symbol.for("ai-matrx.invoked-action");

interface Invocation {
  readonly [INVOCATION]: true;
  readonly actionId: string;
  readonly input: unknown;
  readonly context: unknown;
  settled?: { value: unknown };
}

function invocationOf(target: ClickTarget): Invocation | null {
  const host = target.host as Partial<Invocation> | null | undefined;
  return host && typeof host === "object" && host[INVOCATION] === true
    ? (host as Invocation)
    : null;
}

/** One capability run by id. `I`/`C`/`R`: its input, context, envelope. */
export interface InvokedActionDefinition<I, C, R> {
  /** Registry id — globally unique; namespace it (`kind.trigger_agent`). */
  id: string;
  /** Short name; alchemy's run path names it when the handler throws. */
  label: string;
  description: string;
  category?: ActionCategory;
  handler: (input: I, context: C) => Promise<R>;
}

/** Wrap a definition as an alchemy Action that is absent unless invoked by id. */
export function invokedAction<I, C, R>(
  def: InvokedActionDefinition<I, C, R>,
): Action {
  return {
    id: def.id,
    label: def.label,
    description: def.description,
    category: def.category ?? "app",
    eligible: (target) =>
      invocationOf(target)?.actionId === def.id
        ? { status: "available" }
        : { status: "absent" },
    async run(target) {
      const invocation = invocationOf(target);
      if (!invocation || invocation.actionId !== def.id) {
        throw new Error(`"${def.id}" runs only when invoked by id.`);
      }
      invocation.settled = {
        value: await def.handler(invocation.input as I, invocation.context as C),
      };
    },
  };
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

export type InvokeOutcome<R> =
  | { status: "ran"; value: R }
  | { status: "not-registered" }
  | { status: "failed"; error: unknown };

/**
 * Run a registered Action by id with an input and a capability context.
 * Never throws: an id nobody registered is `not-registered`; a handler throw is
 * `failed` (already captured + notified by alchemy's run path).
 */
export async function invokeRegisteredAction<R>(
  registry: Pick<ActionRegistry, "resolve">,
  ports: RunActionOptions["ports"],
  actionId: string,
  input: unknown,
  context: unknown,
): Promise<InvokeOutcome<R>> {
  const invocation: Invocation = {
    [INVOCATION]: true,
    actionId,
    input,
    context,
  };
  const target = createClickTarget({ host: invocation });
  let action: Action | undefined;
  try {
    const resolved = await registry.resolve(target);
    action = resolved.find((r) => r.action.id === actionId)?.action;
  } catch (error) {
    return { status: "failed", error };
  }
  if (!action) return { status: "not-registered" };
  const result = await runAction(action, target, { ports });
  if (result.status === "failed") return { status: "failed", error: result.error };
  if (result.status !== "ran" || !invocation.settled) {
    return {
      status: "failed",
      error: new Error(`"${actionId}" did not run (${result.status}).`),
    };
  }
  return { status: "ran", value: invocation.settled.value as R };
}
