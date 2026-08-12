/**
 * Canonical task label vocabulary — the ONE place the label set lives,
 * mirroring `constants/priority.ts` for priorities and `constants/status.ts`
 * for the lifecycle set.
 *
 * DB: stored inside `workspace.tasks.settings` JSONB (written by
 * `services/taskService.ts#updateTaskLabels`), so there is no CHECK constraint
 * behind it — this array IS the constraint, and it is what the label picker,
 * the surface manifests' agent-facing prose, and the surface write handlers
 * all read.
 *
 * Deliberately free of React/icon imports AND of service imports so
 * non-component consumers can spell the vocabulary out from the real constant
 * instead of re-typing the literals. That is the whole reason this module
 * exists: the set used to live only in `services/taskService.ts`, which
 * reaches supabase, the files handler, the comments service and the scopes
 * service. `features/surfaces/manifests/*` is imported en masse by
 * `manifests/registry.ts` and from there into the agent execution system, so a
 * manifest could not name the vocabulary without dragging that graph into
 * every authenticated route — and both task manifests re-typed the eight
 * literals into their contract prose instead. A re-typed enum drifts silently:
 * the write handler validates against the real constant, so adding a label
 * here without editing the prose leaves agents unable to use it, and removing
 * one leaves them proposing a value the handler rejects.
 *
 * `taskService` re-exports these, so the existing
 * `@/features/tasks/services/taskService` import sites keep working.
 */

export const TASK_LABEL_OPTIONS = [
  {
    value: "bug",
    label: "Bug",
    color: "bg-destructive/10 text-destructive",
  },
  {
    value: "feature",
    label: "Feature",
    color: "bg-primary/10 text-primary",
  },
  {
    value: "improvement",
    label: "Improvement",
    color: "bg-secondary/10 text-secondary",
  },
  {
    value: "docs",
    label: "Docs",
    color: "bg-info/10 text-info",
  },
  {
    value: "design",
    label: "Design",
    color: "bg-accent-2/10 text-accent-2",
  },
  {
    value: "research",
    label: "Research",
    color: "bg-warning/10 text-warning",
  },
  {
    value: "question",
    label: "Question",
    color: "bg-accent-3/10 text-accent-3",
  },
  {
    value: "blocked",
    label: "Blocked",
    color: "bg-destructive/15 text-destructive",
  },
] as const;

export type TaskLabel = (typeof TASK_LABEL_OPTIONS)[number]["value"];

/**
 * Just the values, in picker order — for enum prose in surface manifests
 * (`TASK_LABELS.join(" | ")`) and for handler validation.
 */
export const TASK_LABELS: readonly TaskLabel[] = TASK_LABEL_OPTIONS.map(
  (option) => option.value,
);
