// Lane HR-360-2 (2026-10-08) — the notes' audited door is called through the generated types.
// Red before: `.rpc("open_confidential_audited" as never, {...} as never)` — a renamed argument or door compiled.
import fs from "node:fs";
import path from "node:path";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ rpc }) } }));

import { openConfidentialAudited } from "../meeting-notes";

it("names the door and its three arguments, and reads granted/reason from the answer", async () => {
  rpc.mockResolvedValueOnce({ data: { granted: false, reason: "Not shared yet" }, error: null });
  const res = await openConfidentialAudited("record", "r1", "360 review meeting notes");
  expect(rpc).toHaveBeenCalledWith("open_confidential_audited", { p_type: "record", p_id: "r1", p_purpose: "360 review meeting notes" });
  expect(res).toEqual({ ok: true, data: { granted: false, reason: "Not shared yet" } });
});

it("carries no `as never` on the door", () => {
  const src = fs.readFileSync(path.join(__dirname, "../meeting-notes.ts"), "utf8");
  const door = src.slice(src.indexOf("export async function openConfidentialAudited"), src.indexOf("export async function openMeetingNotes"));
  expect(door).not.toMatch(/as never/);
});
