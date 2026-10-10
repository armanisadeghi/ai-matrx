"use client";

// features/crm/pre-send-check/PreSendCheckPanel.tsx
//
// The ONE rendering of a pre-send check report: the critique's score and notes,
// the fact check's verdict (and its full Markdown on demand), and each
// recipient's fit. Pitch advisories render in <PitchAdvisoryPanel> beside it,
// so this panel only counts them. Every part says ran / skipped / failed in
// its own row — nothing disappears when it did not run.

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import MarkdownRenderer from "@/components/mardown-display/MarkdownRenderer";
import { cn } from "@/lib/utils";
import { RecipientFitBadge } from "./RecipientFitBadge";
import type { PartStatus, PreSendCheckReport } from "./service";
import type { PreSendCheckState } from "./usePreSendCheck";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
function PartNote({ status }: { status: PartStatus }) {
  if (status.state === "ran") return null;
  return (
    <p
      className={cn(
        "text-xs",
        status.state === "failed" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {status.state === "failed" ? "Did not run: " : "Skipped: "}
      {status.reason ?? "no reason given"}
    </p>
  );
}

function criterionNotes(report: PreSendCheckReport): { id: number; score: number; note: string }[] {
  const criteria = report.critique.critique?.criteria;
  if (!Array.isArray(criteria)) return [];
  return criteria
    .map((c) => {
      const row = (c ?? {}) as { id?: unknown; score?: unknown; note?: unknown };
      return {
        id: typeof row.id === "number" ? row.id : 0,
        score: typeof row.score === "number" ? row.score : 0,
        note: typeof row.note === "string" ? row.note : "",
      };
    })
    .filter((c) => c.score < 2 && c.note);
}

export function PreSendCheckPanel({
  state,
  onRerun,
}: {
  state: PreSendCheckState;
  onRerun?: () => void;
}) {
  const [showFacts, setShowFacts] = useState(false);
  const { report, running, error } = state;

  if (running && !report) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground" data-testid="pre-send-check-running">
        <Loader2 className="h-4 w-4 animate-spin" /> Reviewing the draft…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm" data-testid="pre-send-check-error">
        <p className="flex items-center gap-2 font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" /> The review did not run
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        {onRerun && (
          <Button variant="outline" onClick={onRerun}>
            Try again
          </Button>
        )}
      <ErrorAlchemyMenu /></div>
    );
  }
  if (!report) return null;

  const critique = report.critique.critique;
  const score = typeof critique?.score === "number" ? critique.score : null;
  const verdict = typeof critique?.verdict === "string" ? critique.verdict : null;
  const notes = criterionNotes(report);
  const warnings = (report.advisories?.advisories ?? []).filter((a) => a.severity !== "info").length;

  return (
    <div className="space-y-3 rounded-md border p-3 text-sm" data-testid="pre-send-check-report">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Review before send</p>
        <div className="flex items-center gap-2">
          {warnings > 0 && (
            <Badge variant="outline">{warnings} PR warning{warnings === 1 ? "" : "s"}</Badge>
          )}
          {onRerun && (
            <Button
              variant="quiet"
              onClick={onRerun}
              disabled={running}
              aria-label="Review again"
              icon={running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            />
          )}
        </div>
      </div>

      <section className="space-y-1" data-testid="pre-send-critique">
        <p className="flex items-center gap-2 font-medium">
          Critique
          {score !== null && <Badge variant="secondary">{score}/10</Badge>}
          {verdict && <span className="text-xs text-muted-foreground">{verdict.replace("_", " ")}</span>}
        </p>
        <PartNote status={report.critique.status} />
        {notes.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {notes.slice(0, 6).map((n) => (
              <li key={n.id}>{n.note}</li>
            ))}
          </ul>
        )}
        {(report.critique.corrections ?? []).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Score recomputed from the rubric.
          </p>
        )}
      </section>

      <section className="space-y-1" data-testid="pre-send-fact-check">
        <p className="flex items-center gap-2 font-medium">
          Fact check
          {report.fact_check.status.state === "ran" && (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Ran" />
          )}
        </p>
        <PartNote status={report.fact_check.status} />
        {report.fact_check.verdict && <p className="text-xs">{report.fact_check.verdict}</p>}
        {report.fact_check.markdown && (
          <>
            <Button
              variant="quiet"
              onClick={() => setShowFacts((v) => !v)}
              icon={<ChevronDown className={cn(showFacts && "rotate-180")} />}
            >
              {showFacts ? "Hide claims" : "Show claims"}
            </Button>
            {showFacts && (
              <div className="max-h-64 overflow-y-auto rounded border bg-muted/30 p-2">
                <MarkdownRenderer content={report.fact_check.markdown} type="markdown" fontSize={12} />
              </div>
            )}
          </>
        )}
      </section>

      <section className="space-y-1" data-testid="pre-send-fit">
        <p className="font-medium">Recipient fit</p>
        <PartNote status={report.fit_status} />
        {(report.recipients ?? []).map((r) => (
          <div key={r.party_id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{r.name ?? "Recipient"}</span>
            {r.outlet_name && <span className="text-muted-foreground">{r.outlet_name}</span>}
            <RecipientFitBadge fit={r} />
            {r.note && <span className="line-clamp-1 text-muted-foreground">{r.note}</span>}
          </div>
        ))}
      </section>
    </div>
  );
}
