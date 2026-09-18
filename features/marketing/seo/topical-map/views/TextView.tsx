"use client";

/**
 * TEXT — the map as a MARKDOWN TREE a person can read (Arman, 2026-09-18: "the
 * text version should be a markdown tree … human readable and actually really
 * nice for viewing and understanding").
 *
 * The document is built from the SAME store tree the outline renders
 * (`buildMapMarkdown`), so the two can never disagree, and it renders through
 * the one markdown pipeline (`MarkdownStream`, not a hand-rolled renderer).
 * Focus narrows it to one branch. Copy hands a person the markdown; "Copy for
 * AI" hands an agent the bytes `seo.map_outline` produces — exactly what an
 * agent receives, sized by the sizing overrides in this preview only.
 */

import { useState } from "react";

import MarkdownStream from "@/components/MarkdownStream";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { useAppSelector } from "@/lib/redux/hooks";

import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../components/TopicalMapStates";
import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { useMapOutline, useMapTree, useTopicalMap } from "../hooks";
import { useTopicalMapKnobs } from "../knobs";
import {
  selectMapLoadedIncludes,
  selectMapRootSlugs,
  selectMapTopicsBySlug,
} from "../redux/selectors";
import type { MapTopicSearchHit } from "../types";
import { OUTLINE_TREE_INCLUDE } from "./OutlineView";
import { buildMapMarkdown } from "./outline/text/mapMarkdown";
import { TextFocusPicker } from "./outline/text/TextFocusPicker";
import { TextOverridesPopover, type OutlineOverrides } from "./outline/text/TextOverridesPopover";

const SURFACE_NAME = "matrx-user/marketing-topical-map";

export function TextView({ mapId, siteId }: MapViewProps) {
  const [focus, setFocus] = useState<MapTopicSearchHit | null>(null);
  const [overrides, setOverrides] = useState<OutlineOverrides>({});
  const { knobs, loading: knobsLoading, error: knobsError } = useTopicalMapKnobs();

  // The same read (same key) every tree view makes — one fetch, one cache.
  const tree = useMapTree(mapId, { include: [...OUTLINE_TREE_INCLUDE], siteId: siteId ?? undefined });
  const map = useTopicalMap(mapId);
  const topics = useAppSelector(selectMapTopicsBySlug(mapId));
  const rootSlugs = useAppSelector(selectMapRootSlugs(mapId));
  const loadedIncludes = useAppSelector(selectMapLoadedIncludes(mapId));

  const hasOverrides = Object.keys(overrides).length > 0;
  // What an agent is handed: seo.map_outline's own bytes, focused and sized as
  // the run would be — never a re-rendering of them. Read alongside the tree so
  // Copy for AI can answer synchronously; until it lands the AI copy is absent,
  // never the markdown standing in for it.
  const outline = useMapOutline(mapId, {
    siteId: siteId ?? undefined,
    focusSlug: focus?.slug ?? undefined,
    ...(hasOverrides ? { overrides } : {}),
  });
  const agentBytes = outline.data && outline.data.trim() ? outline.data : null;
  const markdown = tree.isPending || tree.isError
    ? ""
    : buildMapMarkdown(topics, rootSlugs, {
        mapName: map.data?.name ?? null,
        focusSlug: focus?.slug ?? null,
        countsLoaded: loadedIncludes.includes("counts"),
      });

  const controls = (
    <div className="flex flex-wrap items-center gap-1.5">
      <TextFocusPicker mapId={mapId} focus={focus} onChange={setFocus} />
      {knobsError ? (
        <span className="text-[11px] text-destructive" title={knobsError.message}>
          Agent sizing overrides unavailable: the map settings could not be read.
        </span>
      ) : knobs ? (
        <TextOverridesPopover knobs={knobs} overrides={overrides} onChange={setOverrides} />
      ) : knobsLoading ? null : null}
      <div className="ml-auto">
        {markdown ? (
          <CopyButtons
            label={focus ? `Topical map — ${focus.name}` : "Topical map"}
            size="sm"
            human={() => markdown}
            {...(agentBytes ? { agent: () => agentBytes } : { hide: ["ai"] })}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <AssistStrip surfaceName={SURFACE_NAME} />
      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Text view
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The map as a markdown tree — the same topics the outline shows, readable as a document.
          {focus ? ` Focused on "${focus.name}".` : ""}
          {" "}Copy for AI hands an agent the outline it would actually receive
          {hasOverrides ? ", sized with this preview's overrides" : ""}.
        </p>
        <div className="mt-3">{controls}</div>

        {tree.isPending ? (
          <TopicalMapLoading what="this map's topics" />
        ) : tree.isError ? (
          <div className="mt-3">
            <TopicalMapFailed what="this map's topics" error={tree.error} />
          </div>
        ) : !markdown ? (
          <div className="mt-3">
            <TopicalMapEmpty
              title={focus ? "That topic is not in the loaded map" : "This map has no topics yet"}
              detail={
                focus
                  ? "The focused topic is not among the topics this map loaded; pick another or clear the focus."
                  : "Nothing has been generated or added. A map builder run, or an agent using the topical_map tool, fills the tree; until then there is genuinely nothing to show."
              }
            />
          </div>
        ) : (
          <div
            className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg bg-muted/40 p-4"
            aria-label="The map as a markdown tree"
          >
            <MarkdownStream
              content={markdown}
              isStreamActive={false}
              hideCopyButton
              allowFullScreenEditor={false}
            />
          </div>
        )}
      </section>
    </div>
  );
}
