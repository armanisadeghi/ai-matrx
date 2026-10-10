"use client";

// The three 360 review screens under /hr/performance: the HR manager's list, one review (both
// halves side by side once both are in), and a respondent's own half in the existing editor.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, ClipboardCheck, Send, Share2 } from "lucide-react";
import { Badge, Button, EmptyState } from "@ai-matrx/design-system/controls";
import { useRecordsClient } from "@ai-matrx/records/react";
import { MatrxDataTable, type MatrxColumnDef, type MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table";

import PerformanceReviewApp from "@/features/employee-performance-reviews/components/PerformanceReviewApp";
import { createBlankReview, type Review } from "@/features/employee-performance-reviews/schema";
import type { ReviewPersistence } from "@/features/employee-performance-reviews/use-reviews";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { googleCalendarUrl, icsContent, icsFileName } from "@/lib/calendar/eventLinks";
import { toast } from "@/lib/toast";

import { TRACK_TITLE } from "../review-360.typed-table";
import { Review360Host } from "./Review360Host";
import { isReviewHrManager } from "./seat";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ReviewMeetingActions } from "./ReviewMeetingActions";
import {
  listReviews360,
  readReview360,
  readReview360Knobs,
  readTrack,
  saveTrack,
  shareReview360,
  type Review360ListRow,
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

const reviewState = (r: Review360ListRow) =>
  r.status === "shared" ? "shared" : r.selfIn && r.managerIn ? "ready" : "collecting";

const REVIEW_LIST_COLUMNS: MatrxColumnDef<Review360ListRow>[] = [
  {
    id: "employee",
    header: "Employee",
    accessorFn: (r) => r.employee_name ?? "360 review",
    filter: "text",
    width: 260,
    frozen: true,
    cell: (r) => (
      <Link className="hover:underline" href={`/hr/performance/${r._id}?org=${r._organizationId}`}>
        {r.employee_name ?? "360 review"}
      </Link>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessorFn: reviewState,
    filter: "select",
    filterOptions: [
      { value: "collecting", label: "Collecting" },
      { value: "ready", label: "Ready" },
      { value: "shared", label: "Shared" },
    ],
    width: 130,
    cell: (r) => <Badge>{reviewState(r)}</Badge>,
  },
  { id: "due", header: "Due", accessorFn: (r) => r.due_on ?? null, filter: "date", width: 130, cell: (r) => day(r.due_on) },
  {
    id: "self",
    header: "Self",
    accessorFn: (r) => r.selfIn ?? null,
    filter: "date",
    width: 130,
    cell: (r) => (r.selfIn ? day(r.selfIn) : "Waiting"),
  },
  {
    id: "manager",
    header: "Manager",
    accessorFn: (r) => r.managerIn ?? null,
    filter: "date",
    width: 130,
    cell: (r) => (r.managerIn ? day(r.managerIn) : "Waiting"),
  },
];

const REVIEW_LIST_COPY: MatrxDataTableCopyConfig<Review360ListRow> = {
  label: "360 review",
  listLabel: "360 reviews (this view)",
  location: "Performance — 360 reviews",
  rowKind: "review-360",
  listKind: "review-360-list",
  rowDescription: "One 360 review: employee, status, due date and whether the self and manager halves are in.",
  listDescription: "The 360 reviews of the selected employer, as currently shown.",
  humanRow: (r) =>
    [
      `Employee: ${r.employee_name ?? "360 review"}`,
      `Status: ${reviewState(r)}`,
      `Due: ${day(r.due_on)}`,
      `Self: ${r.selfIn ? day(r.selfIn) : "Waiting"}`,
      `Manager: ${r.managerIn ? day(r.managerIn) : "Waiting"}`,
    ].join("\n"),
};

function ReviewList({ org }: { org: string }) {
  const client = useRecordsClient();
  const [rows, setRows] = useState<Review360ListRow[] | null>(null);
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
    <div className="mx-3 mt-3">
      <MatrxDataTable<Review360ListRow>
        tableId="hr/performance/360-reviews"
        data={rows}
        columns={REVIEW_LIST_COLUMNS}
        getRowId={(r) => r._id}
        pageSize={0}
        density="condensed"
        viewTabs={false}
        toolbar={{ title: "360 reviews", searchPlaceholder: "Search 360 reviews" }}
        detail={{ enabled: false }}
        copy={REVIEW_LIST_COPY}
        emptyState={{ title: "No 360 reviews yet" }}
      />
    </div>
  );
}

// ── /hr/performance/[reviewId] ────────────────────────────────────────────────────────────────

export function Review360ReviewPage({ reviewId }: { reviewId: string }) {
  const org = useOrg();
  if (!org) return <Shell><EmptyState icon={<ClipboardCheck />} title="Pick an employer first" /></Shell>;
  return (
    <Review360Host organizationId={org}>
      <Shell>
        <ReviewDetail reviewId={reviewId} org={org} />
      </Shell>
    </Review360Host>
  );
}

export function parseReview(doc: string | null): Review | null {
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

function ReviewDetail({ reviewId, org }: { reviewId: string; org: string }) {
  const client = useRecordsClient();
  const [data, setData] = useState<Awaited<ReturnType<typeof readReview360>> | null>(null);
  const [tick, setTick] = useState(0);
  const userId = useAppSelector(selectUserId);
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
  const hr = isReviewHrManager(doc, userId);
  const share = async () => {
    const ids = [self?.id, manager?.id].filter((x): x is string => Boolean(x));
    const r = await shareReview360(client, reviewId, ids);
    if (r.ok) setTick((n) => n + 1);
    else toast.error(r.message);
  };
  return (
    <div className="space-y-3 px-3 pt-3">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold">{String(doc.employee_name ?? "360 review")}</h1>
        <Badge>{doc.status === "shared" ? "shared" : both ? "ready" : "collecting"}</Badge>
        <span className="text-xs text-muted-foreground">Due {day(doc.due_on)}</span>
        <div className="flex-1" />
        {hr ? (
          <ReviewMeetingActions
            reviewId={reviewId}
            organizationId={org}
            employee={doc.employee}
            ready={both}
          />
        ) : null}
        {hr && both && doc.status !== "shared" ? (
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
  const submittedRef = useRef(false);
  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);
  const [latest, setLatest] = useState<string>("");
  const [leadDays, setLeadDays] = useState<number | null>(null);
  const userId = useAppSelector(selectUserId);
  useEffect(() => {
    if (!userId) return;
    void readReview360Knobs(org, userId).then((k) => setLeadDays(k.ok ? k.data.reminderLeadDays : null));
  }, [org, userId]);

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
      submittedRef.current = Boolean(r.data.submittedAt);
      const parsed = parseReview(r.data.document);
      return parsed ? [parsed] : [];
    },
    save: async (reviews) => {
      // A submitted half is read-only: nothing is saved (the store refuses it too).
      if (submittedRef.current) return;
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
  const due = track.dueAt;
  const calendarEvent = due
    ? {
        uid: `review-360-${trackId}`,
        title: TRACK_TITLE,
        start: due,
        end: new Date(Date.parse(due) + 30 * 60_000).toISOString(),
        url: typeof window === "undefined" ? undefined : window.location.href,
        // The reminder-lead-days knob: the calendar reminds her that many days before it is due.
        alarmMinutesBefore: leadDays === null ? null : leadDays * 24 * 60,
      }
    : null;
  const calendar = calendarEvent ? googleCalendarUrl(calendarEvent) : null;
  const icsHref = calendarEvent ? `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent(calendarEvent))}` : null;

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <PerformanceReviewApp
        showHero={false}
        single={{
          persistence,
          readOnly: submitted,
          toolbarEnd: (
            <>
              {calendar ? (
                <Button variant="quiet" icon={<CalendarPlus />} asChild>
                  <a href={calendar} target="_blank" rel="noopener noreferrer">Add to calendar</a>
                </Button>
              ) : null}
              {icsHref ? (
                <Button variant="quiet" asChild>
                  <a href={icsHref} download={icsFileName(TRACK_TITLE)}>.ics with reminder</a>
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
