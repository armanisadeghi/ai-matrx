"use client";

/**
 * Admin data-quality controls (DEF-25) — the admin-only routes
 * POST /seo/keywords/classify and POST /seo/keywords/assign-topics. Both are
 * capped server-side (explicit id lists ≤200) and require ctx.is_admin.
 *
 * THE FLOATING LAW: both are DURABLE STREAMED COMMANDS. A 40-keyword
 * classification is ~88s of paid model work, and it used to sit behind a bare
 * spinner; it now streams its real milestones — the eligible set, the batch
 * plan, which phrases are in flight, what each batch wrote — plus the
 * classifier's own output, into the floating `LiveRunWindow`. A reload rejoins
 * the run instead of losing it.
 */

import { useState } from "react";
import { ListChecks, Loader2, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";

const CLASSIFY_PATH = "/seo/keywords/classify";
/**
 * The server accepts 200. Streaming removed the CDN's ~100s severance (the run
 * is durable and rejoinable now), but a batch is still ~88s of paid work and an
 * operator wants a pass that finishes while they watch it, so one run stays
 * capped here at 40. Run it repeatedly to work through a backlog.
 */
const CLASSIFY_RUN_LIMIT = 40;
const ASSIGN_TOPICS_PATH = "/seo/keywords/assign-topics";

/** The server's own milestones, in the operator's words. Never invented. */
const CLASSIFY_STAGES: Record<string, string> = {
  "seo.classify_started": "Selecting the unclassified backlog…",
  "seo.classify_batch_started": "Classifying a batch of keywords…",
  "seo.classify_batch_completed": "Batch saved…",
  "seo.classify_completed": "Classification complete",
};

const ASSIGN_STAGES: Record<string, string> = {
  "seo.assign_topics_started": "Selecting unassigned keywords…",
  "seo.assign_topics_tree_loaded": "Reading the shared topic tree…",
  "seo.assign_topics_agent_completed": "Pinning keywords to topics…",
  "seo.assign_topics_applied": "Saving assignments…",
  "seo.assign_topics_completed": "Topic assignment complete",
};

interface ClassifyResult {
  eligible: number;
  batches: number;
  updated: number;
  skipped_error: number;
  missing_keyword_ids: string[];
}

interface AssignTopicsResult {
  eligible: number;
  topics_created: string[];
  keywords_assigned: number;
  unassignable: number;
  unknown_topic_refs: string[];
}

function ClassifyCard() {
  const [limit, setLimit] = useState(CLASSIFY_RUN_LIMIT);

  const command = useSeoCommandRun<ClassifyResult>({
    key: "classify",
    path: CLASSIFY_PATH,
    finalKind: "seo.classify_completed",
    stageLabels: CLASSIFY_STAGES,
    live: { label: "Keyword classifier" },
  });
  const submitting = command.running;
  const result = command.result;

  const run = () => {
    void command.launch({ language: "en", limit });
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <ListChecks className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold text-foreground">Keyword Classifier</h1>
      </div>
      <div className="grid gap-3 p-3">
        <p className="text-xs text-muted-foreground">
          Runs the Keyword Classifier over the oldest unclassified keywords (universal
          plane, not site-scoped), filling all 13 intrinsic columns + envelope. A
          40-keyword batch is about 90 seconds of model work, so one run is capped at{" "}
          {CLASSIFY_RUN_LIMIT} keywords — run it repeatedly to work through a backlog.
          The run streams into its own window and survives a reload.
        </p>
        <div className="flex items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="classify-limit" className="text-xs">
              Limit (≤{CLASSIFY_RUN_LIMIT})
            </Label>
            <Input
              id="classify-limit"
              type="number"
              min={1}
              max={CLASSIFY_RUN_LIMIT}
              value={limit}
              onChange={(event) =>
                setLimit(
                  Math.max(1, Math.min(CLASSIFY_RUN_LIMIT, Number(event.target.value) || 1)),
                )
              }
              className="w-28"
            />
          </div>
          <Button size="sm" className="h-8 gap-1.5" disabled={submitting} onClick={run}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Run classifier
          </Button>
          {command.stage && submitting ? (
            <p className="pb-1.5 text-[11px] text-muted-foreground">{command.stage}</p>
          ) : null}
        </div>
        {command.error ? (
          <p className="text-[11px] text-destructive">{command.error}</p>
        ) : null}
        {result ? (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Eligible</p>
              <p className="font-semibold text-foreground">{result.eligible}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Batches</p>
              <p className="font-semibold text-foreground">{result.batches}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Updated</p>
              <p className="font-semibold text-foreground">{result.updated}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Skipped (error)</p>
              <p className="font-semibold text-foreground">{result.skipped_error}</p>
            </div>
            {result.missing_keyword_ids.length ? (
              <p className="col-span-full text-amber-600 dark:text-amber-400">
                Missing keyword ids: {result.missing_keyword_ids.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AssignTopicsCard() {
  const [territory, setTerritory] = useState("");
  const [limit, setLimit] = useState(50);

  const command = useSeoCommandRun<AssignTopicsResult>({
    key: "assign-topics",
    path: ASSIGN_TOPICS_PATH,
    finalKind: "seo.assign_topics_completed",
    stageLabels: ASSIGN_STAGES,
    live: { label: "Topic assigner" },
  });
  const submitting = command.running;
  const result = command.result;

  const run = () => {
    const territoryValue = territory.trim();
    if (!territoryValue) return;
    void command.launch(
      { territory: territoryValue, language: "en", limit },
      territoryValue,
    );
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <Tags className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold text-foreground">Topic Assigner</h1>
      </div>
      <div className="grid gap-3 p-3">
        <p className="text-xs text-muted-foreground">
          Pins unassigned keywords to the shared topic tree for one industry
          territory (lazy growth — new topic nodes land with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">is_builtin=false</code>{" "}
          and provenance metadata). Capped at 200 keywords per run.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="assign-territory" className="text-xs">
              Industry territory
            </Label>
            <Input
              id="assign-territory"
              value={territory}
              onChange={(event) => setTerritory(event.target.value)}
              placeholder="e.g. electronics recycling"
              className="w-64"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="assign-limit" className="text-xs">
              Limit (≤200)
            </Label>
            <Input
              id="assign-limit"
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(event) =>
                setLimit(Math.max(1, Math.min(200, Number(event.target.value) || 1)))
              }
              className="w-28"
            />
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={submitting || !territory.trim()}
            onClick={run}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Run topic assigner
          </Button>
          {command.stage && submitting ? (
            <p className="pb-1.5 text-[11px] text-muted-foreground">{command.stage}</p>
          ) : null}
        </div>
        {command.error ? (
          <p className="text-[11px] text-destructive">{command.error}</p>
        ) : null}
        {result ? (
          <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Eligible</p>
                <p className="font-semibold text-foreground">{result.eligible}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Assigned</p>
                <p className="font-semibold text-foreground">{result.keywords_assigned}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Unassignable</p>
                <p className="font-semibold text-foreground">{result.unassignable}</p>
              </div>
              <div>
                <p className="text-muted-foreground">New topics</p>
                <p className="font-semibold text-foreground">{result.topics_created.length}</p>
              </div>
            </div>
            {result.topics_created.length ? (
              <div className="flex flex-wrap gap-1.5">
                {result.topics_created.map((slug) => (
                  <Badge key={slug} variant="secondary" className="text-[10px]">
                    {slug}
                  </Badge>
                ))}
              </div>
            ) : null}
            {result.unknown_topic_refs.length ? (
              <p className="text-amber-600 dark:text-amber-400">
                Unknown topic refs: {result.unknown_topic_refs.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function KeywordDataQualityPanel() {
  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="mb-3">
        <h1 className="text-sm font-semibold text-foreground">Keyword data quality</h1>
        <p className="text-xs text-muted-foreground">
          Admin-only controls over the universal keyword plane: classification and topic
          assignment (DEF-25).
        </p>
      </div>
      <div className="grid max-w-3xl gap-3">
        <ClassifyCard />
        <AssignTopicsCard />
      </div>
    </main>
  );
}
