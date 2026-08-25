"use client";

/**
 * The loading library, in both phases, plus what YOUR kinds actually resolve
 * to — the one page that answers "what will my shape look like while it
 * waits?" without starting a run.
 *
 * Two sections, both honest:
 *  1. THE LIBRARY — every silhouette, side by side, in `reserved` (the
 *     placeholder: holds the footprint, stays still) and `arriving` (the
 *     loading state: shimmer, spinner, live early keys). Same component, so
 *     the pair also proves the switch changes mood and not shape.
 *  2. YOUR KINDS — REAL rows from `content_ir.kind_definition`, each rendered
 *     through the real `KindSlot` with the silhouette it genuinely resolves
 *     to, and labelled declared / derived / generic. Nothing here is invented.
 */

import { useState } from "react";
import { CircleDot, Play, TriangleAlert } from "lucide-react";
import {
  KIND_LOADING_COMPONENTS,
  KIND_LOADING_SLUGS,
} from "@/features/content-ir/react/loading/kind-loading-registry";
import { KindSlot } from "@/features/content-ir/react/slot/KindSlot";
import type { KindLoadingProps } from "@/features/content-ir/react/loading/kind-loading.types";
import type { RealKindRow } from "./real-kinds";

/** Early keys shaped like a real streaming payload's first arrivals. */
const EARLY: KindLoadingProps = {
  title: "Cell Biology Fundamentals",
  loadingMessage: "Crafting your questions…",
  loadingSubtext: "Reading the source material",
  count: 5,
};

const ORIGIN_STYLE: Record<
  RealKindRow["origin"],
  { label: string; className: string }
> = {
  declared: {
    label: "declared",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  derived: {
    label: "derived from schema",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  generic: {
    label: "generic (no shape to read)",
    className: "bg-muted text-muted-foreground",
  },
};

export default function KindLoaderGallery({
  realKinds,
  loadError,
}: {
  realKinds: RealKindRow[];
  loadError: string | null;
}) {
  const [showEarly, setShowEarly] = useState(true);
  const early = showEarly ? EARLY : {};

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">
          Kind loading library — placeholder and loading, side by side
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Reserved</span> is the
          placeholder: it holds the footprint its content will need and stays
          still, because nothing has started.{" "}
          <span className="font-medium text-foreground">Arriving</span> is the
          same silhouette once data is actually coming — shimmer, spinner, and
          the early keys filling in. Same component, same footprint, so the
          switch moves nothing on the page.
        </p>
        <button
          type="button"
          onClick={() => setShowEarly((value) => !value)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <Play className="h-3.5 w-3.5" />
          {showEarly ? "Hide early keys" : "Show early keys"}
        </button>
      </header>

      {/* ── 1. The library ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {KIND_LOADING_SLUGS.map((slug) => {
          const Loader = KIND_LOADING_COMPONENTS[slug];
          return (
            <div
              key={slug}
              className="rounded-lg border border-border bg-card/40"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                <span className="font-mono text-xs font-medium text-foreground">
                  {slug}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  reserved · arriving
                </span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-border">
                <div className="p-3">
                  <Loader {...early} kind="demo_kind" phase="reserved" />
                </div>
                <div className="p-3">
                  <Loader {...early} kind="demo_kind" phase="arriving" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 2. Real kinds ──────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-base font-semibold text-foreground">
          Your kinds — what each one actually reserves
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Live rows from the kind registry, rendered through the real{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">KindSlot</code>{" "}
          with the silhouette each one genuinely resolves to. A kind that never
          declared a loader still gets a shaped one, derived from its own
          schema.
        </p>

        {loadError ? (
          <p className="mt-4 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            Could not read the kind registry: {loadError}
          </p>
        ) : realKinds.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No active kinds came back.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {realKinds.map((row) => {
              const origin = ORIGIN_STYLE[row.origin];
              return (
                <div
                  key={row.kind}
                  className="flex flex-col rounded-lg border border-border bg-card"
                >
                  <div className="border-b border-border px-3 py-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.label}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {row.kind}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${origin.className}`}
                      >
                        {row.slug ?? "generic"} · {origin.label}
                      </span>
                    </div>
                    {row.invalidDeclared ? (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-rose-600 dark:text-rose-400">
                        <TriangleAlert className="h-3 w-3 shrink-0" />
                        declares “{row.invalidDeclared}”, which is not a library
                        slug — derived instead
                      </p>
                    ) : null}
                  </div>
                  <div className="flex-1 p-3">
                    <KindSlot
                      slotKey={`gallery:${row.kind}`}
                      kind={row.kind}
                      phase="reserved"
                      early={{ title: row.label }}
                    />
                  </div>
                  <p className="flex items-center gap-1 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
                    <CircleDot className="h-3 w-3 shrink-0" />
                    reserved — holds this footprint until content starts
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
