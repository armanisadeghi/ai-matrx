"use client";

/**
 * "Draft it from my site" — the door out of the blank page (KI-031).
 *
 * THE ADOPTION PROBLEM this exists to solve, measured 2026-08-25: the
 * machinery that delivers a site's business guidelines to every keyword agent
 * was built and A/B-proven, and 1 of 32 sites had written one. Nothing was
 * broken. Writing the first sentence from an empty textarea was simply
 * unprompted homework, and homework does not get done.
 *
 * So the blank page is removed rather than explained. This button runs the
 * Business Discovery Ladder's `guidelines_draft` rung — the SAME ladder, the
 * same cold read of the site's own crawled pages, the same durable-run ledger
 * (KI-040, aidream `services/seo/business_discovery.py`); there is no second
 * discovery path. It is the one rung with no prerequisite, because a site
 * that has told the AI nothing has usually climbed no ladder either; steps
 * 1-3 brief the drafter when they exist.
 *
 * 🚨 WHAT IT DOES NOT DO: write the document. The draft lands as a
 * `guideline_edit` PROPOSAL in `platform.assists` and waits for a person to
 * approve it, or edit it and then approve it (P12 — "an agent can make all
 * the suggestions they want… the new agent is not going to see the
 * suggestions that have not been approved"). The proposal renders in the
 * queue directly below this button, and the ONE write path stays
 * `seo.gsc_set_site_kw_guidelines`.
 */

import { useCallback, useState } from "react";
import { BrainCircuit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { fetchMyAssists } from "@/features/assists/redux/assistsSlice";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";

const STAGE_LABELS: Record<string, string> = {
  "seo.discovery_step_started": "Reading your site's own pages…",
  "seo.discovery_step_completed": "Draft written",
};

/** What the rung returns; only the fields this surface reads are narrowed. */
interface DraftDoc {
  step?: string;
  artifact?: { guidelines_text?: unknown; summary?: unknown };
  suggestion?: { assist_id?: unknown; status?: unknown; chars?: unknown } | null;
}

export function GuidelinesDraftButton({
  siteId,
  hasDocument,
  className,
}: {
  siteId: string;
  /** Drafting REVISES an existing document rather than replacing it blind. */
  hasDocument: boolean;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const [launching, setLaunching] = useState(false);

  const run = useSeoCommandRun<DraftDoc>({
    key: "guidelines-draft",
    path: "/seo/keywords/discovery/step",
    finalKind: "seo.discovery_step_completed",
    stageLabels: STAGE_LABELS,
    live: { label: "Business guidelines drafter" },
  });

  const busy = launching || run.running;

  const draft = useCallback(async () => {
    setLaunching(true);
    try {
      await run.launch({ site_id: siteId, step: "guidelines_draft" }, siteId);
      // The proposal is a fresh assist row; the slice is loaded once per
      // session, so without this the queue below stays empty until a reload.
      if (userId) await dispatch(fetchMyAssists({ userId }));
      toast.success("A draft is waiting for you below", {
        description:
          "Nothing has been saved. Read it, fix what is wrong, then approve it — or edit it first.",
      });
    } catch (error) {
      toast.error("Could not draft the guidelines", {
        description:
          error instanceof Error
            ? error.message
            : "The drafter did not finish. Nothing was changed.",
      });
    } finally {
      setLaunching(false);
    }
  }, [dispatch, run, siteId, userId]);

  return (
    <Button
      type="button"
      size="sm"
      variant={hasDocument ? "outline" : "default"}
      className={className ?? "h-7 gap-1.5 px-2 text-xs"}
      disabled={busy}
      title={
        hasDocument
          ? "Read your site again and propose an updated version — your own sentences are kept where the site still supports them."
          : "Read your site's own pages and propose a first draft. Nothing is saved until you approve it."
      }
      onClick={() => void draft()}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <BrainCircuit className="h-3.5 w-3.5" />
      )}
      {busy
        ? (run.stage ?? "Reading your site…")
        : hasDocument
          ? "Propose an update from my site"
          : "Draft it from my site"}
    </Button>
  );
}
