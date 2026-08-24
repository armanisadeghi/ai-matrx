"use client";

/**
 * Copy meaning from a sibling site (KI-043).
 *
 * Meaning belongs to the SITE — never the brand, never the organization — so
 * two sites of one business do not share rows and do not inherit from each
 * other. When they genuinely mean the same thing, this copies it once, on
 * demand, and the copy is ADDITIVE: nothing the target already decided is
 * overwritten, so pressing it twice is safe.
 *
 * The preview and the write are the same server call with one flag, so what a
 * person is shown cannot disagree with what happens.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Copy, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  copySiteMeaning,
  getMeaningCopySources,
  type MeaningCopyPart,
  type MeaningCopyResult,
} from "./data";

const ALL_PARTS: MeaningCopyPart[] = [
  "matchers",
  "worth",
  "geo",
  "topics",
  "combos",
  "guidelines",
];

const PART_LABEL: Record<MeaningCopyPart, string> = {
  matchers: "Ways of finding keywords",
  worth: "What each answer is worth",
  geo: "Service areas",
  topics: "Offering worth",
  combos: "Combinations",
  guidelines: "Business guidelines",
};

export function CopyMeaningFromSite({ siteId }: { siteId: string }) {
  const qc = useQueryClient();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MeaningCopyResult | null>(null);

  const sources = useQuery({
    queryKey: ["seo", "meaning-copy-sources", siteId],
    queryFn: ({ signal }) => getMeaningCopySources(siteId, signal),
  });

  const run = useMutation({
    mutationFn: (dryRun: boolean) =>
      copySiteMeaning({
        fromSiteId: sourceId as string,
        toSiteId: siteId,
        parts: ALL_PARTS,
        dryRun,
      }),
    onSuccess: (result) => {
      setPreview(result);
      if (!result.dry_run) {
        qc.invalidateQueries({ queryKey: ["seo"] });
        qc.invalidateQueries({ queryKey: ["marketing", "gsc"] });
        toast.success(
          `Copied ${result.total_copied} — now run the matchers so they stamp this site's keywords`,
        );
      }
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  });

  if (sources.isError) {
    return (
      <InlineQueryError
        what="the sites you could copy from"
        error={sources.error}
        onRetry={() => sources.refetch()}
      />
    );
  }

  const options = sources.data ?? [];

  return (
    <section className="rounded-md border border-border bg-card p-3">
      <h3 className="text-xs font-semibold text-foreground">
        Copy meaning from another site
      </h3>
      <p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-muted-foreground">
        Meaning belongs to this site alone — it is never inherited from the brand
        or the organization. If another site of yours already means the same
        things, copy it here. Copying only ADDS: anything this site has already
        decided is left exactly as it is.
      </p>

      {sources.isPending ? (
        <Skeleton className="mt-2 h-8 rounded-md" />
      ) : options.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
          There is no other site you can edit, so there is nothing to copy from
          yet.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            value={sourceId ?? ""}
            aria-label="Site to copy from"
            onChange={(event) => {
              setSourceId(event.target.value || null);
              setPreview(null);
            }}
          >
            <option value="">Choose a site…</option>
            {options.map((option) => (
              <option key={option.site_id} value={option.site_id}>
                {option.label}
                {option.same_brand ? " (same brand)" : ""} — {option.meaning_rows}{" "}
                {option.meaning_rows === 1 ? "item" : "items"}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={!sourceId || run.isPending}
            onClick={() => run.mutate(true)}
          >
            {run.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="mr-1 h-3 w-3" aria-hidden />
            )}
            See what would copy
          </Button>
        </div>
      )}

      {preview ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            From <span className="font-medium text-foreground">{preview.from.label}</span>{" "}
            into <span className="font-medium text-foreground">{preview.to.label}</span>
          </p>
          <ul className="space-y-1">
            {preview.parts.map((part) => (
              <li
                key={part.part}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[11px]"
              >
                <span className="min-w-0 flex-1 text-foreground">
                  {PART_LABEL[part.part] ?? part.part}
                </span>
                <span className="tabular-nums text-foreground">
                  {part.copied} {preview.dry_run ? "would copy" : "copied"}
                </span>
                {part.skipped_existing > 0 ? (
                  <span className="tabular-nums text-muted-foreground">
                    {part.skipped_existing} already here
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          {preview.dry_run ? (
            preview.total_copied === 0 ? (
              <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px] text-warning">
                <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                This site already has everything that one could give it — nothing
                to copy.
              </p>
            ) : (
              <Button
                size="sm"
                className="h-8"
                disabled={run.isPending}
                onClick={() => run.mutate(false)}
              >
                {run.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Copy className="mr-1 h-3 w-3" aria-hidden />
                )}
                Copy {preview.total_copied}{" "}
                {preview.total_copied === 1 ? "item" : "items"}
              </Button>
            )
          ) : (
            <p
              className={cn(
                "rounded-md border border-success/40 bg-success/10 px-2.5 py-2 text-[11px] text-success",
              )}
            >
              Copied. {preview.next_step}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
