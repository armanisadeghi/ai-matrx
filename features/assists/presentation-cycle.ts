import { urgencyFromPriority, type Assist } from "./types";

export const ASSIST_PRESENTATION_LIMIT = 3;
export const ASSIST_PRESENTATION_CYCLE_MS = 3 * 60 * 60 * 1000;

/**
 * 🚨 ROTATION IS FOR TREATS, NOT FOR BLOCKERS.
 *
 * The three scarce slots and the three-hour cycle exist so that *suggestions*
 * cannot pile up (2026-08-19: fifty chips in a corner that could be neither
 * moved nor closed). They were never meant to govern the urgent band, whose
 * definition is the opposite of a suggestion — `ASSIST_URGENT_BAR`:
 * **something is blocked or failing and only this person can unblock it.**
 *
 * Applied to an urgent row, rotation is a silent failure: `chooseAssistPresentationCycle`
 * deliberately puts last cycle's rows BEHIND the fresh ones, so a blocker that
 * has been waiting the longest is the first thing displaced, and it can stay
 * invisible for up to three hours while the screen looks calm. It also could
 * not appear at all until the next cycle began.
 *
 * So the urgent band is PINNED: always presented, immediately, whatever the
 * cycle says. The ceiling below is not a rotation — it is the anti-pileup floor
 * the 2026-08-19 incident earned, and everything past it stays one click away
 * through the dock's existing door to every assist. The urgent bar is narrow
 * and `assistPriority()` is the only way to reach it, so this set is small by
 * construction; if it ever is not, that is a producer defect to fix at the
 * producer, not a reason to hide work from the person it is blocking.
 */
export const ASSIST_URGENT_PRESENTATION_CEILING = 3;

function isUrgent(assist: Assist): boolean {
  return urgencyFromPriority(assist.priority) === "urgent";
}

export interface AssistPresentationCycle {
  startedAt: string;
  assistIds: string[];
}

export function isAssistPresentationCycleCurrent(
  cycle: AssistPresentationCycle | null,
  now = Date.now(),
): boolean {
  if (!cycle) return false;
  const started = Date.parse(cycle.startedAt);
  return (
    Number.isFinite(started) &&
    started <= now &&
    now - started < ASSIST_PRESENTATION_CYCLE_MS
  );
}

/** One noisy check family can occupy at most one of the three scarce slots. */
export function assistSourceFamily(sourceKey: string): string {
  const parts = sourceKey.split(".");
  return parts.length > 2 ? parts.slice(0, 2).join(".") : sourceKey;
}

export function chooseAssistPresentationCycle(
  candidates: Assist[],
  previous: AssistPresentationCycle | null,
  now = new Date(),
): AssistPresentationCycle {
  const previousIds = new Set(previous?.assistIds ?? []);
  // Urgent rows are pinned by `presentedAssists`, so spending one of the three
  // rotated slots on one would cost a treat its turn and change nothing.
  const rotatable = candidates.filter((assist) => !isUrgent(assist));
  const ordered = [
    ...rotatable.filter((assist) => !previousIds.has(assist.id)),
    ...rotatable.filter((assist) => previousIds.has(assist.id)),
  ];
  const families = new Set<string>();
  const assistIds: string[] = [];
  for (const assist of ordered) {
    const family = assistSourceFamily(assist.sourceKey);
    if (families.has(family)) continue;
    families.add(family);
    assistIds.push(assist.id);
    if (assistIds.length === ASSIST_PRESENTATION_LIMIT) break;
  }
  return { startedAt: now.toISOString(), assistIds };
}

/**
 * What the dock shows right now: every urgent row (pinned, up to the ceiling)
 * followed by this cycle's rotated treats.
 *
 * Urgency is read HERE rather than baked into the stored cycle on purpose. The
 * cycle is a persisted preference that lasts three hours; a blocker that
 * arrives one minute into it must appear one minute into it, not in two hours
 * and fifty-nine minutes.
 */
export function presentedAssists(
  candidates: Assist[],
  cycle: AssistPresentationCycle | null,
): Assist[] {
  const pinned = candidates
    .filter(isUrgent)
    .slice(0, ASSIST_URGENT_PRESENTATION_CEILING);
  const shown = new Set(pinned.map((assist) => assist.id));
  if (!cycle) return pinned;
  const byId = new Map(candidates.map((assist) => [assist.id, assist]));
  const rotated = cycle.assistIds
    .map((id) => byId.get(id))
    .filter((assist): assist is Assist => assist !== undefined)
    .filter((assist) => !shown.has(assist.id));
  return [...pinned, ...rotated];
}
