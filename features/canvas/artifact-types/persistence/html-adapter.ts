/**
 * HTML persistence adapter for the artifact system.
 *
 * Domain record: an `html_pages` row (in the mymatrx project, reached only via
 * the `/api/html-pages` route — see `HTMLPageService`). Link:
 * `{ externalSystem: 'html_pages', externalId: <page id> }`.
 *
 * HTML is a "self-contained deliverable" (vision R7): the published webpage IS
 * the artifact, so it ALWAYS auto-saves on materialize (Q2). `onMaterialize`
 * publishes the page and links the canvas row — closing the open hand-off in
 * /Users/armanisadeghi/code/common-docs/systems/publish/artifacts/VISION.md (no canvas path set `external_system='html_pages'`
 * before; only the editor path wrote the cx_artifact discovery index).
 *
 * ONE PAGE PER VERSION: the page is keyed by this canvas row's id
 * (`html_pages.artifact_id`), so reconcile re-runs republish the same page and a
 * later version (a user save, an agent `edit_artifact`) gets its own page — the
 * chat card and the canvas tab can never overwrite each other's page.
 *
 * No per-viewer interaction state — the page is the whole artifact.
 */

import {
  HTML_PAGES_SYSTEM,
  publishHtmlCanvasVersion,
} from "@/features/html-pages/services/canvasVersionPage";
import type {
  ArtifactPersistenceAdapter,
  ArtifactLink,
  MaterializedArtifactInfo,
} from "./artifact-adapters";

export const HTML_ADAPTER: ArtifactPersistenceAdapter = {
  async onMaterialize(
    info: MaterializedArtifactInfo,
  ): Promise<ArtifactLink | void> {
    const html = typeof info.rawContent === "string" ? info.rawContent : "";
    if (!html.trim()) return;
    try {
      const published = await publishHtmlCanvasVersion({
        id: info.artifactId,
        html,
        title: info.title || "Generated page",
        sourceMessageId: info.sourceMessageId ?? null,
        conversationId: info.conversationId ?? null,
      });
      if (!published) return;
      return { externalSystem: HTML_PAGES_SYSTEM, externalId: published.pageId };
    } catch (err) {
      // Non-blocking: the canvas row already persisted; the link backfills on a
      // later load (loud, not silent).
      console.error("[HTML_ADAPTER.onMaterialize] publish failed:", err);
      return;
    }
  },

  // The published page is the artifact — no per-viewer state to load/save.
  loadState: async () => null,
  saveState: async () => false,
};
