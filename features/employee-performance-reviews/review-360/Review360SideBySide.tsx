"use client";

// THE 360 REVIEW, SIDE BY SIDE, ONE SECTION AT A TIME — the review meeting's surface (HR-360 wave 2).
//
// Two homes, one component:
//   · inside a Meet call, as the registered app panel `hr.review_360` (Review360MeetPanel): the
//     section is the meeting's ONE shared focus, so both people look at the same thing;
//   · full page for an in-person meeting (/hr/performance/[reviewId]/meeting): local section.
// Each person reads the review through their own doors (readReview360 → the records store):
// a half they may not read arrives empty and is said to be waiting, never fetched around.

import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Badge, EmptyState } from "@ai-matrx/design-system/controls";
import { useRecordsClient } from "@ai-matrx/records/react";

import type { Review } from "@/features/employee-performance-reviews/schema";

import { Review360MeetingFiles } from "./Review360MeetingFiles";
import { Review360MeetingNotes } from "./Review360MeetingNotes";
import { parseReview } from "./Review360Pages";
import { readReview360, type TrackView } from "./service";

export const REVIEW_360_SECTIONS = [
  { key: "responsibilities", label: "Responsibilities" },
  { key: "accomplishments", label: "Accomplishments" },
  { key: "strengths", label: "Strengths" },
  { key: "opportunities", label: "Opportunities" },
  { key: "goals", label: "Goals" },
] as const;

export type Review360Section = (typeof REVIEW_360_SECTIONS)[number]["key"];

export function isReview360Section(value: string | null | undefined): value is Review360Section {
  return REVIEW_360_SECTIONS.some((s) => s.key === value);
}

function itemsOf(review: Review | null, section: Review360Section): string[] {
  if (!review) return [];
  if (section === "goals") return review.goals ? [review.goals] : [];
  return (review[section] ?? []).filter((item) => typeof item === "string" && item.trim().length > 0);
}

function Column({ label, track, section }: { label: string; track: TrackView | null; section: Review360Section }) {
  const review = track?.submittedAt ? parseReview(track.document) : null;
  const items = itemsOf(review, section);
  return (
    <section className="min-w-0 flex-1 rounded-md border border-border bg-card p-2" data-review-360-half={label}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">{label}</h3>
        {!track?.submittedAt ? <Badge>Waiting</Badge> : null}
      </div>
      {review === null ? null : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing written</p>
      ) : (
        <ul className="list-disc space-y-1 pl-4 text-sm">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Review360SideBySide({
  reviewId,
  organizationId,
  section,
  onSection,
  movedBy,
  canMove = true,
}: {
  reviewId: string;
  /** The review's organization — the notes box writes there. */
  organizationId: string;
  section: Review360Section;
  onSection: (section: Review360Section) => void;
  movedBy?: string | null;
  canMove?: boolean;
}) {
  const client = useRecordsClient();
  const [data, setData] = useState<Awaited<ReturnType<typeof readReview360>> | null>(null);
  useEffect(() => {
    let live = true;
    void readReview360(client, reviewId).then((r) => live && setData(r));
    return () => {
      live = false;
    };
  }, [client, reviewId]);

  if (!data) return <div className="h-24 animate-pulse rounded-md bg-card/40" aria-label="Loading the review" />;
  // read-gate-exempt: this is the read's own refusal, drawn with the refusal's message
  if (!data.ok) return <EmptyState icon={<ClipboardCheck />} title="This review is not open to you" line={data.message} />;
  const { doc, self, manager } = data.data;

  return (
    <div className="flex min-h-0 flex-col gap-2" data-review-360-section={section}>
      <div className="flex items-center gap-2">
        <h2 className="truncate text-sm font-semibold">{String(doc.employee_name ?? "360 review")}</h2>
        {movedBy ? <span className="truncate text-xs text-muted-foreground">{movedBy}</span> : null}
      </div>
      <div role="tablist" aria-label="Review section" className="flex flex-wrap gap-1">
        {REVIEW_360_SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={s.key === section}
            disabled={!canMove}
            onClick={() => onSection(s.key)}
            className={`rounded-md px-2 py-1 text-xs ${
              s.key === section ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
            } disabled:cursor-default`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <Column label="Employee" track={self} section={section} />
        <Column label="Manager" track={manager} section={section} />
      </div>
      <Review360MeetingNotes reviewId={reviewId} organizationId={organizationId} doc={doc} />
      <Review360MeetingFiles notesId={typeof doc.meeting_notes === "string" && doc.meeting_notes ? doc.meeting_notes : null} />
    </div>
  );
}
