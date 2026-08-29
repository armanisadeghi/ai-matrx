// app/(core)/commerce/review/admin/page.tsx
//
// Per-feature admin map for Commerce Review (/commerce/triage, /commerce/drafts,
// /commerce/attention, /commerce/stores/connect). Update this map when adding
// any commerce-review route/component.

export const dynamic = "force-dynamic";

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const COMMERCE_REVIEW_ADMIN_MAP: FeatureAdminMap = {
  name: "Commerce Review",
  slug: "commerce-review",
  baseUrl: "/commerce",
  description:
    "W11 of the ebay-store-management build: the two human gates over the commerce pipeline (warehouse triage on awaiting_triage, lister craft on in_review), the attention queue (recall disagreements + escalations + high-impact unknowns), and the onboarding/store-connect shell. Human decisions NEVER overwrite AI output rows — every change lands as a human_correction diff plus a guarded asset write, so the learning taps can diff human vs AI.",
  docs: [
    {
      label: "Commerce Review FEATURE.md",
      href: "/features/commerce-review/FEATURE.md",
    },
    {
      label: "Commerce Intake FEATURE.md (the upstream capture app)",
      href: "/features/commerce-intake/FEATURE.md",
    },
  ],
  routeScanPath: "app/(core)/commerce",
  routes: [
    {
      url: "/commerce/triage",
      label: "Warehouse triage (gate 1)",
      description:
        "Image-first, keyboard-driven value_bucket decisions (1–5 buckets, Enter confirms the AI, J/K move). no_value → recycled, else → drafting; the status write is the trigger.",
      filePath: "app/(core)/commerce/triage/page.tsx",
      status: "Live",
    },
    {
      url: "/commerce/drafts",
      label: "Drafts review (gate 2)",
      description:
        "One draft per screen at the ~15s/item bar: evidence photos + reasoning, confidence-gated fields, edit-in-place, Enter/R/X verdicts. Edits land as gate_2 human_correction diffs.",
      filePath: "app/(core)/commerce/drafts/page.tsx",
      status: "Live",
    },
    {
      url: "/commerce/attention",
      label: "Attention queue",
      description:
        "Open recall_audit disagreements + escalations + high-impact asset_unknown rows in one list; inline recall verdicts; every row opens its asset.",
      filePath: "app/(core)/commerce/attention/page.tsx",
      status: "Live",
    },
    {
      url: "/commerce/stores/connect",
      label: "Onboarding + store connect",
      description:
        "The connect flow's UI shell; the Connect button is the registered Coming-Soon promise commerce.store-connect-oauth until W6's OAuth routes land.",
      filePath: "app/(core)/commerce/stores/connect/page.tsx",
      status: "Live",
    },
    {
      url: "/commerce/review/admin",
      label: "Admin map (this page)",
      description: "Admin index of every commerce-review resource.",
      filePath: "app/(core)/commerce/review/admin/page.tsx",
      status: "Live",
    },
  ],
  components: [
    {
      name: "TriageQueue",
      filePath: "features/commerce-review/components/TriageQueue.tsx",
      description: "Gate-1 engine: queue paging, keyboard decisions, decideValueBucket.",
      status: "Live",
    },
    {
      name: "DraftReviewQueue",
      filePath: "features/commerce-review/components/DraftReviewQueue.tsx",
      description:
        "Gate-2 engine: evidence pane, confidence-gated editable fields, reviewDraft verdicts.",
      status: "Live",
    },
    {
      name: "AttentionQueue",
      filePath: "features/commerce-review/components/AttentionQueue.tsx",
      description: "The unified attention list with inline recall verdicts.",
      status: "Live",
    },
    {
      name: "StoreConnectShell",
      filePath: "features/commerce-review/components/StoreConnectShell.tsx",
      description: "Onboarding steps + the tracked Connect promise.",
      status: "Live",
    },
    {
      name: "ConfidenceChip",
      filePath: "features/commerce-review/components/ConfidenceChip.tsx",
      description: "The one confidence rendering + banding shared by both gates.",
      status: "Live",
    },
    {
      name: "billing-dimensions",
      filePath: "features/commerce-config/billing-dimensions.ts",
      description:
        "The seeded commerce billable dimensions (items processed, listings published, storage) — the ONE vocabulary future billing.capability / billing.plan_limit wiring consumes. No live consumer yet; registered here so it is never orphaned. Commerce knob CONFIG has no commerce-local page: platform tier /administration/users/limits, org tier /organizations/[orgId]/settings/configuration, user tier the Personal configuration Settings tab.",
      status: "Coming soon",
    },
    {
      name: "service + types",
      filePath: "features/commerce-review/service.ts",
      description:
        "Direct-Supabase reads (live mandate results via superseded_by-null, complete queue reads) and the learning-tap-lawful writes (human_correction + guarded CAS asset writes; recall verdict-only updates).",
      status: "Live",
    },
  ],
};

export default function CommerceReviewAdminPage() {
  return <FeatureAdminPage map={COMMERCE_REVIEW_ADMIN_MAP} />;
}
