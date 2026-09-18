"use client";

/**
 * TEXT — `seo.map_outline`, exactly what an agent receives, read-only and
 * copyable (vision §2.1: "exactly what an agent receives, copyable, read-only").
 *
 * This screen is deliberately NOT a rendering of the map: it is the bytes the
 * agent is handed, so what the person reads here and what the agent read are
 * provably the same thing. Two controls change WHICH bytes — never how they
 * look: the focus (which topic the neighbourhood is built around) and the
 * sizing overrides (`p_overrides`, this preview only). Copy hands the same
 * bytes to a person or to an agent.
 */

import { useState } from "react";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AssistStrip } from "@/features/assists/components/AssistStrip";

import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../components/TopicalMapStates";
import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { useMapOutline } from "../hooks";
import { useTopicalMapKnobs } from "../knobs";
import type { MapTopicSearchHit } from "../types";
import { TextFocusPicker } from "./outline/text/TextFocusPicker";
import { TextOverridesPopover, type OutlineOverrides } from "./outline/text/TextOverridesPopover";

const SURFACE_NAME = "matrx-user/marketing-topical-map";

export function TextView({ mapId, siteId }: MapViewProps) {
  const [focus, setFocus] = useState<MapTopicSearchHit | null>(null);
  const [overrides, setOverrides] = useState<OutlineOverrides>({});
  const { knobs, loading: knobsLoading, error: knobsError } = useTopicalMapKnobs();

  const hasOverrides = Object.keys(overrides).length > 0;
  const outline = useMapOutline(mapId, {
    siteId: siteId ?? undefined,
    focusSlug: focus?.slug ?? undefined,
    ...(hasOverrides ? { overrides } : {}),
  });

  const controls = (
    <div className="flex flex-wrap items-center gap-1.5">
      <TextFocusPicker mapId={mapId} focus={focus} onChange={setFocus} />
      {knobsError ? (
        <span className="text-[11px] text-destructive" title={knobsError.message}>
          Sizing overrides unavailable: the map settings could not be read.
        </span>
      ) : knobs ? (
        <TextOverridesPopover knobs={knobs} overrides={overrides} onChange={setOverrides} />
      ) : knobsLoading ? null : null}
      <div className="ml-auto">
        {outline.data && outline.data.trim() ? (
          <CopyButtons
            label="Agent outline"
            size="sm"
            human={() => outline.data}
            agent={() => outline.data}
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
          This is the map exactly as an agent receives it (seo.map_outline), not a
          rendering of it.
          {focus ? ` Focused on "${focus.name}".` : ""}
          {hasOverrides ? " Sized with this preview's overrides, not the settings." : ""}
        </p>
        <div className="mt-3">{controls}</div>

        {outline.isPending ? (
          <TopicalMapLoading what="the agent outline" />
        ) : outline.isError ? (
          <div className="mt-3">
            <TopicalMapFailed what="the agent outline" error={outline.error} />
          </div>
        ) : !outline.data.trim() ? (
          <div className="mt-3">
            <TopicalMapEmpty
              title="The outline is empty"
              detail="seo.map_outline returned nothing, which means this map has no topics an agent could be shown yet."
            />
          </div>
        ) : (
          <pre
            className="mt-3 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-xs"
            aria-label="The outline an agent receives"
          >
            {outline.data}
          </pre>
        )}
      </section>
    </div>
  );
}
