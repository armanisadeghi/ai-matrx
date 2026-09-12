"use client";

/**
 * "From a case that unfolded" — the TIMELINE Approach (unfolding-case contract
 * §5, `common-docs/systems/masterwork/unfolding-case-contract.md`).
 *
 * ## Why this lane exists
 *
 * The paste / link / file lanes flatten a narrative into findings. A case
 * report, an incident post-mortem, a negotiation log or a sales cycle carries
 * its expertise in the ORDER: which fact was known at which moment, what was
 * still unknown, and what the practitioner chose to find out next and why.
 * Distilled through the text lane every rule comes back static ("patients with
 * X get Y") with no precondition on the known set and no cost or risk on the
 * next step.
 *
 * So this lane UNFOLDS the narrative into a `serial_observation_timeline`
 * first, and distils BY TIME — windows of consecutive steps carrying the
 * cumulative known set — instead of by paragraph.
 *
 * ## Two roles, and the difference matters to the Expert
 *
 * - **teaching** — unfold, then distil into draft rules she approves as usual.
 * - **held-out** — unfold, then SEAL. The desk is examined on the case and
 *   never learns from it. No rules come out of it, and no surface ever shows
 *   how it turned out.
 *
 * ONE durable run (`useMasterworkRun` → `platform.masterwork_run`), its own
 * surface and pointer: reload mid-unfold and this dialog picks the run back up
 * and reports the true outcome. A run that dies on page refresh is the same
 * defect as a spinner.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { SERIAL_OBSERVATION_TIMELINE_KIND } from "@/features/content-ir/kinds/serial-observation-timeline";
import type { paths } from "@/types/python-generated/api-types";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import type { Rulebook } from "../../types";

/**
 * Being built in parallel in aidream
 * (`aidream/services/distillation/timeline_ingest.py`). Cast pending the
 * OpenAPI type sync (precedent: the dump lane); until the server deploys it the
 * run fails loudly with the real HTTP error and everything typed survives.
 */
const INGEST_TIMELINE_PATH = "/masterworks/ingest-timeline" as keyof paths;

/** The shortest narrative worth unfolding — below this there is no order. */
const MIN_NARRATIVE_CHARS = 400;

export type TimelineRole = "teaching" | "heldout";

const ROLE_OPTIONS: {
  value: TimelineRole;
  title: string;
  blurb: string;
}[] = [
  {
    value: "teaching",
    title: "Teach from this case",
    blurb:
      "The system reads it step by step and suggests rules for you to approve.",
  },
  {
    value: "heldout",
    title: "Hold this one back as a test",
    blurb:
      "Held-out cases are sealed: your system is examined on them and never learns from them. No rules come out of this, and nobody sees how it turned out.",
  },
];

export interface TimelineIngestSummary {
  role: TimelineRole;
  /** The `platform.masterwork_corpus_item` row this case now lives in. */
  corpusItemId: string | null;
  /** The unfolded case, ready for the kind component. Null if the server
   *  answered without one — which the summary then says out loud. */
  timeline: Record<string, unknown> | null;
  steps: number;
  added: number;
  duplicatesSkipped: number;
  quotesUnverified: number;
}

export function parseTimelineSummary(
  raw: unknown,
): TimelineIngestSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  // A timeline result is identified by its corpus row or its unfolded case —
  // `added` is legitimately 0 for a held-out case, so it proves nothing.
  if (!("corpus_item_id" in data) && !("timeline" in data)) return null;
  const timeline =
    data.timeline && typeof data.timeline === "object" && !Array.isArray(data.timeline)
      ? (data.timeline as Record<string, unknown>)
      : null;
  const steps = Array.isArray(timeline?.steps) ? timeline.steps.length : 0;
  return {
    role: data.role === "heldout" ? "heldout" : "teaching",
    corpusItemId:
      typeof data.corpus_item_id === "string" ? data.corpus_item_id : null,
    timeline,
    steps: typeof data.steps === "number" ? data.steps : steps,
    added: Number(data.added ?? 0),
    duplicatesSkipped: Number(data.duplicates_skipped ?? 0),
    quotesUnverified: Number(data.quotes_unverified ?? 0),
  };
}

/** The one sentence the Expert reads when the run lands. */
export function describeTimelineIngest(s: TimelineIngestSummary): string {
  if (s.steps === 0) {
    return (
      "The case was saved, but no steps could be read out of it — the narrative may not " +
      "describe one thing happening after another. Paste it again with the order made " +
      "explicit (what was known, what you did next), or add it through one of the other ways."
    );
  }
  const unfolded = `${s.steps} ${s.steps === 1 ? "step" : "steps"} read out of the case`;
  if (s.role === "heldout") {
    return `${unfolded}. It is sealed as a held-out case — no rules came from it, and how it turned out is not shown anywhere.`;
  }
  return (
    `${unfolded}. ${s.added} suggested ${s.added === 1 ? "rule" : "rules"} added as drafts` +
    (s.duplicatesSkipped ? `, ${s.duplicatesSkipped} duplicates skipped` : "") +
    (s.quotesUnverified
      ? `. ${s.quotesUnverified} ${s.quotesUnverified === 1 ? "quote" : "quotes"} could not be verified word-for-word — those rules are flagged for your review.`
      : ". Every quote verified word-for-word against your source.")
  );
}

/**
 * The request body, built once — the dialog's Distil button and its guard test
 * go through THIS function, so what the test proves is what the server gets.
 * Every refusal names what to do about it; nothing is silently dropped.
 */
export function buildTimelineRequest(input: {
  rulebookId: string;
  title: string;
  text: string;
  role: TimelineRole;
  licence: string;
  url: string;
  published: string;
  externalId: string;
}): { body: Record<string, unknown> } | { error: string } {
  const title = input.title.trim();
  if (!title) {
    return {
      error:
        "Give the case a title first — it is how you will find it again.",
    };
  }
  if (input.text.trim().length < MIN_NARRATIVE_CHARS) {
    return {
      error:
        "Paste the whole case, in the order it happened — at least a few paragraphs. A short summary has no order to read.",
    };
  }
  const licence = input.licence.trim();
  if (!licence) {
    return {
      error:
        "Say what lets you use this case — the licence, or 'my own work'. Sources without one are not safe to teach from.",
    };
  }
  return {
    body: {
      rulebook_id: input.rulebookId,
      text: input.text,
      title,
      role: input.role,
      source_meta: {
        licence,
        url: input.url.trim() || null,
        published: input.published.trim() || null,
        external_id: input.externalId.trim() || null,
      },
    },
  };
}

export function IngestTimelineDialog({
  open,
  onOpenChange,
  rulebook,
  onIngested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  onIngested?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [role, setRole] = useState<TimelineRole>("teaching");
  const [licence, setLicence] = useState("");
  const [url, setUrl] = useState("");
  const [published, setPublished] = useState("");
  const [externalId, setExternalId] = useState("");

  const run = useMasterworkRun<TimelineIngestSummary>({
    surface: "timeline",
    rulebookId: rulebook.id,
    path: INGEST_TIMELINE_PATH,
    parseResult: parseTimelineSummary,
  });
  const running = run.running;
  const rejoining = run.status === "rejoining";
  const summary = run.result;

  // Drafts and corpus rows that landed while the Expert was away still have to
  // reach the page behind this dialog.
  useEffect(() => {
    if (run.result) onIngested?.();
  }, [run.result, onIngested]);

  useEffect(() => {
    if (run.error) toast.error(run.error);
  }, [run.error]);

  // A run picked back up after a reload has to be VISIBLE — rejoining behind a
  // closed dialog reads as "nothing is happening", the defect durability
  // exists to kill.
  const reopenedRef = useRef(false);
  useEffect(() => {
    if (reopenedRef.current || open || !run.running) return;
    reopenedRef.current = true;
    onOpenChange(true);
  }, [open, run.running, onOpenChange]);

  const reset = () => run.reset();

  const launch = async () => {
    const built = buildTimelineRequest({
      rulebookId: rulebook.id,
      title,
      text,
      role,
      licence,
      url,
      published,
      externalId,
    });
    if ("error" in built) {
      toast.error(built.error);
      return;
    }
    await run.launch(built.body, title.trim());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a case that unfolded over time</DialogTitle>
          <DialogDescription>
            A case report, an incident write-up, a negotiation log — anything
            where what you knew changed as it went. The system reads it step by
            step: what was known at each point, what was still unknown, and what
            you did next. That order is the part the other ways throw away.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              {describeTimelineIngest(summary)}
            </p>
            {summary.timeline ? (
              <KindInstanceRender
                kind={SERIAL_OBSERVATION_TIMELINE_KIND}
                value={summary.timeline}
              />
            ) : (
              <p className="text-sm text-amber-600 dark:text-amber-500">
                The unfolded case did not come back with the run, so it cannot
                be shown here. It is saved — open Sources to see it.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {summary.role === "teaching" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    reset();
                    onOpenChange(false);
                  }}
                >
                  Review the drafts
                </Button>
              ) : (
                <Button size="sm" asChild>
                  <Link
                    href={`/masterwork/${rulebook.id}/sources`}
                    onClick={() => {
                      reset();
                      onOpenChange(false);
                    }}
                  >
                    See your held-out cases
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ) : running || run.stages.length > 0 ? (
          <div className="space-y-2">
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
              {run.stages.map((line, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
            {running ? (
              <div className="flex items-start gap-2">
                <LoadingSpinner size="sm" />
                <p className="text-xs text-muted-foreground">
                  {rejoining
                    ? "Picking this back up — it kept reading while you were away."
                    : "Reading the case step by step — this takes a minute."}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="timeline-title">What is this case called?</Label>
              <Input
                id="timeline-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. The Tuesday outage, or Case 14 — fever and a stiff neck"
              />
            </div>

            <div className="space-y-1.5">
              <Label>What is this case for?</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    className={cn(
                      "rounded-md border p-2.5 text-left transition-colors",
                      role === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-muted-foreground/40",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">
                      {opt.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {opt.blurb}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timeline-text">The case, start to finish</Label>
              <ProTextarea
                id="timeline-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the whole thing in the order it happened — long is fine. Keep the times, the findings and what you decided to do next; those are what get read."
                rows={12}
                enableTextStats
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timeline-licence">
                What lets you use this case?
              </Label>
              <Input
                id="timeline-licence"
                value={licence}
                onChange={(e) => setLicence(e.target.value)}
                placeholder="e.g. my own work, CC BY 4.0, or the publisher's name"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="timeline-url">Link to it (optional)</Label>
                <Input
                  id="timeline-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timeline-published">
                  When was it published? (optional)
                </Label>
                <Input
                  id="timeline-published"
                  type="date"
                  value={published}
                  onChange={(e) => setPublished(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timeline-external-id">
                Its own reference number (optional)
              </Label>
              <Input
                id="timeline-external-id"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="e.g. a DOI, a PubMed id, your own case number"
              />
            </div>
          </div>
        )}

        {!summary ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={running}
            >
              Cancel
            </Button>
            <Button onClick={() => void launch()} disabled={running}>
              {running
                ? "Reading the case…"
                : role === "heldout"
                  ? "Seal it as a test case"
                  : "Read it and suggest rules"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
