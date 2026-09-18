"use client";

/**
 * The Keyword Workbench's `map_topic` column (placement §7 #1).
 *
 * 🚨 `topic` means OFFERING in that table (`OFFERING_COLUMN_ID`, kept for
 * saved views); the MAP topic is this column, id `map_topic`. The cell is a
 * door into the map at that topic (`?topic=<slug>` — the map's outline reveals
 * it, and its pages workspace now opens filtered to it,
 * `views/pages/pageFilterParams.ts`); an unhomed keyword says
 * so honestly — the daily assigner homes a keyword from its primary Offering,
 * and the map-home writer is server-only by design (register lesson 30), so
 * the human path to a map home today IS the Offering cell beside it. The
 * client-callable "attach these keywords to a map topic" door is filed with
 * the coordinator (VERIFY-E.md § Not verified / owed); until it lands this
 * column never renders a control that would 42501 on click.
 */

import Link from "next/link";
import { Network } from "lucide-react";

import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import type { GscBreakdownRow } from "@/features/marketing/search-console/types";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { TopicStatusMark } from "../ui/TopicStatusMark";
import type { KeywordMapHomes } from "./useKeywordMapHomes";

export const MAP_TOPIC_COLUMN_ID = "map_topic";

export function buildKeywordMapTopicColumn({
  brandSeg,
  homes,
  width = 220,
}: {
  brandSeg: string;
  homes: KeywordMapHomes;
  width?: number;
}): MatrxColumnDef<GscBreakdownRow> {
  return {
    id: MAP_TOPIC_COLUMN_ID,
    header: "Map topic",
    accessorFn: (row) => homes.homeFor(row.keyword_id)?.name ?? "",
    filter: "text",
    width,
    cell: (row) => {
      if (homes.error) {
        return (
          <span role="alert" className="text-xs text-destructive" title={homes.error}>
            {homes.error}
          </span>
        );
      }
      const home = homes.homeFor(row.keyword_id);
      if (home === undefined) {
        return <span className="text-xs text-muted-foreground">…</span>;
      }
      if (!homes.mapId) {
        return (
          <span className="text-xs text-muted-foreground" title="This site uses no topical map yet">
            no map
          </span>
        );
      }
      if (home === null) {
        return (
          <span
            className="text-xs text-muted-foreground"
            title="No map home yet — the daily assigner homes a keyword from its primary Offering on its next pass"
          >
            not homed yet
          </span>
        );
      }
      return (
        <Link
          href={`${marketingRoutes.brandTopicalMap(brandSeg, homes.mapId)}?topic=${encodeURIComponent(home.slug)}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-full items-center gap-1 text-xs hover:underline"
          title={`Open ${home.name} in the map`}
        >
          <Network className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{home.name}</span>
          <TopicStatusMark status={home.status} compact />
        </Link>
      );
    },
  };
}
