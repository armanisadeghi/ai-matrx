/**
 * Central registry of all `SurfaceManifest` declarations.
 *
 * This file is the **single source of truth** for what runtime values each
 * surface promises to supply. Mirrored into `ui.ui_surface_value` via
 * the manifest sync endpoint at `POST /api/admin/surfaces/sync-manifests`.
 *
 * Adding a new surface:
 *   1. Create `<surface-slug>.manifest.ts` in this directory (see README).
 *   2. Export a `SurfaceManifest` from it.
 *   3. Add it to `RAW_MANIFESTS` below (`ALL_MANIFESTS` is derived).
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
import { pdfExtractorManifest } from "./pdf-extractor.manifest";
import { extractorChunkerManifest } from "./extractor-chunker.manifest";
import { analysisStudioManifest } from "./analysis-studio.manifest";
import { scannerManifest } from "./scanner.manifest";
import { transcriptsManifest } from "./transcripts.manifest";
import { transcriptsCleanupManifest } from "./transcripts-cleanup.manifest";
import { transcriptScribeManifest } from "./transcript-scribe.manifest";
import { agentBuilderManifest } from "./agent-builder.manifest";
import { chatManifest } from "./chat.manifest";
import { assistantMessageManifest } from "./assistant-message.manifest";
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
import { warRoomThreadManifest } from "./war-room-thread.manifest";
import { warRoomManifest } from "./war-room.manifest";
import { cmsManifest } from "./cms.manifest";
import { cmsSiteManifest } from "./cms-site.manifest";
import { cmsPageManifest } from "./cms-page.manifest";
import { cmsComponentManifest } from "./cms-component.manifest";
import { htmlPageManifest } from "./html-page.manifest";

/**
 * Manifests exactly as authored. Do NOT consume directly — generic baselines
 * are injected below. Use `ALL_MANIFESTS`.
 */
const RAW_MANIFESTS: readonly SurfaceManifest[] = [
  notesEditorManifest,
  codeEditorManifest,
  pdfExtractorManifest,
  extractorChunkerManifest,
  analysisStudioManifest,
  scannerManifest,
  transcriptsManifest,
  transcriptsCleanupManifest,
  transcriptScribeManifest,
  agentBuilderManifest,
  chatManifest,
  assistantMessageManifest,
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
  warRoomThreadManifest,
  warRoomManifest,
  cmsManifest,
  cmsSiteManifest,
  cmsPageManifest,
  cmsComponentManifest,
  htmlPageManifest,
];

// ---------------------------------------------------------------------------
// Surface inheritance (v1) — `inheritsFrom` resolution.
//
// A child manifest inherits its parent's values, agent roles, config
// namespaces, and evidence sources, overriding per key.
// Parent entries come FIRST so child declarations win, mirroring the
// launch-time binding-layer merge (parent layers weakest, child strongest —
// resolved in bind-agent-to-surface.service.ts `fetchSurfaceBindingLayers`).
//
// Guards are LOUD by design: an unknown parent, a cycle, or a chain deeper
// than MAX_INHERITANCE_DEPTH throws at module init — the build/dev server
// fails instead of silently dropping inherited values.
// ---------------------------------------------------------------------------

const MAX_INHERITANCE_DEPTH = 3;

const RAW_INDEX: ReadonlyMap<string, SurfaceManifest> = new Map(
  RAW_MANIFESTS.map((m) => [m.surfaceName, m] as const),
);

/**
 * Parent chain for a surface, ROOT FIRST (e.g. child of a child returns
 * `[grandparent, parent]`). Unknown surfaces return `[]`. Throws on cycles
 * and on chains deeper than MAX_INHERITANCE_DEPTH.
 */
export function getSurfaceAncestry(surfaceName: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([surfaceName]);
  let cur = RAW_INDEX.get(surfaceName)?.inheritsFrom;
  while (cur) {
    if (seen.has(cur)) {
      throw new Error(
        `[surfaces] inheritsFrom CYCLE detected at "${cur}" (from "${surfaceName}"). ` +
          `Fix the manifest chain: ${[...seen].join(" → ")} → ${cur}`,
      );
    }
    const parent = RAW_INDEX.get(cur);
    if (!parent) {
      throw new Error(
        `[surfaces] "${surfaceName}" inheritsFrom unknown surface "${cur}" — ` +
          `the parent must be a registered manifest in registry.ts`,
      );
    }
    seen.add(cur);
    chain.unshift(cur);
    if (chain.length > MAX_INHERITANCE_DEPTH) {
      throw new Error(
        `[surfaces] inheritance chain for "${surfaceName}" exceeds depth ${MAX_INHERITANCE_DEPTH}: ` +
          chain.join(" → "),
      );
    }
    cur = parent.inheritsFrom;
  }
  return chain;
}

/** Merge parent → child (child wins) for all inheritable declarations. */
function withInheritance(m: SurfaceManifest): SurfaceManifest {
  const ancestry = getSurfaceAncestry(m.surfaceName);
  if (ancestry.length === 0) return m;

  const lineage = [
    ...ancestry.map((name) => {
      const layer = RAW_INDEX.get(name);
      if (!layer) {
        throw new Error(`[surfaces] missing inherited manifest "${name}"`);
      }
      return layer;
    }),
    m,
  ];

  const valuesByName = new Map<string, SurfaceManifest["values"][number]>();
  const rolesByName = new Map<
    string,
    NonNullable<SurfaceManifest["agentRoles"]>[number]
  >();
  const nsByName = new Map<
    string,
    NonNullable<SurfaceManifest["configNamespaces"]>[number]
  >();
  const evidenceByIdentity = new Map<
    string,
    NonNullable<SurfaceManifest["evidenceSources"]>[number]
  >();
  for (const layer of lineage) {
    for (const v of layer.values) valuesByName.set(v.name, v);
    for (const r of layer.agentRoles ?? []) rolesByName.set(r.name, r);
    for (const n of layer.configNamespaces ?? []) nsByName.set(n.namespace, n);
    for (const source of layer.evidenceSources ?? []) {
      evidenceByIdentity.set(`${source.kind}:${source.idValue}`, source);
    }
  }

  return {
    ...m,
    values: Array.from(valuesByName.values()),
    ...(rolesByName.size > 0
      ? { agentRoles: Array.from(rolesByName.values()) }
      : {}),
    ...(nsByName.size > 0
      ? { configNamespaces: Array.from(nsByName.values()) }
      : {}),
    ...(evidenceByIdentity.size > 0
      ? { evidenceSources: Array.from(evidenceByIdentity.values()) }
      : {}),
  };
}

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

/**
 * All registered surface manifests, with inheritance resolved (parent values /
 * roles / config namespaces / evidence sources merged in, child wins per key) and generic
 * baselines guaranteed.
 */
export const ALL_MANIFESTS: readonly SurfaceManifest[] = RAW_MANIFESTS.map(
  (m) => withInjectedBaselines(withInheritance(m)),
);

/** Map of `surfaceName → manifest` for O(1) lookup. */
const MANIFEST_INDEX: ReadonlyMap<string, SurfaceManifest> = new Map(
  ALL_MANIFESTS.map((m) => [m.surfaceName, m] as const),
);

/** Get a manifest by surface name. Returns `undefined` when no manifest is registered. */
export function getManifest(surfaceName: string): SurfaceManifest | undefined {
  return MANIFEST_INDEX.get(surfaceName);
}

/**
 * Get the manifest exactly as it was authored, before inherited declarations
 * and generic baseline values are applied. Admin tooling uses this to explain
 * declaration provenance; runtime consumers should continue using
 * `getManifest()`.
 */
export function getRawManifest(
  surfaceName: string,
): SurfaceManifest | undefined {
  return RAW_INDEX.get(surfaceName);
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
