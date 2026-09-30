"use client";

/**
 * "Review what goes in" — dev harness (USI-4).
 *
 * Proves the review's one discipline on REAL stored Sources: the numbers on
 * screen equal what the returned SourceSet carries, and what the ONE server
 * handler resolves from it. Two ways in, same component:
 *   - inline (the canonical `SourceReview` body, as a page would host it);
 *   - the window, through `openSourceReview(sourceSet, options)`.
 * "Check with the server" posts the planned set to /sources/manifest and
 * /sources/resolve and compares the character counts.
 */

import { useState } from "react";
import { PanelTop } from "lucide-react";
import { Button, Input } from "@ai-matrx/design-system";
import { createSourceRef, createSourceSet, type SourceSet } from "@ai-matrx/agents/sources";
import { SourceReview } from "@/features/resource-manager/source-input/review/SourceReview";
import { openSourceReview } from "@/features/resource-manager/source-input/review/openSourceReview";
import { fetchSourceManifest, resolveSourceSet } from "@/features/resource-manager/source-input/sourceSetApi";
import type { SourcePlan } from "@/features/resource-manager/source-input/review/plan";
import type { SourceReviewOutcome } from "@/features/resource-manager/source-input/review/types";

/** Real Sources owned by admin@admin.com: a 240-page PDF, a 227-page PDF and a note. */
const DEFAULT_REFS = [
  "file:e7c4d481-6b4d-430a-9c5e-330b464e6c8f",
  "file:6880fa94-4d71-463e-b8bd-160789896a74",
  "note:effcbd12-a8ce-4c6f-b846-a219971c4391",
].join("\n");

function parseRefs(text: string, model: string): SourceSet {
  const refs = text
    .split(/\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [type, id] = line.split(":");
      return createSourceRef(type ?? "", id ?? "");
    });
  return createSourceSet(refs, { target_model_id: model.trim() || undefined });
}

interface ServerCheck {
  planned: number;
  manifestTotal: number;
  resolvedTotal: number;
  resolvedSources: number;
  dropped: string[];
  notes: string[];
}

export default function SourceReviewHarnessPage() {
  const [refsText, setRefsText] = useState(DEFAULT_REFS);
  const [model, setModel] = useState("");
  const [set, setSet] = useState<SourceSet>(() => parseRefs(DEFAULT_REFS, ""));
  const [plan, setPlan] = useState<SourcePlan | null>(null);
  const [outcome, setOutcome] = useState<SourceReviewOutcome | null>(null);
  const [check, setCheck] = useState<ServerCheck | string | null>(null);
  const [checking, setChecking] = useState(false);
  const [round, setRound] = useState(0);

  const load = () => {
    setSet(parseRefs(refsText, model));
    setRound((r) => r + 1);
    setPlan(null);
    setCheck(null);
  };

  const runCheck = async (target: SourceSet, planned: number) => {
    setChecking(true);
    setCheck(null);
    try {
      const [manifest, resolved] = await Promise.all([fetchSourceManifest(target), resolveSourceSet(target)]);
      setCheck({
        planned,
        manifestTotal: manifest.total_chars,
        resolvedTotal: resolved.sources.reduce((n, s) => n + s.text.length, 0),
        resolvedSources: resolved.sources.length,
        dropped: resolved.dropped.map((d) => `${d.ref.resource_id} (${d.reason})`),
        notes: resolved.sources.flatMap((s) => s.notes.map((n) => `${s.label}: ${n}`)),
      });
    } catch (err) {
      setCheck(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-textured p-4">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold text-foreground">Review what goes in — harness</h1>
        <p className="text-sm text-muted-foreground">
          One Source per line as <code>type:id</code>. Model is optional (a model id or name); leave it empty to see
          the unknown-model default.
        </p>
        <textarea
          value={refsText}
          onChange={(e) => setRefsText(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
          aria-label="Sources"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Target model (optional)"
            className="w-64"
            aria-label="Target model"
          />
          <Button type="button" variant="outline" onClick={load}>
            Load
          </Button>
          <Button
            type="button"
            onClick={async () => {
              const result = await openSourceReview(set, {
                purpose: "a harness check",
                reason: "large",
                addMoreLabel: "Add more Sources",
              });
              setOutcome(result);
            }}
          >
            <PanelTop className="mr-1.5 h-4 w-4" />
            Open as a window
          </Button>
        </div>
      </div>

      <div className="h-[640px] shrink-0 rounded-lg border border-border bg-card">
        <SourceReview
          key={round}
          sourceSet={set}
          options={{ purpose: "a harness check" }}
          onApply={(s) => setOutcome({ status: "applied", sourceSet: s })}
          onCancel={() => setOutcome({ status: "cancelled" })}
          onPlanChange={setPlan}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">Planned:</span>
          <span data-testid="planned-chars" className="tabular-nums">
            {plan ? `${plan.sentChars} characters · ${plan.sourceSet.sources.length} Sources · ${plan.verdict}` : "—"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!plan || checking}
            onClick={() => plan && runCheck(plan.sourceSet, plan.sentChars)}
          >
            {checking ? "Checking…" : "Check with the server"}
          </Button>
        </div>
        {check && typeof check === "string" && <p className="text-red-600">{check}</p>}
        {check && typeof check !== "string" && (
          <pre data-testid="server-check" className="overflow-x-auto whitespace-pre-wrap text-xs">
            {JSON.stringify({ ...check, match: check.planned === check.resolvedTotal }, null, 2)}
          </pre>
        )}
        <div className="font-medium text-foreground">Returned SourceSet</div>
        <pre data-testid="outcome" className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
          {outcome ? JSON.stringify(outcome, null, 2) : "Nothing returned yet."}
        </pre>
      </div>
    </div>
  );
}
