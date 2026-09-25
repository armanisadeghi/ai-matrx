// features/tool-call-visualization/intelligence-places.ts
//
// WHERE EACH TOOL DISPLAY JOB RUNS — drawn on /intelligence/tool_viz.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const TOOL_VIZ_PLACES: FeaturePlaces = {
  feature: "tool_viz",
  label: "Tool displays",
  roots: ["features/tool-call-visualization"],
  places: [
    {
      id: "component-generator",
      label: "A tool's display (admin)",
      trigger: "Generate the display component",
      urlPattern: "/administration/agents/mcp-tools/[toolId]/ui",
      mandateKeys: [K.tool_viz__component_generator],
      sources: [
        "features/tool-call-visualization/admin/hooks/useToolComponentAgent.ts",
        "features/tool-call-visualization/admin/tool-ui-generator-prompt.ts",
      ],
    },
  ],
};
