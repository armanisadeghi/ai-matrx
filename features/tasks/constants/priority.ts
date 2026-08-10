/**
 * Canonical task priority vocabulary — the ONE place the set of priorities
 * lives, mirroring `constants/status.ts` for the lifecycle set.
 *
 * DB: `workspace.tasks.priority`, nullable — `null` means "no priority", which
 * is why the picker's own value type is `TaskPriorityValue | null` and the
 * quick-create form models "none" as an empty string in its `<Select>`.
 *
 * Deliberately free of React/icon imports so non-component consumers (surface
 * manifests, which the drift checker imports under plain `tsx`, and server
 * code) can spell the vocabulary out from the real constant instead of
 * re-typing the literals.
 */

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;

export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number];
