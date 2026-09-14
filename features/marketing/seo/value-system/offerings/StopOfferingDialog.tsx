"use client";

/**
 * Stop offering one or more offerings on this site — the consequence stated
 * BEFORE the click (destructive-and-expensive-actions), per item and in total.
 *
 * Stopping is explicit availability (brand-offerings D2): the brand keeps the
 * offering; this site stops exposing it. That removes this site's keyword
 * placements and worth ruling on it, because nothing may be placed on or valued
 * for an offering a site does not offer. Offering it again restores exactly
 * what was removed — and the dialog says so, so the person is not afraid of it.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { extractErrorMessage } from "@/utils/errors";
import { formatCount } from "@/features/marketing/search-console/types";
import { getAvailabilityImpact, type AvailabilityImpact } from "./data";

export function StopOfferingDialog({
  siteId,
  offerings,
  busy,
  onCancel,
  onConfirm,
}: {
  siteId: string;
  offerings: { id: string; name: string }[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const ids = offerings.map((offering) => offering.id);
  const impact = useQuery({
    queryKey: ["seo", "offerings", "availability-impact", siteId, [...ids].sort()],
    queryFn: ({ signal }) => getAvailabilityImpact(siteId, ids, signal),
  });

  const rows = impact.data ?? [];
  const total = rows.reduce(
    (sum, row) => ({
      placements: sum.placements + row.placements,
      human: sum.human + row.humanPlacements,
      worth: sum.worth + (row.hasWorth ? 1 : 0),
      inheriting: sum.inheriting + row.keywordsInheritingWorth,
    }),
    { placements: 0, human: 0, worth: 0, inheriting: 0 },
  );
  const title =
    offerings.length === 1
      ? `Stop offering “${offerings[0].name}” on this site?`
      : `Stop offering ${offerings.length} offerings on this site?`;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="flex max-h-[90dvh] max-w-xl flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription>
            The brand keeps {offerings.length === 1 ? "it" : "them"}. Only this
            site stops offering {offerings.length === 1 ? "it" : "them"}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
          {impact.isPending ? (
            <div className="space-y-2" aria-label="Measuring what this changes">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : impact.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p>Could not measure what this would change: {extractErrorMessage(impact.error)}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void impact.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
                <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  {total.placements === 0 && total.worth === 0
                    ? "Nothing on this site is placed on or valued through this. It simply stops being offered here."
                    : summarize(total)}
                </p>
                {total.inheriting > 0 ? (
                  <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
                    {formatCount(total.inheriting)} keyword
                    {total.inheriting === 1 ? "" : "s"} on offerings beneath{" "}
                    {offerings.length === 1 ? "it" : "them"} take their worth
                    from {offerings.length === 1 ? "its" : "their"} ruling and
                    will get the nearest ruling above instead, or the baseline.
                  </p>
                ) : null}
                <p className="mt-1.5 flex items-start gap-2 pl-6 text-xs text-muted-foreground">
                  <RotateCcw className="mt-0.5 h-3 w-3 shrink-0" />
                  Offering {offerings.length === 1 ? "it" : "them"} here again
                  restores exactly these placements and the worth ruling.
                </p>
              </div>

              {rows.length > 1 ? (
                <ul className="divide-y divide-border rounded-md border border-border text-xs">
                  {rows.map((row) => (
                    <li key={row.offeringId} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="min-w-0 truncate font-medium text-foreground">{row.offeringName}</span>
                      <span className="shrink-0 text-muted-foreground">{describeRow(row)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="stop-offering-reason" className="text-xs">
              Why does this site not offer {offerings.length === 1 ? "it" : "them"}?
            </Label>
            <ProTextarea
              id="stop-offering-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="This site only covers enterprise work; household recycling lives on our other site."
              rows={2}
              className="text-base sm:text-sm"
            />
          </div>
        </div>

        <DialogFooter className="pb-safe">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || impact.isPending || Boolean(impact.error)}
            onClick={() => onConfirm(reason)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Stop offering here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function summarize(total: { placements: number; human: number; worth: number }): string {
  const parts: string[] = [];
  if (total.placements > 0) {
    parts.push(
      `${formatCount(total.placements)} keyword placement${total.placements === 1 ? "" : "s"} on this site ${total.placements === 1 ? "is" : "are"} removed` +
        (total.human > 0 ? ` (${formatCount(total.human)} made by a person)` : ""),
    );
  }
  if (total.worth > 0) {
    parts.push(
      `${formatCount(total.worth)} worth ruling${total.worth === 1 ? " is" : "s are"} removed`,
    );
  }
  return `${parts.join("; ")}.`;
}

function describeRow(row: AvailabilityImpact): string {
  const bits = [`${formatCount(row.placements)} placed`];
  if (row.hasWorth) bits.push("has worth");
  if (row.keywordsInheritingWorth > 0) bits.push(`${formatCount(row.keywordsInheritingWorth)} inherit it`);
  return bits.join(" · ");
}
