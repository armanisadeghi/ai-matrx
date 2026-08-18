"use client";

/**
 * The Press Room — the pitch pipeline and the coverage that came out of it.
 *
 * The pipeline is deliberately NOT a kanban board. A kanban implies you drag
 * things between columns, and nothing here moves because you dragged it — it
 * moves because a journalist replied. So it is a staged list: the same row
 * component as the angle queue, grouped by lifecycle, counts on every stage.
 *
 * Coverage closes the loop the brief asks for: every landed piece points back
 * to the angle that produced it. There is NO foreign key from
 * `seo.coverage_mention` to `seo.story_angle`, so the tie is read from
 * `metadata.story_angle_id` — stated here and stated in the UI, because an
 * inferred link that pretends to be a real one is worse than no link.
 */

import * as React from "react";
import { ArrowRight, ExternalLink, Link2, Newspaper } from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";

import { formatDay } from "./press-model";
import { AngleRow } from "./AngleViews";
import { ViewEmpty } from "./PressRoomStates";
import type { CoverageMentionRow, StoryAngleRow } from "./types";

/* ── pipeline ────────────────────────────────────────────────────────────── */

const PIPELINE_STAGES: ReadonlyArray<{
  status: StoryAngleRow["status"];
  label: string;
  hint: string;
}> = [
  {
    status: "accepted",
    label: "Accepted",
    hint: "You said yes. Nothing has gone out.",
  },
  {
    status: "developing",
    label: "Getting the proof",
    hint: "Waiting on evidence before it can be pitched.",
  },
  {
    status: "pitched",
    label: "Pitched",
    hint: "Out with a journalist. The ball is in their court.",
  },
  {
    status: "landed",
    label: "Landed",
    hint: "It ran. Coverage is tied back below.",
  },
];

export function PitchPipeline({
  angles,
  selectedId,
  onSelect,
}: {
  angles: StoryAngleRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const staged = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    rows: angles.filter((angle) => angle.status === stage.status),
  }));
  const total = staged.reduce((sum, stage) => sum + stage.rows.length, 0);

  if (total === 0) {
    return (
      <ViewEmpty
        title="Nothing is in flight"
        detail="Accept an angle from the queue and it appears here, then moves along as it goes out and lands."
      />
    );
  }

  return (
    <div>
      {staged.map((stage) => (
        <section key={stage.status}>
          <div className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-border/60 bg-background/95 px-4 py-1.5 backdrop-blur">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
              {stage.label}
            </h3>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {stage.rows.length}
            </span>
            <span className="min-w-0 truncate text-[11px] text-muted-foreground/80">
              {stage.hint}
            </span>
          </div>
          {stage.rows.length === 0 ? (
            <p className="px-4 py-2.5 text-[11px] text-muted-foreground/70">
              Nothing at this stage.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {stage.rows.map((angle) => (
                <AngleRow
                  key={angle.id}
                  angle={angle}
                  selected={selectedId === angle.id}
                  onSelect={() => onSelect(angle.id)}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/* ── coverage ────────────────────────────────────────────────────────────── */

/** The angle→coverage tie lives in `metadata`, not in a foreign key. */
export function coverageAngleId(row: CoverageMentionRow): string | null {
  const metadata = row.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))
    return null;
  const value = (metadata as Record<string, unknown>)["story_angle_id"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function prominenceTone(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 0.6) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 0.3) return "text-foreground";
  return "text-muted-foreground";
}

export function CoverageList({
  rows,
  anglesById,
  onOpenAngle,
}: {
  rows: CoverageMentionRow[];
  anglesById: Map<string, StoryAngleRow>;
  onOpenAngle: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <ViewEmpty
        title="No coverage found yet"
        detail="Once something runs, it lands here with the journalist, the link, and the angle that produced it."
      />
    );
  }

  return (
    <ul className="divide-y divide-border/40">
      {rows.map((row) => {
        const angleId = coverageAngleId(row);
        const angle = angleId ? (anglesById.get(angleId) ?? null) : null;
        return (
          <li key={row.id} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Newspaper className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-start gap-1.5 text-[13px] font-medium leading-snug text-foreground hover:text-primary hover:underline"
                >
                  <span className="min-w-0 flex-1">{row.title ?? row.url}</span>
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                </a>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {row.domain}
                  </span>
                  <span aria-hidden="true">·</span>
                  {row.author_party_id ? (
                    <EntityRef
                      token="party"
                      id={row.author_party_id}
                      name={row.author_name ?? "Author"}
                      showIcon={false}
                      openInNewTab
                      className="text-[11px]"
                    />
                  ) : row.author_name ? (
                    <span className="inline-flex items-center gap-1">
                      {row.author_name}
                      <a
                        href="/crm"
                        target="_blank"
                        rel="noreferrer noopener"
                        className="rounded border border-dashed border-border px-1 py-px text-[10px] transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        not in CRM — add
                      </a>
                    </span>
                  ) : (
                    <span>No byline</span>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{formatDay(row.published_at)}</span>
                  {row.links_to_site ? (
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                      <Link2 className="h-2.5 w-2.5" />
                      links to you
                    </span>
                  ) : (
                    <span className="rounded border border-border px-1.5 py-px text-[10px]">
                      no link
                    </span>
                  )}
                </div>

                {row.key_quote ? (
                  <p className="mt-1.5 border-l-2 border-border pl-2.5 text-[11px] italic leading-relaxed text-muted-foreground">
                    {row.key_quote}
                  </p>
                ) : null}

                {angle ? (
                  <button
                    type="button"
                    onClick={() => onOpenAngle(angle.id)}
                    className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      From angle
                    </span>
                    <span className="min-w-0 truncate text-[11px] text-foreground">
                      {angle.headline}
                    </span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>
                ) : angleId ? (
                  // An id we cannot resolve is its own loud state, never "ok".
                  <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    Tagged to an angle that is not in this list
                    {" — "}it may be dismissed, or on another site.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                    Not tied to any angle. If you know which one earned it, that
                    link is what turns coverage into a repeatable play.
                  </p>
                )}
              </div>

              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    "text-[11px] font-semibold capitalize",
                    prominenceTone(row.prominence_score),
                  )}
                >
                  {row.prominence ?? "unrated"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {row.sentiment ?? "sentiment unknown"}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
