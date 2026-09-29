// The record header and People tab count PEOPLE, not joins (verifier,
// 2026-09-27: a guest who rejoined three times showed as 3 of "4 people").
// The per-person rule lives once, in @ai-matrx/meet's `uniqueAttendees`.

import { readFileSync } from "node:fs";
import { join } from "node:path";

it("the record workspace counts attendees through uniqueAttendees", () => {
  const source = readFileSync(join(__dirname, "MeetingRecordWorkspace.tsx"), "utf8");
  expect(source).toMatch(/const attended = uniqueAttendees\(/);
  expect(source).not.toMatch(/bundle\.attendees\.filter\([^)]*\)\s*\.length/);
});
