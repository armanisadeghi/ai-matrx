// features/flashcards/admin/flashcardsAdminMap.ts
//
// Per-feature admin map for the Flashcards tool (/education/flashcards). Lists
// every resource the feature owns: the live routes, the render block that
// surfaces flashcards inline in chat, the canonical data layer (fcService +
// the study hook over the shared study spine), the education.fc_* tables and
// study RPCs it writes through, and the AI agents that will author/grade cards
// (specs in features/education/docs/AGENT_SPECS.md — agents not built yet).
//
// Keep in sync as routes/components are added — the drift warnings on the
// rendered page flag anything under app/(core)/education/flashcards not listed.

import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

export const flashcardsAdminMap: FeatureAdminMap = {
  name: "Flashcards",
  slug: "flashcards",
  description:
    "The flashcard creation + study tool under /education/flashcards. Canonical content lives in the education schema (fc_set / fc_card / fc_detail); studying writes the shared study spine (study_attempt + item_mastery). Today: a list-first browser + set detail + a classic-flip study surface. Creation / AI generation flows are out of scope until the fc_* agents are built (specs in AGENT_SPECS.md).",
  docs: [
    { label: "Flashcard agent specs", href: "/features/education/docs/AGENT_SPECS.md" },
    { label: "Education VISION", href: "/education/VISION-education-hub.md" },
    { label: "Education admin map", href: "/education/admin" },
  ],

  routes: [
    {
      url: "/education/flashcards",
      label: "List home",
      description: "Savior list view of all my/shared/public sets, recent-first; click → detail, Study → session.",
      filePath: "app/(core)/education/flashcards/page.tsx",
      status: "Live",
      notes: ["Reads fcService.listSets() (RLS-filtered)", "New-set button disabled (creation flows pending agents)"],
    },
    {
      url: "/education/flashcards/[setId]",
      label: "Set detail",
      description: "Set header (name/topic/count) + card grid (front/back peek + helper/example/audio badges).",
      filePath: "app/(core)/education/flashcards/[setId]/page.tsx",
      status: "Live",
    },
    {
      url: "/education/flashcards/[setId]/study",
      label: "Study surface",
      description: "Focused classic-flip session: flip, grade (Again/Partial/Got it), keyboard nav, progress, completion summary.",
      filePath: "app/(core)/education/flashcards/[setId]/study/page.tsx",
      status: "Live",
      notes: ["Driven by useFlashcardStudy({ withSession: true })", "Grading funnels through the shared study spine"],
    },
    {
      url: "/education/flashcards/admin",
      label: "This admin map",
      description: "Per-feature resource index (admin-gated).",
      filePath: "app/(core)/education/flashcards/admin/page.tsx",
      status: "Live",
    },
  ],

  components: [
    {
      name: "FlashcardsHome",
      filePath: "features/flashcards/components/home/FlashcardsHome.tsx",
      description: "List-first home: loads listSets(), renders set cards with Study affordances + disabled New-set.",
      tier: "internal",
    },
    {
      name: "SetDetailView",
      filePath: "features/flashcards/components/set-detail/SetDetailView.tsx",
      description: "Set detail: header + card-peek grid (detail-presence badges) + Study button + back.",
      tier: "internal",
    },
    {
      name: "StudySurface",
      filePath: "features/flashcards/components/study/StudySurface.tsx",
      description: "Focused study session over useFlashcardStudy; flip/grade/keyboard + completion summary.",
      tier: "internal",
    },
    {
      name: "CanvasFlashcardsView",
      filePath: "features/flashcards/components/CanvasFlashcardsView.tsx",
      description: "Inline canvas study view for a chat-materialized set (the grade-wiring reference).",
      tier: "internal",
    },
    {
      name: "FlashcardItem",
      filePath: "components/mardown-display/blocks/flashcards/FlashcardItem.tsx",
      description: "The canonical card visual: 3D flip + onReview grade buttons. Reused by every study surface.",
      tier: "internal",
    },
    {
      name: "FlashcardsBlock (render block)",
      filePath: "components/mardown-display/blocks/flashcards/FlashcardsBlock.tsx",
      description: "Markdown/stream render block that surfaces a flashcard set inline in chat.",
      tier: "internal",
    },
  ],

  reduxSlices: [],

  relatedFeatures: [
    {
      name: "Education Hub",
      adminUrl: "/education/admin",
      description: "Flashcards is an app-tool under /education; the hub owns the tools registry + access tiers.",
    },
    {
      name: "Canvas / Artifacts",
      description: "Chat-generated sets materialize as canvas_items linked to fc_set (CanvasFlashcardsView studies them).",
    },
    {
      name: "Files",
      description: "Card source lineage + media (illustration/audio) are fc_card → file association edges.",
    },
  ],
};
