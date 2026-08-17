// app/(core)/masterwork/admin/page.tsx — per-feature admin map (doctrine).

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const MASTERWORK_ADMIN_MAP: FeatureAdminMap = {
  name: "Masterwork",
  slug: "masterwork",
  description:
    "Rulebooks (platform.rulebook): the versioned, citable capture of one Expert's judgment. Masterworks (workflows) are built FROM Rulebooks; auditors consume rules verbatim; every verdict cites a rule id.",
  docs: [
    { label: "FEATURE.md", href: "/features/masterwork/FEATURE.md" },
  ],
  routeScanPath: "app/(core)/masterwork",
  routes: [
    {
      url: "/masterwork",
      label: "Masterwork Studio (Rulebook list)",
      description: "Canonical entity-list shell over platform.rulebook.",
      filePath: "app/(core)/masterwork/page.tsx",
      status: "Live",
    },
    {
      url: "/masterwork/[id]",
      label: "Rulebook detail (rule editor)",
      description:
        "Read/edit/add/retire rules grouped by section; version bumps on save.",
      filePath: "app/(core)/masterwork/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/masterwork/[id]/masterworks",
      label: "Masterworks for a Rulebook",
      description:
        "workflow.definition rows stamped built_from_rulebook, with version drift flags, release lifecycle (draft → released), and run links.",
      filePath: "app/(core)/masterwork/[id]/masterworks/page.tsx",
      status: "Live",
    },
    {
      url: "/encore",
      label: "Encore (Operator home)",
      description:
        "Every RELEASED Masterwork the viewer can reach (mine / orgs / public shelves), one primary action: Run.",
      filePath: "app/(core)/encore/page.tsx",
      status: "Live",
    },
    {
      url: "/encore/[id]",
      label: "Encore run page",
      description:
        "Run one released Masterwork: input form, live streamed run (TryMasterworkBox machinery), result, the Operator's own run history.",
      filePath: "app/(core)/encore/[id]/page.tsx",
      status: "Live",
    },
  ],
  components: [
    {
      name: "rulebookListConfig",
      filePath: "features/masterwork/browse/listConfig.tsx",
      description: "EntityListConfig for the list shell.",
      tier: "internal",
    },
    {
      name: "browse service",
      filePath: "features/masterwork/browse/service.ts",
      description:
        "Scoped list reads (mine / orgs / public) — plain PostgREST, THE VIEW LAW predicates.",
      tier: "internal",
    },
    {
      name: "rulebook service",
      filePath: "features/masterwork/service.ts",
      description:
        "Detail reads/writes: getRulebook, saveRules (optimistic version bump), createDraftRulebook, listMasterworksForRulebook.",
      tier: "internal",
    },
    {
      name: "RulebookDetailPage",
      filePath: "features/masterwork/components/detail/RulebookDetailPage.tsx",
      description: "The Expert rule editor surface.",
      tier: "candidate",
    },
    {
      name: "RuleEditorDialog",
      filePath: "features/masterwork/components/detail/RuleEditorDialog.tsx",
      description: "Plain-language add/edit rule form.",
      tier: "candidate",
    },
    {
      name: "encore service",
      filePath: "features/masterwork/encore/service.ts",
      description:
        "Released-Masterwork reads for Operators (VIEW LAW scoped shelves, per-Operator run history) + the rulebook join for the Expert doors.",
      tier: "internal",
    },
    {
      name: "EncoreHomePage / EncoreRunPage",
      filePath: "features/masterwork/encore/EncoreHomePage.tsx",
      description:
        "The Operator surface — jargon-free cards + the run experience (reuses TryMasterworkBox).",
      tier: "internal",
    },
  ],
  relatedFeatures: [
    {
      name: "Agents / workflows",
      description:
        "Masterworks are workflows; the Build service lands in aidream (POST /masterworks/build).",
      adminUrl: "/agents/admin",
    },
  ],
};

export default function MasterworkAdminPage() {
  return <FeatureAdminPage map={MASTERWORK_ADMIN_MAP} />;
}
