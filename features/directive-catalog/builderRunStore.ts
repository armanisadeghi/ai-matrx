/**
 * THE ADMIN BUILDER'S RUN, KEPT OUTSIDE THE COMPONENT (G18 review, 2026-10-07).
 *
 * A run was lost once: the page re-rendered right after the confirm, the panel
 * remounted with fresh state, and its result had nowhere to land. The action
 * cards already keep an apply's progress per block outside the component
 * (`@ai-matrx/content-ir-react` ApplyDirectiveButton `applyOutcomes`); the
 * builder now does the same. The run keeps going whatever the panel does, and
 * a panel that mounts later shows its progress and outcome.
 *
 * It also remembers which exact blocks (slug + items) already applied on this
 * page, so a repeat says "This already ran once." — the card's Run-again rule.
 */
import { useSyncExternalStore } from "react";
import type { DirectiveApplyResult } from "@/features/directive-catalog/types";

export interface BuilderRunState {
  executing: boolean;
  result: DirectiveApplyResult | null;
  error: { raw: string; headline?: string } | null;
  /** The title the last run sent — names the written record in its receipt. */
  sentTitle: string | null;
  /** The slug the last run sent ("…_create_task"), so a remount knows what it was. */
  slug: string | null;
}

const IDLE: BuilderRunState = {
  executing: false,
  result: null,
  error: null,
  sentTitle: null,
  slug: null,
};

let current: BuilderRunState = IDLE;
const applied = new Set<string>();
const listeners = new Set<() => void>();

function publish(next: BuilderRunState): void {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBuilderRun(): BuilderRunState {
  return current;
}

export function useBuilderRun(): BuilderRunState {
  return useSyncExternalStore(subscribe, getBuilderRun, () => IDLE);
}

/** Clears the shown outcome — inputs changed, so an old error no longer applies. */
export function clearBuilderOutcome(): void {
  if (current.executing) return;
  if (current.result === null && current.error === null) return;
  publish({ ...current, result: null, error: null });
}

/** One block's identity: the ledger keys a block by its slug and items. */
export function blockKey(slug: string, items: ReadonlyArray<unknown>): string {
  return `${slug}\u0000${JSON.stringify(items)}`;
}

/** True when this exact block already applied on this page. */
export function alreadyApplied(key: string): boolean {
  return applied.has(key);
}

/**
 * Runs `execute` and keeps its progress and outcome here. Never rejects; the
 * outcome lands in the store whether or not any panel is mounted.
 */
export async function runBuilder(
  slug: string,
  key: string,
  sentTitle: string | null,
  execute: () => Promise<DirectiveApplyResult>,
  describeError: (e: unknown) => { raw: string; headline?: string },
): Promise<BuilderRunState> {
  publish({ executing: true, result: null, error: null, sentTitle, slug });
  try {
    const result = await execute();
    if (result.receipts.some((r) => r.status === "applied" || r.status === "already_applied")) {
      applied.add(key);
    }
    publish({ executing: false, result, error: null, sentTitle, slug });
  } catch (e) {
    publish({ executing: false, result: null, error: describeError(e), sentTitle, slug });
  }
  return current;
}

/** Test seam. */
export function resetBuilderRunForTests(): void {
  applied.clear();
  publish(IDLE);
}
