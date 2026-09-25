// features/personal-staff/intelligence-places.ts
//
// WHERE EACH PERSONAL STAFF JOB RUNS — drawn on /intelligence/personal_staff.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const PERSONAL_STAFF_PLACES: FeaturePlaces = {
  feature: "personal_staff",
  label: "Personal staff",
  roots: ["features/personal-staff", "app/(core)/staff"],
  places: [
    {
      id: "staff-room",
      label: "Staff room",
      trigger: "Talk to your front-line assistant",
      urlPattern: "/staff",
      mandateKeys: [K.personal_staff__front_line],
      sources: [
        "features/personal-staff/components/StaffRoom.tsx",
        "features/personal-staff/mandate.ts",
        "app/(core)/staff/page.tsx",
        "features/surfaces/manifests/staff.manifest.ts",
      ],
    },
  ],
};
