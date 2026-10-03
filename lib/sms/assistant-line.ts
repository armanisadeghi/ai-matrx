/**
 * A RETIRED STAFF NUMBER KEEPS ANSWERING ITS PEOPLE.
 *
 * When Personal Staff moved to its own number (+1 415 980 8187, 2026-10-03,
 * Lane BC), every enrolled person's binding moved to the new destination row,
 * and the old row (+1 415 805 9951) gained `metadata.succeeded_by = <new row id>`.
 * Nobody's old thread may break: a text or call to the old number must still
 * reach the person whose binding now names its successor.
 *
 * The rule, in one place for this repo (the database twin lives in
 * `communication.resolve_voice_owner_call_context` and the enrollment door):
 * destination D answers for a person whose binding names D, or names the row
 * `D.metadata.succeeded_by`. The binding's program is the BOUND row's program.
 */

export type AssistantBindingTarget = {
  destinationId: string;
  programKey: string;
};

type DestinationLike = {
  id: string;
  program_key: string;
  metadata?: unknown;
};

/** The successor row id a retired destination names, or null. */
export function successorDestinationId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>).succeeded_by;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Every (destination, program) pair a binding may name for a person to be
 * answered on `destination`: the destination itself, plus its successor when
 * it has one. `successor` is the successor row as read (null when absent or
 * deleted — then only the destination itself counts).
 */
export function assistantBindingTargets(
  destination: DestinationLike,
  successor: { id: string; program_key: string } | null,
): AssistantBindingTarget[] {
  const targets: AssistantBindingTarget[] = [
    { destinationId: destination.id, programKey: destination.program_key },
  ];
  const successorId = successorDestinationId(destination.metadata);
  if (successor && successorId && successor.id === successorId) {
    targets.push({ destinationId: successor.id, programKey: successor.program_key });
  }
  return targets;
}

/** True when a binding row names one of the targets with that target's program. */
export function bindingMatchesTargets(
  binding: { assistant_destination_id: string | null; assistant_program_key: string | null },
  targets: readonly AssistantBindingTarget[],
): boolean {
  return targets.some(
    (target) =>
      binding.assistant_destination_id === target.destinationId &&
      binding.assistant_program_key === target.programKey,
  );
}
