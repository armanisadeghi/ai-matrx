// features/tasks/intelligence-places.ts
//
// WHERE EACH TASKS JOB RUNS — drawn on /intelligence/tasks.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const TASKS_PLACES: FeaturePlaces = {
  feature: "tasks",
  label: "Tasks",
  roots: ["features/tasks/components"],
  places: [
    {
      id: "triage",
      label: "Tasks",
      trigger: "Triage suggestions",
      urlPattern: "/tasks",
      mandateKeys: [K.tasks__triage],
      sources: [
        "features/tasks/components/TasksHeaderControls.tsx",
        "features/tasks/tasks-assists-producer.ts",
      ],
    },
  ],
};
