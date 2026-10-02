import { parseBoardDocument, recordKeyOf } from "../../board/document";
import {
  MEETING_NOTES_FRAME_ID,
  MEETING_PARTS,
  matchesMeetingPart,
  meetingNotesDocument,
  meetingPartOf,
  meetingPartSource,
} from "../meeting-items.logic";

// Pure: no Supabase. documentColumns lives in the service; serialize directly.
import { serializeBoardDocument } from "../../board/document";

describe("meeting part sources", () => {
  it("a part names its meeting and which part, and nothing else matches", () => {
    const s = meetingPartSource("m1", "decisions");
    expect(matchesMeetingPart(s)).toBe(true);
    expect(meetingPartOf(s)).toEqual({ meetingId: "m1", part: "decisions" });
    expect(matchesMeetingPart({ kind: "entity", entity: "meeting", id: "m1" })).toBe(false);
    // A hand-edited source missing its part, or naming an unknown one, is not a part.
    expect(meetingPartOf({ kind: "entity", entity: "meeting_part", id: "m1" })).toBeNull();
    expect(meetingPartOf({ kind: "entity", entity: "meeting_part", id: "m1", meta: { part: "agenda" } })).toBeNull();
    expect(meetingPartOf({ kind: "entity", entity: "meeting_part", id: null, meta: { part: "notes" } })).toBeNull();
  });

  it("each part of one meeting is its own record key, so a board holds all five once each", () => {
    const keys = MEETING_PARTS.map((p) => recordKeyOf(meetingPartSource("m1", p.part)));
    expect(new Set(keys).size).toBe(5);
    // The same part of the same meeting is ONE key (a second bring-in shows the tile).
    expect(recordKeyOf(meetingPartSource("m1", "notes"))).toBe(recordKeyOf(meetingPartSource("m1", "notes")));
    // Another meeting's part is another key.
    expect(recordKeyOf(meetingPartSource("m2", "notes"))).not.toBe(recordKeyOf(meetingPartSource("m1", "notes")));
    // A plain record is unchanged.
    expect(recordKeyOf({ kind: "entity", entity: "note", id: "n1" })).toBe("note:n1");
  });
});

describe("the board a meeting opens on", () => {
  const doc = meetingNotesDocument("m1");

  it("is the five parts of THIS meeting inside the Meeting notes frame", () => {
    expect(doc.groups.map((g) => g.id)).toEqual([MEETING_NOTES_FRAME_ID]);
    expect(doc.nodes.map((n) => meetingPartOf(n.source))).toEqual(
      MEETING_PARTS.map((p) => ({ meetingId: "m1", part: p.part })),
    );
    const frame = doc.groups[0].rect;
    for (const n of doc.nodes) {
      expect(n.rect.x).toBeGreaterThanOrEqual(frame.x);
      expect(n.rect.y).toBeGreaterThanOrEqual(frame.y);
      expect(n.rect.x + n.rect.w).toBeLessThanOrEqual(frame.x + frame.w);
      expect(n.rect.y + n.rect.h).toBeLessThanOrEqual(frame.y + frame.h);
    }
  });

  it("no two parts overlap", () => {
    const r = doc.nodes.map((n) => n.rect);
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        const apart = r[i].x + r[i].w <= r[j].x || r[j].x + r[j].w <= r[i].x || r[i].y + r[i].h <= r[j].y || r[j].y + r[j].h <= r[i].y;
        expect(apart).toBe(true);
      }
  });

  it("saves and reopens with no problems (the saved-board round trip)", () => {
    const back = parseBoardDocument(JSON.parse(JSON.stringify(serializeBoardDocument(doc))));
    expect(back.problems).toEqual([]);
    expect(back.doc.nodes.map((n) => n.source)).toEqual(doc.nodes.map((n) => n.source));
    expect(back.doc.groups).toEqual(doc.groups);
  });
});
