/**
 * Surface manifest — Documentation Admin (`matrx-admin/documentation`).
 *
 * ADMIN SURFACE. Drives `/administration/documentation/**` — the Feature
 * Docs browser over `admin.feature_docs` (markdown synced from the repo):
 *
 *   /administration/documentation                              hub (AdminDomainDirectory — static link directory, no data)
 *   /administration/documentation/feature-docs                  redirects to .../codebase
 *   /administration/documentation/feature-docs/codebase          zone=codebase table (app/, features/, components/)
 *   /administration/documentation/feature-docs/docs              zone=docs table (root docs/ only)
 *   /administration/documentation/feature-docs/dotdirs            hub of tooling dot-dirs (.claude/, .agents/, …)
 *   /administration/documentation/feature-docs/dotdirs/[slug]     zone=dotdir table, scoped to one dot-dir
 *   /administration/documentation/feature-docs/view/[[...path]]   one doc's rendered markdown
 *
 * What an agent bound here may safely do: read whichever doc/table state is
 * populated and summarize, explain, or answer questions about the doc's
 * content — e.g. "what does this FEATURE.md say about write targets",
 * "which codebase docs haven't synced since HEAD". Nothing on this surface
 * has a write target — feature_docs is populated by a one-way sync job
 * (repo markdown → DB), so there is no in-page edit form to write into.
 *
 * EMITTER WIRED (readiness: partial) for the two easy, safe halves:
 *   - Navigation (documentation_section / feature_docs_zone / feature_docs_dot_dir)
 *     → `features/feature-docs/components/FeatureDocsShell.tsx` (mounted on
 *     every codebase/docs/dotdirs/dotdir_detail page — it is the one client
 *     component shared by all of them).
 *   - Doc viewer (current_doc_path / current_doc) → a small client wrapper,
 *     `features/feature-docs/components/FeatureDocViewerRuntime.tsx`, mounted
 *     around `BasicMarkdownContent` in the (Server Component) view page —
 *     nested INSIDE the shell's depth, so while a doc is open its scope wins.
 *
 * NOT WIRED: `feature_docs_rows` / `feature_docs_table_filters` (the table's
 * loaded rows, sort, and column filters) live entirely inside
 * `FeatureDocsTable`'s own `useState`, with no prop seam to publish from
 * today — left for a follow-up pass.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_DOCUMENTATION_SURFACE_NAME = "matrx-admin/documentation";

const groups: SurfaceValueGroup[] = [
  {
    key: "navigation",
    label: "Documentation navigation",
    sortOrder: 100,
    description: "Which part of the Feature Docs browser is active.",
  },
  {
    key: "browser",
    label: "Feature docs browser",
    sortOrder: 200,
    description:
      "The codebase/docs/dotdir table's loaded rows, sort, and column filters.",
  },
  {
    key: "doc_viewer",
    label: "Doc viewer",
    sortOrder: 300,
    description: "The single markdown doc open on the view page.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Navigation ───────────────────────────────────────────────────────
  {
    name: "documentation_section",
    label: "Documentation section",
    description:
      'Which part of the Feature Docs browser is active: "hub" (link directory), "codebase", "docs", "dotdirs" (the dot-dir picker), "dotdir_detail" (one dot-dir\'s table), or "view" (a single rendered doc). Always present — each emitter declares which one it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 100,
    group: "navigation",
  },
  {
    name: "feature_docs_zone",
    label: "Feature docs zone",
    description:
      'Which table zone the browser is scoped to: "codebase" (app/, features/, components/ — excludes docs/ and tooling dirs), "docs" (root docs/ only), or "dotdir" (one tooling dot-dir). Present on documentation_section=codebase|docs|dotdir_detail.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 110,
    group: "navigation",
  },
  {
    name: "feature_docs_dot_dir",
    label: "Feature docs dot-dir",
    description:
      "The tooling dot-dir the table is scoped to (e.g. \".claude\", \".agents\"). Present only on documentation_section=dotdir_detail.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 120,
    group: "navigation",
  },
  {
    name: "feature_docs_dot_dirs_list",
    label: "Feature docs dot-dirs list",
    description:
      "Every tooling dot-dir offered on the picker (e.g. \".claude\", \".agents\", \".codex\"). Present only on documentation_section=dotdirs.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    autoContext: false,
    sortOrder: 130,
    group: "navigation",
  },

  // ── Browser table ────────────────────────────────────────────────────
  {
    name: "feature_docs_rows",
    label: "Feature docs table rows",
    description:
      "Every admin.feature_docs row matching the current zone (path, slug, title, area, content_hash, sync_base_hash, sync_base_commit, synced_at, updated_at, version, deleted_at). Present on documentation_section=codebase|docs|dotdir_detail.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    sortOrder: 200,
    group: "browser",
  },
  {
    name: "feature_docs_table_filters",
    label: "Feature docs table filters",
    description:
      "The table's current { sortField, sortDirection, filters } (per-column text filters, e.g. by path/title/area). Present on documentation_section=codebase|docs|dotdir_detail.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 210,
    group: "browser",
  },

  // ── Doc viewer ───────────────────────────────────────────────────────
  {
    name: "current_doc_path",
    label: "Current doc path",
    description:
      "Repo-relative path of the doc open on the view page (e.g. \"features/notes/FEATURE.md\"). Present only on documentation_section=view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 300,
    group: "doc_viewer",
  },
  {
    name: "current_doc",
    label: "Current doc",
    description:
      "The full loaded admin.feature_docs record for current_doc_path: { id, path, slug, title, area, content, content_hash, sync_base_hash, sync_base_commit, synced_at, updated_at, version, metadata }. Present only on documentation_section=view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    sortOrder: 310,
    group: "doc_viewer",
  },
];

export const adminDocumentationManifest: SurfaceManifest = {
  surfaceName: ADMIN_DOCUMENTATION_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Navigation (documentation_section/feature_docs_zone/feature_docs_dot_dir/feature_docs_dot_dirs_list) is wired and real via FeatureDocsShell. The doc viewer (current_doc_path/current_doc) is wired and real via FeatureDocViewerRuntime, nested inside the shell's provider depth. feature_docs_rows and feature_docs_table_filters are declared (THE COMPLETENESS LAW) but NOT emitted — they live inside FeatureDocsTable's own useState with no prop seam to publish from today; left for a follow-up pass.",
  label: "Documentation Admin",
  urlPattern: "/administration/documentation",
  intro: `<surface_intro>
This is an ADMIN surface: the Feature Docs browser at /administration/documentation, over admin.feature_docs — markdown synced one-way from the repo (app/, features/, components/, docs/, and tooling dot-dirs like .claude/).

documentation_section tells you which part is active: "codebase"/"docs"/"dotdir_detail" (a sortable/filterable table of synced docs, scoped by feature_docs_zone and — for dotdir_detail — feature_docs_dot_dir), "dotdirs" (the picker listing every tooling dot-dir), or "view" (one doc's full rendered markdown, in current_doc).

Only the values matching the current documentation_section are populated — everything else is absent, not stale. This surface has no write targets: feature_docs is a one-way sync target (repo markdown → DB), so there is nothing here for an agent to write back into — treat every doc as read-only reference material to summarize or answer questions from, and note its synced_at/sync_base_commit when currency matters.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminDocumentationScope(values: {
  // alwaysAvailable: true → required
  documentation_section:
    | "hub"
    | "codebase"
    | "docs"
    | "dotdirs"
    | "dotdir_detail"
    | "view";
  // alwaysAvailable: false → optional
  context?: Record<string, unknown>;
  feature_docs_zone?: "codebase" | "docs" | "dotdir";
  feature_docs_dot_dir?: string;
  feature_docs_dot_dirs_list?: string[];
  feature_docs_rows?: unknown[];
  feature_docs_table_filters?: Record<string, unknown>;
  current_doc_path?: string;
  current_doc?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
