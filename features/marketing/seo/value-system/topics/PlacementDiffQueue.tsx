"use client";

/**
 * THE OPT-IN DIFF (P30a, register KI-050). Arman: "If we ever change it at
 * the top level, it needs to be presented to them as a diff that they can
 * opt in or out of." Never an automatic re-apply over a site's own state.
 *
 * A row here means this site has always INHERITED its opinion of a keyword
 * (brand/organization/system — never its own scope_tier='site' ruling) and
 * that higher tier's opinion has since moved. Both decisions resolve through
 * `setKeywordService`, the ONE placement write every other surface in the
 * product uses:
 *   • Take it   — write the NEW topic at the site's own tier.
 *   • Keep mine — write the OLD topic at the site's own tier, formalizing
 *                 what the site already had as its own explicit ruling.
 * Either way the site now owns a scope_tier='site' row for that keyword, so
 * the row drops off this list for good — it never nags twice for the same
 * drift, and no second table remembers the decision.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, GitCompare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { TableLoadingComponent } from "@/components/matrx/LoadingComponents";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { setKeywordService } from "@/features/marketing/seo/keyword-workbench/data";
import { getTopicPlacementDiff } from "./data";

const SCOPE_TIER_LABEL: Record<string, string> = {
  brand: "the brand default",
  organization: "the organization default",
  system: "the platform default",
};

export function PlacementDiffQueue({
  siteId,
  onChanged,
}: {
  siteId: string;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["seo-topic-placement-diff", siteId] as const;
  const [pendingKeywordId, setPendingKeywordId] = useState<string | null>(
    null,
  );

  const diffQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getTopicPlacementDiff(siteId, 50, signal),
    staleTime: 60_000,
  });

  const decide = useMutation({
    mutationFn: async (input: {
      keywordId: string;
      phrase: string;
      topicId: string;
      decision: "take_it" | "keep_mine";
    }) => {
      setPendingKeywordId(input.keywordId);
      return setKeywordService({
        siteId,
        keywordIds: [input.keywordId],
        topicId: input.topicId,
        notes:
          input.decision === "take_it"
            ? `Opted in to the new default for "${input.phrase}"`
            : `Kept this site's own placement for "${input.phrase}"`,
      });
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey });
      onChanged();
      toast.success(
        input.decision === "take_it"
          ? `"${input.phrase}" now uses the new Offering`
          : `"${input.phrase}" keeps this site's own Offering`,
        {
          description: "This site now owns that ruling — it will not be asked again.",
        },
      );
    },
    onError: (error) => {
      toast.error("Could not save that decision", {
        description: extractErrorMessage(error),
      });
    },
    onSettled: () => setPendingKeywordId(null),
  });

  if (diffQuery.isLoading) {
    return <TableLoadingComponent />;
  }

  if (diffQuery.isError) {
    return (
      <InlineQueryError
        what="the Offering changes waiting on your review"
        error={diffQuery.error}
        onRetry={() => void diffQuery.refetch()}
      />
    );
  }

  const rows = diffQuery.data ?? [];
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col rounded-lg border border-primary/40 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <GitCompare className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          {rows.length} Offering change{rows.length === 1 ? "" : "s"} waiting
          on your review
        </h2>
        <p className="hidden text-[11px] text-muted-foreground sm:block">
          This site has always used {SCOPE_TIER_LABEL.system} for these
          keywords; the default moved. Nothing changes here until you decide.
        </p>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const busy = decide.isPending && pendingKeywordId === row.keyword_id;
          return (
            <li
              key={row.keyword_id}
              className="flex flex-wrap items-center gap-3 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  &ldquo;{row.phrase}&rdquo;
                </p>
                <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>{row.old_topic_name ?? "Not placed yet"}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium text-foreground">
                    {row.new_topic_name}
                  </span>
                  <span className="text-muted-foreground/70">
                    · moved in {SCOPE_TIER_LABEL[row.scope_tier] ?? row.scope_tier}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({
                      keywordId: row.keyword_id,
                      phrase: row.phrase,
                      topicId: row.new_topic_id,
                      decision: "take_it",
                    })
                  }
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Take it
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  disabled={decide.isPending || !row.old_topic_id}
                  onClick={() =>
                    row.old_topic_id &&
                    decide.mutate({
                      keywordId: row.keyword_id,
                      phrase: row.phrase,
                      topicId: row.old_topic_id,
                      decision: "keep_mine",
                    })
                  }
                >
                  Keep mine
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
