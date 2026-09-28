// A guest's RSVP must reach the host's Guests tab live. Before this, the tab
// read `meet_invitees` once and the table was not in the realtime publication,
// so an answer appeared only after a reload (verifier, 2026-09-27).

import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("@ai-matrx/realtime", () => ({
  defineChannelNamespace: ({ namespace }: { namespace: string }) => ({
    topic: (parts: Record<string, string>) =>
      `${namespace}:${Object.values(parts).join(":")}`,
  }),
}));
jest.mock("@ai-matrx/realtime/react", () => ({ useChannel: jest.fn() }));

import { meetingInviteesSubscription } from "./useMeetingInviteesLive";

const ROOT = join(__dirname, "..", "..", "..");

describe("meeting invitees live subscription", () => {
  it("subscribes to this meeting's invitee rows and re-reads on change and on reconnect", async () => {
    const onChange = jest.fn();
    const spec = meetingInviteesSubscription("m-1", onChange)!;
    expect(spec.postgresChanges).toHaveLength(1);
    const binding = spec.postgresChanges[0]!;
    expect(binding.schema).toBe("communication");
    expect(binding.table).toBe("meet_invitees");
    expect(binding.filter).toBe("meeting_id=eq.m-1");
    binding.onChange();
    await spec.onBackfill();
    expect(onChange).toHaveBeenCalledTimes(2);
    // An answer changing is news; the fingerprint must move with it.
    expect(binding.fingerprint({ rsvp_state: "accepted" })).not.toBe(
      binding.fingerprint({ rsvp_state: "declined" }),
    );
  });

  it("opens nothing without a meeting", () => {
    expect(meetingInviteesSubscription(null, () => undefined)).toBeNull();
  });

  it("is mounted by the meeting page that renders the Guests tab", () => {
    const source = readFileSync(
      join(ROOT, "features/meet/components/manage/MeetingDetail.tsx"),
      "utf8",
    );
    expect(source).toMatch(/useMeetingInviteesLive\(meetingId,\s*reload\)/);
  });

  it("the table is in the realtime publication (a subscription to an unpublished table is silent forever)", () => {
    const sql = readFileSync(
      join(ROOT, "migrations/meet_invitees_realtime_publication.sql"),
      "utf8",
    );
    expect(sql).toMatch(/alter publication supabase_realtime add table communication\.meet_invitees/);
  });
});
