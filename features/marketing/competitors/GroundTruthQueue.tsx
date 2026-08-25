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
 *
 * The list itself is the canonical `MatrxDataTable` (every column sorts and
 * filters). "Right" stays a one-click row action, with the free-text "why"
 * moved into a popover so the row stays a table row. "Wrong" opens the
 * canonical WindowPanel onto the full `CompetitorClassificationEditor` — never
 * a side drawer.
 */

import { useMemo, useState } from "react";
import { ArrowUpRight, Check, Loader2, X } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

/** The one-click "Right" action, with the free-text "why" tucked into a
 *  popover so it stays available without needing an always-visible textarea
 *  in every row. */
function AgreeAction({
  row,
  onSaved,
}: {
  row: CompetitorRow;
  onSaved: () => Promise<void>;
}) {
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

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
      setOpen(false);
      setWhy("");
      await onSaved();
      toast.success("Ruling saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your ruling",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={busy}
          onClick={(event) => event.stopPropagation()}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Right
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-2"
        onClick={(event) => event.stopPropagation()}
      >
        <Label
          htmlFor={`gt-why-${row.id}`}
          className="text-xs font-normal text-muted-foreground"
        >
          Optional, and the most valuable thing here: why?
        </Label>
        <Textarea
          id={`gt-why-${row.id}`}
          rows={2}
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          placeholder="Say it however you would say it out loud."
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={busy} onClick={() => void agree()} className="gap-1.5">
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Confirm right
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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

  const columns = useMemo<MatrxColumnDef<CompetitorRow>[]>(
    () => [
      {
        accessorKey: "display_domain",
        header: "Competitor",
        filter: "text",
        cell: (row) => (
          <a
            href={`https://${row.display_domain}`}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex max-w-64 items-center gap-1 truncate font-medium text-primary hover:underline"
          >
            <span className="truncate">
              {row.display_name || row.display_domain}
            </span>
            <ArrowUpRight className="size-3 shrink-0" />
          </a>
        ),
      },
      {
        accessorKey: "entity_role",
        header: "Proposed classification",
        filter: "select",
        width: 190,
        cell: (row) => (
          <Badge
            className="max-w-full truncate whitespace-nowrap"
            title={derivedCompetitorLabel(row)}
          >
            {derivedCompetitorLabel(row)}
          </Badge>
        ),
      },
      {
        id: "confidence",
        header: "Confidence",
        filter: "number",
        align: "right",
        accessorFn: (row) => confidenceOf(row),
        cell: (row) => {
          const confidence = confidenceOf(row);
          return confidence ? (
            <span className="tabular-nums">{confidence}%</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "reason",
        header: "Why the machine thinks this",
        filter: "text",
        width: 420,
        accessorFn: (row) => headlineReason(row),
        cell: (row) => {
          const reason = headlineReason(row);
          return reason ? (
            <span className="line-clamp-2 leading-5">{reason}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "use_for_link_gap",
        header: "Link-gap seed",
        filter: "boolean",
        cell: (row) =>
          row.use_for_link_gap ? (
            <Badge variant="secondary">Would chase their links</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

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
      <CardContent>
        <MatrxDataTable
          urlState={{ id: "competitor-ground-truth" }}
          data={pending}
          columns={columns}
          getRowId={(row) => row.id}
          // MSR-19/20: "Wrong" opens the canonical WindowPanel onto the full
          // axis editor — never a side drawer. `onOpen` is required or the
          // opener falls through to `onRowOpen` instead of opening the window
          // (the same bug already fixed on the search-console insight tables,
          // features/marketing/search-console/components/insights/InsightsTab.tsx).
          detail={{ enabled: false }}
          window={{
            title: (row) => row.display_name || row.display_domain,
            renderView: (row) => (
              <CompetitorClassificationEditor row={row} onSaved={onSaved} source={SOURCE} />
            ),
            enabled: true,
            onOpen: () => {},
          }}
          rowActions={(row, controls) => (
            <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
              <AgreeAction row={row} onSaved={onSaved} />
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => controls.openWindow()}
              >
                <X className="size-3.5" />
                Wrong
              </Button>
            </div>
          )}
          emptyState={{
            title: "Nothing waiting",
            description:
              "Find competitors, or add one you already know, and they will queue up here.",
          }}
        />
      </CardContent>
    </Card>
  );
}

export default GroundTruthQueue;
