"use client";

/**
 * KIND — a placement the Offering assigner was not sure about (P12, KI-014).
 *
 * The assigner places every keyword it can on THIS site's offerings; one below
 * the `confidence_floor` knob (or every one, while its autonomy mode waits for a
 * person) is written with `metadata.placement.confirmed = false` and waits here.
 *   • Confirm — `seo.gsc_confirm_keyword_offering`. It writes only this site's
 *     placement, keeps the person's reason on it (P24), and makes it the site's
 *     own ruling so the assigner never revisits it.
 *   • Place elsewhere — `setKeywordOffering` (the ONE placement write) with the
 *     person's reason.
 *
 * The queue shows the highest-demand page; the full, sortable, filterable set
 * stays the canonical keyword table on the offerings screen (P26 — ONE TABLE),
 * reached by this kind's "more" door.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLink from "@/components/navigation/AppLink";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/styles/themes/utils";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  confirmKeywordOfferings,
  KEYWORD_OFFERINGS_KEY,
  listOfferingProposals,
  setKeywordOffering,
  type OfferingProposalRow,
} from "@/features/marketing/seo/keyword-workbench/data";
import {
  SITE_OFFERINGS_KEY,
  useSiteOfferings,
} from "@/features/marketing/seo/keyword-workbench/hooks/useSiteOfferings";
import { extractErrorMessage } from "@/utils/errors";
import { KeywordDoor } from "./doors";
import { siteOf } from "./siteScope";
import type {
  ApprovalChooserProps,
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalOutcome,
  ApprovalScope,
  ApprovalSource,
} from "@/features/approvals/types";

const KIND_ID = "topic_placement";
const PAGE = 25;
/** The placement queue's demand window (knob `seo.topic_placement.demand_window_days`). */
const WINDOW_DAYS = 90;

const queryKey = (siteId: string) =>
  [...SITE_OFFERINGS_KEY, "proposals", siteId] as const;

interface PlacementItem extends ApprovalItem {
  row: OfferingProposalRow;
}

function window90(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function offeringsHref(scope: ApprovalScope): string {
  return marketingRoutes.site(scope.brandId ?? null, siteOf(scope), "/value/offerings");
}

function toItem(scope: ApprovalScope, row: OfferingProposalRow): PlacementItem {
  const sure = row.confidence == null ? "no confidence given" : `${row.confidence}% sure`;
  return {
    key: `${KIND_ID}:${row.keywordId}`,
    kindId: KIND_ID,
    row,
    // Mode 4, always: an unconfirmed placement stays unconfirmed until a
    // person rules — no clock applies it.
    mode: "mode_4",
    headline: `Place "${row.phrase}" under ${row.offeringName}`,
    acceptEffect: `Confirms "${row.phrase}" under ${row.offeringName} as this site's own ruling, with your reason; the assigner will not revisit it.`,
    rejectEffect: `Places "${row.phrase}" under the offering you choose, as this site's own ruling.`,
    proposedBy: `Offering assigner · ${sure}`,
    doors: (
      <span className="inline-flex flex-wrap items-center gap-1">
        <KeywordDoor scope={scope} phrase={row.phrase} />
        <span>→</span>
        <AppLink
          href={offeringsHref(scope)}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {row.offeringName}
        </AppLink>
        <span className="tabular-nums">
          · {row.clicks.toLocaleString()} clicks · {row.impressions.toLocaleString()} impressions
        </span>
      </span>
    ),
  };
}

function useSource(scope: ApprovalScope): ApprovalSource {
  const query = useQuery({
    queryKey: queryKey(siteOf(scope)),
    queryFn: ({ signal }) => {
      const { start, end } = window90();
      return listOfferingProposals(siteOf(scope), start, end, PAGE, signal);
    },
    staleTime: 60_000,
  });
  const rows = query.data ?? [];
  const total = rows[0]?.totalCount ?? 0;
  return {
    items: rows.map((row) => toItem(scope, row)),
    total,
    loading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
    moreHref: offeringsHref(scope),
    moreLabel: `Work all ${total.toLocaleString()} in the proposals table`,
  };
}

function failAll(items: ApprovalItem[], message: string): ApprovalOutcome {
  return { applied: 0, failures: items.map((item) => ({ key: item.key, message })) };
}

const NO_ORGANIZATION =
  "This queue does not know which organization owns the site, so nothing can be written from here. Open the site's own queue.";

function useDecisions(scope: ApprovalScope): ApprovalDecisions {
  const queryClient = useQueryClient();
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: SITE_OFFERINGS_KEY });
    void queryClient.invalidateQueries({ queryKey: [...KEYWORD_OFFERINGS_KEY, siteOf(scope)] });
  };
  return {
    acceptItems: async (items, reason) => {
      if (!scope.organizationId) return failAll(items, NO_ORGANIZATION);
      const ids = (items as PlacementItem[]).map((item) => item.row.keywordId);
      try {
        await confirmKeywordOfferings({
          organizationId: scope.organizationId,
          siteId: siteOf(scope),
          keywordIds: ids,
          notes: reason,
        });
        settle();
        return { applied: items.length, failures: [] };
      } catch (error) {
        return failAll(items, extractErrorMessage(error));
      }
    },
    rejectItems: async (items, reason, choice) => {
      if (!choice) return failAll(items, "Choose the offering these keywords belong under.");
      if (!scope.organizationId) return failAll(items, NO_ORGANIZATION);
      const ids = (items as PlacementItem[]).map((item) => item.row.keywordId);
      try {
        await setKeywordOffering({
          organizationId: scope.organizationId,
          siteId: siteOf(scope),
          keywordIds: ids,
          offeringId: choice,
          notes: reason,
        });
        settle();
        return { applied: items.length, failures: [] };
      } catch (error) {
        return failAll(items, extractErrorMessage(error));
      }
    },
  };
}

/**
 * "Not this one — which offering, then?" A plain searchable list of THIS site's
 * offerings inside the dialog (a portalled picker inside a dialog reads as an
 * outside click and closes it), plus the reason the write keeps.
 */
function RejectChooser({ scope, items, onChosen, onCancel }: ApprovalChooserProps) {
  const { start, end } = window90();
  const offerings = useSiteOfferings(siteOf(scope), start, end);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const placement = items as PlacementItem[];
  const current = placement.length === 1 ? (placement[0]?.row.offeringId ?? null) : null;
  const label =
    placement.length === 1 ? `"${placement[0]?.row.phrase}"` : `${placement.length} keywords`;
  const needle = search.trim().toLowerCase();
  const rows = offerings.options.filter(
    (option) =>
      option.offeringId !== current &&
      (!needle ||
        option.name.toLowerCase().includes(needle) ||
        option.lineage.toLowerCase().includes(needle)),
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Place {label} somewhere else</DialogTitle>
          <DialogDescription>
            The assigner&apos;s offering was wrong. Choose the right one; it becomes this
            site&apos;s own ruling.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find an offering…"
          className="text-base sm:text-sm"
          aria-label="Find an offering"
        />
        <div className="max-h-64 overflow-y-auto rounded-md border border-border">
          {offerings.loading ? (
            <p className="p-3 text-xs text-muted-foreground">Loading this site&apos;s offerings…</p>
          ) : rows.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No offering matches. Add it on the offerings screen first.
            </p>
          ) : (
            rows.map((option) => (
              <button
                key={option.offeringId}
                type="button"
                onClick={() => setChosen(option.offeringId)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent",
                  chosen === option.offeringId && "bg-accent",
                )}
                style={{ paddingLeft: `${12 + Math.min(option.depth, 6) * 12}px` }}
              >
                <span className="min-w-0 truncate text-foreground">{option.name}</span>
                {option.depth > 0 ? (
                  <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                    {option.rootName}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
        <label htmlFor="placement-reason" className="text-xs font-medium text-foreground">
          Why does it belong there instead?
        </label>
        <ProTextarea
          id="placement-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          className="text-xs"
        />
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!chosen}
            onClick={() => chosen && onChosen(chosen, reason.trim() || null)}
          >
            Place here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const topicPlacementKind: ApprovalKind = {
  id: KIND_ID,
  label: "Offering placement",
  accept: {
    label: "Confirm",
    keepsReason: true,
    reasonPrompt: "Why is this right? (optional — it teaches the assigner)",
  },
  reject: { label: "Place elsewhere", keepsReason: true },
  useSource,
  useDecisions,
  RejectChooser,
  /**
   * These read one site's proposals, so a person- or organization-scoped mount
   * cannot show them — and says so with the door instead of omitting them.
   */
  scopeRequirement: {
    field: "siteId",
    explain:
      "keyword proposals belong to one website, so they are shown on each site's own queue.",
    where: {
      label: "Open the marketing approvals console",
      href: "/marketing/operations/approvals",
    },
  },
};
