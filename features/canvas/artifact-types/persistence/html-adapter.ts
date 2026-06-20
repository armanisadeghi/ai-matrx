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
 * ARTIFACT_VISION_AND_DESIGN.md (no canvas path set `external_system='html_pages'`
 * before; only the editor path wrote the cx_artifact discovery index).
 *
 * IDEMPOTENT: `createPage` passes `sourceMessageId`, and the API updates the
 * page for that message in place instead of inserting a duplicate — so reconcile
 * re-runs and the inline preview's own publish all converge on ONE page.
 *
 * No per-viewer interaction state — the page is the whole artifact.
 */

import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import { requireUserId } from "@/utils/auth/getUserId";
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
      const userId = requireUserId();
      const result = await HTMLPageService.createPage(
        html,
        info.title || "Generated page",
        "Generated from chat",
        userId,
        {},
        {
          sourceMessageId: info.sourceMessageId,
          sourceConversationId: info.conversationId,
        },
      );
      const pageId = result?.pageId ?? result?.id;
      if (!pageId) return;
      return { externalSystem: "html_pages", externalId: String(pageId) };
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
