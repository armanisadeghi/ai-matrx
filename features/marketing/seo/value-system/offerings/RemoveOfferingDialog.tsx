"use client";

/**
 * Remove an offering from the brand — the consequence stated before the click.
 *
 * Offered only when no other site offers it, so removing it here retires it
 * from the brand. Its keywords can move to another offering this site offers,
 * or become unplaced; its worth ruling on this site goes with it; offerings
 * beneath it move up one level. Unlike stopping an offering, this is not
 * restored by switching it back on, and the dialog says so.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2, Trash2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Skeleton } from "@ai-matrx/design-system";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { formatCount } from "@/features/marketing/search-console/types";
import { getOfferingRemovalImpact, type CatalogOffering } from "./data";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function RemoveOfferingDialog({
  siteId,
  offering,
  replacements,
  busy,
  onCancel,
  onRemove,
}: {
  siteId: string;
  offering: CatalogOffering;
  /** Offerings this site offers that the keywords could move to. */
  replacements: CatalogOffering[];
  busy: boolean;
  onCancel: () => void;
  onRemove: (replacementOfferingId: string | null) => void;
}) {
  const [mode, setMode] = useState<"unplace" | "move">("move");
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const impact = useQuery({
    queryKey: ["seo", "offerings", "removal-impact", siteId, offering.id],
    queryFn: ({ signal }) => getOfferingRemovalImpact(siteId, offering.id, signal),
  });

  const data = impact.data;
  const needle = search.trim().toLocaleLowerCase();
  const choices = replacements
    .filter((candidate) => candidate.id !== offering.id)
    .filter((candidate) => !needle || candidate.name.toLocaleLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasKeywords = (data?.keywordCount ?? 0) > 0;
  const canRemove =
    Boolean(data) && !busy && (!hasKeywords || mode === "unplace" || Boolean(replacementId));

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="flex max-h-[90dvh] max-w-xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-destructive" />
            Remove “{offering.name}” from this brand?
          </DialogTitle>
          <DialogDescription>
            No other site offers it, so it leaves the brand&apos;s offerings.
            This is not undone by offering it again. To keep it in the brand,
            stop offering it on this site instead.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
          {impact.isPending ? (
            <div className="space-y-2" aria-label="Measuring what removing it changes">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : impact.error || !data ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p>
                {impact.error
                  ? `Could not measure what removing it would change: ${extractErrorMessage(impact.error)}`
                  : "This site does not offer it, so there is nothing here to remove."}
              </p>
              {impact.error ? (
                <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void impact.refetch()}>
                  Try again
                </Button>
              ) : null}
              <ErrorAlchemyMenu />
            </div>
          ) : (
            <>
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
                <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  {hasKeywords
                    ? `${formatCount(data.keywordCount)} keyword placement${data.keywordCount === 1 ? "" : "s"} on this site ${data.keywordCount === 1 ? "is" : "are"} affected.`
                    : "No keywords on this site are placed on it."}
                </p>
                <ul className="mt-2 space-y-1 pl-6 text-xs text-muted-foreground">
                  {data.valueCount > 0 ? <li>This site&apos;s worth ruling on it is removed.</li> : null}
                  {data.childCount > 0 ? (
                    <li>
                      {formatCount(data.childCount)} offering{data.childCount === 1 ? "" : "s"} beneath it
                      move{data.childCount === 1 ? "s" : ""} up one level.
                    </li>
                  ) : null}
                </ul>
              </div>

              {hasKeywords ? (
                <RadioGroup
                  value={mode}
                  onValueChange={(value) => setMode(value === "unplace" ? "unplace" : "move")}
                  className="gap-2"
                >
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40">
                    <RadioGroupItem value="move" className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        Move its keywords to another offering
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Every placement moves, including which were primary and who made them.
                      </span>
                      {mode === "move" ? (
                        <span className="mt-2 block space-y-1.5">
                          <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search this site's offerings…"
                            className="h-9 text-base sm:text-sm"
                          />
                          <span className="block max-h-40 overflow-y-auto overscroll-contain rounded border border-border">
                            {choices.map((candidate) => (
                              <button
                                key={candidate.id}
                                type="button"
                                aria-pressed={replacementId === candidate.id}
                                onClick={() => setReplacementId(candidate.id)}
                                className={cn(
                                  "flex min-h-9 w-full items-center gap-1.5 truncate px-2 py-1.5 text-left text-sm sm:min-h-0",
                                  replacementId === candidate.id
                                    ? "bg-primary/10 text-foreground"
                                    : "text-foreground hover:bg-muted/60",
                                )}
                              >
                                <ArrowRightLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{candidate.name}</span>
                              </button>
                            ))}
                            {choices.length === 0 ? (
                              <span className="block px-2 py-1.5 text-xs text-muted-foreground">
                                {needle ? `No offering on this site matches “${search.trim()}”.` : "This site offers nothing else yet."}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40">
                    <RadioGroupItem value="unplace" className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium text-foreground">Leave its keywords unplaced</span>
                      <span className="block text-xs text-muted-foreground">
                        They show up in “Keywords not placed” below, ready to place again.
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="pb-safe">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canRemove}
            onClick={() => onRemove(hasKeywords && mode === "move" ? replacementId : null)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remove from this brand
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
