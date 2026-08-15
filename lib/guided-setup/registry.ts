/**
 * The guided-checklist registry.
 *
 * A checklist is DECLARED, never hand-built per surface. Registering it here
 * means (a) the key that persistence hangs off is unique and greppable, (b)
 * anyone can find every guided setup flow the product has, and (c) a surface
 * mounts one with a key rather than by importing a bespoke component.
 *
 * Definitions are registered by their owning feature at import time — the same
 * shape the settings catalogue and the kind registry use. Keep the key
 * namespaced by feature (`marketing.site_setup`, `outreach.sending_identity`).
 *
 * Contexts are per-checklist and deliberately not unified: a site checklist
 * needs a site, a sending-identity checklist needs a mailbox. `getChecklist`
 * returns the definition typed to the context the caller declares it takes —
 * the caller is the one that constructs it, so it is the one that knows.
 */

import type { ChecklistDefinition } from "./types";

const registry = new Map<string, ChecklistDefinition<never>>();

export function registerChecklist<Ctx>(
  definition: ChecklistDefinition<Ctx>,
): ChecklistDefinition<Ctx> {
  const existing = registry.get(definition.key);
  if (existing && existing !== (definition as ChecklistDefinition<never>)) {
    // Loud, not silent: two definitions on one key means one of them is
    // writing into the other's persisted state.
    console.error(
      `[guided-setup] Two checklists are registered under "${definition.key}". ` +
        `Keys are persistence keys — the second one will read the first one's saved state.`,
    );
  }
  // A factory's output cannot be inspected without a context, so that form is
  // checked for duplicate ids at read time instead — see `checklistSteps`.
  if (Array.isArray(definition.steps)) {
    const ids = new Set<string>();
    for (const step of definition.steps) {
      if (ids.has(step.id)) {
        console.error(
          `[guided-setup] Checklist "${definition.key}" declares step id "${step.id}" twice — ` +
            `step ids are persistence keys and must be unique.`,
        );
      }
      ids.add(step.id);
    }
  }
  registry.set(definition.key, definition as ChecklistDefinition<never>);
  return definition;
}

/** Every registered checklist, for admin maps and audits. */
export function listChecklists(): ChecklistDefinition<never>[] {
  return [...registry.values()];
}

export function getChecklist<Ctx>(
  key: string,
): ChecklistDefinition<Ctx> | undefined {
  return registry.get(key) as ChecklistDefinition<Ctx> | undefined;
}
