"use client";

/**
 * Copy keywords from a sibling site (MSR-26).
 *
 * Arman's ruling: "keyword research should go to a site… but then we can
 * offer the option of… copying them to another site internally." The
 * site<->keyword association (`seo.site_keyword_value`) belongs to the site
 * — this copies it once, on demand, additively (nothing the target already
 * tracks is duplicated). Global keyword identity (the phrase itself,
 * `seo.keyword`) travels as-is; only the site row is recreated.
 *
 * The preview and the write are the same server call with one flag
 * (`seo.site_keyword_value_copy`, the sibling of `seo.site_meaning_copy`), so
 * what a person is shown cannot disagree with what happens.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { copySiteKeywords } from "../data/queries";
import { savedKeywordResearchListQueryKey } from "./SavedResearchLibrary";

export function CopyKeywordsFromSite({ siteId }: { siteId: string }) {
  const qc = useQueryClient();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    fromLabel: string;
    toLabel: string;
    copied: number;
    skippedExisting: number;
    dryRun: boolean;
  } | null>(null);

  const sites = useSiteOptions();
  const options = (sites.data ?? []).filter((site) => site.id !== siteId);

  const run = useMutation({
    mutationFn: (dryRun: boolean) =>
      copySiteKeywords({
        fromSiteId: sourceId as string,
        toSiteId: siteId,
        dryRun,
      }),
    onSuccess: (result) => {
      setPreview({
        fromLabel: result.from.label,
        toLabel: result.to.label,
        copied: result.copied,
        skippedExisting: result.skipped_existing,
        dryRun: result.dry_run,
      });
      if (!result.dry_run) {
        qc.invalidateQueries({ queryKey: ["seo"] });
        qc.invalidateQueries({
          queryKey: savedKeywordResearchListQueryKey(siteId),
        });
        toast.success(`Copied ${result.copied} keyword${result.copied === 1 ? "" : "s"}`);
      }
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  });

  if (sites.isError) {
    return (
      <p className="text-[11px] text-destructive">
        Could not load the sites you could copy from.
      </p>
    );
  }

  return (
    <section className="rounded-md border border-border bg-card p-3">
      <h3 className="text-xs font-semibold text-foreground">
        Copy keywords from another site
      </h3>
      <p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-muted-foreground">
        Keyword research belongs to this site alone — it is never shared
        automatically, even with another site of the same brand. If another
        site of yours already tracks keywords worth having here, copy them.
        Copying only ADDS: keywords this site already tracks are left exactly
        as they are.
      </p>

      {sites.isPending ? (
        <Skeleton className="mt-2 h-8 rounded-md" />
      ) : options.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
          There is no other site you can reach, so there is nothing to copy
          from yet.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            value={sourceId ?? ""}
            aria-label="Site to copy keywords from"
            onChange={(event) => {
              setSourceId(event.target.value || null);
              setPreview(null);
            }}
          >
            <option value="">Choose a site…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name ?? option.domain}
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
            From <span className="font-medium text-foreground">{preview.fromLabel}</span>{" "}
            into <span className="font-medium text-foreground">{preview.toLabel}</span>
          </p>
          <p className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[11px] text-foreground">
            {preview.copied} keyword{preview.copied === 1 ? "" : "s"}{" "}
            {preview.dryRun ? "would copy" : "copied"}
            {preview.skippedExisting > 0
              ? ` · ${preview.skippedExisting} already tracked here`
              : ""}
          </p>

          {preview.dryRun ? (
            preview.copied === 0 ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px] text-warning">
                This site already tracks everything that site could give it —
                nothing to copy.
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
                Copy {preview.copied} keyword{preview.copied === 1 ? "" : "s"}
              </Button>
            )
          ) : (
            <p className="rounded-md border border-success/40 bg-success/10 px-2.5 py-2 text-[11px] text-success">
              Copied.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
