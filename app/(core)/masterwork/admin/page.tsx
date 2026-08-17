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
  windowPanels: [
    {
      overlayId: "masterworkCheckupWindow",
      description:
        "THE FINAL CHECKUP — split down the middle (your Rulebook today | what we suggest). Streams add / modify / remove findings from POST /masterworks/checkup over the durable masterwork_run spine, keyboard disposition (Y / N / arrows), Approve with AI above 80% confidence, and ONE compare-and-swap apply through saveRules. Opened from the Rulebook page header.",
      status: "Live",
    },
  ],
  components: [
    {
      name: "Final Checkup — CheckupWindow",
      filePath: "features/masterwork/checkup/CheckupWindow.tsx",
      description:
        "The window itself: composition root, the split, the keyboard model, the footer (progress, Approve with AI, Apply, Undo).",
      tier: "candidate",
    },
    {
      name: "Final Checkup — CheckupPanes",
      filePath: "features/masterwork/checkup/CheckupPanes.tsx",
      description:
        "The two halves of the split: the Rulebook as it stands vs. the proposal, the reason, the Expert's VERBATIM evidence quote with doors to the conversation / source file, the confidence meter, alternatives, and the ProTextarea rewrite.",
      tier: "internal",
    },
    {
      name: "Final Checkup — CheckupFindingList",
      filePath: "features/masterwork/checkup/CheckupFindingList.tsx",
      description:
        "The queue: one row per finding with its kind, honest confidence badge, and the Expert's decision (with an AI mark when Approve with AI made the call).",
      tier: "internal",
    },
    {
      name: "Final Checkup — useCheckup",
      filePath: "features/masterwork/checkup/useCheckup.ts",
      description:
        "The one state hook: decisions (kept per run, restored after a refresh), filters, focus, Approve with AI + its undo, apply and undo-apply.",
      tier: "internal",
    },
    {
      name: "Final Checkup — useCheckupRun",
      filePath: "features/masterwork/checkup/useCheckupRun.ts",
      description:
        "The durable run (operation `checkup` on platform.masterwork_run) with progressive findings merged by id; the terminal document wins.",
      tier: "internal",
    },
    {
      name: "Final Checkup — apply service",
      filePath: "features/masterwork/checkup/service.ts",
      description:
        "projectCheckup (pure decisions → rules + checkup memory) and applyCheckup (ONE compare-and-swap through saveRules). remove RETIRES, never deletes.",
      tier: "internal",
    },
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
