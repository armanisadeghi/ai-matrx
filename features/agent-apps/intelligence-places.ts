// features/agent-apps/intelligence-places.ts
//
// WHERE EACH AGENT APP JOB RUNS — drawn on /intelligence/agent_apps.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const AGENT_APPS_PLACES: FeaturePlaces = {
  feature: "agent_apps",
  // The builder's jobs are declared as applets.build / applets.fix (d46539068d).
  extraPrefixes: ["applets"],
  label: "Agent apps",
  roots: ["features/agent-apps", "app/(core)/agent-apps"],
  places: [
    {
      id: "build",
      label: "Build an app",
      trigger: "Describe the app; the builder drafts and fixes it",
      urlPattern: "/agent-apps/build",
      mandateKeys: [K.applets__build, K.applets__fix],
      sources: ["features/applets-host/builder/AppletBuilder.tsx"],
    },
    {
      id: "code",
      label: "App code editor",
      trigger: "The chat that writes the app's code",
      urlPattern: "/agent-apps/[appId]/code",
      mandateKeys: [K.agent_apps__prompt_app_dev],
      sources: ["app/(core)/agent-apps/[id]/code/AgentAppEditPageClient.tsx"],
    },
  ],
};
