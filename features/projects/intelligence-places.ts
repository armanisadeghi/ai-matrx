// features/projects/intelligence-places.ts
//
// WHERE EACH PROJECTS JOB RUNS — drawn on /intelligence/projects.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const PROJECTS_PLACES: FeaturePlaces = {
  feature: "projects",
  label: "Projects",
  aliases: { PROJECT_CREATE_MANDATE_KEY: K.projects__creation_guide },
  roots: ["features/projects"],
  places: [
    {
      id: "create",
      label: "New project",
      trigger: "Create with AI",
      urlPattern: "/projects/new",
      mandateKeys: [K.projects__creation_guide],
      sources: [
        "features/projects/components/ProjectCreatePanel.tsx",
        "features/projects/debug/projectCreateAiDebug.ts",
      ],
    },
  ],
};
