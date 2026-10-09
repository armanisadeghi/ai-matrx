// Lane HR-360-REC (2026-10-09) — the recording and transcript of a review meeting are files under its notes row.
// Red before: the notes row was never tied to the meeting and no screen listed files under it.
const rpc = jest.fn();
const eq = jest.fn();
const chain: Record<string, unknown> = {};
const files = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (s: string) => ({
      rpc,
      from: (t: string) => {
        files(s, t);
        Object.assign(chain, {
          select: () => chain,
          eq: (...a: unknown[]) => (eq(...a), chain),
          is: () => chain,
          order: () => Promise.resolve({ data: [
            { id: "f1", file_name: "recording_1.mp4", mime_type: "video/mp4", created_at: "2026-10-09T10:00:00Z" },
            { id: "f2", file_name: "transcript.txt", mime_type: "text/plain", created_at: "2026-10-09T10:30:00Z" },
          ], error: null }),
        });
        return chain;
      },
    }),
  },
}));

import { linkMeetingCaptureToNotes, listCaptureFiles, openCaptureFile } from "../meeting-notes";

beforeEach(() => jest.clearAllMocks());

it("ties the review's meeting to the notes row through the one door", async () => {
  rpc.mockResolvedValueOnce({ data: 1, error: null });
  const res = await linkMeetingCaptureToNotes("review-1", "notes-1");
  expect(rpc).toHaveBeenCalledWith("meet_link_capture_to_notes", { p_review_id: "review-1", p_notes_id: "notes-1" });
  expect(res).toEqual({ ok: true, data: 1 });
});

it("says out loud when the door refuses", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "You do not edit this notes row." } });
  const res = await linkMeetingCaptureToNotes("review-1", "notes-1");
  expect(res.ok).toBe(false);
  expect(res.ok ? "" : res.message).toContain("You do not edit this notes row.");
});

it("lists only files whose parent is the notes row, and names recording and transcript", async () => {
  const res = await listCaptureFiles("notes-1");
  expect(files).toHaveBeenCalledWith("files", "files");
  expect(eq).toHaveBeenCalledWith("parent_record_type", "record");
  expect(eq).toHaveBeenCalledWith("parent_record_id", "notes-1");
  expect(res.ok && res.data.map((f) => f.kind)).toEqual(["recording", "transcript"]);
});

it("opens a file through the audited door and refuses when the door does", async () => {
  rpc.mockResolvedValueOnce({ data: { granted: true }, error: null });
  expect(await openCaptureFile("f1")).toEqual({ ok: true, data: true });
  expect(rpc).toHaveBeenCalledWith("open_confidential_audited", expect.objectContaining({ p_type: "file", p_id: "f1" }));
  rpc.mockResolvedValueOnce({ data: { granted: false, reason: "This is not open to you." }, error: null });
  const refused = await openCaptureFile("f2");
  expect(refused.ok).toBe(false);
});
