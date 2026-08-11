"use client";

/**
 * Admin data-quality controls (DEF-25) — the previously orphaned admin-only
 * routes POST /seo/keywords/classify and POST /seo/keywords/assign-topics
 * finally get a UI. Both routes are capped server-side (explicit id lists
 * ≤200, batches ≤40) and require ctx.is_admin; this panel is the simplest
 * real surface that lets an admin trigger a run and see what happened.
 */

import { useState } from "react";
import { ListChecks, Loader2, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { extractErrorMessage } from "@/utils/errors";
// Both routes wait on provider calls inside the request — the shared header
// budget lives with the classifier service, never re-invented per surface.
import { SEO_COMPUTE_CONNECT_TIMEOUT_MS } from "@/features/marketing/search-console/data-classification";

const CLASSIFY_PATH = "/seo/keywords/classify";
const ASSIGN_TOPICS_PATH = "/seo/keywords/assign-topics";

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
  const dispatch = useAppDispatch();
  const [limit, setLimit] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ClassifyResult | null>(null);

  const run = async () => {
    setSubmitting(true);
    try {
      const response = await dispatch(
        callApi({
          path: CLASSIFY_PATH,
          method: "POST",
          body: { language: "en", limit },
          connectTimeoutMs: SEO_COMPUTE_CONNECT_TIMEOUT_MS,
          totalTimeoutMs: null,
        }),
      );
      if (response.error) throw new Error(response.error.message);
      const data = response.data as unknown as ClassifyResult;
      setResult(data);
      toast.success(`Classified ${data.updated} of ${data.eligible} eligible keywords`);
    } catch (error) {
      toast.error("Classification failed", { description: extractErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
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
          plane, not site-scoped), in batches of ≤40, filling all 13 intrinsic
          columns + envelope. Capped at 200 keywords per run.
        </p>
        <div className="flex items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="classify-limit" className="text-xs">
              Limit (≤200)
            </Label>
            <Input
              id="classify-limit"
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
          <Button size="sm" className="h-8 gap-1.5" disabled={submitting} onClick={() => void run()}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Run classifier
          </Button>
        </div>
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
  const dispatch = useAppDispatch();
  const [territory, setTerritory] = useState("");
  const [limit, setLimit] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AssignTopicsResult | null>(null);

  const run = async () => {
    const territoryValue = territory.trim();
    if (!territoryValue) return;
    setSubmitting(true);
    try {
      const response = await dispatch(
        callApi({
          path: ASSIGN_TOPICS_PATH,
          method: "POST",
          body: { territory: territoryValue, language: "en", limit },
          connectTimeoutMs: SEO_COMPUTE_CONNECT_TIMEOUT_MS,
          totalTimeoutMs: null,
        }),
      );
      if (response.error) throw new Error(response.error.message);
      const data = response.data as unknown as AssignTopicsResult;
      setResult(data);
      toast.success(`Assigned ${data.keywords_assigned} of ${data.eligible} eligible keywords`);
    } catch (error) {
      toast.error("Topic assignment failed", { description: extractErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
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
            onClick={() => void run()}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Run topic assigner
          </Button>
        </div>
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
