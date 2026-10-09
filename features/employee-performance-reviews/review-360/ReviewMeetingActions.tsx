"use client";

// THE REVIEW MEETING (HR-360 wave 2): from the review page, the HR manager schedules the meeting
// once both halves are in. It is an ordinary Meet meeting that carries the registered app panel
// `hr.review_360` on this review (Meet MD-15), with the employee and the manager invited; the
// HR manager is its host and may join it as a silent observer (Meet MD-16). In person, the same
// panel opens full page.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Eye, Users, Video } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { asOrganizationId, asUserId, createMeetRepository, type MeetingRecord } from "@ai-matrx/meet";

import { fetchHrEmployeeProfile } from "@/features/hr/service";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";

import { useRecordsClient } from "@ai-matrx/records/react";

import { useConfidentialServerStep } from "./Review360Host";
import { ensureMeetingNotes } from "./meeting-notes";
import { readReview360Knobs, type Review360Knobs } from "./service";

export const REVIEW_360_PANEL_KEY = "hr.review_360";

const repository = createMeetRepository({ client: supabase });

/** The live (not cancelled, not archived) meeting that carries this review's panel, if any. */
async function findReviewMeeting(reviewId: string): Promise<MeetingRecord | null> {
  const { data, error } = await supabase
    .schema("communication")
    .from("meet_meetings")
    .select("*")
    .eq("metadata->app_panel->>key", REVIEW_360_PANEL_KEY)
    .eq("metadata->app_panel->>record_id", reviewId)
    .is("deleted_at", null)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return row ? repository.projectMeeting(row as Record<string, unknown>) : null;
}

async function loginOf(employeeId: string): Promise<{ userId: string | null; managerEmployeeId: string | null }> {
  const p = await fetchHrEmployeeProfile({ employeeId });
  if (!p.ok) return { userId: null, managerEmployeeId: null };
  return { userId: p.data.header.login_user_id ?? null, managerEmployeeId: p.data.header.manager_employee_id ?? null };
}

function employeeIdOf(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

/** Tomorrow at the hour the knob hr.performance/review_360_meeting_hour names (local time). */
export function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReviewMeetingActions({
  reviewId,
  organizationId,
  employee,
  ready,
}: {
  reviewId: string;
  organizationId: string;
  /** The review's `employee` entity reference (hr_employee). */
  employee: unknown;
  /** Both halves are in. */
  ready: boolean;
}) {
  const userId = useAppSelector(selectUserId);
  const client = useRecordsClient();
  const serverStep = useConfidentialServerStep();
  const [meeting, setMeeting] = useState<MeetingRecord | null | undefined>(undefined);
  const [when, setWhen] = useState("");
  const [knobs, setKnobs] = useState<Review360Knobs | null>(null);
  useEffect(() => {
    if (!userId) return;
    void readReview360Knobs(organizationId, userId).then((k) => {
      if (!k.ok) {
        toast.error(k.message);
        return;
      }
      setKnobs(k.data);
      setWhen((w) => w || tomorrowAt(k.data.meetingHour));
    });
  }, [organizationId, userId]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    findReviewMeeting(reviewId)
      .then((m) => live && setMeeting(m))
      .catch((thrown: unknown) => {
        if (live) setMeeting(null);
        toast.error(`The review meeting could not be read: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
      });
    return () => {
      live = false;
    };
  }, [reviewId]);

  const inPerson = `/hr/performance/${reviewId}/meeting?org=${organizationId}`;

  const schedule = async () => {
    if (!userId || busy || !knobs) return;
    setBusy(true);
    try {
      const employeeId = employeeIdOf(employee);
      if (!employeeId) throw new Error("This review names no employee record.");
      const emp = await loginOf(employeeId);
      if (!emp.userId) throw new Error("The employee has no login in this organization.");
      const mgr = emp.managerEmployeeId ? await loginOf(emp.managerEmployeeId) : null;
      if (!mgr?.userId) throw new Error("The employee's manager has no login in this organization.");
      const made = await repository.scheduleMeeting({
        organizationId: asOrganizationId(organizationId),
        hostUserId: asUserId(userId),
        title: "360 review meeting",
        scheduledFor: new Date(when).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        durationMinutes: knobs.meetingMinutes,
        agenda: null,
        recurrenceRule: null,
        settings: { joinBeforeHost: knobs.meetingJoinBeforeHost, lobbyEnabled: knobs.meetingLobby },
        appPanel: { key: REVIEW_360_PANEL_KEY, recordId: reviewId },
      });
      await repository.addInvitees(
        made.id,
        [
          { userId: asUserId(emp.userId), role: "invitee" },
          { userId: asUserId(mgr.userId), role: "invitee" },
        ],
        asUserId(userId),
      );
      // A silent observer stays silent here: in THIS meeting only hosts see "Observing".
      const quiet = await supabase
        .schema("communication")
        .rpc("meet_policy_set", { p_meeting_id: made.id, p_key: "observers_visible_to", p_value: "hosts" });
      const answer: unknown = quiet.data;
      const field = (k: string): unknown =>
        answer !== null && typeof answer === "object" && !Array.isArray(answer) ? Reflect.get(answer, k) : undefined;
      const refused = field("ok") === false;
      if (quiet.error || refused) {
        const said = field("detail");
        const detail = typeof said === "string" ? said : "refused";
        throw new Error(`The meeting was scheduled, but observers could not be hidden: ${quiet.error?.message ?? detail}`);
      }
      setMeeting(made);
      toast.success("Review meeting scheduled");
      // The notes row exists before anything can be filed under it: make it, then tie the meeting to it so a
      // recording or transcript (only when the organization allows capture) lands under that row.
      const review = await client.recordRead({ record_id: reviewId });
      const notes = review.ok
        ? await ensureMeetingNotes(client, organizationId, serverStep, { id: reviewId, doc: review.data.document as Record<string, unknown> })
        : { ok: false as const, message: review.error.message };
      if (!notes.ok) toast.error(`The meeting is scheduled, but its confidential notes could not be prepared: ${notes.message}`);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  };

  if (meeting === undefined) return null;
  if (meeting !== null) {
    return (
      <div className="flex items-center gap-1" data-review-360-meeting={meeting.slug}>
        <Button variant="primary" icon={<Video />} asChild>
          <Link href={`/meet/${meeting.slug}`}>Join meeting</Link>
        </Button>
        <Button variant="quiet" icon={<Eye />} asChild>
          <Link href={`/meet/${meeting.slug}?observe=1`}>Observe</Link>
        </Button>
        <Button variant="quiet" icon={<Users />} asChild>
          <Link href={inPerson}>In person</Link>
        </Button>
      </div>
    );
  }
  if (!ready) return null;
  return (
    <div className="flex items-center gap-1">
      <input
        type="datetime-local"
        aria-label="Meeting time"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="h-8 rounded-md border border-border bg-background px-2 text-base md:text-sm"
      />
      <Button variant="primary" icon={<CalendarPlus />} disabled={busy} onClick={() => void schedule()}>
        {busy ? "Scheduling…" : "Schedule meeting"}
      </Button>
      <Button variant="quiet" icon={<Users />} asChild>
        <Link href={inPerson}>In person</Link>
      </Button>
    </div>
  );
}
