"use client";

/**
 * features/marketing/competitors/GroundTruthQueue.tsx
 *
 * THE RULING QUEUE — where a human's judgment becomes ground truth.
 *
 * System of record: `common-docs/systems/marketing/competitor-classification/FEATURE.md`
 * §8d step 6 and §10. Zero competitors in this platform have ever been
 * human-ruled, so every threshold is provisional; the missing thing is labels.
 *
 * The interaction is deliberately NOT a form and NOT a quiz:
 *
 *   - **The real judgment calls first.** *"run one or two quick analyses, return
 *     the handful of results the agent is most confident about, and ask did we
 *     get these right or wrong?"* — but a registry row is certain by
 *     construction and teaches us nothing, so `teachingValue` puts the confident
 *     AI calls about real companies at the top and the deterministic furniture
 *     at the bottom. Disagreement on a confident judgment is the single most
 *     informative thing this surface can collect.
 *   - **Two buttons.** Right, or Wrong. Everything else is optional.
 *   - **No abstract taxonomy questions, ever.** The reader sees a real domain
 *     from their own search results and a plain sentence about it. They never
 *     see the word "axis".
 *   - **The why box is free text and it is the point.** Three saved axes teach
 *     a threshold; one sentence of a real expert's reasoning teaches the system
 *     how that expert thinks.
 */

import { useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

import type { CompetitorRow } from "./data";
import { saveCompetitorClassification } from "./data";
import { axesOf, buildRuling } from "./groundTruth";
import {
  CompetitorClassificationEditor,
  derivedCompetitorLabel,
} from "./CompetitorIdentification";

const SOURCE = "ground_truth_queue";

/** How sure the machine was. Deterministic rows carry 100 by construction. */
function confidenceOf(row: CompetitorRow): number {
  const classification = (
    row.latest_autopsy as { classification?: { confidence?: unknown } } | null
  )?.classification;
  return typeof classification?.confidence === "number"
    ? classification.confidence
    : 0;
}

function layerOf(row: CompetitorRow): string {
  const classification = (
    row.latest_autopsy as { classification?: { layer?: unknown } } | null
  )?.classification;
  return typeof classification?.layer === "string" ? classification.layer : "";
}

/**
 * How much a ruling on this row would TEACH us — which is not the same as how
 * confident the machine is.
 *
 * A registry row ("wikipedia.org is a reference site") is certain by
 * construction, and confirming it teaches us almost nothing. A judgment about a
 * real company at 95% is the thing we have zero labels for, and either answer —
 * agreement or correction — is worth having. So judgment calls come first,
 * confident ones before shaky ones, and the deterministic furniture goes last
 * where it is a fast, satisfying tail rather than six clicks of tedium standing
 * between the reader and the real question.
 */
function teachingValue(row: CompetitorRow): number {
  const base = confidenceOf(row);
  return layerOf(row) === "deterministic" ? base - 1000 : base;
}

/** The one-line case for this row, in the machine's own words. */
function headlineReason(row: CompetitorRow): string {
  const classification = (
    row.latest_autopsy as {
      classification?: { reasons?: Record<string, string> };
    } | null
  )?.classification;
  const reasons = classification?.reasons ?? {};
  return (
    reasons.business_overlap ||
    reasons.entity_role ||
    reasons.market_overlap ||
    ""
  );
}

function RulingRow({
  row,
  onSaved,
}: {
  row: CompetitorRow;
  onSaved: () => Promise<void>;
}) {
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const confidence = confidenceOf(row);
  const reason = headlineReason(row);

  const agree = async () => {
    setBusy(true);
    try {
      await saveCompetitorClassification(
        row.id,
        {
          business_overlap: row.business_overlap,
          market_overlap: row.market_overlap,
          entity_role: row.entity_role,
          peer_scale: row.peer_scale,
          posture: row.posture,
          use_for_link_gap: row.use_for_link_gap,
          custom_labels: row.custom_labels,
        },
        true,
        buildRuling({
          row,
          ruling: axesOf(row),
          why,
          source: SOURCE,
          labelOf: derivedCompetitorLabel,
        }),
      );
      await onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your ruling",
      );
    } finally {
      setBusy(false);
    }
  };

  if (correcting) {
    return (
      <div className="rounded-lg border border-primary/30 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{row.display_domain}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCorrecting(false)}
          >
            Cancel
          </Button>
        </div>
        <CompetitorClassificationEditor
          row={row}
          onSaved={onSaved}
          source={SOURCE}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://${row.display_domain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {row.display_name || row.display_domain}
              <ExternalLink className="size-3" />
            </a>
            <Badge>{derivedCompetitorLabel(row)}</Badge>
            {confidence ? (
              <span className="text-xs text-muted-foreground">
                {confidence}% sure
              </span>
            ) : null}
            {row.use_for_link_gap ? (
              <Badge variant="secondary">Would chase their links</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{row.display_domain}</p>
          {reason ? (
            <p className="max-w-3xl text-sm leading-6">{reason}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={() => void agree()}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Right
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={busy}
            onClick={() => setCorrecting(true)}
          >
            <X className="size-3.5" />
            Wrong
          </Button>
        </div>
      </div>
      <div className="mt-2">
        <Label
          htmlFor={`gt-why-${row.id}`}
          className="text-xs font-normal text-muted-foreground"
        >
          Optional, and the most valuable thing on this page: why?
        </Label>
        <Textarea
          id={`gt-why-${row.id}`}
          rows={1}
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          className="mt-1 min-h-9"
          placeholder="Say it however you would say it out loud."
        />
      </div>
    </div>
  );
}

export function GroundTruthQueue({
  competitors,
  onSaved,
}: {
  competitors: CompetitorRow[];
  onSaved: () => Promise<void>;
}) {
  const pending = useMemo(
    () =>
      competitors
        .filter((row) => row.classification_status !== "confirmed")
        .sort((left, right) => teachingValue(right) - teachingValue(left)),
    [competitors],
  );
  const ruled = competitors.length - pending.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Did we get these right?</CardTitle>
        <p className="text-xs text-muted-foreground">
          These came out of your own search results. The real judgment calls are
          first; the obvious ones are at the bottom. {ruled} ruled,{" "}
          {pending.length} to go — every answer sharpens every run after it.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing waiting. Find competitors, or add one you already know, and
            they will queue up here.
          </p>
        ) : (
          pending.map((row) => (
            <RulingRow key={row.id} row={row} onSaved={onSaved} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default GroundTruthQueue;
