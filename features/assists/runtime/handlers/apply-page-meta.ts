/**
 * `apply_page_meta` — accepting the assist lands a PROPOSED metadata edit on a
 * marketing page: the page's desired title/description, plus a DRAFT on the
 * linked CMS page.
 *
 * This is the write-back half of the Growth Loop (`G-FINDING-FIX`). Before it,
 * accepting a findings chip could only open an agent in a window — the loop
 * ended in a conversation instead of on the page.
 *
 * IT OPENS NO NEW WRITE PATH. Every byte goes through `applyFindingFix`, which
 * is itself only `updatePageIntent` + `executeCmsPush` — the two seams that
 * already existed. Consequently the two invariants hold here for free:
 * NEVER AUTO-PUBLISH (drafts only) and THE 301 LAW (a route is never moved,
 * and a missing CMS page is reported, never created).
 *
 * The exact replacement text rides on the action, so the expanded card shows
 * the user precisely what will be written before the verb button is clickable.
 */

import { applyFindingFix } from "@/features/marketing/lib/finding-fix-apply";
import { getPageWorkspace, getSite } from "@/features/marketing/data/service";
import {
  registerAssistAction,
  type AssistActionResult,
} from "../assist-action-registry";

registerAssistAction({
  kind: "apply_page_meta",
  description:
    "Save the proposed title/description as the page's desired metadata and write it into the linked CMS page's DRAFT. Never publishes.",
  handler: async (assist): Promise<AssistActionResult> => {
    const action = assist.action;
    if (action.kind !== "apply_page_meta") {
      return { ok: false, error: "apply_page_meta: wrong action payload" };
    }
    if (!action.metaTitle && !action.metaDescription) {
      return {
        ok: false,
        error: "apply_page_meta: this action carries no change to apply.",
      };
    }
    try {
      const [site, workspace] = await Promise.all([
        getSite(action.siteId),
        getPageWorkspace(action.siteId, action.pageId),
      ]);
      const result = await applyFindingFix({
        site,
        page: workspace.page,
        draft: {
          ...(action.metaTitle ? { metaTitle: action.metaTitle } : {}),
          ...(action.metaDescription
            ? { metaDescription: action.metaDescription }
            : {}),
          source: action.source,
          rationale: action.rationale,
        },
      });
      return {
        ok: true,
        result: {
          applied: result.applied,
          cms: result.cms,
          page_id: result.page.id,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not apply this change to the page.",
      };
    }
  },
});
