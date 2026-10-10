// features/employee-performance-reviews/review-360/meeting-notes.ts — lane HR-360 wave 3 (2026-10-08)
//
// THE REVIEW MEETING'S CONFIDENTIAL NOTES. One row per review in the Confidential typed table
// `review360MeetingNotes`; the review's `meeting_notes` holds its id (found by id, never by scan).
// The HR manager writes; the employee and the manager read only once HR shares (`shared = true`,
// the store's own reader `when`). Every open goes through the audited door
// `iam.open_confidential_audited` first, so each read — and each refusal — is a row in
// iam.access_audit; the row itself is then read through the records store as the person.

import { readVersionNow, updateRecordAt } from "@/lib/records/record-versions";
import type { RecordsClient } from "@ai-matrx/records/core";
import { confidentialGate, upsertAppRow } from "@ai-matrx/records/typed-table";

import { supabase } from "@/utils/supabase/client";

import { review360, review360MeetingNotes } from "../review-360.typed-table";
import { provisionConfidentialTable, type ConfidentialServerStep, type R360 } from "./service";

export interface CaptureFile {
  id: string;
  name: string;
  kind: "recording" | "transcript" | "file";
  createdAt: string | null;
}

const no = (message: string) => ({ ok: false as const, message });

const unwrap = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v) && "value" in (v as Record<string, unknown>) ? (v as { value: unknown }).value : v;

export interface MeetingNotesView {
  id: string;
  notes: string;
  shared: boolean;
  /** The HR manager's person id on the row — the one writer. */
  hrManager: string | null;
}

/** Closed = the door refused (not a reader yet); the refusal is already logged. */
export type MeetingNotesOpen = { open: true; view: MeetingNotesView } | { open: false; reason: string };

/** The audited open: logs the open (granted or refused) and answers whether this person may read. */
export async function openConfidentialAudited(
  type: "record" | "file",
  id: string,
  purpose: string,
): Promise<R360<{ granted: boolean; reason: string | null }>> {
  const { data, error } = await supabase
    .schema("iam")
    .rpc("open_confidential_audited", { p_type: type, p_id: id, p_purpose: purpose });
  if (error) return no(`The open could not be recorded: ${error.message}`);
  const field = (k: string): unknown =>
    data !== null && typeof data === "object" && !Array.isArray(data) ? Reflect.get(data, k) : undefined;
  const reason = field("reason");
  return { ok: true, data: { granted: field("granted") === true, reason: typeof reason === "string" ? reason : null } };
}

export async function openMeetingNotes(client: RecordsClient, notesId: string): Promise<R360<MeetingNotesOpen>> {
  const door = await openConfidentialAudited("record", notesId, "360 review meeting notes");
  if (!door.ok) return door;
  if (!door.data.granted) return { ok: true, data: { open: false, reason: door.data.reason ?? "Not shared yet" } };
  const read = await client.recordRead({ record_id: notesId });
  if (!read.ok) return no(read.error.message);
  const d = read.data.document as Record<string, unknown>;
  const notes = unwrap(d.notes);
  const hr = unwrap(d.hr_manager);
  return {
    ok: true,
    data: {
      open: true,
      view: {
        id: notesId,
        notes: typeof notes === "string" ? notes : "",
        shared: unwrap(d.shared) === true,
        hrManager: typeof hr === "string" ? hr : null,
      },
    },
  };
}

/**
 * The HR manager starts the notes of a review: makes the organization's notes copy Confidential
 * (the same server step and approval as the rest of the family), writes the row with the review's
 * three people, and records its id on the review. Returns the existing id when there is one.
 */
export async function ensureMeetingNotes(
  client: RecordsClient,
  organizationId: string,
  serverStep: ConfidentialServerStep,
  review: { id: string; doc: Record<string, unknown> },
): Promise<R360<string>> {
  const existing = review.doc.meeting_notes;
  if (typeof existing === "string" && existing) {
    const linked = await linkMeetingCaptureToNotes(review.id, existing);
    return linked.ok ? { ok: true, data: existing } : linked;
  }
  // The review copy gains its `meeting_notes` field, the notes copy is made and made Confidential.
  for (const def of [review360, review360MeetingNotes]) {
    const ready = await provisionConfidentialTable(client, def, organizationId, serverStep);
    if (!ready.ok) return ready;
  }
  const person = (k: string) => (typeof review.doc[k] === "string" ? (review.doc[k] as string) : null);
  const made = await upsertAppRow(
    client,
    review360MeetingNotes,
    {
      title: "Review meeting notes",
      review_ref: String(review.doc.review_ref ?? review.id),
      notes: "",
      hr_manager: person("hr_manager"),
      employee_user: person("employee_user"),
      manager_user: person("manager_user"),
      shared: false,
    } as never,
    { organizationId },
  );
  if (!made.ok) return no(made.error.message);
  const linked = await updateRecordAt(client, { record_id: review.id, patch: { meeting_notes: made.data }, version: await readVersionNow(client, review.id) });
  if (!linked.ok) return no(linked.error.message);
  // The notes row exists now, so the meeting's recording and transcript can be filed under it.
  const captured = await linkMeetingCaptureToNotes(review.id, made.data);
  return captured.ok ? { ok: true, data: made.data } : captured;
}

/**
 * The host of the review's meeting records the notes row as the parent of everything the meeting captures
 * (communication.meet_link_capture_to_notes). Answers how many meetings were linked; 0 is normal when no
 * meeting is scheduled yet or the caller does not host it. Capture itself stays off unless the organization's
 * knob meet.confidential_capture allows it.
 */
export async function linkMeetingCaptureToNotes(reviewId: string, notesId: string): Promise<R360<number>> {
  // This migration-only RPC is newer than the generated Supabase client types.
  const rpc = supabase.schema("communication").rpc as unknown as (
    name: string,
    args: { p_review_id: string; p_notes_id: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc("meet_link_capture_to_notes", {
    p_review_id: reviewId,
    p_notes_id: notesId,
  });
  if (error) return no(`The meeting could not be tied to its notes: ${error.message}`);
  return { ok: true, data: typeof data === "number" ? data : 0 };
}

/** The recording and transcript files under the notes row, as the signed-in person may see them (empty when none or not shared). */
export async function listCaptureFiles(notesId: string): Promise<R360<CaptureFile[]>> {
  const { data, error } = await supabase
    .schema("files")
    .from("files")
    .select("id, file_name, mime_type, created_at")
    .eq("parent_record_type", "record")
    .eq("parent_record_id", notesId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return no(error.message);
  return {
    ok: true,
    data: (data ?? []).map((f) => ({
      id: String(f.id),
      name: String(f.file_name ?? "file"),
      kind: /^(video|audio)\//.test(String(f.mime_type ?? "")) ? "recording" : /transcript/i.test(String(f.file_name)) ? "transcript" : "file",
      createdAt: typeof f.created_at === "string" ? f.created_at : null,
    })),
  };
}

/** The audited open of one captured file: logged in iam.access_audit, granted or refused, like the notes. */
export async function openCaptureFile(fileId: string): Promise<R360<true>> {
  const door = await openConfidentialAudited("file", fileId, "360 review meeting recording or transcript");
  if (!door.ok) return door;
  return door.data.granted ? { ok: true, data: true } : no(door.data.reason ?? "Not shared yet");
}

/** HR writes the notes — refused until the organization's copy is Confidential (fail closed). */
export async function saveMeetingNotes(
  client: RecordsClient,
  organizationId: string,
  notesId: string,
  patch: { notes?: string; shared?: boolean },
): Promise<R360<true>> {
  const gate = await confidentialGate(client, review360MeetingNotes, { organizationId });
  if (!gate.ok) return no(gate.error.message);
  const res = await updateRecordAt(client, { record_id: notesId, patch, version: await readVersionNow(client, notesId) });
  return res.ok ? { ok: true, data: true } : no(res.error.message);
}
