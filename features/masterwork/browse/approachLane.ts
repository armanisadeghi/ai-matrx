// features/masterwork/browse/approachLane.ts
//
// THE ONE MAP from a `platform.approach` registry row to the lane it opens.
//
// ## The class this closes (census row 3, 2026-09-12)
//
// The `timeline` Approach ("A case that unfolds in time") was seeded live with
// `intake_query = {"ingest":"timeline"}`, `enabled = true`,
// `metadata.availability = "available"`, and a real server lane behind it
// (`POST /masterworks/ingest-timeline`,
// `aidream/services/distillation/timeline_ingest.py`). The card rendered, was
// selectable, and Start created a Rulebook — and then dropped the Expert on a
// bare, empty detail page, because the dispatch in `RulebookDetailPage` was a
// hand-written three-way `q.ingest === "source" | "exemplar" | "file"` and a
// fourth value fell through to a URL push nothing read. No error, no toast, no
// capture UI: a fully live card that led nowhere.
//
// The instance was one missing `||`. The CLASS is that the registry could grow
// a row the code silently did not handle. So the mapping lives HERE as a pure
// function with a total return type — every caller gets `null` for an
// unmapped row and must say so out loud (NOTHING FAILS SILENTLY), and
// `features/masterwork/browse/__tests__/approachLaneCoverage.test.ts` reads the
// live registry and fails if any startable row resolves to `null`.

import type { DistillationApproach } from "./approaches";

/**
 * The ingest lanes of the "Add rules from a source" dialog. Each value is the
 * literal `intake_query.ingest` of a registry row, and the literal `?ingest=`
 * deep link on `/masterwork/[id]`.
 */
export const INGEST_LANES = [
  "source",
  "exemplar",
  "file",
  "timeline",
  // The VOICE-FIRST door (2026-09-12). The `monologue` Approach's server lane
  // has existed since the recording lane shipped — transcribe, chunk by time
  // range, distill through `masterwork.monologue_distiller`, anchor every rule
  // to the moment it was said — and the row sat `enabled=false` for the one
  // reason a row ever does: the product had no door. It is a lane of its own
  // and not a mode of `file` because an Expert who wants to TALK must not be
  // asked to go away and make a recording first.
  "monologue",
] as const;

export type IngestLane = (typeof INGEST_LANES)[number];

/** Narrow an arbitrary query value onto a real ingest lane, or null. */
export function toIngestLane(value: string | null | undefined): IngestLane | null {
  return INGEST_LANES.includes(value as IngestLane) ? (value as IngestLane) : null;
}

/** Where an Approach goes. One variant per real door in the product. */
export type ApproachLane =
  /** The registry row names its own page (`metadata.launch_href`). */
  | { kind: "href"; href: string }
  /** The Scout interview panel. */
  | { kind: "interview" }
  /** The "Add rules from a source" dialog, on a named lane. */
  | { kind: "ingest"; lane: IngestLane }
  /** The "Everything you've published" corpus dialog. */
  | { kind: "body_of_work" }
  /** The chat-import dialog, on one of its two tabs. */
  | { kind: "chatImport"; tab: "upload" | "matrx" }
  /** The Sources panel's dump staging area. */
  | { kind: "dump" }
  /**
   * THE MEETING SCAVENGER (2026-09-15). Its own door, not an ingest lane: the
   * Expert first picks MEETINGS (ours, an uploaded transcript, or a paste) and
   * then says which VOICE in them is theirs — a question no other lane has,
   * because no other source has more than one person in it.
   */
  | { kind: "meeting" }
  /** The Conductor conversation. */
  | { kind: "conduct" }
  /**
   * THE TRIAD GAME's own page (`/masterwork/[id]/triad`). Not an ingest lane
   * and not a dialog: a phone-first forced-choice game needs the whole screen,
   * a sticky thumb-reachable footer and a swipe that nothing else is listening
   * for. Reached by `intake_query.triad = "1"`.
   */
  | { kind: "triad" }
  /**
   * THE RED-PEN LANE (`red_pen`, 2026-09-15): a piece of somebody else's work
   * the Expert marks up, correction by correction. It is a lane of its own and
   * not an `ingest` mode because the source is material the Expert DISAGREES
   * with — there is no "is it the finished work?" question, no paste-or-upload
   * choice once the work is in, and the capture surface is a highlighter and a
   * microphone rather than a text box.
   */
  | { kind: "redPen" }
  /**
   * Trial 7's UNFOLDING-CASE dialog — the one door that can SEAL a case as a
   * held-out exam (`role: "heldout"`), which the `timeline` ingest lane has no
   * notion of. Reached by `intake_query.intake = "timeline"`; the live
   * `timeline` registry row carries `{"ingest":"timeline"}` and still goes to
   * the ingest dialog, so the two doors never fight over one row.
   */
  | { kind: "unfolding" }
  /**
   * THE BAD EXAMPLE PROBE (`bad_example_probe`, 2026-09-15) — boundary
   * hunting. The system writes a plausible-but-wrong version of the Expert's
   * own work and asks what is wrong with it; each answer steers the next
   * variant. Reached by `intake_query.probe = "1"`.
   *
   * A door of its own and NOT an `ingest` mode: every ingest lane reads
   * expertise out of something that already exists, and this one MANUFACTURES
   * the stimulus round by round, so the Expert brings nothing at all. It is
   * also not a dialog — a session is minutes of back-and-forth and gets a real
   * URL like the interview and the Conductor.
   */
  | { kind: "probe" }
  /**
   * THE PREDICTION LEDGER — calls recorded on real open cases before the
   * answer is known, scored when it arrives. Reached by
   * `intake_query.predictions = "1"`.
   *
   * It is a door of its own and NOT a mode of the ingest dialog: every ingest
   * lane takes something that already exists (a document, a recording, a
   * chat) and reads expertise out of it. This one CREATES the record, over
   * weeks, in two sittings — the call and the outcome — and nothing in the
   * ingest dialog's one-shot shape can hold that.
   */
  | { kind: "prediction" }
  /**
   * SHADOW-THE-INBOX (`shadow_inbox`, 2026-09-15) — the Expert's real mail,
   * diffed against the reply a competent generalist would have written.
   * Reached by `intake_query.shadowInbox = "1"`.
   *
   * A door of its own and NOT a `chatImport` tab, even though both read
   * transcripts: the chat lane mines what the Expert said to an AI, and this
   * one MANUFACTURES a baseline first (a blind generic reply) and distils the
   * distance between it and what they actually sent. It also has a second,
   * provider-gated door the chat lane has no notion of — and that door is
   * ABSENT, never dead, until the mailbox grant exists.
   */
  | { kind: "shadowInbox" }
  /**
   * THE SORTING TABLE (`sorting_table`, 2026-09-15) — a pile of real cases
   * sorted wordlessly into piles the Expert names, then the boundary: the pairs
   * that sat CLOSEST across a pile edge, and the pile nobody used. Reached by
   * `intake_query.sort = "1"`.
   *
   * A door of its own and NOT an `ingest` mode: every ingest lane reads
   * expertise out of something that already exists, and here the sort itself
   * produces almost none — the expertise appears only when the platform's own
   * arithmetic finds the edge and asks about it. It is also not a dialog. A
   * phone-first sort needs the whole screen and a sticky thumb-reachable row of
   * piles, the same reason the Triad game got a page.
   */
  | { kind: "sortingTable" }
  /**
   * THE TEACH-BACK (`teach_back`, 2026-09-15) — the system explains, the
   * expert corrects. We say the Expert's own method back to them in about a
   * minute of plain spoken words, the way a bright new hire would at the end of
   * their first week, and they interrupt: "no, not like that", "you missed the
   * part where…", "that's right but only when…". Reached by
   * `intake_query.teachBack = "1"`.
   *
   * A door of its own and NOT an `ingest` mode, for the Probe's reason and one
   * more. Every ingest lane reads expertise out of something that already
   * exists; this one MANUFACTURES a misunderstanding for the Expert to break,
   * so they bring nothing at all — it is the one lane that works on a Rulebook
   * holding zero rules, where it explains what a generalist would do and says
   * so. And it is not a dialog: a session is minutes of listening and
   * interrupting, with audio playing, which is a working mode owed a real URL
   * like the interview, the probe and the Conductor.
   */
  | { kind: "teachBack" }
  /**
   * THE CAPTURE PLAN (`capture_plan`, 2026-09-15) — a PROGRAM, not a lane.
   * Reached by `intake_query.plan = "1"`.
   *
   * It is a door of its own and not a mode of anything, because it captures
   * nothing itself: it decides which of the other doors the Expert opens next,
   * sizes the session to the time they said they have, measures what came of
   * it, and re-plans — giving more of their minutes to whatever is actually
   * producing rules they keep, and dropping whatever is not. It gets its own
   * page rather than a dialog because it is the longest-lived working mode
   * Masterwork has: the thing an Expert returns to daily for a fortnight, and
   * the thing every session reminder deep-links to.
   */
  | { kind: "plan" }
  /**
   * THE DAILY DRIP (`daily_drip`, 2026-09-15) — one short question a day about
   * the work the Expert actually did, arriving by text, email or in-app, and
   * answered by talking into one field on their phone. Reached by
   * `intake_query.drip = "1"`.
   *
   * A door of its own and NOT an `ingest` mode, for the reason every other
   * manufacturing lane here is one: every ingest lane reads expertise out of
   * something that already exists, and this one MAKES its source one minute at
   * a time over weeks. And the dialog is only where it is turned on and where
   * the streak is read — the answering happens on its own phone page, in a
   * channel, on a day the Expert is not looking at this app at all.
   */
  | { kind: "drip" };

/**
 * Resolve a registry row to the lane it opens, or `null` when the product has
 * no door for it. `null` is never a silent state: the caller must tell the
 * Expert the lane is missing rather than leaving them on a bare page.
 */
export function resolveApproachLane(
  approach: Pick<DistillationApproach, "launchHref" | "intakeQuery">,
): ApproachLane | null {
  if (approach.launchHref) return { kind: "href", href: approach.launchHref };
  const q = approach.intakeQuery ?? {};
  if (q.interview === "1") return { kind: "interview" };
  const ingest = toIngestLane(q.ingest);
  if (ingest) return { kind: "ingest", lane: ingest };
  if (q.body_of_work === "1") return { kind: "body_of_work" };
  if (q.chatImport === "1")
    return { kind: "chatImport", tab: q.tab === "matrx" ? "matrx" : "upload" };
  if (q.dump === "1") return { kind: "dump" };
  if (q.meeting === "1") return { kind: "meeting" };
  if (q.conduct === "1") return { kind: "conduct" };
  if (q.triad === "1") return { kind: "triad" };
  if (q.sort === "1") return { kind: "sortingTable" };
  if (q.shadowInbox === "1") return { kind: "shadowInbox" };
  if (q.red_pen === "1") return { kind: "redPen" };
  if (q.intake === "timeline") return { kind: "unfolding" };
  if (q.predictions === "1") return { kind: "prediction" };
  if (q.probe === "1") return { kind: "probe" };
  if (q.teachBack === "1") return { kind: "teachBack" };
  if (q.plan === "1") return { kind: "plan" };
  if (q.drip === "1") return { kind: "drip" };
  return null;
}

/**
 * The rows this product PROMISES a working lane for: anything an Expert can
 * actually start (`enabled`) plus anything the registry declares `available`.
 * A `coming_soon` or `partial` row that is not startable is allowed to have no
 * lane — that is the honest, declared state the cards already show.
 */
export function promisesALane(approach: DistillationApproach): boolean {
  return approach.enabled || approach.availability === "available";
}
