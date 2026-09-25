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
  label: "Agent apps",
  aliases: {
    "prompt-app-auto-create": K.agent_apps__auto_create,
    "prompt-app-auto-create-lightning": K.agent_apps__auto_create_lightning,
    "prompt-app-metadata-generator": K.agent_apps__metadata,
  },
  roots: ["features/agent-apps", "app/(core)/agent-apps"],
  places: [
    {
      id: "auto-create",
      label: "New agent app",
      trigger: "Build the app for me (name, code)",
      urlPattern: "/agent-apps/new",
      mandateKeys: [
        K.agent_apps__auto_create,
        K.agent_apps__auto_create_lightning,
        K.agent_apps__metadata,
      ],
      sources: [
        "features/agent-apps/hooks/useAutoCreateApp.ts",
        "features/agents/constants/system-agent-registry.ts",
      ],
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
