// features/meet/lib/task-owner.ts
//
// WHO OWNS A TASK MADE FROM A MEETING'S ACTION ITEM.
//
// The owner is exactly who the meeting named — and an item the meeting named
// nobody for stays unowned ("Nobody yet"). Through 2026-09-27 an unowned item
// defaulted to the person clicking, and that person was listed under the name
// they used IN the meeting, so a host whose meeting name was "Grace Hopper" saw
// every unowned item pre-assigned to "Grace Hopper" — which read as a real,
// different person (verifier, 2026-09-27). The clicker is now labelled
// "(you)" wherever they appear, and never chosen for them.

export interface TaskOwnerChoice {
  readonly userId: string;
  readonly name: string;
}

export interface OwnerCandidate {
  readonly userId: string | null;
  readonly isAgent: boolean;
  readonly name: string;
}

/** The owner a new task starts with: the one the meeting named, or nobody. */
export function defaultTaskOwner(item: {
  readonly assigneeUserId: string | null;
}): string | null {
  return item.assigneeUserId ?? null;
}

/**
 * Everyone with an account who was there, once each, plus the viewer — the
 * viewer always marked "(you)" so their own meeting name is never mistaken for
 * somebody else.
 */
export function taskOwnerChoices(
  attendees: readonly OwnerCandidate[],
  viewerId: string | null,
): TaskOwnerChoice[] {
  const people: TaskOwnerChoice[] = [];
  const seen = new Set<string>();
  for (const person of attendees) {
    if (!person.userId || person.isAgent || seen.has(person.userId)) continue;
    seen.add(person.userId);
    people.push({
      userId: person.userId,
      name: person.userId === viewerId ? `${person.name} (you)` : person.name,
    });
  }
  if (viewerId && !seen.has(viewerId)) people.unshift({ userId: viewerId, name: "Me" });
  return people;
}
