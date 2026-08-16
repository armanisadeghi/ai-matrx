"use client";

/**
 * Save a HUMAN-authored revision of a page's words.
 *
 * `POST /content-plan/nodes/{id}/draft` — aidream
 * `page_pipeline.save_human_draft`. NOT a Supabase write: `plan.node_artifact`
 * has exactly ONE writer (`services/content_plan/artifacts.py`), which owns the
 * supersession INSERT that turns every save into a revision rather than a
 * mutation, and stamps provenance saying a person — not an agent — wrote these
 * words. A client that INSERTed the row itself would have to reimplement both,
 * and would get provenance wrong the first time.
 *
 * Not a stream: this is the user's own typing going to the database, not model
 * work — it returns in milliseconds and a stream would only add ceremony.
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { callApi } from "@/lib/api/call-api";
import { describeBackendFailure, parseCallApiError } from "@/lib/api/errors";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import { planKeys } from "../data/hooks";
import type { PageDraft } from "../lib/page-draft";

export interface PageDraftSaveState {
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
  /** True when the save made an existing review stale. */
  supersededReview?: boolean;
}

export function usePageDraftSave(args: {
  nodeId: string;
  siteId: string | null;
}) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [state, setState] = useState<PageDraftSaveState>({ status: "idle" });

  const { nodeId, siteId } = args;

  const save = useCallback(
    async (draft: PageDraft, note = ""): Promise<boolean> => {
      setState({ status: "saving" });
      const result = await dispatch(
        callApi({
          path: "/content-plan/nodes/{node_id}/draft",
          method: "POST",
          pathParams: { node_id: nodeId },
          body: {
            h1: draft.h1,
            intro: draft.intro,
            sections: draft.sections.map((section) => ({
              heading: section.heading,
              level: section.level === 3 ? 3 : 2,
              intent: section.intent,
              body: section.body,
              bullets: section.bullets,
            })),
            call_to_action: draft.call_to_action,
            meta_title: draft.meta_title,
            meta_description: draft.meta_description,
            note,
          },
        }),
      );

      if (result.error) {
        const explanation = describeBackendFailure(
          parseCallApiError(result.error),
        );
        setState({ status: "error", error: explanation.headline });
        toast.error(explanation.headline);
        return false;
      }

      const supersededReview = result.data?.superseded_review === true;
      setState({ status: "saved", supersededReview });
      toast.success(
        supersededReview
          ? "Your edit is saved. It is now what the page will be built from — the earlier review no longer matches it."
          : "Your edit is saved as a new revision.",
      );
      void queryClient.invalidateQueries({
        queryKey: planKeys.nodeArtifacts(nodeId),
      });
      if (siteId) {
        void queryClient.invalidateQueries({
          queryKey: planKeys.nodeSteps(siteId),
        });
      }
      return true;
    },
    [dispatch, nodeId, queryClient, siteId],
  );

  return { save, state, isSaving: state.status === "saving" };
}
