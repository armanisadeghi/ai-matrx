// app/(core)/expertise/admin/page.tsx — per-feature admin map (doctrine).

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const EXPERTISE_ADMIN_MAP: FeatureAdminMap = {
  name: "Expertise",
  slug: "expertise",
  description:
    "Expertise Packs (platform.expertise_pack): the versioned, citable rulebook primitive. Desks (workflows) compile FROM packs; auditors consume principles verbatim; every verdict cites a rule id.",
  docs: [
    { label: "FEATURE.md", href: "/features/expertise/FEATURE.md" },
  ],
  routeScanPath: "app/(core)/expertise",
  routes: [
    {
      url: "/expertise",
      label: "Pack list",
      description: "Canonical entity-list shell over platform.expertise_pack.",
      filePath: "app/(core)/expertise/page.tsx",
      status: "Live",
    },
    {
      url: "/expertise/[id]",
      label: "Pack detail (rule editor)",
      description:
        "Read/edit/add/retire rules grouped by section; version bumps on save.",
      filePath: "app/(core)/expertise/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/expertise/[id]/desks",
      label: "Desks for a pack",
      description:
        "workflow.definition rows stamped compiled_from_pack, with version drift flags and run links.",
      filePath: "app/(core)/expertise/[id]/desks/page.tsx",
      status: "Live",
    },
  ],
  components: [
    {
      name: "expertiseListConfig",
      filePath: "features/expertise/browse/listConfig.tsx",
      description: "EntityListConfig for the list shell.",
      tier: "internal",
    },
    {
      name: "browse service",
      filePath: "features/expertise/browse/service.ts",
      description:
        "Scoped list reads (mine / orgs / public) — plain PostgREST, THE VIEW LAW predicates.",
      tier: "internal",
    },
    {
      name: "pack service",
      filePath: "features/expertise/service.ts",
      description:
        "Detail reads/writes: getPack, savePrinciples (optimistic version bump), createDraftPack, listDesksForPack.",
      tier: "internal",
    },
    {
      name: "PackDetailPage",
      filePath: "features/expertise/components/detail/PackDetailPage.tsx",
      description: "The expert rule editor surface.",
      tier: "candidate",
    },
    {
      name: "RuleEditorDialog",
      filePath: "features/expertise/components/detail/RuleEditorDialog.tsx",
      description: "Plain-language add/edit rule form.",
      tier: "candidate",
    },
  ],
  relatedFeatures: [
    {
      name: "Agents / workflows",
      description:
        "Desks are workflows; compile service lands in aidream services/expertise_desks (Phase 2).",
      adminUrl: "/agents/admin",
    },
  ],
};

export default function ExpertiseAdminPage() {
  return <FeatureAdminPage map={EXPERTISE_ADMIN_MAP} />;
}
