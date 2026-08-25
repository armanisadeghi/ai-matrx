"use client";

/**
 * THE KIND SLOT — one reserved place on a surface, from first paint to final
 * content, without ever moving anything above it.
 *
 * Ratified by Arman 2026-08-25, from the podcast run page: a slot "takes up
 * the space… it's sort of animated, but it's fairly steady, and it tries to
 * look a little bit like it's gonna look eventually, but without looking like
 * it's actively, instantly loading. And then when the content actually starts
 * coming, boom — that's when it switches to the loading component."
 *
 * ─── The four phases ────────────────────────────────────────────────────────
 *   reserved  the kind's silhouette, STILL — holds the footprint, nothing has
 *             started. (`PodcastCompositionPlaceholder` is the reference look.)
 *   arriving  the same silhouette, now working — spinner, shimmer, live early
 *             keys. The switch moves nothing: same component, same footprint.
 *   settled   the real kind component, growing downward from its first
 *             renderable unit (THE ONE LOADING SEQUENCE).
 *   failed    an honest failure, inside the same reserved footprint.
 *
 * ─── Why the placeholder is a PHASE, not a third component ──────────────────
 * A separately-authored loader would mean a second artifact per kind to keep
 * in sync with the schema (868 of them), and — worse — swapping between two
 * components unmounts and remounts, so the layout jumps and animations
 * restart at exactly the moment we are trying to keep calm. One silhouette in
 * two moods keeps the transition continuous, and every kind gets a
 * shape-appropriate placeholder for free via the declared-or-derived slug
 * (`resolveLoadingSlugForKind`) — including the 857 that declare nothing.
 *
 * ─── The floor, not the ceiling ─────────────────────────────────────────────
 * `minHeightPx` is honoured in EVERY phase, settled included. Holding it only
 * while pending would let a short result shrink the slot and pull the page up
 * — the same defect as growing it, in the other direction. Content longer than
 * the floor grows DOWNWARD, which is the one direction that disturbs nothing
 * the reader is already looking at. This mirrors `ReadoutTile`'s floor in
 * `features/workflow-runtime/components/RunSurfaceView.tsx` ("the zero
 * page-shift law") — same law, now keyed to the KIND rather than to an
 * authored grid height.
 *
 * ─── Identity ───────────────────────────────────────────────────────────────
 * `slotKey` is the slot's OWN identity and must be stable from first paint —
 * it exists before any producer does, which is exactly why it cannot be a
 * request id (there is no request yet when the slot is reserved). A producer
 * id (a streaming lane's requestId, a workflow `invocationKeyOf(...)`) is a
 * BINDING the caller resolves later and feeds in as `phase` + `children`.
 */

import React from "react";
import { resolveKindLoadingComponent } from "../loading/kind-loading-registry";
import { resolveLoadingSlugForKind } from "../loading/resolve-loading-slug";
import { useContentIrKindVersion } from "../use-registry-repaint";
import { useEnsureKindRenderable } from "../ensure-kind-renderable";
import type { KindLoadingProps } from "../loading/kind-loading.types";

export type KindSlotPhase = "reserved" | "arriving" | "settled" | "failed";

export interface KindSlotProps {
  /**
   * Stable identity for this slot, known at first paint and never changing.
   * Surfaces derive it from their own structure (a workflow invocation key, a
   * podcast asset index, an authored slot id) — never from a producer id.
   */
  slotKey: string;
  /** The kind expected here, when known. Drives which silhouette reserves. */
  kind?: string | null;
  phase: KindSlotPhase;
  /**
   * Early keys for the arriving phase (title / count / loading_message …) and
   * the partial value a data-fed smart loader performs. Ignored when settled.
   */
  early?: KindLoadingProps;
  /**
   * Footprint floor in px, held in every phase. Omit to let the silhouette's
   * own natural height do the reserving (which is right for most kinds).
   */
  minHeightPx?: number;
  /** The settled content — the real kind component. */
  children?: React.ReactNode;
  /** Rendered in the `failed` phase. */
  error?: React.ReactNode;
  /**
   * `bare` when the host already draws the frame/icon/title around this slot
   * (a workflow deliverable card does) — the silhouette then contributes only
   * its body, never a second header.
   */
  chrome?: "full" | "bare";
  className?: string;
}

export function KindSlot({
  slotKey,
  kind,
  phase,
  early,
  minHeightPx,
  children,
  error,
  chrome,
  className,
}: KindSlotProps) {
  // A slot is usually the FIRST thing on screen to name a kind — often long
  // before any stream mentions it — so it owes the same two duties the chat
  // render path owes:
  //  1. DEMAND what is missing. Rendering a kind is the fetch signal, on every
  //     surface (THE ONE LOADING SEQUENCE). Without this a slot for a DB-only
  //     kind sat on the generic skeleton for the whole run, because nothing
  //     else had asked for its definition yet.
  //  2. SUBSCRIBE, so the answer arriving late actually repaints this slot.
  //     Registry reads are plain synchronous lookups; nothing in React state
  //     changes when a definition lands.
  useEnsureKindRenderable(kind ?? null);
  const kindVersion = useContentIrKindVersion(kind ?? null);

  // Explicit memo: React Compiler is OFF in this repo, and resolution should
  // re-run when the kind or its registry answer changes — not every render.
  const slug = React.useMemo(() => {
    void kindVersion; // registry-arrival invalidation key
    return resolveLoadingSlugForKind(kind).slug;
  }, [kind, kindVersion]);

  // ONE root element across every phase — React reconciles it in place, so
  // the container (and the reader's scroll position) survives the swap. A
  // conditional that returned different roots per phase would remount and
  // undo the whole point of the slot.
  return (
    <div
      data-kind-slot={slotKey}
      data-kind-slot-phase={phase}
      data-kind-slot-kind={kind ?? undefined}
      style={minHeightPx ? { minHeight: `${minHeightPx}px` } : undefined}
      className={className}
    >
      {phase === "settled" ? (
        children
      ) : phase === "failed" ? (
        error
      ) : (
        <PendingSilhouette
          slug={slug}
          kind={kind}
          phase={phase}
          early={early}
          chrome={chrome}
        />
      )}
    </div>
  );
}

/** The reserved/arriving body: the resolved silhouette, in the right mood. */
const PendingSilhouette: React.FC<{
  slug: string | null;
  kind?: string | null;
  phase: "reserved" | "arriving";
  early?: KindLoadingProps;
  chrome?: "full" | "bare";
}> = ({ slug, kind, phase, early, chrome }) => {
  const Loader = resolveKindLoadingComponent(slug);
  return React.createElement(Loader, {
    ...early,
    kind: kind ?? early?.kind,
    phase,
    chrome,
  });
};

/**
 * The phase a slot is in, from the two facts every producer surface has: has
 * anything started, and has it finished. Kept here so a surface never invents
 * its own phase vocabulary — the workflow run board, a podcast slot, and an
 * authored page all map into the SAME four phases.
 */
export function kindSlotPhase(input: {
  started: boolean;
  settled: boolean;
  failed?: boolean;
}): KindSlotPhase {
  if (input.failed) return "failed";
  if (input.settled) return "settled";
  return input.started ? "arriving" : "reserved";
}
