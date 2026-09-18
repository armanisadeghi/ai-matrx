"use client";

// features/exports/components/LibrarySummary.tsx
//
// "WITHIN SECONDS YOU SEE WHAT IT IS." This is that moment.
//
// It renders from the first `library.index.started` event (what it is, and how
// big) and fills in as the index runs, so nobody stares at a spinner holding a
// 4 GB archive. Three deliberate shapes:
//
//   • THE STRIP is always on screen, one dense row, horizontally scrollable on
//     a phone. It never grows and never pushes the list off the screen — the
//     list is the main event and this is its caption.
//   • THE DETAILS SHEET holds everything else: every kind, every label, the
//     threads, the correspondents. Its chips are FILTERS, so reading the
//     summary and acting on it are the same gesture.
//   • THE IDENTITY LINE says who the export belongs to AND why we think so
//     (`owner_identity_basis`), because "sent by me" is otherwise a mystery —
//     and when we could not tell, it says so and lets the person pick.

import { useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  FileText,
  Info,
  Paperclip,
  Send,
  FileArchive,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { countWithNoun, directionLabel, formatCount, formatDay, formatSpan, topCounts } from "../format";
import { formatExportCount, type ExportCounts } from "../counts";
import type { ExportLibrary, ExportSummary } from "../types";
import { formatFileSize } from "@ai-matrx/kit/format";

export interface LibrarySummaryProps {
  library: ExportLibrary | null;
  summary: ExportSummary | null;
  /**
   * EVERY NUMBER THIS CARD SHOWS, already derived (`../counts`).
   *
   * 🚨 D6: this component must not read `summary`, the index stream or an
   * items response for a count of its own. It did, the list header below it
   * read a different one, and mid-index the two contradicted each other on the
   * same screen. `summary` survives as a prop only for the things that are not
   * counts — the date range, the correspondents, the label and thread chips,
   * the warnings and the owner identity.
   */
  counts: ExportCounts;
  /** The identity the person picked when the server could not tell. */
  ownerOverride: string | null;
  onPickOwner: (key: string | null) => void;
  /** Apply one narrowing from a chip. */
  onNarrow: (filterId: string, value: string) => void;
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5"
      title={hint}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="block whitespace-nowrap text-sm font-semibold tabular-nums">
          {value}
        </span>
      </span>
    </div>
  );
}

function ChipRow({
  title,
  entries,
  onPick,
  empty,
}: {
  title: string;
  entries: { value: string; count: number; label?: string }[];
  onPick: (value: string) => void;
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <button
              key={entry.value}
              type="button"
              data-tap-target
              onClick={() => onPick(entry.value)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="truncate">{entry.label ?? entry.value}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatCount(entry.count)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LibrarySummary({
  library,
  summary,
  counts,
  ownerOverride,
  onPickOwner,
  onNarrow,
}: LibrarySummaryProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const adapterLabel =
    library?.adapter_label ?? library?.adapter ?? "Working it out";
  const detectedFrom = library?.detected_from ?? null;

  const indexing = counts.indexing;

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline" className="shrink-0 gap-1.5 py-1">
          <FileArchive className="h-3.5 w-3.5" />
          {adapterLabel}
        </Badge>
        {/* THE SENTENCE NAMING WHAT IN THE BYTES DECIDED. Never hidden — it is
            the difference between a guess and an answer. */}
        {detectedFrom && (
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={detectedFrom}>
            {detectedFrom}
          </p>
        )}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 shrink-0">
              <Info className="h-4 w-4" />
              <span className="max-sm:sr-only">Details</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="matrx-touch-targets max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader className="text-left">
              <DialogTitle className="text-base">
                {library?.name ?? "This export"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {detectedFrom ??
                  "Everything we could work out from the file you dropped."}
              </DialogDescription>
            </DialogHeader>

            {!summary ? (
              <p className="text-sm text-muted-foreground">
                The full breakdown appears when the index finishes.
                {counts.total.value !== null &&
                  ` ${formatExportCount(counts.total, indexing)}.`}
              </p>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Stat
                    icon={FileText}
                    label="Items"
                    value={formatExportCount(counts.total, indexing)}
                  />
                  <Stat
                    icon={Send}
                    label="Sent by you"
                    value={formatExportCount(counts.outbound, indexing)}
                  />
                  <Stat
                    icon={Paperclip}
                    label="With a file"
                    value={formatExportCount(counts.withAttachments, indexing)}
                  />
                  <Stat
                    icon={FileText}
                    label="Words"
                    value={formatExportCount(counts.words, indexing)}
                  />
                  <Stat
                    icon={FileText}
                    label="Characters"
                    value={formatExportCount(counts.characters, indexing)}
                  />
                  <Stat
                    icon={CalendarRange}
                    label="Spans"
                    value={formatSpan(summary.date_range.span_days)}
                    hint={`${formatDay(summary.date_range.earliest)} – ${formatDay(summary.date_range.latest)}`}
                  />
                </div>

                <OwnerIdentity
                  summary={summary}
                  ownerOverride={ownerOverride}
                  onPickOwner={onPickOwner}
                />

                <ChipRow
                  title="Who you talk to most"
                  entries={summary.top_correspondents.map((c) => ({
                    value: c.key,
                    count: c.count,
                    label: c.label,
                  }))}
                  onPick={(value) => {
                    onNarrow("author", value);
                    setDetailsOpen(false);
                  }}
                  empty="No correspondents were found in this export."
                />

                <ChipRow
                  title="Types"
                  entries={topCounts(summary.counts_by_kind, 20)}
                  onPick={(value) => {
                    onNarrow("kind", value);
                    setDetailsOpen(false);
                  }}
                  empty="Everything in here is one type."
                />

                <ChipRow
                  title="Directions"
                  entries={topCounts(summary.counts_by_direction, 10).map((e) => ({
                    ...e,
                    label: directionLabel(e.value),
                  }))}
                  onPick={(value) => {
                    onNarrow("direction", value);
                    setDetailsOpen(false);
                  }}
                  empty="Nothing here says which way it went."
                />

                <ChipRow
                  title="Labels"
                  entries={topCounts(summary.counts_by_label, 30)}
                  onPick={(value) => {
                    onNarrow("labels", value);
                    setDetailsOpen(false);
                  }}
                  empty="This export carries no labels."
                />

                <ChipRow
                  title="Threads and channels"
                  entries={topCounts(summary.counts_by_container, 30)}
                  onPick={(value) => {
                    onNarrow("container_label", value);
                    setDetailsOpen(false);
                  }}
                  empty="This export is not organised into threads or channels."
                />

                {summary.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      What we could not work out
                    </h3>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                      {summary.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Stat
          icon={FileText}
          label="Items"
          value={formatExportCount(counts.total, indexing)}
        />
        <Stat
          icon={Send}
          label="Sent by you"
          value={formatExportCount(counts.outbound, indexing)}
        />
        <Stat
          icon={CalendarRange}
          label="Spans"
          value={
            summary
              ? `${formatDay(summary.date_range.earliest)} – ${formatDay(summary.date_range.latest)}`
              : "—"
          }
          hint={summary ? formatSpan(summary.date_range.span_days) : undefined}
        />
        <Stat
          icon={Paperclip}
          label="With a file"
          value={formatExportCount(counts.withAttachments, indexing)}
        />
        <Stat
          icon={FileText}
          label="Words"
          value={formatExportCount(counts.words, indexing)}
        />
        {library?.bytes ? (
          <Stat icon={FileText} label="Archive" value={formatFileSize(library.bytes)} />
        ) : null}
      </div>

      {summary && (
        <OwnerIdentityLine
          summary={summary}
          ownerOverride={ownerOverride}
          onOpenDetails={() => setDetailsOpen(true)}
        />
      )}
    </div>
  );
}

/**
 * WHY "SENT BY ME" MEANS WHAT IT MEANS.
 *
 * The server decides direction from `owner_identity`, and it states its
 * reasoning in `owner_identity_basis`. Both are shown. When the server could
 * NOT tell, the summary's own warnings say so and the person picks themselves
 * out of the correspondents — at which point this feature filters by that name
 * instead of by a direction nothing could compute (see `sentByMeView`).
 */
function OwnerIdentity({
  summary,
  ownerOverride,
  onPickOwner,
}: {
  summary: ExportSummary;
  ownerOverride: string | null;
  onPickOwner: (key: string | null) => void;
}) {
  if (summary.owner_identity) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          <UserCheck className="h-3.5 w-3.5" />
          This export belongs to {summary.owner_identity}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {summary.owner_identity_basis ??
            "The server did not say how it worked that out."}{" "}
          That is what &ldquo;sent by you&rdquo; filters on.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        We could not tell which identity is yours
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        So nothing in here is marked as sent by you. Pick yourself and
        &ldquo;sent by me&rdquo; will filter on that name instead.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {summary.top_correspondents.slice(0, 12).map((c) => (
          <button
            key={c.key}
            type="button"
            data-tap-target
            onClick={() => onPickOwner(c.key === ownerOverride ? null : c.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              c.key === ownerOverride
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-primary hover:bg-primary/5",
            )}
          >
            <span className="truncate">{c.label}</span>
            <span className="tabular-nums opacity-70">{formatCount(c.count)}</span>
          </button>
        ))}
      </div>
      {summary.top_correspondents.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          This export names nobody we can offer as a choice.
        </p>
      )}
    </div>
  );
}

function OwnerIdentityLine({
  summary,
  ownerOverride,
  onOpenDetails,
}: {
  summary: ExportSummary;
  ownerOverride: string | null;
  onOpenDetails: () => void;
}) {
  const identity = summary.owner_identity ?? ownerOverride;
  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="flex w-full min-w-0 items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
    >
      {identity ? (
        <>
          <UserCheck className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            &ldquo;Sent by you&rdquo; means {identity}
            {summary.owner_identity && summary.owner_identity_basis
              ? ` — ${summary.owner_identity_basis}`
              : ownerOverride
                ? " — you picked this yourself"
                : ""}
          </span>
        </>
      ) : (
        <>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="truncate">
            We could not tell which identity is yours — pick yourself
          </span>
        </>
      )}
    </button>
  );
}

/**
 * Used by the page's aria label; kept beside the strip it describes.
 *
 * Takes the derived counts, not the summary: a headline that read the summary
 * itself would be one more place on this screen with its own opinion of how
 * many items there are (D6).
 */
export function summaryHeadline(counts: ExportCounts): string {
  if (counts.total.value === null) return "Working out what is in this export";
  return counts.total.partial
    ? `${countWithNoun(counts.total.value, "item")} read so far`
    : `${countWithNoun(counts.total.value, "item")} indexed`;
}
