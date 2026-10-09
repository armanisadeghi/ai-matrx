// Lane HR-360 (2026-10-08) — a submitted half is read-only.
// saveTrack refuses a write to a track whose submitted_at is set (the store refuses it too: the
// respondent's editor reader applies only `when` submitted_at is empty), and the respond page
// renders the editor read-only once submitted. Red before: saveTrack wrote, the page stayed editable.
import fs from "node:fs";
import path from "node:path";

import { review360Track } from "../../review-360.typed-table";
import { SUBMITTED_REFUSAL, saveTrack } from "../service";

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const TRACK = "94eb733b-d18f-4688-9fd9-71ed1561913b";

function client(submittedAt: string | null) {
  const writes: unknown[] = [];
  const c = {
    config: { organizationId: ORG, dataSource: {} },
    tableFind: async () => ({
      ok: true,
      data: { id: "t1", level: "confidential", maker_is_reader: true, readers: review360Track.confidential!.readers },
    }),
    recordRead: async () => ({ ok: true, data: { document: { track: "self", submitted_at: submittedAt } } }),
    recordUpdate: async (args: unknown) => {
      writes.push(args);
      return { ok: true, data: 2 };
    },
  };
  return { c: c as never, writes };
}

it("refuses to write a submitted half", async () => {
  const { c, writes } = client("2026-10-08T19:02:59.066Z");
  expect(await saveTrack(c, ORG, TRACK, "{}", false)).toEqual({ ok: false, message: SUBMITTED_REFUSAL });
  expect(writes).toEqual([]);
});

it("writes a half that is not submitted yet", async () => {
  const { c, writes } = client(null);
  expect((await saveTrack(c, ORG, TRACK, "{}", true)).ok).toBe(true);
  expect(writes).toHaveLength(1);
});

it("the respond page renders read-only once submitted and stops autosaving", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "Review360Pages.tsx"), "utf8");
  expect(src).toMatch(/readOnly: submitted/);
  expect(src).toMatch(/if \(submittedRef\.current\) return;/);
  const app = fs.readFileSync(path.join(__dirname, "..", "..", "components", "PerformanceReviewApp.tsx"), "utf8");
  expect(app).toMatch(/readOnly \? null : \(/);
});
