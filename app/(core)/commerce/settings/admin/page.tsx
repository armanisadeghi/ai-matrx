// app/(core)/commerce/settings/admin/page.tsx
//
// Per-feature admin map for Commerce Configuration (/commerce/settings).
// Update this map when adding any commerce-config route/component.

export const dynamic = "force-dynamic";

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const COMMERCE_CONFIG_ADMIN_MAP: FeatureAdminMap = {
  name: "Commerce Configuration",
  slug: "commerce-config",
  baseUrl: "/commerce/settings",
  description:
    "The commerce-scoped lens over the ONE scoped-configuration primitive (Code → System → Org → User): commerce.* and batch.deadline knobs read via platform.knob_index and written ONLY through platform.knob_override_set (NULL = clear/inherit), rendered with the canonical lib/scoped-config KnobOverrideRow. The platform tier stays at /administration/users/limits; the all-features org surface is /organizations/[orgId]/settings/configuration. Also home of the seeded commerce billing dimensions module.",
  docs: [
    {
      label: "Commerce Config FEATURE.md",
      href: "/features/commerce-config/FEATURE.md",
    },
  ],
  routeScanPath: "app/(core)/commerce/settings",
  routes: [
    {
      url: "/commerce/settings",
      label: "Scoped configuration",
      description:
        "Organization tab (knobs overridable_by organization, org-admin gated server-side) + My settings tab (knobs overridable_by user), both mounting lib/scoped-config KnobOverrideRow over platform.knob_index / knob_override_set.",
      filePath: "app/(core)/commerce/settings/page.tsx",
      status: "Live",
    },
    {
      url: "/commerce/settings/admin",
      label: "Admin map (this page)",
      description: "Admin index of every commerce-config resource.",
      filePath: "app/(core)/commerce/settings/admin/page.tsx",
      status: "Live",
    },
  ],
  components: [
    {
      name: "ScopedConfigPanel",
      filePath: "features/commerce-config/components/ScopedConfigPanel.tsx",
      description:
        "Thin commerce filter over useScopedKnobs + KnobOverrideRow (lib/scoped-config): two tabs, knobs grouped by feature; all editing behavior lives in the canonical row.",
      status: "Live",
    },
    {
      name: "billing-dimensions",
      filePath: "features/commerce-config/billing-dimensions.ts",
      description:
        "The seeded commerce billable dimensions (items processed, listings published, storage) future billing consumes.",
      status: "Live",
    },
  ],
};

export default function CommerceConfigAdminPage() {
  return <FeatureAdminPage map={COMMERCE_CONFIG_ADMIN_MAP} />;
}
