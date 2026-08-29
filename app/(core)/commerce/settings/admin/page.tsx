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
    "W11/W1 of the ebay-store-management build: the org + user tiers of scoped configuration (Code → System → Org → User) over platform.feature_knob (override_scope), platform.org_knob_override and platform.user_knob_override, written ONLY through platform.org_knob_set / platform.user_knob_set (NULL = reset). The platform tier stays at /administration/users/limits. Also home of the seeded commerce billing dimensions module.",
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
        "Organization tab (org-admin-editable overrides, platform default greyed, one-click reset) + My settings tab (user-scope knobs via user_knob_set).",
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
        "The two-tab surface: knobs grouped by feature, value_type-shaped inputs (number/integer with min/max clamps, boolean switch, enum select, string), override badges, reset-to-inherited.",
      status: "Live",
    },
    {
      name: "service + types",
      filePath: "features/commerce-config/service.ts",
      description:
        "Direct-Supabase reads of the three platform tables (hand-typed until db-types carries override_scope); writes only via the two SECURITY DEFINER setters.",
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
