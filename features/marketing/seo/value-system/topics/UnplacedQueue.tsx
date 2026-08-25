"use client";

/**
 * The work queue: this site's keywords with NO primary topic.
 *
 * P26 — ONE TABLE. This used to be a hand-rolled `<div>` list: 5,823 keywords
 * in no particular order, with clicks and impressions as unsortable text, no
 * filters, and none of the dimension columns the same keywords carry one screen
 * away in the Keyword Workbench. Arman, 2026-08-24: "all they had to do is just
 * use the canonical table."
 *
 * So it IS the canonical table now — the same rows from the same RPC, every
 * column sorting and filtering on the server — configured with exactly two
 * things that make it this surface:
 *
 *   • `baseFilters: { topic: "none" }` — the keywords nobody has placed;
 *   • an opening column set, which the person can change and save.
 *
 * Placing a keyword is the Offering cell (one gesture, no dialog) or the bulk
 * panel, both of which are THE one placement write (`seo.gsc_set_keyword_topic`)
 * that the workbench already used. The Topic Assigner agent stays here, because
 * handing a batch of unplaced keywords to it is a thing only this surface does.
 */

import { useEffect, useState } from "react";
import { BrainCircuit, Loader2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import {
  KeywordTable,
  type KeywordTableSurface,
} from "@/features/marketing/seo/keyword-table/KeywordTable";

const ASSIGN_TOPICS_PATH = "/seo/keywords/assign-topics";

/** The server's own milestones, in the operator's words. Never invented. */
const ASSIGN_STAGES: Record<string, string> = {
  "seo.assign_topics_started": "Selecting unassigned keywords…",
  "seo.assign_topics_tree_loaded": "Reading the shared offering tree…",
  "seo.assign_topics_agent_completed": "Pinning keywords to topics…",
  "seo.assign_topics_applied": "Saving assignments…",
  "seo.assign_topics_completed": "Topic assignment complete",
};

interface AssignTopicsResult {
  eligible: number;
  topics_created: string[];
  keywords_assigned: number;
  unassignable: number;
  unknown_topic_refs: string[];
}

const SURFACE: KeywordTableSurface = {
  id: "seo-unplaced-queue",
  label: "Keyword",
  listLabel: "Keywords not placed on the tree",
  location: "Marketing — Offering tree — Not placed",
  // Two keyword tables share this route, so each owns its own URL namespace and
  // Back undoes exactly one step on the one you touched.
  prefix: "u",
  // The Offering column is the placement gesture, so it opens visible even
  // though every row in this queue is empty in it — that emptiness is the work.
  defaultColumns: [
    "key",
    "topic",
    "traffic_class",
    "clicks",
    "impressions",
    "value_band",
  ],
  baseFilters: { topic: "none" },
};

export function UnplacedQueue({
  siteId,
  siteDomain,
  brandId,
  onChanged,
}: {
  siteId: string;
  siteDomain: string;
  brandId: string;
  /** The tree's counts move whenever this queue shrinks. */
  onChanged: () => void;
}) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const [territory, setTerritory] = useState("");
  const [batch, setBatch] = useState<string[]>([]);

  const assigner = useSeoCommandRun<AssignTopicsResult>({
    key: "assign-topics",
    path: ASSIGN_TOPICS_PATH,
    finalKind: "seo.assign_topics_completed",
    stageLabels: ASSIGN_STAGES,
    live: { label: "Offering assigner" },
  });

  useEffect(() => {
    if (assigner.result) onChanged();
  }, [assigner.result, onChanged]);

  return (
    <section className="flex min-h-[28rem] flex-col rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">
          Not placed on the tree
        </h2>
        <p className="hidden text-[11px] text-muted-foreground sm:block">
          Traffic that maps to nothing you sell cannot be counted as demand for
          it.
        </p>
      </div>

      {assigner.error ? (
        <p className="border-b border-border bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {assigner.error}
        </p>
      ) : null}
      {assigner.result ? (
        <p className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          Assigner placed {assigner.result.keywords_assigned} of{" "}
          {assigner.result.eligible} keywords
          {assigner.result.topics_created.length > 0
            ? `, creating ${assigner.result.topics_created.length} topic${assigner.result.topics_created.length === 1 ? "" : "s"}`
            : ""}
          {assigner.result.unassignable > 0
            ? `; ${assigner.result.unassignable} it could not place`
            : ""}
          .
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col p-2">
        <KeywordTable
          siteId={siteId}
          siteDomain={siteDomain}
          brandId={brandId}
          surface={SURFACE}
          onWrite={onChanged}
          onSelectedKeywordIdsChange={setBatch}
          emptyState={{
            title: "Nothing is unplaced",
            description:
              "Every keyword with traffic in this window is on the tree. That is the goal state.",
          }}
          headerActions={
            isAdmin ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={territory}
                  onChange={(event) => setTerritory(event.target.value)}
                  placeholder="Industry (e.g. itad)"
                  className="h-7 w-40 text-xs"
                  aria-label="Industry territory for the topic assigner"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={
                    assigner.running || !territory.trim() || batch.length === 0
                  }
                  onClick={() =>
                    void assigner.launch(
                      {
                        territory: territory.trim(),
                        language: "en",
                        limit: Math.min(batch.length, 50),
                        keyword_ids: batch.slice(0, 50),
                      },
                      `${siteDomain} · ${territory.trim()}`,
                    )
                  }
                >
                  {assigner.running ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <BrainCircuit className="mr-1.5 h-3 w-3" />
                  )}
                  Assigner: {batch.length || "select keywords"}
                </Button>
              </div>
            ) : null
          }
          selectionActions={({ keywordIds, openServiceAssign, clear }) => (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={keywordIds.length === 0}
                onClick={() =>
                  openServiceAssign(
                    keywordIds,
                    `${keywordIds.length.toLocaleString()} keyword${keywordIds.length === 1 ? "" : "s"}`,
                  )
                }
              >
                <Network className="h-3.5 w-3.5" />
                Place under an offering…
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={clear}
              >
                Clear {keywordIds.length}
              </Button>
            </div>
          )}
        />
      </div>
    </section>
  );
}
