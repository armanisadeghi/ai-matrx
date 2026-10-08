"use client";

// The three 360 review screens under /hr/performance: the HR manager's list, one review (both
// halves side by side once both are in), and a respondent's own half in the existing editor.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, ClipboardCheck, Send, Share2 } from "lucide-react";
import { Badge, Button, EmptyState } from "@ai-matrx/design-system/controls";
import { useRecordsClient } from "@ai-matrx/records/react";

import PerformanceReviewApp from "@/features/employee-performance-reviews/components/PerformanceReviewApp";
import { createBlankReview, type Review } from "@/features/employee-performance-reviews/schema";
import type { ReviewPersistence } from "@/features/employee-performance-reviews/use-reviews";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { googleCalendarUrl } from "@/lib/calendar/eventLinks";
import { toast } from "@/lib/toast";

import { TRACK_TITLE } from "../review-360.typed-table";
import { Review360Host } from "./Review360Host";
import {
  listReviews360,
  readReview360,
  readTrack,
  saveTrack,
  shareReview360,
  type Review360Row,
  type TrackView,
} from "./service";

function useOrg(): string | null {
  const params = useSearchParams();
  const hr = useHrContext();
  return params?.get("org") || hr.active?.organization_id || null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">{children}</div>;
}

const day = (iso: unknown) => (typeof iso === "string" && iso ? new Date(iso).toLocaleDateString() : "—");

// ── /hr/performance ───────────────────────────────────────────────────────────────────────────

export function Review360ListPage() {
  const org = useOrg();
  if (!org) return <Shell><EmptyState icon={<ClipboardCheck />} title="Pick an employer first" /></Shell>;
  return (
    <Review360Host organizationId={org}>
      <Shell>
        <ReviewList org={org} />
      </Shell>
    </Review360Host>
  );
}

function ReviewList({ org }: { org: string }) {
  const client = useRecordsClient();
  const [rows, setRows] = useState<Review360Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void listReviews360(client, org).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [client, org]);
  if (error) return <EmptyState icon={<ClipboardCheck />} title="360 reviews could not be read" line={error} />;
  if (!rows) return <div className="m-4 h-24 animate-pulse rounded-md bg-card/40" aria-label="Loading 360 reviews" />;
  if (rows.length === 0) return <EmptyState icon={<ClipboardCheck />} title="No 360 reviews yet" line="Start one from an employee profile" />;
  return (
    <table className="m-3 w-[calc(100%-1.5rem)] text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="px-2 py-1.5 font-medium">Employee</th>
          <th className="px-2 py-1.5 font-medium">Status</th>
          <th className="px-2 py-1.5 font-medium">Due</th>
          <th className="px-2 py-1.5 font-medium">Self</th>
          <th className="px-2 py-1.5 font-medium">Manager</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r._id} className="border-t border-border">
            <td className="px-2 py-1.5">
              <Link className="hover:underline" href={`/hr/performance/${r._id}?org=${r._organizationId}`}>
                {r.employee_name ?? "360 review"}
              </Link>
            </td>
            <td className="px-2 py-1.5"><Badge>{r.status ?? "collecting"}</Badge></td>
            <td className="px-2 py-1.5">{day(r.due_on)}</td>
            <td className="px-2 py-1.5">{r.self_submitted_at ? day(r.self_submitted_at) : "Waiting"}</td>
            <td className="px-2 py-1.5">{r.manager_submitted_at ? day(r.manager_submitted_at) : "Waiting"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── /hr/performance/[reviewId] ────────────────────────────────────────────────────────────────

export function Review360ReviewPage({ reviewId }: { reviewId: string }) {
  const org = useOrg();
  if (!org) return <Shell><EmptyState icon={<ClipboardCheck />} title="Pick an employer first" /></Shell>;
  return (
    <Review360Host organizationId={org}>
      <Shell>
        <ReviewDetail reviewId={reviewId} />
      </Shell>
    </Review360Host>
  );
}

function parseReview(doc: string | null): Review | null {
  if (!doc) return null;
  try {
    return { ...createBlankReview(), ...(JSON.parse(doc) as Partial<Review>) };
  } catch {
    return null;
  }
}

function Half({ label, track }: { label: string; track: TrackView | null }) {
  const r = parseReview(track?.document ?? null);
  return (
    <section className="min-w-0 flex-1 rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{label}</h2>
        <Badge>{track?.submittedAt ? `In ${day(track.submittedAt)}` : "Waiting"}</Badge>
      </div>
      {!track?.submittedAt || !r ? null : (
        <dl className="space-y-2 text-sm">
          {(["accomplishments", "strengths", "opportunities"] as const).map((k) => (
            <div key={k}>
              <dt className="text-xs capitalize text-muted-foreground">{k}</dt>
              <dd>
                <ul className="list-disc pl-4">
                  {(r[k] ?? []).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function ReviewDetail({ reviewId }: { reviewId: string }) {
  const client = useRecordsClient();
  const [data, setData] = useState<Awaited<ReturnType<typeof readReview360>> | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void readReview360(client, reviewId).then((r) => live && setData(r));
    return () => {
      live = false;
    };
  }, [client, reviewId, tick]);
  if (!data) return <div className="m-4 h-24 animate-pulse rounded-md bg-card/40" aria-label="Loading the review" />;
  if (!data.ok) return <EmptyState icon={<ClipboardCheck />} title="This review could not be opened" line={data.message} />;
  const { doc, self, manager } = data.data;
  const both = Boolean(self?.submittedAt && manager?.submittedAt);
  const share = async () => {
    const ids = [self?.id, manager?.id].filter((x): x is string => Boolean(x));
    const r = await shareReview360(client, reviewId, ids);
    if (r.ok) setTick((n) => n + 1);
    else toast.error(r.message);
  };
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold">{String(doc.employee_name ?? "360 review")}</h1>
        <Badge>{String(doc.status ?? "collecting")}</Badge>
        <span className="text-xs text-muted-foreground">Due {day(doc.due_on)}</span>
        <div className="flex-1" />
        {both && doc.status !== "shared" ? (
          <Button variant="primary" icon={<Share2 />} onClick={() => void share()}>
            Share with both
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <Half label="Self review" track={self} />
        <Half label="Manager review" track={manager} />
      </div>
    </div>
  );
}

// ── /hr/performance/respond/[trackId] ─────────────────────────────────────────────────────────

export function Review360RespondPage({ trackId }: { trackId: string }) {
  const org = useSearchParams()?.get("org") ?? null;
  if (!org) return <Shell><EmptyState icon={<ClipboardCheck />} title="This link is missing its organization" /></Shell>;
  return (
    <Review360Host organizationId={org}>
      <Respond trackId={trackId} org={org} />
    </Review360Host>
  );
}

function Respond({ trackId, org }: { trackId: string; org: string }) {
  const client = useRecordsClient();
  const [track, setTrack] = useState<TrackView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [latest, setLatest] = useState<string>("");

  useEffect(() => {
    let live = true;
    void readTrack(client, trackId).then((r) => {
      if (!live) return;
      if (r.ok && r.data.kind) {
        setTrack(r.data);
        setSubmitted(Boolean(r.data.submittedAt));
      } else setError(r.ok ? "This review is not yours to open." : r.message);
    });
    return () => {
      live = false;
    };
  }, [client, trackId]);

  const [persistence] = useState<ReviewPersistence>(() => ({
    load: async () => {
      const r = await readTrack(client, trackId);
      if (!r.ok) throw new Error(r.message);
      const parsed = parseReview(r.data.document);
      return parsed ? [parsed] : [];
    },
    save: async (reviews) => {
      const doc = JSON.stringify(reviews[0] ?? createBlankReview());
      setLatest(doc);
      const r = await saveTrack(client, org, trackId, doc, false);
      if (!r.ok) throw new Error(r.message);
    },
  }));

  if (error) return <Shell><EmptyState icon={<ClipboardCheck />} title="This review could not be opened" line={error} /></Shell>;
  if (!track) return <Shell><div className="m-4 h-24 animate-pulse rounded-md bg-card/40" aria-label="Loading your review" /></Shell>;

  const submit = async () => {
    const r = await saveTrack(client, org, trackId, latest || track.document || JSON.stringify(createBlankReview()), true);
    if (r.ok) {
      setSubmitted(true);
      toast.success("Review submitted");
    } else toast.error(r.message);
  };
  const due = track.dueOn ? `${track.dueOn}T16:00:00.000Z` : null;
  const calendar = due
    ? googleCalendarUrl({
        uid: `review-360-${trackId}`,
        title: TRACK_TITLE,
        start: due,
        end: new Date(Date.parse(due) + 30 * 60_000).toISOString(),
        url: typeof window === "undefined" ? undefined : window.location.href,
      })
    : null;

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <PerformanceReviewApp
        showHero={false}
        single={{
          persistence,
          toolbarEnd: (
            <>
              {calendar ? (
                <Button variant="quiet" icon={<CalendarPlus />} asChild>
                  <a href={calendar} target="_blank" rel="noopener noreferrer">Add to calendar</a>
                </Button>
              ) : null}
              <Button variant="primary" icon={<Send />} disabled={submitted} onClick={() => void submit()}>
                {submitted ? "Submitted" : "Submit"}
              </Button>
            </>
          ),
        }}
      />
    </div>
  );
}
