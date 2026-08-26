/**
 * features/agents/mandates/notes.ts
 *
 * MANDATE NOTES — the data layer for an admin's observations about a job.
 *
 * Arman, 2026-08-25: "wherever we have agents running like this that are based
 * on a mandate, I want … to add notes and observations for that mandate and
 * agent who's handling that … we store the text and then the date and time and
 * who did it … so that later, when we're reviewing mandates, we have that
 * information available to us."
 *
 * THE NOTE FOLLOWS THE JOB. A note hangs off the MANDATE, never off the agent
 * bound to it today (the pin moves) and never off the run it was typed during
 * (a run is a moment; review is mandate-shaped). Where it was written and who
 * was holding the mandate at the time are recorded ALONGSIDE the text so a note
 * can still answer "where was I, and which agent was this about".
 *
 * Reads and writes go straight to Supabase under RLS (`agent.mandate_note`,
 * entity variant, `internal` visibility) — no Next.js route, no Python hop.
 *
 * Notes are NEVER fed to an agent implicitly. They are human-to-human evidence
 * for the human who decides what a mandate should be.
 */

import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@/lib/supabase/readAllRows";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Database } from "@/types/database.types";

type MandateNoteRow = Database["agent"]["Tables"]["mandate_note"]["Row"];

/**
 * The fixed, code-level vocabulary (db-rules §0.4 — a growing vocabulary would
 * be a `platform.categories` FK; this one is four words the composer offers and
 * a fifth is a code change). Mirrored by `mandate_note_kind_check`.
 */
export const MANDATE_NOTE_KINDS = [
  "observation",
  "issue",
  "idea",
  "praise",
] as const;
export type MandateNoteKind = (typeof MANDATE_NOTE_KINDS)[number];

export const MANDATE_NOTE_KIND_LABELS: Record<MandateNoteKind, string> = {
  observation: "Observation",
  issue: "Issue",
  idea: "Idea",
  praise: "Working well",
};

export interface MandateNote {
  id: string;
  mandateId: string;
  body: string;
  noteKind: MandateNoteKind;
  /** `ui_surface.name` the note was written from. Null = the mandate console. */
  surfaceName: string | null;
  /** The agent resolved as the holder when the note was written. */
  observedAgentId: string | null;
  observedAgentVersionId: string | null;
  conversationId: string | null;
  createdBy: string | null;
  createdAt: string;
  /** Best-effort author display name (`users.profiles`); null when unreadable. */
  authorName: string | null;
}

export interface CreateMandateNoteInput {
  mandateId: string;
  body: string;
  noteKind?: MandateNoteKind;
  surfaceName?: string | null;
  observedAgentId?: string | null;
  observedAgentVersionId?: string | null;
  conversationId?: string | null;
  /**
   * The organization the note is written under. Omitted = the caller's ACTIVE
   * org via the canonical resolver — never a database-chosen one (db-rules §0.9).
   */
  organizationId?: string | null;
}

function isNoteKind(value: string): value is MandateNoteKind {
  return (MANDATE_NOTE_KINDS as readonly string[]).includes(value);
}

function toNote(row: MandateNoteRow, authorName: string | null): MandateNote {
  return {
    id: row.id,
    mandateId: row.mandate_id,
    body: row.body,
    // The CHECK constraint makes anything else unrepresentable; narrow rather
    // than cast so a future vocabulary change surfaces here instead of lying.
    noteKind: isNoteKind(row.note_kind) ? row.note_kind : "observation",
    surfaceName: row.surface_name,
    observedAgentId: row.observed_agent_id,
    observedAgentVersionId: row.observed_agent_version_id,
    conversationId: row.conversation_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    authorName,
  };
}

/**
 * Author display names for a set of user ids, best-effort.
 *
 * `users.profiles` is 1:1 with `auth.users` and RLS may hide other people's
 * rows — an unreadable author is normal, not an error, and the UI falls back to
 * the canonical user door (`AdminUserRef`).
 */
async function fetchAuthorNames(
  userIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return names;
  const { data, error } = await createClient()
    .schema("users")
    .from("profiles")
    .select("id, display_name")
    .in("id", unique);
  if (error || !data) return names;
  for (const row of data) {
    const label = row.display_name?.trim();
    if (label) names.set(row.id, label);
  }
  return names;
}

/** Every live note on one mandate, newest first. */
export async function fetchMandateNotes(
  mandateId: string,
): Promise<MandateNote[]> {
  const supabase = createClient();
  const rows = await readAllRows<MandateNoteRow>(
    ({ from, to }) =>
      supabase
        .schema("agent")
        .from("mandate_note")
        .select("*", { count: "exact" })
        .eq("mandate_id", mandateId)
        .is("deleted_at", null)
        // Stable total order — created_at alone can tie, so the unique id
        // breaks it (the unstable-pagination class).
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    { label: "agent.mandate_note" },
  );
  const names = await fetchAuthorNames(
    rows.map((row) => row.created_by).filter((id): id is string => !!id),
  );
  return rows.map((row) =>
    toNote(row, row.created_by ? (names.get(row.created_by) ?? null) : null),
  );
}

/**
 * Notes across MANY mandates in ONE read — what a console listing 300 mandates
 * needs to show a count per row without 300 requests.
 * Returns a map keyed by `mandate_id`, newest first inside each bucket.
 */
export async function fetchMandateNotesFor(
  mandateIds: string[],
): Promise<Map<string, MandateNote[]>> {
  const byMandate = new Map<string, MandateNote[]>();
  const unique = [...new Set(mandateIds)].filter(Boolean);
  if (unique.length === 0) return byMandate;
  const supabase = createClient();
  const rows = await readAllRows<MandateNoteRow>(
    ({ from, to }) =>
      supabase
        .schema("agent")
        .from("mandate_note")
        .select("*", { count: "exact" })
        .in("mandate_id", unique)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    { label: "agent.mandate_note (batch)" },
  );
  const names = await fetchAuthorNames(
    rows.map((row) => row.created_by).filter((id): id is string => !!id),
  );
  for (const row of rows) {
    const note = toNote(
      row,
      row.created_by ? (names.get(row.created_by) ?? null) : null,
    );
    const list = byMandate.get(note.mandateId);
    if (list) list.push(note);
    else byMandate.set(note.mandateId, [note]);
  }
  return byMandate;
}

/** Write one note. Throws with a readable message; the caller toasts it. */
export async function createMandateNote(
  input: CreateMandateNoteInput,
): Promise<MandateNote> {
  const body = input.body.trim();
  if (!body) throw new Error("A note needs some text.");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to leave a note.");

  // EXPLICIT org on every write — the database never chooses one.
  const organizationId = input.organizationId ?? (await ensureOrgId(undefined));
  if (!organizationId) {
    throw new Error(
      "No organization could be resolved for this note. Nothing was saved.",
    );
  }

  const { data, error } = await supabase
    .schema("agent")
    .from("mandate_note")
    .insert({
      mandate_id: input.mandateId,
      body,
      note_kind: input.noteKind ?? "observation",
      surface_name: input.surfaceName ?? null,
      observed_agent_id: input.observedAgentId ?? null,
      observed_agent_version_id: input.observedAgentVersionId ?? null,
      conversation_id: input.conversationId ?? null,
      organization_id: organizationId,
      // std_insert requires created_by = auth.uid(); the actor trigger fills it
      // too, but setting it explicitly keeps the INSERT passing with_check
      // regardless of trigger order.
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message || "Could not save the note.");
  return toNote(data as MandateNoteRow, null);
}

/** Soft-delete a note (author or an admin, per RLS). */
export async function deleteMandateNote(noteId: string): Promise<void> {
  const { error } = await createClient()
    .schema("agent")
    .from("mandate_note")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) throw new Error(error.message || "Could not delete the note.");
}
