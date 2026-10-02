/**
 * The pure half of the meeting-notes item type (`meeting-items.tsx`): the
 * parts a meeting shows on a board, their saved source, and the board a
 * meeting opens on. No React, no Supabase — unit-tested in
 * `__tests__/meeting-items.logic.test.ts`.
 *
 * A meeting part is a REFERENCE to one part of one meeting
 * (`{ kind: "entity", entity: "meeting_part", id: <meeting id>, meta: { part } }`):
 * the tile reads the meeting's live notes while this tab is in that meeting's
 * room, and its durable record everywhere else.
 */

import type { BoardDocument, NodeSource } from "../board/document";

export const MEETING_PART_ENTITY = "meeting_part";

export type MeetingPart = "transcript" | "notes" | "decisions" | "actions" | "summary";

/** In the order the parts sit on a meeting's board and in pickers. */
export const MEETING_PARTS: readonly { part: MeetingPart; title: string }[] = [
  { part: "transcript", title: "Transcript" },
  { part: "notes", title: "Notes" },
  { part: "decisions", title: "Decisions" },
  { part: "actions", title: "Action items" },
  { part: "summary", title: "Summary" },
];

const PART_SET = new Set<string>(MEETING_PARTS.map((p) => p.part));

export function isMeetingPart(value: unknown): value is MeetingPart {
  return typeof value === "string" && PART_SET.has(value);
}

export function meetingPartTitle(part: MeetingPart): string {
  return MEETING_PARTS.find((p) => p.part === part)?.title ?? part;
}

export function meetingPartSource(meetingId: string, part: MeetingPart): NodeSource {
  return { kind: "entity", entity: MEETING_PART_ENTITY, id: meetingId, meta: { part } };
}

export function matchesMeetingPart(source: NodeSource): boolean {
  return source.kind === "entity" && source.entity === MEETING_PART_ENTITY;
}

/** The meeting and part a source shows, or null for anything else (or a
 * hand-edited source missing either). */
export function meetingPartOf(source: NodeSource): { meetingId: string; part: MeetingPart } | null {
  if (!matchesMeetingPart(source) || source.kind !== "entity" || !source.id) return null;
  const part = source.meta?.part;
  return isMeetingPart(part) ? { meetingId: source.id, part } : null;
}

// ── the board a meeting opens on ─────────────────────────────────────────────

const PAD = 48;
const GAP = 40;
const COL_W = 520;
const CELL_H = 390;
const TRANSCRIPT_W = 560;

/** The "Meeting notes" frame's id on a meeting's board. */
export const MEETING_NOTES_FRAME_ID = "meeting-notes";

/**
 * A new meeting board: the "Meeting notes" frame holding the five live parts
 * (transcript down the left, notes / decisions / action items / summary in a
 * 2×2 beside it). Everything else is the person's to add.
 */
export function meetingNotesDocument(meetingId: string): BoardDocument {
  const right = PAD + TRANSCRIPT_W + GAP;
  const rects: Record<MeetingPart, { x: number; y: number; w: number; h: number }> = {
    transcript: { x: PAD, y: PAD, w: TRANSCRIPT_W, h: CELL_H * 2 + GAP },
    notes: { x: right, y: PAD, w: COL_W, h: CELL_H },
    decisions: { x: right + COL_W + GAP, y: PAD, w: COL_W, h: CELL_H },
    actions: { x: right, y: PAD + CELL_H + GAP, w: COL_W, h: CELL_H },
    summary: { x: right + COL_W + GAP, y: PAD + CELL_H + GAP, w: COL_W, h: CELL_H },
  };
  return {
    camera: { x: 0, y: 0, z: 0.6 },
    groups: [
      {
        id: MEETING_NOTES_FRAME_ID,
        rect: { x: 0, y: 0, w: PAD * 2 + TRANSCRIPT_W + GAP * 2 + COL_W * 2, h: PAD * 2 + CELL_H * 2 + GAP },
        title: "Meeting notes",
        note: "Live from the meeting assistant",
      },
    ],
    nodes: MEETING_PARTS.map(({ part, title }) => ({
      id: `meeting:${part}`,
      rect: rects[part],
      title,
      source: meetingPartSource(meetingId, part),
    })),
    edges: [],
    shapes: [],
  };
}
