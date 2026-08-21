import type { Assist } from "./types";

export const ASSIST_PRESENTATION_LIMIT = 3;
export const ASSIST_PRESENTATION_CYCLE_MS = 3 * 60 * 60 * 1000;

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
  const ordered = [
    ...candidates.filter((assist) => !previousIds.has(assist.id)),
    ...candidates.filter((assist) => previousIds.has(assist.id)),
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

export function presentedAssists(
  candidates: Assist[],
  cycle: AssistPresentationCycle | null,
): Assist[] {
  if (!cycle) return [];
  const byId = new Map(candidates.map((assist) => [assist.id, assist]));
  return cycle.assistIds
    .map((id) => byId.get(id))
    .filter((assist): assist is Assist => assist !== undefined);
}
