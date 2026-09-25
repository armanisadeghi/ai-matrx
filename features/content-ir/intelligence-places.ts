// features/content-ir/intelligence-places.ts
//
// WHERE EACH SHAPES JOB RUNS — drawn on /intelligence/content_ir.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const CONTENT_IR_PLACES: FeaturePlaces = {
  feature: "content_ir",
  label: "Shapes",
  roots: ["features/content-ir", "features/workflow-emit"],
  places: [
    {
      id: "studio",
      label: "Shape studio",
      trigger: "Create or fix a shape, build its component",
      urlPattern: "/shapes",
      mandateKeys: [K.content_ir__kind_creator, K.content_ir__component_artisan],
      sources: [
        "features/content-ir/studio/constants.ts",
        "features/content-ir/studio/kind-agent-intents.ts",
        "features/surfaces/manifests/shapes.manifest.ts",
      ],
    },
    {
      id: "fix-component",
      label: "Any shape on screen",
      trigger: "Fix this component",
      mandateKeys: [K.content_ir__kind_creator],
      sources: ["features/content-ir/react/db-component/KindComponentFixBadge.tsx"],
    },
    {
      id: "workflow-emit",
      label: "A workflow result",
      trigger: "Make a shape for this output",
      mandateKeys: [K.content_ir__kind_creator],
      sources: ["features/workflow-emit/GenericEmitRenderer.tsx"],
    },
    {
      id: "kind-registry",
      label: "Kind registry (admin)",
      trigger: "Kind builder",
      urlPattern: "/administration/utilities/kind-registry/build",
      mandateKeys: [K.content_ir__kind_architect, K.content_ir__kind_creator],
      sources: [
        "features/content-ir/admin/KindBuilderClient.tsx",
        "features/surfaces/manifests/admin-kind-registry.manifest.ts",
      ],
    },
  ],
};
