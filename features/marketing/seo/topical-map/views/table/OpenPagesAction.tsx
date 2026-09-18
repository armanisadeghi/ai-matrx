"use client";

/**
 * features/marketing/seo/topical-map/views/table/OpenPagesAction.tsx — the
 * bulk bar's door from checked topics to the pages workspace (PLAN §6 B:
 * "selection → setCheckedTopics → Open pages pre-filtered").
 *
 * THE FILTER HOLDS ONE TOPIC. `MapPageFilters.topicSlug` is a single slug
 * (CONTRACTS §3, frozen), so with one topic checked this is one link; with
 * several it is one link PER topic, each pre-filtering the pages screen to
 * that topic, and a sentence saying so. A single "Open pages" over five topics
 * that silently opened the first would be a lie; a disabled button would be a
 * dead end. A multi-topic filter is filed with the coordinator in the register.
 *
 * It is a real anchor (THE DOOR LAW): cmd/middle-click opens a tab; on a
 * window or canvas host it opens a tab outright, because navigating the page
 * underneath a floating window is not what anyone meant.
 */

import { ChevronDown, FileStack } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch } from "@/lib/redux/hooks";

import type { MapHost } from "../../components/TopicalMapWorkspaceBody";
import { useMapLinks } from "../../links";
import { setPageFilters } from "../../redux/slice";
import type { MapTableRow } from "./tableRows";

export interface OpenPagesActionProps {
  mapId: string;
  siteId: string | null;
  host: MapHost;
  /** The checked rows that are loaded. */
  selected: readonly MapTableRow[];
}

const BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function OpenPagesAction({ mapId, siteId, host, selected }: OpenPagesActionProps) {
  const dispatch = useAppDispatch();
  const links = useMapLinks();
  const href = links.mapView(mapId, "pages", siteId);
  const target = host === "page" ? undefined : "_blank";

  const prefilter = (slug: string) => {
    dispatch(setPageFilters({ mapId, filters: { topicSlug: slug, onNoTopic: false } }));
  };

  if (selected.length === 0) return null;

  if (selected.length === 1) {
    const [only] = selected;
    return (
      <Link
        href={href}
        target={target}
        className={BUTTON}
        onClick={() => prefilter(only.slug)}
        title={`Open the pages workspace filtered to "${only.name}"`}
      >
        <FileStack className="h-3.5 w-3.5" aria-hidden />
        Open pages
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={BUTTON}>
          <FileStack className="h-3.5 w-3.5" aria-hidden />
          Open pages
          <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          The pages screen filters to one topic at a time. Pick which:
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {selected.map((row) => (
          <DropdownMenuItem key={row.slug} asChild>
            <Link
              href={href}
              target={target}
              className="text-xs"
              onClick={() => prefilter(row.slug)}
            >
              {row.name}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
