/**
 * Lightweight favicon route data — no icon imports, no JSX, server-safe.
 *
 * Single source of truth for route → favicon color/letter mapping.
 * `favicon-utils.ts` imports from here. Nav labels/hrefs/icons live in
 * `features/shell/constants/nav-data.ts`; UI links with icons are built in
 * `features/shell/navigation/navigationLinks.tsx`.
 */

export interface FaviconConfig {
  color: string;
  letter?: string;
  emoji?: string;
}

export interface FaviconRouteEntry {
  href: string;
  favicon?: FaviconConfig;
}

export const faviconRouteData: FaviconRouteEntry[] = [
  { href: "/dashboard", favicon: { color: "#0ea5e9", letter: "H" } },
  { href: "/agents", favicon: { color: "#f43f5e", letter: "G" } },
  { href: "/prompt-apps", favicon: { color: "#059669", letter: "Pa" } },
  { href: "/research", favicon: { color: "#7c3aed", letter: "R" } },
  { href: "/chat", favicon: { color: "#2563eb", letter: "C" } },
  { href: "/organizations", favicon: { color: "#b91c1c", letter: "O" } },
  { href: "/notes", favicon: { color: "#d97706", letter: "N" } },
  { href: "/tasks", favicon: { color: "#16a34a", letter: "T" } },
  { href: "/projects", favicon: { color: "#4f46e5", letter: "P" } },
  { href: "/files", favicon: { color: "#0284c7", letter: "F" } },
  {
    href: "/tools/pdf-extractor",
    favicon: { color: "#ea580c", letter: "E" },
  },
  {
    href: "/transcripts",
    favicon: { color: "#9333ea", letter: "M" },
  },
  { href: "/data", favicon: { color: "#0891b2", letter: "L" } },
  { href: "/voice", favicon: { color: "#be185d", letter: "Vc" } },
  {
    href: "/demo/voice/voice-manager",
    favicon: { color: "#ea580c", letter: "Vo" },
  },
  {
    href: "/image-editing/public-image-search",
    favicon: { color: "#0d9488", letter: "Im" },
  },
  { href: "/images", favicon: { color: "#ec4899", letter: "I" } },
  { href: "/scraper", favicon: { color: "#3730a3", letter: "H" } },
  { href: "/sandbox", favicon: { color: "#c2410c", letter: "Z" } },
  { href: "/messages", favicon: { color: "#db2777", letter: "V" } },
  { href: "/rag/data-stores", favicon: { color: "#b45309", letter: "Ds" } },
  { href: "/rag/search", favicon: { color: "#ca8a04", letter: "Rq" } },
  { href: "/rag/library", favicon: { color: "#a16207", letter: "Rl" } },
  { href: "/rag/repositories", favicon: { color: "#854d0e", letter: "Rp" } },
  { href: "/rag", favicon: { color: "#92400e", letter: "K" } },
  { href: "/podcast", favicon: { color: "#e11d48", letter: "J" } },
  { href: "/schedules", favicon: { color: "#0d9488", letter: "C" } },
  { href: "/artifacts", favicon: { color: "#78716c", letter: "Ar" } },
  { href: "/legal", favicon: { color: "#1e40af", letter: "Lg" } },
  { href: "/cms", favicon: { color: "#0f766e", letter: "Cn" } },
  { href: "/knowledge", favicon: { color: "#6366f1", letter: "Kn" } },
  { href: "/suggestions", favicon: { color: "#a21caf", letter: "Sg" } },
  { href: "/features", favicon: { color: "#64748b", letter: "Ft" } },
  { href: "/context-items", favicon: { color: "#0369a1", letter: "Ci" } },
  { href: "/invitations", favicon: { color: "#57534e", letter: "In" } },
  { href: "/code", favicon: { color: "#4f46e5", letter: "K" } },
  { href: "/workflows", favicon: { color: "#6d28d9", letter: "Q" } },
  { href: "/scopes", favicon: { color: "#047857", letter: "S" } },
  { href: "/war-room", favicon: { color: "#dc2626", letter: "W" } },
  { href: "/free", favicon: { color: "#14b8a6", letter: "Fr" } },
  { href: "/free/data-truncator", favicon: { color: "#14b8a6", letter: "Dt" } },
  { href: "/free/uuid", favicon: { color: "#14b8a6", letter: "Ui" } },
  { href: "/free/uuid/array", favicon: { color: "#14b8a6", letter: "Ua" } },
  {
    href: "/free/zip-code-heatmap",
    favicon: { color: "#14b8a6", letter: "Zh" },
  },
  {
    href: "/free/games/matrx-jump/character-maker",
    favicon: { color: "#14b8a6", letter: "Cm" },
  },
  {
    href: "/free/games/matrx-jump/jump-with-settings",
    favicon: { color: "#14b8a6", letter: "Js" },
  },
  {
    href: "/free/games/matrx-jump",
    favicon: { color: "#14b8a6", letter: "Mj" },
  },
  {
    href: "/free/games/tic-tac-toe",
    favicon: { color: "#14b8a6", letter: "Tt" },
  },
  { href: "/reports", favicon: { color: "#44403c", letter: "Rt" } },
  {
    href: "/knowledge/extractions",
    favicon: { color: "#7e22ce", letter: "Ke" },
  },
  { href: "/welcome", favicon: { color: "#06b6d4", letter: "We" } },
  { href: "/dictionary", favicon: { color: "#84cc16", letter: "Dc" } },
  { href: "/agent-context", favicon: { color: "#0891b2", letter: "X" } },
  { href: "/agent-apps", favicon: { color: "#059669", letter: "A" } },
  { href: "/documents", favicon: { color: "#4f46e5", letter: "U" } },
  { href: "/workbooks", favicon: { color: "#16a34a", letter: "B" } },
  { href: "/settings", favicon: { color: "#475569", letter: "Y" } },
  { href: "/ai/cockpit", favicon: { color: "#7c3aed", letter: "Ac" } },
  { href: "/ai/recipes", favicon: { color: "#c026d3", letter: "Rc" } },
  { href: "/ai/runs", favicon: { color: "#0e7490", letter: "Ru" } },
  { href: "/legacy/workflows", favicon: { color: "#6d28d9", letter: "Wf" } },
  { href: "/lists", favicon: { color: "#1d4ed8", letter: "Li" } },
  { href: "/registered-results", favicon: { color: "#831843", letter: "Rr" } },
  { href: "/legacy/entity-admin", favicon: { color: "#854d0e", letter: "Ea" } },
  { href: "/administration" },
  { href: "/administration/official-components" },
  { href: "/admin" },
  { href: "/tests/forms/entity-final-test" },
  { href: "/tests/socket-tests/redux-form-test" },
  { href: "/apps", favicon: { color: "#14532d", letter: "Ah" } },
  { href: "/apps/app-builder", favicon: { color: "#4c1d95", letter: "Ab" } },
  { href: "/apps/demo", favicon: { color: "#be123c", letter: "Ad" } },
  { href: "/apps/dynamic-layouts/options" },
  { href: "/apps/all-layouts" },
  { href: "/apps/builder/hub", favicon: { color: "#1e3a8a", letter: "Bh" } },
  { href: "/tests/markdown-tests" },
  { href: "/admin/socketio" },
  { href: "/demo/many-to-many-ui/claude" },
  { href: "/demo/workflows" },
  { href: "/tests/tailwind-test" },
  { href: "/admin/registered-functions" },
  { href: "/legacy/administration/schema-manager" },
  { href: "/administration/utils/text-cleaner" },
  { href: "/tests/forms" },
  { href: "/tests/selector-test" },
  { href: "/tests/matrx-table" },
  { href: "/demo/prompt-builder" },
  { href: "/legacy/entity-crud", favicon: { color: "#0369a1", letter: "Ec" } },
  { href: "/admin/sandbox" },
  { href: "/demos" },
  {
    href: "/demos/scopes/context-lab",
    favicon: { color: "#ca8a04", letter: "Dx" },
  },
];
