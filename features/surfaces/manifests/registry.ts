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

import {
  registerLoadedValueDeclarations,
  type LoadedValueDeclarationLookup,
} from "@/features/surfaces/runtime/loaded-value-check";
import { createDeclarationRegistry } from "@ai-matrx/alchemy/declare";
import type {
  ResolvedSurfaceManifest,
  SurfaceManifest,
} from "@/features/surfaces/types";
import { agentRolesExtension } from "@/features/surfaces/declare/surface-declare";
import { BASELINE_VALUES, PLATFORM_RESERVED_NAMES } from "./_baseline.manifest";
import { notesEditorManifest } from "./notes-editor.manifest";
import { agentShortcutsManifest } from "./agent-shortcuts.manifest";
import { aiWorkManifest } from "./ai-work.manifest";
import { aiWorkComposerManifest } from "./ai-work-composer.manifest";
import { aiWorkConversationsManifest } from "./ai-work-conversations.manifest";
import { imageManagerManifest } from "./image-manager.manifest";
import { visionInterviewManifest } from "./vision-interview.manifest";
import { artifactsManifest } from "./artifacts.manifest";
import { assistsManifest } from "./assists.manifest";
import { reportsManifest } from "./reports.manifest";
import { cameraManifest } from "./camera.manifest";
import { vaultManifest } from "./vault.manifest";
import { legalCaWcManifest } from "./legal-ca-wc.manifest";
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
import { contextPreviewManifest } from "./context-preview.manifest";
import { agentRunManifest } from "./agent-run.manifest";
import { agentComparisonModelManifest } from "./agent-comparison-model.manifest";
import { agentBattleManifest } from "./agent-battle.manifest";
import { scraperManifest } from "./scraper.manifest";
import { searchManifest } from "./search.manifest";
import { documentsManifest } from "./documents.manifest";
import { researchManifest } from "./research.manifest";
import { tasksManifest } from "./tasks.manifest";
import { dataTablesManifest } from "./data-tables.manifest";
import { filesManifest } from "./files.manifest";
import { projectsManifest } from "./projects.manifest";
import { messagesManifest } from "./messages.manifest";
import { listsManifest } from "./lists.manifest";
import { canvasManifest } from "./canvas.manifest";
import { mapsManifest } from "./maps.manifest";
import { aiResultsManifest } from "./ai-results.manifest";
import { agentAdvancedEditorManifest } from "./agent-advanced-editor.manifest";
import { mermaidEditorManifest } from "./mermaid-editor.manifest";
import { ragSearchManifest } from "./rag-search.manifest";
import { ragLibraryManifest } from "./rag-library.manifest";
import { ragDataStoresManifest } from "./rag-data-stores.manifest";
import { knowledgeRepositoriesManifest } from "./knowledge-repositories.manifest";
import { ragViewerManifest } from "./rag-viewer.manifest";
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
import { keywordValueWorkbenchManifest } from "./keyword-value-workbench.manifest";
import { marketingCrawlsManifest } from "./marketing-crawls.manifest";
import { marketingCrawlManifest } from "./marketing-crawl.manifest";
import { marketingAuditManifest } from "./marketing-audit.manifest";
import { marketingAnalysisManifest } from "./marketing-analysis.manifest";
import { marketingFindingsManifest } from "./marketing-findings.manifest";
import { marketingLinksManifest } from "./marketing-links.manifest";
import { marketingBacklinksManifest } from "./marketing-backlinks.manifest";
import { marketingAuthorityManifest } from "./marketing-authority.manifest";
import { marketingReputationManifest } from "./marketing-reputation.manifest";
import { marketingRanksManifest } from "./marketing-ranks.manifest";
import { marketingRanksHubManifest } from "./marketing-ranks-hub.manifest";
import { marketingInitiativesManifest } from "./marketing-initiatives.manifest";
import { marketingReportsManifest } from "./marketing-reports.manifest";
import { marketingRunConsoleManifest } from "./marketing-run-console.manifest";
import { marketingAutomationsManifest } from "./marketing-automations.manifest";
import { marketingCoverageManifest } from "./marketing-coverage.manifest";
import { marketingCompetitorsManifest } from "./marketing-competitors.manifest";
import { marketingSitemapsManifest } from "./marketing-sitemaps.manifest";
import { marketingDiscoveryManifest } from "./marketing-discovery.manifest";
import { marketingBrandAssetsManifest } from "./marketing-brand-assets.manifest";
import { marketingIntegrationsManifest } from "./marketing-integrations.manifest";
import { marketingSiteSettingsManifest } from "./marketing-site-settings.manifest";
import { marketingTopicalMapManifest } from "./marketing-topical-map.manifest";
import { contentPlanManifest } from "./content-plan.manifest";
import { contentPlanEntitiesManifest } from "./content-plan-entities.manifest";
import { contentPlanListManifest } from "./content-plan-list.manifest";
import { contentPlanNodeManifest } from "./content-plan-node.manifest";
import { contentPlanSetupManifest } from "./content-plan-setup.manifest";
import { masterworkRulebookManifest } from "./masterwork-rulebook.manifest";
import { agentsHubManifest } from "./agents-hub.manifest";
import { organizationsManifest } from "./organizations.manifest";
import { organizationPerformanceReviewsManifest } from "./organization-performance-reviews.manifest";
import { dashboardManifest } from "./dashboard.manifest";
import { educationManifest } from "./education.manifest";
import { educationStudyGuidesManifest } from "./education-study-guides.manifest";
import { educationTutorManifest } from "./education-tutor.manifest";
import { educationFlashcardsManifest } from "./education-flashcards.manifest";
import { educationFlashcardSetManifest } from "./education-flashcard-set.manifest";
import { educationFlashcardEditorManifest } from "./education-flashcard-editor.manifest";
import { educationFastfireManifest } from "./education-fastfire.manifest";
import { educationAssessmentManifest } from "./education-assessment.manifest";
import { educationGradeWorkManifest } from "./education-grade-work.manifest";
import { educationPlannerManifest } from "./education-planner.manifest";
import { educationMindMapsManifest } from "./education-mind-maps.manifest";
import { educationMemoryManifest } from "./education-memory.manifest";
import { educationPracticeOralManifest } from "./education-practice-oral.manifest";
import { educationLearnAuthoringManifest } from "./education-learn-authoring.manifest";
import { educationAudioStudyManifest } from "./education-audio-study.manifest";
import { educationGameManifest } from "./education-game.manifest";
import { educationLearnManifest } from "./education-learn.manifest";
import { educationProgressManifest } from "./education-progress.manifest";
import { settingsManifest } from "./settings.manifest";
import { agentAppsManifest } from "./agent-apps.manifest";
import { publicAgentAppManifest } from "./public-agent-app.manifest";
import { barcodePreviewManifest } from "./barcode-preview.manifest";
import { markdownPdfManifest } from "./markdown-pdf.manifest";
import { agentConnectionsManifest } from "./agent-connections.manifest";
import { connectionsSkillsManifest } from "./connections-skills.manifest";
import { keywordResearchManifest } from "./keyword-research.manifest";
import { keywordQuickAnswersManifest } from "./keyword-quick-answers.manifest";
import { keywordResearchWindowManifest } from "./keyword-research-window.manifest";
import { pageResearchManifest } from "./page-research.manifest";
import { marketingSiteKeywordsManifest } from "./marketing-site-keywords.manifest";
import { marketingSiteMediaManifest } from "./marketing-site-media.manifest";
import { quickTasksManifest } from "./quick-tasks.manifest";
import { taskCreateManifest } from "./task-create.manifest";
import { quickNoteSaveManifest } from "./quick-note-save.manifest";
import { filePreviewManifest } from "./file-preview.manifest";
import { imageViewerManifest } from "./image-viewer.manifest";
import { tableSettingsManifest } from "./table-settings.manifest";
import { workflowEmitManifest } from "./workflow-emit.manifest";
import { imageUploaderManifest } from "./image-uploader.manifest";
import { imagesManifest } from "./images.manifest";
import { imageStudioManifest } from "./image-studio.manifest";
import { imageGenerateManifest } from "./image-generate.manifest";
import { imageEditManifest } from "./image-edit.manifest";
import { imageAnnotateManifest } from "./image-annotate.manifest";
import { galleryManifest } from "./gallery.manifest";
import { itemDetailManifest } from "./item-detail.manifest";
import { shareManifest } from "./share.manifest";
import { feedbackManifest } from "./feedback.manifest";
import { markdownEditorManifest } from "./markdown-editor.manifest";
import { listManagerManifest } from "./list-manager.manifest";
import { canvasViewerManifest } from "./canvas-viewer.manifest";
import { tableViewerManifest } from "./table-viewer.manifest";
import { documentsWorkspaceManifest } from "./documents-workspace.manifest";
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
import { scopesManifest } from "./scopes.manifest";
import { contextItemsManifest } from "./context-items.manifest";
import { chatVoiceManifest } from "./chat-voice.manifest";
import { staffManifest } from "./staff.manifest";
import { voiceChatManifest } from "./voice-chat.manifest";
import { transcriptScribeLiveManifest } from "./transcript-scribe-live.manifest";
import { adminSystemAgentsManifest } from "./admin-system-agents.manifest";
import { adminDatabaseManifest } from "./admin-database.manifest";
import { adminAiModelsManifest } from "./admin-ai-models.manifest";
import { adminAiModelAuditManifest } from "./admin-ai-model-audit.manifest";
import { adminToolRegistryManifest } from "./admin-tool-registry.manifest";
import { adminUsersManifest } from "./admin-users.manifest";
import { adminLimitsManifest } from "./admin-limits.manifest";
import { commerceLabelBatchManifest } from "./commerce-label-batch.manifest";
import { adminFeedbackManifest } from "./admin-feedback.manifest";
import { adminEmailManifest } from "./admin-email.manifest";
import { adminAgentReviewManifest } from "./admin-agent-review.manifest";
import { adminAgentReviewItemManifest } from "./admin-agent-review-item.manifest";
import { adminCxDashboardManifest } from "./admin-cx-dashboard.manifest";
import { adminServerLogsManifest } from "./admin-server-logs.manifest";
import { adminBillingSpendManifest } from "./admin-billing-spend.manifest";
import { adminSandboxManifest } from "./admin-sandbox.manifest";
import { adminOfficialComponentsManifest } from "./admin-official-components.manifest";
import { adminApplicationsManifest } from "./admin-applications.manifest";
import { adminSyncFleetManifest } from "./admin-sync-fleet.manifest";
import { adminProofRunsManifest } from "./admin-proof-runs.manifest";
import { adminSchedulingManifest } from "./admin-scheduling.manifest";
import { adminAgentAppsManifest } from "./admin-agent-apps.manifest";
import { adminBundlesManifest } from "./admin-bundles.manifest";
import { adminMcpServersManifest } from "./admin-mcp-servers.manifest";
import { adminLookupsManifest } from "./admin-lookups.manifest";
import { mandatesManifest } from "./mandates.manifest";
import { mandateWorkspaceManifest } from "./mandate-workspace.manifest";
import { knowledgeManifest } from "./knowledge.manifest";
import { shapesManifest } from "./shapes.manifest";
import { crmManifest } from "./crm.manifest";
import { crmManagerManifest } from "./crm-manager.manifest";
import { crmCreatePartyManifest } from "./crm-create-party.manifest";
import { crmRecordManifest } from "./crm-record.manifest";
import { crmOutreachListsManifest } from "./crm-outreach-lists.manifest";
import { crmChaseboxManifest } from "./crm-chasebox.manifest";
import { crmInboxManifest } from "./crm-inbox.manifest";
import { adminKnowledgeManifest } from "./admin-knowledge.manifest";
import { adminKindRegistryManifest } from "./admin-kind-registry.manifest";
import { adminSkillsManifest } from "./admin-skills.manifest";
import { adminGrowthLoopManifest } from "./admin-growth-loop.manifest";
import { adminHindsightManifest } from "./admin-hindsight.manifest";
import { adminReportingManifest } from "./admin-reporting.manifest";
import { adminUtilitiesManifest } from "./admin-utilities.manifest";
import { adminDocumentationManifest } from "./admin-documentation.manifest";
import { quickDataManifest } from "./quick-data.manifest";

/**
 * Manifests exactly as authored. Do NOT consume directly at runtime — generic
 * baselines are injected below and inheritance is unresolved. Use
 * `ALL_MANIFESTS`.
 *
 * Exported for TOOLING only (`scripts/check-surface-impact.ts`): the resolved
 * list cannot distinguish "the child inherits this value" from "the child
 * re-declares it", and that difference is the whole shadowing question — a
 * child that redeclares a name its parent already conveys splits the family's
 * vocabulary in two. See THE FAMILY DOCTRINE in `.claude/skills/surface-authoring`.
 */
export const RAW_MANIFESTS: readonly SurfaceManifest[] = [
  agentShortcutsManifest,
  barcodePreviewManifest,
  markdownPdfManifest,
  aiWorkManifest,
  aiWorkComposerManifest,
  aiWorkConversationsManifest,
  imageManagerManifest,
  visionInterviewManifest,
  artifactsManifest,
  assistsManifest,
  reportsManifest,
  cameraManifest,
  vaultManifest,
  legalCaWcManifest,
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
  contextPreviewManifest,
  agentRunManifest,
  agentComparisonModelManifest,
  agentBattleManifest,
  scraperManifest,
  searchManifest,
  documentsManifest,
  researchManifest,
  tasksManifest,
  dataTablesManifest,
  filesManifest,
  projectsManifest,
  messagesManifest,
  listsManifest,
  canvasManifest,
  mapsManifest,
  aiResultsManifest,
  agentAdvancedEditorManifest,
  mermaidEditorManifest,
  ragSearchManifest,
  ragLibraryManifest,
  ragDataStoresManifest,
  knowledgeRepositoriesManifest,
  ragViewerManifest,
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
  keywordValueWorkbenchManifest,
  marketingCrawlsManifest,
  marketingCrawlManifest,
  marketingAuditManifest,
  marketingAnalysisManifest,
  marketingFindingsManifest,
  marketingLinksManifest,
  marketingBacklinksManifest,
  marketingAuthorityManifest,
  marketingReputationManifest,
  marketingRanksManifest,
  marketingRanksHubManifest,
  marketingInitiativesManifest,
  marketingReportsManifest,
  marketingRunConsoleManifest,
  marketingAutomationsManifest,
  marketingCoverageManifest,
  marketingCompetitorsManifest,
  marketingSitemapsManifest,
  marketingDiscoveryManifest,
  marketingBrandAssetsManifest,
  marketingIntegrationsManifest,
  marketingSiteSettingsManifest,
  // The brand's topical map — which pages should exist and where they live.
  // The Content section's home; the content plan below is its production line.
  marketingTopicalMapManifest,
  // Content planning (plan schema) — sibling of the marketing fleet.
  // One workspace, five surfaces: the ?view= param is a different page with
  // different agents (list front door, plan-editor base, setup, entities,
  // and the open node panel — the first read/WRITE surface).
  contentPlanManifest,
  contentPlanListManifest,
  contentPlanSetupManifest,
  contentPlanEntitiesManifest,
  contentPlanNodeManifest,
  masterworkRulebookManifest,
  // 2026-07-24 fleet push — hub/list + workspace surfaces.
  agentsHubManifest,
  organizationsManifest,
  organizationPerformanceReviewsManifest,
  dashboardManifest,
  educationManifest,
  educationStudyGuidesManifest,
  educationTutorManifest,
  educationFlashcardsManifest,
  educationFlashcardSetManifest,
  educationFlashcardEditorManifest,
  educationFastfireManifest,
  educationAssessmentManifest,
  educationGradeWorkManifest,
  educationPlannerManifest,
  educationMindMapsManifest,
  educationMemoryManifest,
  educationPracticeOralManifest,
  educationLearnAuthoringManifest,
  educationAudioStudyManifest,
  educationGameManifest,
  educationLearnManifest,
  educationProgressManifest,
  settingsManifest,
  agentAppsManifest,
  publicAgentAppManifest,
  agentConnectionsManifest,
  connectionsSkillsManifest,
  keywordResearchManifest,
  keywordQuickAnswersManifest,
  keywordResearchWindowManifest,
  pageResearchManifest,
  marketingSiteKeywordsManifest,
  marketingSiteMediaManifest,
  // 2026-07-24 overlay-surface fleet — window panels are surfaces too
  // (identified by overlayId, emitters nested inside the window components).
  quickTasksManifest,
  taskCreateManifest,
  quickNoteSaveManifest,
  filePreviewManifest,
  imageViewerManifest,
  tableSettingsManifest,
  workflowEmitManifest,
  imageUploaderManifest,
  imagesManifest,
  imageStudioManifest,
  imageGenerateManifest,
  imageEditManifest,
  imageAnnotateManifest,
  galleryManifest,
  itemDetailManifest,
  shareManifest,
  feedbackManifest,
  markdownEditorManifest,
  listManagerManifest,
  canvasViewerManifest,
  tableViewerManifest,
  documentsWorkspaceManifest,
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
  scopesManifest,
  contextItemsManifest,
  chatVoiceManifest,
  staffManifest,
  voiceChatManifest,
  transcriptScribeLiveManifest,
  adminSystemAgentsManifest,
  adminDatabaseManifest,
  adminAiModelsManifest,
  adminAiModelAuditManifest,
  adminToolRegistryManifest,
  adminUsersManifest,
  adminLimitsManifest,
  commerceLabelBatchManifest,
  adminFeedbackManifest,
  adminEmailManifest,
  adminAgentReviewManifest,
  adminAgentReviewItemManifest,
  adminCxDashboardManifest,
  adminServerLogsManifest,
  adminBillingSpendManifest,
  adminSandboxManifest,
  adminOfficialComponentsManifest,
  adminApplicationsManifest,
  adminSchedulingManifest,
  adminAgentAppsManifest,
  adminBundlesManifest,
  adminSyncFleetManifest,
  adminProofRunsManifest,
  adminMcpServersManifest,
  adminLookupsManifest,
  mandatesManifest,
  mandateWorkspaceManifest,
  knowledgeManifest,
  shapesManifest,
  crmManifest,
  crmManagerManifest,
  crmCreatePartyManifest,
  crmRecordManifest,
  crmOutreachListsManifest,
  crmChaseboxManifest,
  crmInboxManifest,
  adminKnowledgeManifest,
  adminKindRegistryManifest,
  adminSkillsManifest,
  adminGrowthLoopManifest,
  adminHindsightManifest,
  adminReportingManifest,
  adminUtilitiesManifest,
  adminDocumentationManifest,
  quickDataManifest,
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

/**
 * Platform-written names (`surface-chain.ts` / `window-forms.ts`): a surface
 * claiming one would be silently shadowed by the platform at run time, so a
 * manifest that declares one is refused at registry init.
 */
export function assertNoPlatformReservedNames(
  m: Pick<SurfaceManifest, "surfaceName" | "values" | "writeTargets">,
): void {
  for (const v of m.values) {
    if (PLATFORM_RESERVED_NAMES.values.includes(v.name)) {
      throw new Error(
        `[surfaces] "${m.surfaceName}" declares value "${v.name}" — that name is written by the platform ` +
          `(the surface chain, _baseline.manifest.ts PLATFORM_CONTEXT_VALUES); choose another name`,
      );
    }
  }
  for (const t of m.writeTargets ?? []) {
    if (PLATFORM_RESERVED_NAMES.writeTargets.includes(t.name)) {
      throw new Error(
        `[surfaces] "${m.surfaceName}" declares write target "${t.name}" — that name is the platform's ` +
          `target for unregistered windows (window-forms.ts); choose another name`,
      );
    }
  }
}

/**
 * THE REGISTRY is `@ai-matrx/alchemy/declare`'s (ALC-14): inheritance (child
 * wins per key), baseline injection, provenance, group synthesis and the loud
 * guards (unknown parent, cycle, depth > MAX_INHERITANCE_DEPTH, reserved or
 * duplicate group keys, undeclared groups) all run in the package. The app
 * supplies its manifests, its baselines and the agent-owned extension slots
 * (agent roles inherit per name, like values).
 *
 * Baseline injection is the platform half of the "generic values are always
 * available" contract: an agent author can bind a variable to a generic value
 * on ANY surface; a surface with genuinely no text/content concept opts out
 * via `skipBaselineValues`.
 */
const REGISTRY = createDeclarationRegistry<SurfaceManifest>({
  baselineValues: Object.values(BASELINE_VALUES),
  maxInheritanceDepth: MAX_INHERITANCE_DEPTH,
});
REGISTRY.registerExtension(agentRolesExtension);
for (const manifest of RAW_MANIFESTS) {
  assertNoPlatformReservedNames(manifest);
  REGISTRY.register(manifest);
}

/**
 * Parent chain for a surface, ROOT FIRST (e.g. child of a child returns
 * `[grandparent, parent]`). Unknown surfaces return `[]`. Throws on cycles
 * and on chains deeper than MAX_INHERITANCE_DEPTH.
 */
export function getSurfaceAncestry(surfaceName: string): string[] {
  return REGISTRY.ancestry(surfaceName);
}

/**
 * All registered surface manifests, fully resolved: inheritance merged
 * (child wins per key), generic baselines guaranteed, provenance + canonical
 * group stamped on every value, groups synthesized and ordered
 * curated → general → inherited → baseline. Each also carries its
 * `contentHash` and defaults-filled `resolvedSensitivity` per value.
 */
export const ALL_MANIFESTS: readonly ResolvedSurfaceManifest[] =
  REGISTRY.all() as unknown as readonly ResolvedSurfaceManifest[];

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
 * Whether shell chrome and binding services may treat this surface as owning
 * a bound-agent roster. Unknown/legacy surfaces keep the historical `bound`
 * default; registered universal hosts opt out explicitly in their manifest.
 */
export function surfaceAcceptsAgentBindings(surfaceName: string): boolean {
  return getManifest(surfaceName)?.agentRosterMode !== "universal";
}

/**
 * Direct children of a surface (manifests declaring `inheritsFrom` it),
 * in declaration order. The registry — not the DB mirror — is the ONE
 * hierarchy source for UI chrome.
 */
export function getSurfaceChildren(surfaceName: string): string[] {
  return REGISTRY.children(surfaceName);
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
  return REGISTRY.getRaw(surfaceName);
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

// The runtime's loaded-value check (ALC-14) reads declarations through this
// lookup, so the runtime never imports the registry (no import cycle).
registerLoadedValueDeclarations(
  (surfaceName) =>
    getManifest(surfaceName) as unknown as ReturnType<LoadedValueDeclarationLookup>,
);
