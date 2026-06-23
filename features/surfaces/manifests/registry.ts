/**
 * Central registry of all `SurfaceManifest` declarations.
 *
 * This file is the **single source of truth** for what runtime values each
 * surface promises to supply. Mirrored into `public.ui_surface_value` via
 * the manifest sync endpoint at `POST /api/admin/surfaces/sync-manifests`.
 *
 * Adding a new surface:
 *   1. Create `<surface-slug>.manifest.ts` in this directory (see README).
 *   2. Export a `SurfaceManifest` from it.
 *   3. Add it to `ALL_MANIFESTS` below.
 *   4. Run the manifest sync from the Surfaces admin (or hit the API).
 *
 * Removing a manifest does NOT delete its DB rows automatically — the sync
 * endpoint reports the drift and the admin chooses to apply the deletion.
 * This is intentional: code-first ownership doesn't mean code-first
 * destruction.
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import { BASELINE_VALUES, mergeBaselineValues } from "./_baseline.manifest";
import { notesEditorManifest } from "./notes-editor.manifest";
import { codeEditorManifest } from "./code-editor.manifest";
import { pdfWidgetsManifest } from "./pdf-widgets.manifest";
import { contentExtractorManifest } from "./content-extractor.manifest";
import { transcriptsManifest } from "./transcripts.manifest";
import { transcriptsCleanupManifest } from "./transcripts-cleanup.manifest";
import { agentBuilderManifest } from "./agent-builder.manifest";
import { chatManifest } from "./chat.manifest";
import { agentRunManifest } from "./agent-run.manifest";
import { scraperManifest } from "./scraper.manifest";
import { documentsManifest } from "./documents.manifest";
import { researchManifest } from "./research.manifest";
import { tasksManifest } from "./tasks.manifest";
import { dataTablesManifest } from "./data-tables.manifest";
import { filesManifest } from "./files.manifest";
import { projectsManifest } from "./projects.manifest";
import { messagesManifest } from "./messages.manifest";
import { listsManifest } from "./lists.manifest";
import { canvasManifest } from "./canvas.manifest";
import { aiResultsManifest } from "./ai-results.manifest";
import { agentAdvancedEditorManifest } from "./agent-advanced-editor.manifest";
import { mermaidEditorManifest } from "./mermaid-editor.manifest";
import { ragSearchManifest } from "./rag-search.manifest";
import { workingDocumentManifest } from "./working-document.manifest";
import { scratchpadManifest } from "./scratchpad.manifest";

/**
 * Manifests exactly as authored. Do NOT consume directly — generic baselines
 * are injected below. Use `ALL_MANIFESTS`.
 */
const RAW_MANIFESTS: readonly SurfaceManifest[] = [
  notesEditorManifest,
  codeEditorManifest,
  pdfWidgetsManifest,
  contentExtractorManifest,
  transcriptsManifest,
  transcriptsCleanupManifest,
  agentBuilderManifest,
  chatManifest,
  agentRunManifest,
  scraperManifest,
  documentsManifest,
  researchManifest,
  tasksManifest,
  dataTablesManifest,
  filesManifest,
  projectsManifest,
  messagesManifest,
  listsManifest,
  canvasManifest,
  aiResultsManifest,
  agentAdvancedEditorManifest,
  mermaidEditorManifest,
  ragSearchManifest,
  workingDocumentManifest,
  scratchpadManifest,
];

/**
 * Guarantee EVERY surface declares the full generic baseline set (`selection`,
 * `text_before`, `text_after`, `content`, `context`). This is the platform
 * half of the "generic values are always available" contract: an agent author
 * can bind a variable to a generic value on ANY surface, even one whose
 * manifest forgot to spread the baselines — the regression that dropped
 * `text_before`/`text_after` from ~14 surfaces during the v2 transition, and
 * that this injection makes structurally impossible going forward.
 *
 * Idempotent and non-destructive: `mergeBaselineValues` lets a surface's own
 * same-named value win, so a manifest that already declares (or customizes) a
 * baseline keeps its version; only the missing baselines are added. A surface
 * with genuinely no text/content concept opts out via `skipBaselineValues`.
 */
function withInjectedBaselines(m: SurfaceManifest): SurfaceManifest {
  if (m.skipBaselineValues) return m;
  return {
    ...m,
    values: mergeBaselineValues(Object.values(BASELINE_VALUES), m.values),
  };
}

/** All registered surface manifests, with generic baselines guaranteed. */
export const ALL_MANIFESTS: readonly SurfaceManifest[] =
  RAW_MANIFESTS.map(withInjectedBaselines);

/** Map of `surfaceName → manifest` for O(1) lookup. */
const MANIFEST_INDEX: ReadonlyMap<string, SurfaceManifest> = new Map(
  ALL_MANIFESTS.map((m) => [m.surfaceName, m] as const),
);

/** Get a manifest by surface name. Returns `undefined` when no manifest is registered. */
export function getManifest(surfaceName: string): SurfaceManifest | undefined {
  return MANIFEST_INDEX.get(surfaceName);
}

/** All known manifests, in declaration order. */
export function getAllManifests(): readonly SurfaceManifest[] {
  return ALL_MANIFESTS;
}

/** All surface names that have a manifest declared. */
export function getRegisteredSurfaceNames(): string[] {
  return ALL_MANIFESTS.map((m) => m.surfaceName);
}

/**
 * Look up a single `SurfaceValue` by `(surfaceName, valueName)`. Useful in
 * the resolver and in mapping editors for hover-cards / autocomplete.
 */
export function getSurfaceValue(surfaceName: string, valueName: string) {
  const manifest = MANIFEST_INDEX.get(surfaceName);
  if (!manifest) return undefined;
  return manifest.values.find((v) => v.name === valueName);
}
