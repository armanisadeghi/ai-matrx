// The two ingress guards of the Meetings admin page: the usage jsonb is
// validated (a missing or non-numeric number is an error, never a silent 0),
// and a history row the generator calls non-null is widened where the
// function really returns NULL. Real shapes: copied from a live
// communication.meet_admin_usage / meet_admin_meetings answer on 2026-09-29.

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

import { parseMeetUsage, toAdminMeetingRow } from "./service";

const numbers = {
  meetings_held: 12,
  meeting_minutes: 431.5,
  unique_participants: 5,
  guests: 2,
  recordings: 3,
  recording_bytes: 73400320,
  transcript_segments: 812,
  live_now: 1,
};

describe("parseMeetUsage", () => {
  it("reads totals and per-organization rows", () => {
    const report = parseMeetUsage({
      from: "2026-08-30T00:00:00Z",
      to: "2026-09-29T00:00:00Z",
      totals: numbers,
      by_org: [{ organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b", organization_name: "AI Matrx", ...numbers }],
    });
    expect(report.totals.meeting_minutes).toBe(431.5);
    expect(report.byOrg).toHaveLength(1);
    expect(report.byOrg[0].organization_name).toBe("AI Matrx");
    expect(report.byOrg[0].recording_bytes).toBe(73400320);
  });

  it("refuses a report whose number is missing instead of showing zero", () => {
    const { live_now: _dropped, ...partial } = numbers;
    expect(() => parseMeetUsage({ totals: partial, by_org: [] })).toThrow(/totals\.live_now/);
  });

  it("refuses a report with no per-organization list", () => {
    expect(() => parseMeetUsage({ totals: numbers })).toThrow(/per-organization/);
  });
});

describe("toAdminMeetingRow", () => {
  const base = {
    id: "0b6c5a3e-1f7e-4a53-9a5e-9b8f3b1f2c10",
    title: "Weekly sales sync",
    slug: "weekly-sales-sync",
    kind: "scheduled",
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    organization_name: "AI Matrx",
    host_user_id: "87a6e699-3622-4869-8843-d0867456c0dd",
    host_name: "Admin",
    host_email: "admin@admin.com",
    state: "scheduled",
    scheduled_for: "2026-10-01T16:00:00Z",
    started_at: null as unknown as string,
    ended_at: null as unknown as string,
    duration_minutes: null as unknown as number,
    participants: 0,
    recordings: 0,
    ai_enabled: true,
    total_count: 1,
  };

  it("keeps a never-started meeting's times and duration as null", () => {
    const row = toAdminMeetingRow(base);
    expect(row.started_at).toBeNull();
    expect(row.duration_minutes).toBeNull();
    expect(row.state).toBe("scheduled");
  });

  it("refuses a state the page does not know", () => {
    expect(() => toAdminMeetingRow({ ...base, state: "paused" })).toThrow(/unknown state/);
  });
});
