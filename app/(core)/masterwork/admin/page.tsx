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
    {
      label: "Source onboarding FEATURE.md (import guides)",
      href: "/features/source-onboarding/FEATURE.md",
    },
  ],
  routeScanPath: "app/(core)/masterwork",
  routes: [
    {
      url: "/masterwork",
      label: "Masterwork landing",
      description:
        "The module home. Guests get the marketing landing (ModuleLanding); signed-in Experts get the Masterwork home — Rulebooks with review KPIs, built Masterworks with release state + quality trend, recent runs, Approach start tiles, and the 'How it's improving' Hindsight panel.",
      filePath: "app/(core)/masterwork/page.tsx",
      status: "Live",
    },
    {
      url: "/masterwork/all",
      label: "All Rulebooks (Masterwork Studio list)",
      description: "Canonical entity-list shell over platform.rulebook.",
      filePath: "app/(core)/masterwork/all/page.tsx",
      status: "Live",
    },
    {
      url: "/masterwork/new",
      label: "New Rulebook (guided intake)",
      description:
        "The guided Distillation start — full page in the house guided-intake pattern: big default-filled option tiles (goal · who runs it · where the knowledge lives · stakes · benchmark), then the registry-driven Approach picker. Every 'New Rulebook' entry point routes here.",
      filePath: "app/(core)/masterwork/new/page.tsx",
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
      url: "/masterwork/[id]/interview",
      label: "Scout interview (full page)",
      description:
        "The interview as its own URL — the same ScoutInterviewContent the 'Interview me' sheet renders (chooser included). Deep links: ?conversation=<id> resumes one; ?new=1 starts fresh.",
      filePath: "app/(core)/masterwork/[id]/interview/page.tsx",
      status: "Live",
    },
    {
      url: "/masterwork/[id]/record",
      label: "The Record ('Your words')",
      description:
        "Everything the Expert contributed to one Rulebook — every interview turn, upload, and recording, oldest first, with doors and copy affordances.",
      filePath: "app/(core)/masterwork/[id]/record/page.tsx",
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
      url: "/masterwork/encore",
      label: "Encore (Operator home)",
      description:
        "Every RELEASED Masterwork the viewer can reach (mine / orgs / public shelves), one primary action: Run.",
      filePath: "app/(core)/masterwork/encore/page.tsx",
      status: "Live",
    },
    {
      url: "/masterwork/encore/[id]",
      label: "Encore run page",
      description:
        "Run one released Masterwork: input form, live streamed run (TryMasterworkBox machinery), result, the Operator's own run history.",
      filePath: "app/(core)/masterwork/encore/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/import/ai-chats",
      label: "Import guides — provider gallery (PUBLIC, anonymous SEO surface)",
      description:
        "features/source-onboarding house pattern: recognizable provider cards (ChatGPT, Claude, Gemini, Grok, Meta AI, coding tools, …), each opening a hand-holding export guide. Deliberately in (public) — 'how do I export my X history' is high-intent anonymous search traffic; CTA routes into /masterwork. Linked from ChatImportDialog's Upload tab.",
      filePath: "app/(public)/import/ai-chats/page.tsx",
      status: "Live",
    },
    {
      url: "/import/ai-chats/[provider]",
      label: "Import guides — one provider's export guide (PUBLIC)",
      description:
        "Numbered steps, deep links, trap warnings, honest delivery mechanics, screenshot slots (illustrated placeholders until real captures land per SCREENSHOT_WORK_ORDERS.md). Per-provider SEO metadata + generateStaticParams.",
      filePath: "app/(public)/import/ai-chats/[provider]/page.tsx",
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
      name: "MasterworkHomePage",
      filePath: "features/masterwork/home/MasterworkHomePage.tsx",
      description:
        "The authed landing body: Rulebook cards with review progress, Masterworks with release state + quality trend, recent runs, Approach start tiles, the improvement panel.",
      tier: "internal",
    },
    {
      name: "HowItsImprovingPanel",
      filePath: "features/masterwork/home/HowItsImprovingPanel.tsx",
      description:
        "The honest Hindsight panel — renders only what a signed-in user can truly read (public mandate registry + agent revision counts); never fabricates review activity.",
      tier: "internal",
    },
    {
      name: "home service",
      filePath: "features/masterwork/home/service.ts",
      description:
        "Bounded overview reads for the landing (your Rulebooks / Masterworks / runs / quality scores) + fetchImprovementRows.",
      tier: "internal",
    },
    {
      name: "MasterworkLanding (marketing)",
      filePath:
        "features/auth/components/module-landing/landings/MasterworkLanding.tsx",
      description:
        "The guest marketing landing (ModuleLanding shell), registered in MODULE_LANDING_DIRECTORY so it appears on /features.",
      tier: "internal",
    },
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
      name: "SourceGallery / SourceGuidePage / ScreenshotSlot",
      filePath: "features/source-onboarding/components/SourceGallery.tsx",
      description:
        "The reusable provider-gallery + guide-page components behind /import/ai-chats. Config-driven: a new gallery (meeting platforms, message threads) is a new SourceGalleryConfig + provider files, zero new components. Contract: features/source-onboarding/FEATURE.md.",
      tier: "official",
    },
    {
      name: "ai-chats gallery config",
      filePath: "features/source-onboarding/galleries/ai-chats/index.ts",
      description:
        "SourceGalleryConfig for AI chat providers (11 provider files under providers/); screenshot capture briefs in the sibling SCREENSHOT_WORK_ORDERS.md (0/16 captured — all need signed-in accounts).",
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
