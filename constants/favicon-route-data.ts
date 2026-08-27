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
  { href: "/launchpad", favicon: { color: "#4d7c0f", letter: "UL" } },
  { href: "/dashboard", favicon: { color: "#0ea5e9", letter: "H" } },
  { href: "/work", favicon: { color: "#7c3aed", letter: "AW" } },
  { href: "/agents", favicon: { color: "#f43f5e", letter: "AG" } },
  { href: "/agent-connections", favicon: { color: "#0f172a", letter: "Ax" } },
  { href: "/assists", favicon: { color: "#0c4a6e", letter: "As" } },
  { href: "/research", favicon: { color: "#7c3aed", letter: "R" } },
  { href: "/search", favicon: { color: "#2563eb", letter: "Sr" } },
  { href: "/camera", favicon: { color: "#166534", letter: "CA" } },
  { href: "/chat", favicon: { color: "#2563eb", letter: "C" } },
  { href: "/organizations", favicon: { color: "#b91c1c", letter: "O" } },
  { href: "/notes", favicon: { color: "#d97706", letter: "N" } },
  { href: "/tasks", favicon: { color: "#16a34a", letter: "T" } },
  { href: "/projects", favicon: { color: "#4f46e5", letter: "P" } },
  { href: "/files", favicon: { color: "#0284c7", letter: "F" } },
  {
    href: "/tools/pdf-extractor",
    favicon: { color: "#ea580c", letter: "PE" },
  },
  {
    href: "/transcripts",
    favicon: { color: "#9333ea", letter: "TR" },
  },
  { href: "/data", favicon: { color: "#0891b2", letter: "DA" } },
  { href: "/voice", favicon: { color: "#be185d", letter: "V" } },
  {
    href: "/demo/voice/voice-manager",
    favicon: { color: "#ea580c", letter: "Vo" },
  },
  {
    href: "/image-editing/public-image-search",
    favicon: { color: "#0d9488", letter: "Im" },
  },
  { href: "/images", favicon: { color: "#ec4899", letter: "I" } },
  { href: "/scraper", favicon: { color: "#3730a3", letter: "SC" } },
  { href: "/sandbox", favicon: { color: "#c2410c", letter: "SB" } },
  { href: "/messages", favicon: { color: "#db2777", letter: "MS" } },
  { href: "/crm", favicon: { color: "#9f1239", letter: "CR" } },
  // SPEC-UI-IA §2.1, verbatim.
  { href: "/hr", favicon: { color: "#4f46e5", letter: "HR" } },
  { href: "/education", favicon: { color: "#1e3a8a", letter: "ED" } },
  { href: "/maps", favicon: { color: "#713f12", letter: "MP" } },
  { href: "/markdown-studio", favicon: { color: "#334155", letter: "MD" } },
  { href: "/masterwork", favicon: { color: "#be123c", letter: "M" } },
  { href: "/surfaces", favicon: { color: "#075985", letter: "SF" } },
  { href: "/vault", favicon: { color: "#065f46", letter: "VA" } },
  { href: "/vision-interview", favicon: { color: "#9d174d", letter: "VI" } },
  {
    href: "/knowledge/data-stores",
    favicon: { color: "#b45309", letter: "Ds" },
  },
  { href: "/knowledge/search", favicon: { color: "#ca8a04", letter: "Rq" } },
  { href: "/knowledge/library", favicon: { color: "#a16207", letter: "Rl" } },
  {
    href: "/knowledge/repositories",
    favicon: { color: "#854d0e", letter: "Rp" },
  },
  { href: "/knowledge", favicon: { color: "#92400e", letter: "K" } },
  // Compatibility route retained until the structural Knowledge cutover.
  { href: "/rag", favicon: { color: "#92400e", letter: "K" } },
  { href: "/podcast", favicon: { color: "#e11d48", letter: "PO" } },
  { href: "/schedules", favicon: { color: "#0d9488", letter: "SD" } },
  { href: "/artifacts", favicon: { color: "#78716c", letter: "AR" } },
  { href: "/legal", favicon: { color: "#1e40af", letter: "LG" } },
  { href: "/cms", favicon: { color: "#0f766e", letter: "CM" } },
  { href: "/knowledge-graph", favicon: { color: "#312e81", letter: "KG" } },
  { href: "/suggestions", favicon: { color: "#a21caf", letter: "Sg" } },
  { href: "/features", favicon: { color: "#64748b", letter: "Ft" } },
  { href: "/context-items", favicon: { color: "#0369a1", letter: "Ci" } },
  { href: "/invitations", favicon: { color: "#57534e", letter: "In" } },
  { href: "/code", favicon: { color: "#4f46e5", letter: "CD" } },
  { href: "/workflows", favicon: { color: "#6d28d9", letter: "WF" } },
  { href: "/scopes", favicon: { color: "#047857", letter: "S" } },
  { href: "/war-room", favicon: { color: "#dc2626", letter: "WR" } },
  { href: "/marketing", favicon: { color: "#15803d", letter: "Mk" } },
  {
    href: "/google-analytics-youtube-review",
    favicon: { color: "#1d4ed8", letter: "GY" },
  },
  { href: "/free", favicon: { color: "#14b8a6", letter: "Fr" } },
  {
    href: "/appointment-reminder",
    favicon: { color: "#0e7490", letter: "Ap" },
  },
  { href: "/contact", favicon: { color: "#9a3412", letter: "Co" } },
  { href: "/download", favicon: { color: "#2563eb", letter: "Dl" } },
  { href: "/how-it-works", favicon: { color: "#7c2d12", letter: "Hw" } },
  { href: "/loop", favicon: { color: "#14532d", letter: "Lp" } },
  { href: "/matrx-extend-demo", favicon: { color: "#5b21b6", letter: "Me" } },
  { href: "/pricing", favicon: { color: "#115e59", letter: "Pr" } },
  { href: "/privacy-policy", favicon: { color: "#374151", letter: "PP" } },
  { href: "/seo", favicon: { color: "#166534", letter: "Se" } },
  { href: "/sms", favicon: { color: "#155e75", letter: "Sm" } },
  {
    href: "/terms-and-conditions",
    favicon: { color: "#3f3f46", letter: "Tc" },
  },
  { href: "/terms-of-service", favicon: { color: "#27272a", letter: "Ts" } },
  { href: "/free/data-truncator", favicon: { color: "#14b8a6", letter: "Dt" } },
  { href: "/free/uuid", favicon: { color: "#14b8a6", letter: "Ui" } },
  { href: "/free/uuid/array", favicon: { color: "#14b8a6", letter: "Ua" } },
  {
    href: "/free/zip-code-heatmap",
    favicon: { color: "#14b8a6", letter: "Zh" },
  },
  {
    href: "/free/games/matrx-jump/character-maker",
    favicon: { color: "#14b8a6", letter: "CC" },
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
  { href: "/agent-apps", favicon: { color: "#059669", letter: "AA" } },
  { href: "/shapes", favicon: { color: "#8b5cf6", letter: "Sh" } },
  { href: "/documents", favicon: { color: "#4f46e5", letter: "DO" } },
  { href: "/workbooks", favicon: { color: "#16a34a", letter: "WB" } },
  { href: "/settings", favicon: { color: "#475569", letter: "ST" } },
  { href: "/trash", favicon: { color: "#52525b", letter: "Td" } },
  { href: "/ai/cockpit", favicon: { color: "#7c3aed", letter: "Ac" } },
  { href: "/ai/recipes", favicon: { color: "#c026d3", letter: "Rc" } },
  { href: "/legacy/workflows", favicon: { color: "#6d28d9", letter: "Wf" } },
  { href: "/lists", favicon: { color: "#1d4ed8", letter: "Li" } },
  { href: "/registered-results", favicon: { color: "#831843", letter: "Rr" } },
  { href: "/legacy/entity-admin", favicon: { color: "#854d0e", letter: "Ea" } },
  { href: "/administration" },
  { href: "/administration/ui/official-components" },
  { href: "/admin" },
  { href: "/tests/forms/entity-final-test" },
  { href: "/tests/socket-tests/redux-form-test" },
  { href: "/tests/markdown-tests" },
  { href: "/admin/socketio" },
  { href: "/demo/many-to-many-ui/claude" },
  { href: "/demo/workflows" },
  { href: "/tests/tailwind-test" },
  { href: "/admin/registered-functions" },
  { href: "/legacy/administration/schema-manager" },
  { href: "/administration/utilities/utils/text-cleaner" },
  { href: "/tests/forms" },
  { href: "/tests/selector-test" },
  { href: "/demo/prompt-builder" },
  { href: "/legacy/entity-crud", favicon: { color: "#0369a1", letter: "Ec" } },
  { href: "/admin/sandbox" },
  { href: "/demos" },
  {
    href: "/demos/scopes/context-lab",
    favicon: { color: "#ca8a04", letter: "Dx" },
  },
];
