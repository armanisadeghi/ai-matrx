// features/admin/feature-maps/feature-map-registry.ts
//
// THE list of per-feature admin maps — every `app/(core)/**/admin/page.tsx`
// (the `/[feature]/admin` contract in features/admin/FEATURE.md). Read by the
// "Feature maps" admin page (/administration/documentation/feature-maps), so a
// map is reachable from the admin menu instead of only by typing its URL.
//
// A new map page MUST be added here: `__tests__/feature-map-registry.test.ts`
// scans the filesystem and fails on any map page missing from this list (and
// on any entry whose page no longer exists). Runtime filesystem discovery is
// not available on the deployed server, so the list is data plus that guard.
//
// Not a map: `/organizations/[orgId]/admin` (an organization's own admin
// dashboard, opened from that organization) — the guard skips dynamic routes.

export interface FeatureMapEntry {
  /** The map's URL — `/<feature>/admin`. */
  href: string;
  /** The feature's name as its map names it. */
  label: string;
}

export const FEATURE_MAPS: readonly FeatureMapEntry[] = [
  { href: "/agents/admin", label: "Agents" },
  { href: "/work/admin", label: "AI Work" },
  { href: "/cms/admin", label: "CMS" },
  { href: "/commerce/intake/admin", label: "Commerce Intake" },
  { href: "/commerce/review/admin", label: "Commerce Review" },
  { href: "/crm/admin", label: "CRM" },
  { href: "/dictionary/admin", label: "Custom Dictionary" },
  { href: "/education/admin", label: "Education Hub" },
  { href: "/files/admin", label: "Files" },
  { href: "/education/flashcards/admin", label: "Flashcards" },
  { href: "/knowledge/admin", label: "Knowledge" },
  { href: "/rag/admin", label: "Knowledge (RAG)" },
  { href: "/marketing/admin", label: "Marketing" },
  { href: "/masterwork/admin", label: "Masterwork" },
  { href: "/camera/admin", label: "Media Capture" },
  { href: "/messages/admin", label: "Messages" },
  { href: "/knowledge/extractions/admin", label: "Page Extraction" },
  { href: "/tools/pdf-extractor/admin", label: "PDF" },
  { href: "/print/admin", label: "Print" },
  { href: "/tools/product-capture/admin", label: "Product Capture" },
  { href: "/education/subjects/quick-math/admin", label: "Quick Math authoring" },
  { href: "/reports/admin", label: "Reports" },
  { href: "/shapes/admin", label: "Shapes" },
  { href: "/education/learn/admin", label: "Study guide authoring" },
  { href: "/tool-call-visualization/admin", label: "Tool Call Visualization" },
  { href: "/transcripts/admin", label: "Transcripts" },
  { href: "/war-room/admin", label: "War Room" },
];
