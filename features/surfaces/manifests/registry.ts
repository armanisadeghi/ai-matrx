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

import type {
  ResolvedSurfaceManifest,
  ResolvedSurfaceValue,
  SurfaceManifest,
  SurfaceValueGroup,
  SurfaceValueProvenance,
} from "@/features/surfaces/types";
import { RESERVED_GROUP_KEYS } from "@/features/surfaces/types";
import { BASELINE_VALUES } from "./_baseline.manifest";
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
import { marketingManifest } from "./marketing.manifest";
import { marketingBrandManifest } from "./marketing-brand.manifest";
import { marketingSiteManifest } from "./marketing-site.manifest";
import { marketingSitePagesManifest } from "./marketing-site-pages.manifest";
import { marketingPageManifest } from "./marketing-page.manifest";
import { keywordIntelligenceManifest } from "./keyword-intelligence.manifest";
import { marketingCrawlsManifest } from "./marketing-crawls.manifest";
import { marketingCrawlManifest } from "./marketing-crawl.manifest";
import { marketingAuditManifest } from "./marketing-audit.manifest";
import { marketingAnalysisManifest } from "./marketing-analysis.manifest";
import { marketingFindingsManifest } from "./marketing-findings.manifest";
import { marketingLinksManifest } from "./marketing-links.manifest";
import { marketingBacklinksManifest } from "./marketing-backlinks.manifest";
import { marketingRanksManifest } from "./marketing-ranks.manifest";
import { marketingCoverageManifest } from "./marketing-coverage.manifest";
import { marketingSitemapsManifest } from "./marketing-sitemaps.manifest";
import { marketingDiscoveryManifest } from "./marketing-discovery.manifest";
import { marketingIntegrationsManifest } from "./marketing-integrations.manifest";
import { marketingBatchesManifest } from "./marketing-batches.manifest";
import { contentPlanManifest } from "./content-plan.manifest";
import { agentsHubManifest } from "./agents-hub.manifest";
import { organizationsManifest } from "./organizations.manifest";
import { dashboardManifest } from "./dashboard.manifest";
import { educationManifest } from "./education.manifest";
import { educationTutorManifest } from "./education-tutor.manifest";
import { educationFlashcardsManifest } from "./education-flashcards.manifest";
import { settingsManifest } from "./settings.manifest";
import { agentAppsManifest } from "./agent-apps.manifest";
import { agentConnectionsManifest } from "./agent-connections.manifest";
import { connectionsSkillsManifest } from "./connections-skills.manifest";
import { keywordResearchManifest } from "./keyword-research.manifest";
import { marketingSiteKeywordsManifest } from "./marketing-site-keywords.manifest";
import { quickTasksManifest } from "./quick-tasks.manifest";
import { taskCreateManifest } from "./task-create.manifest";
import { quickNoteSaveManifest } from "./quick-note-save.manifest";
import { filePreviewManifest } from "./file-preview.manifest";
import { imageViewerManifest } from "./image-viewer.manifest";
import { imageUploaderManifest } from "./image-uploader.manifest";
import { imagesManifest } from "./images.manifest";
import { galleryManifest } from "./gallery.manifest";
import { shareManifest } from "./share.manifest";
import { feedbackManifest } from "./feedback.manifest";
import { markdownEditorManifest } from "./markdown-editor.manifest";
import { listManagerManifest } from "./list-manager.manifest";
import { canvasViewerManifest } from "./canvas-viewer.manifest";
import { voicePadManifest } from "./voice-pad.manifest";
import { transcriptStudioManifest } from "./transcript-studio.manifest";
import { observationalMemoryManifest } from "./observational-memory.manifest";
import { agentGateManifest } from "./agent-gate.manifest";
import { agentRunHistoryManifest } from "./agent-run-history.manifest";
import { agentSettingsManifest } from "./agent-settings.manifest";
import { smartCodeEditorManifest } from "./smart-code-editor.manifest";
import { sandboxesManifest } from "./sandboxes.manifest";
import { markdownStudioManifest } from "./markdown-studio.manifest";
import { schedulesManifest } from "./schedules.manifest";
import { workbooksManifest } from "./workbooks.manifest";
import { podcastManifest } from "./podcast.manifest";
import { podcastStudioManifest } from "./podcast-studio.manifest";
import { podcastRunManifest } from "./podcast-run.manifest";

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
  // Marketing tree — parents BEFORE children is not required (inheritance
  // resolves by name), but keeps the declaration readable: hub, brand root,
  // site, then the site verticals, then cross-site ops.
  marketingManifest,
  marketingBrandManifest,
  marketingSiteManifest,
  marketingSitePagesManifest,
  marketingPageManifest,
  keywordIntelligenceManifest,
  marketingCrawlsManifest,
  marketingCrawlManifest,
  marketingAuditManifest,
  marketingAnalysisManifest,
  marketingFindingsManifest,
  marketingLinksManifest,
  marketingBacklinksManifest,
  marketingRanksManifest,
  marketingCoverageManifest,
  marketingSitemapsManifest,
  marketingDiscoveryManifest,
  marketingIntegrationsManifest,
  marketingBatchesManifest,
  // Content planning (plan schema) — sibling of the marketing fleet.
  contentPlanManifest,
  // 2026-07-24 fleet push — hub/list + workspace surfaces.
  agentsHubManifest,
  organizationsManifest,
  dashboardManifest,
  educationManifest,
  educationTutorManifest,
  educationFlashcardsManifest,
  settingsManifest,
  agentAppsManifest,
  agentConnectionsManifest,
  connectionsSkillsManifest,
  keywordResearchManifest,
  marketingSiteKeywordsManifest,
  // 2026-07-24 overlay-surface fleet — window panels are surfaces too
  // (identified by overlayId, emitters nested inside the window components).
  quickTasksManifest,
  taskCreateManifest,
  quickNoteSaveManifest,
  filePreviewManifest,
  imageViewerManifest,
  imageUploaderManifest,
  imagesManifest,
  galleryManifest,
  shareManifest,
  feedbackManifest,
  markdownEditorManifest,
  listManagerManifest,
  canvasViewerManifest,
  voicePadManifest,
  transcriptStudioManifest,
  observationalMemoryManifest,
  agentGateManifest,
  agentRunHistoryManifest,
  agentSettingsManifest,
  smartCodeEditorManifest,
  sandboxesManifest,
  markdownStudioManifest,
  schedulesManifest,
  workbooksManifest,
  podcastManifest,
  podcastStudioManifest,
  podcastRunManifest,
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

const BASELINE_NAME_SET = new Set(Object.keys(BASELINE_VALUES));

/** Group sortOrder bands. Curated groups author 0–899; the rest is reserved. */
const GENERAL_GROUP_ORDER = 850;
const INHERITED_GROUP_ORDER_BASE = 9000;
const BASELINE_GROUP_ORDER = 9900;

/**
 * Decide the canonical group key for a resolved value.
 * A baseline-named value with no explicit group ALWAYS lands in `baseline`
 * (regardless of which layer authored it) so generic values sink to the
 * bottom by construction. Inherited values ALWAYS collapse into their
 * supplying parent's `inherited:<parent>` group — a parent-declared `group`
 * key only applies on the parent's own surface (children don't declare it, so
 * honoring it here would orphan the value into an unresolvable group). Own
 * ungrouped values go to `general`.
 */
function groupKeyFor(
  value: SurfaceManifest["values"][number],
  provenance: SurfaceValueProvenance,
): string {
  if (provenance.kind === "own" && value.group) return value.group;
  if (BASELINE_NAME_SET.has(value.name)) return RESERVED_GROUP_KEYS.baseline;
  if (provenance.kind === "inherited") {
    return `${RESERVED_GROUP_KEYS.inheritedPrefix}${provenance.from}`;
  }
  if (provenance.kind === "baseline") return RESERVED_GROUP_KEYS.baseline;
  return RESERVED_GROUP_KEYS.general;
}

/**
 * Resolve one manifest: merge inheritance (child wins per key), inject the
 * generic baselines, stamp provenance + groupKey on every value, synthesize
 * the auto groups, and sort values by (group order, value sortOrder).
 *
 * Baseline injection is the platform half of the "generic values are always
 * available" contract: an agent author can bind a variable to a generic value
 * on ANY surface, even one whose manifest forgot to spread the baselines —
 * the regression that dropped `text_before`/`text_after` from ~14 surfaces
 * during the v2 transition, made structurally impossible here. A surface with
 * genuinely no text/content concept opts out via `skipBaselineValues`.
 *
 * Guards are LOUD by design: a curated group with a reserved key, or a value
 * referencing an undeclared group, throws at module init.
 */
function resolveManifest(m: SurfaceManifest): ResolvedSurfaceManifest {
  const ancestry = getSurfaceAncestry(m.surfaceName);
  const lineage: Array<{ layer: SurfaceManifest; from: string | null }> = [
    ...ancestry.map((name) => {
      const layer = RAW_INDEX.get(name);
      if (!layer) {
        throw new Error(`[surfaces] missing inherited manifest "${name}"`);
      }
      return { layer, from: name };
    }),
    { layer: m, from: null },
  ];

  // Validate curated groups.
  const curatedKeys = new Set<string>();
  for (const g of m.groups ?? []) {
    if (
      g.key === RESERVED_GROUP_KEYS.general ||
      g.key === RESERVED_GROUP_KEYS.baseline ||
      g.key.startsWith(RESERVED_GROUP_KEYS.inheritedPrefix)
    ) {
      throw new Error(
        `[surfaces] "${m.surfaceName}" declares reserved group key "${g.key}" — ` +
          `general/baseline/inherited:* are synthesized by the registry`,
      );
    }
    if (curatedKeys.has(g.key)) {
      throw new Error(
        `[surfaces] "${m.surfaceName}" declares duplicate group key "${g.key}"`,
      );
    }
    curatedKeys.add(g.key);
  }
  for (const v of m.values) {
    if (v.group && !curatedKeys.has(v.group)) {
      throw new Error(
        `[surfaces] "${m.surfaceName}" value "${v.name}" references undeclared ` +
          `group "${v.group}" — declare it in the manifest's \`groups\``,
      );
    }
  }

  const valuesByName = new Map<string, ResolvedSurfaceValue>();
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
  for (const { layer, from } of lineage) {
    for (const v of layer.values) {
      const provenance: SurfaceValueProvenance = from
        ? { kind: "inherited", from }
        : { kind: "own" };
      valuesByName.set(v.name, {
        ...v,
        provenance,
        groupKey: groupKeyFor(v, provenance),
      });
    }
    for (const r of layer.agentRoles ?? []) rolesByName.set(r.name, r);
    for (const n of layer.configNamespaces ?? []) nsByName.set(n.namespace, n);
    for (const source of layer.evidenceSources ?? []) {
      evidenceByIdentity.set(`${source.kind}:${source.idValue}`, source);
    }
  }

  if (!m.skipBaselineValues) {
    for (const baseline of Object.values(BASELINE_VALUES)) {
      if (valuesByName.has(baseline.name)) continue;
      valuesByName.set(baseline.name, {
        ...baseline,
        provenance: { kind: "baseline" },
        groupKey: RESERVED_GROUP_KEYS.baseline,
      });
    }
  }

  // Synthesize the group list: curated + general + inherited (nearest parent
  // first) + baseline, sorted by sortOrder.
  const usedGroupKeys = new Set(
    Array.from(valuesByName.values(), (v) => v.groupKey),
  );
  const groups: SurfaceValueGroup[] = [...(m.groups ?? [])];
  if (usedGroupKeys.has(RESERVED_GROUP_KEYS.general)) {
    groups.push({
      key: RESERVED_GROUP_KEYS.general,
      label: "General",
      sortOrder: GENERAL_GROUP_ORDER,
    });
  }
  for (let i = ancestry.length - 1, distance = 0; i >= 0; i--, distance++) {
    const parentName = ancestry[i];
    const key = `${RESERVED_GROUP_KEYS.inheritedPrefix}${parentName}`;
    if (!usedGroupKeys.has(key)) continue;
    const parentLabel =
      RAW_INDEX.get(parentName)?.label ?? parentName;
    groups.push({
      key,
      label: `Inherited from ${parentLabel}`,
      sortOrder: INHERITED_GROUP_ORDER_BASE + distance * 10,
    });
  }
  if (usedGroupKeys.has(RESERVED_GROUP_KEYS.baseline)) {
    groups.push({
      key: RESERVED_GROUP_KEYS.baseline,
      label: "Generic baselines",
      sortOrder: BASELINE_GROUP_ORDER,
    });
  }
  groups.sort((a, b) => a.sortOrder - b.sortOrder);

  const groupOrder = new Map(groups.map((g) => [g.key, g.sortOrder] as const));
  const values = Array.from(valuesByName.values()).sort((a, b) => {
    const ga = groupOrder.get(a.groupKey) ?? GENERAL_GROUP_ORDER;
    const gb = groupOrder.get(b.groupKey) ?? GENERAL_GROUP_ORDER;
    if (ga !== gb) return ga - gb;
    return (a.sortOrder ?? 1000) - (b.sortOrder ?? 1000);
  });

  return {
    ...m,
    values,
    groups,
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
 * All registered surface manifests, fully resolved: inheritance merged
 * (child wins per key), generic baselines guaranteed, provenance + canonical
 * group stamped on every value, groups synthesized and ordered
 * curated → general → inherited → baseline.
 */
export const ALL_MANIFESTS: readonly ResolvedSurfaceManifest[] =
  RAW_MANIFESTS.map(resolveManifest);

/** Map of `surfaceName → manifest` for O(1) lookup. */
const MANIFEST_INDEX: ReadonlyMap<string, ResolvedSurfaceManifest> = new Map(
  ALL_MANIFESTS.map((m) => [m.surfaceName, m] as const),
);

/** Get a manifest by surface name. Returns `undefined` when no manifest is registered. */
export function getManifest(
  surfaceName: string,
): ResolvedSurfaceManifest | undefined {
  return MANIFEST_INDEX.get(surfaceName);
}

/**
 * Direct children of a surface (manifests declaring `inheritsFrom` it),
 * in declaration order. The registry — not the DB mirror — is the ONE
 * hierarchy source for UI chrome.
 */
export function getSurfaceChildren(surfaceName: string): string[] {
  return RAW_MANIFESTS.filter((m) => m.inheritsFrom === surfaceName).map(
    (m) => m.surfaceName,
  );
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
export function getAllManifests(): readonly ResolvedSurfaceManifest[] {
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
