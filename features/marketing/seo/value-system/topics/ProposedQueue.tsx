"use client";

/**
 * Proposals — what the assigner placed but is NOT sure about, waiting for a
 * person.
 *
 * P12 in one screen: agents apply, humans win. A placement at or above the
 * `confidence_floor` knob is a ruling; below it, the keyword still lands on the
 * tree (a candidate an expert can correct beats an empty tree) but it is
 * flagged here until someone confirms it or replaces it. Confirming stamps the
 * placement as the site's own; "Move to another topic…" writes
 * `assigned_by='human'` through the EXISTING write, which takes the keyword off
 * the agent's list forever.
 *
 * P26 — ONE TABLE. This was a hand-rolled row list with unsortable numbers. It
 * is now the canonical keyword table, configured by ONE base filter
 * (`placement: "proposed"`), which is why that filter exists on
 * `seo.gsc_perf_breakdown` at all: a surface is a configuration, never a second
 * query with a poorer contract.
 */

import { Check, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import type { GscBreakdownRow } from "@/features/marketing/search-console/types";
import {
  KeywordTable,
  type KeywordTableSurface,
} from "@/features/marketing/seo/keyword-table/KeywordTable";
import type { KeywordRowsResult } from "@/features/marketing/seo/keyword-table/useKeywordRows";
import { confirmKeywordTopics } from "./data";

const SURFACE: KeywordTableSurface = {
  id: "seo-proposed-queue",
  label: "Proposed placement",
  listLabel: "Placements awaiting confirmation",
  location: "Marketing — Topic tree — Proposals",
  prefix: "pq",
  defaultColumns: ["key", "topic", "clicks", "impressions", "value_band"],
  baseFilters: { placement: "proposed" },
  // The offering filter would fight the base filter for meaning here; the
  // Offering COLUMN still filters, which is the same door.
  showFilterBar: false,
};

/**
 * How sure the assigner was. It rides the SHARED placement read
 * (`gsc_keyword_topics_for`) that the Offering column already needs, so this
 * column costs no extra query.
 */
function confidenceColumn(
  data: KeywordRowsResult,
): MatrxColumnDef<GscBreakdownRow> {
  return {
    id: "confidence",
    header: "How sure",
    sortable: true,
    filter: false,
    align: "right",
    width: 110,
    mobileHidden: true,
    accessorFn: (row) => data.serviceFor(row)?.confidence ?? null,
    cell: (row) => {
      const confidence = data.serviceFor(row)?.confidence;
      if (confidence == null) {
        return (
          <span className="rounded border border-warning/40 px-1 py-px text-[10px] text-warning">
            none given
          </span>
        );
      }
      return (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {confidence}% sure
        </span>
      );
    },
  };
}

export function ProposedQueue({
  siteId,
  siteDomain,
  brandId,
  onChanged,
}: {
  siteId: string;
  siteDomain: string;
  brandId: string;
  onChanged: () => void;
}) {
  const confirm = async (keywordIds: string[], refresh: () => Promise<void>) => {
    try {
      const results = await confirmKeywordTopics(siteId, keywordIds);
      await refresh();
      onChanged();
      toast.success(
        `${results.length} placement${results.length === 1 ? "" : "s"} confirmed`,
        {
          description:
            "The assigner will not revisit them, and they now read as your ruling.",
        },
      );
    } catch (error) {
      toast.error("Could not confirm those placements", {
        description: extractErrorMessage(error),
      });
    }
  };

  return (
    <section className="flex min-h-[24rem] flex-col rounded-lg border border-warning/40 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">
          The assigner placed these — is it right?
        </h2>
        <p className="hidden text-[11px] text-muted-foreground sm:block">
          They are already on the tree. Confirming makes them yours.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-2">
        <KeywordTable
          siteId={siteId}
          siteDomain={siteDomain}
          brandId={brandId}
          surface={SURFACE}
          onWrite={onChanged}
          extraColumns={(data) => [confidenceColumn(data)]}
          emptyState={{
            title: "Nothing is waiting for you",
            description:
              "Every placement on this site is either your own ruling or one the assigner was sure enough about.",
          }}
          rowActions={(row, controls) =>
            row.keyword_id ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() =>
                  void confirm([row.keyword_id as string], controls.refresh)
                }
              >
                Confirm
              </Button>
            ) : null
          }
          selectionActions={({
            keywordIds,
            openServiceAssign,
            refresh,
            clear,
          }) => (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={keywordIds.length === 0}
                onClick={() => {
                  void confirm(keywordIds, refresh);
                  clear();
                }}
              >
                <Check className="h-3.5 w-3.5" />
                Confirm
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={keywordIds.length === 0}
                onClick={() =>
                  openServiceAssign(
                    keywordIds,
                    `${keywordIds.length.toLocaleString()} keyword${keywordIds.length === 1 ? "" : "s"}`,
                  )
                }
              >
                <Network className="h-3.5 w-3.5" />
                Move to another topic…
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={clear}
              >
                Clear {keywordIds.length}
              </Button>
            </div>
          )}
        />
      </div>
    </section>
  );
}
