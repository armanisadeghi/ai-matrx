"use client";

// features/education/spoken-practice/setupWrites.ts
//
// The ONE validator for an agent-supplied `practice_setup` patch on the
// `matrx-user/education-practice-oral` surface.
//
// It reads the SAME vocabulary constants the setup form's own pickers render
// from (`DIFFICULTY_OPTIONS`, `PROMPT_COUNT_OPTIONS`, `MODE_CONFIG`), so the
// options the learner sees, the enum the manifest advertises to the agent, and
// the check that runs here cannot drift apart. It returns a normalized patch;
// PracticeSetup then applies it through its OWN setters — the same ones the
// learner's typing goes through — so there is no parallel write path.
//
// Every rejection THROWS. The surface writeback seam
// (features/surfaces/runtime/surface-writeback.ts) turns a throw into the safe
// error envelope the agent reads back, so a wrong value is something the agent
// is told about rather than something quietly coerced into the form.

import {
  DIFFICULTY_OPTIONS,
  MODE_VOCABULARY,
  PROMPT_COUNT_OPTIONS,
} from "./vocabulary";
import type { PracticeSetupSnapshot } from "./setupSnapshot";
import { isSpokenPracticeMode } from "./types";

/** The keys `practice_setup` accepts. Anything else is refused by name. */
export const PRACTICE_SETUP_KEYS = [
  "focus",
  "difficulty",
  "count",
  "deck_id",
  "source_text",
] as const;

/** A validated patch. An absent key means "leave that field alone". */
export interface PracticeSetupPatch {
  focus?: string;
  difficulty?: string;
  count?: number;
  deckId?: string;
  pasted?: string;
}

const quote = (v: unknown) =>
  typeof v === "string" ? `"${v}"` : JSON.stringify(v);

const list = (options: readonly (string | number)[]) =>
  options.map((o) => (typeof o === "string" ? `"${o}"` : String(o))).join(", ");

/**
 * Validate an agent-supplied `practice_setup` value against the form that is
 * actually on screen, and return the normalized patch to apply.
 *
 * `snapshot` is the live setup form (its current values, its mode, the decks it
 * has loaded, whether a start is in flight). Passing the live snapshot rather
 * than the raw fields is what lets combination rules — deck-vs-pasted, and
 * which fields this mode even renders — be judged against what the learner can
 * see, instead of pretending the fields are independent.
 */
export function resolvePracticeSetupPatch(
  value: unknown,
  snapshot: PracticeSetupSnapshot | null,
): PracticeSetupPatch {
  if (!snapshot)
    throw new Error(
      "The practice setup form is not on screen right now, so there is nothing to fill in. The learner is either choosing a practice type or already in a session.",
    );
  if (snapshot.busy)
    throw new Error(
      "A session is already starting — the setup form is locked. Wait for it to finish rather than changing the configuration underneath it.",
    );

  // The inline-tool layer parses a JSON-looking argument BEFORE the handler
  // sees it, so an object target receives a real object. Anything else is the
  // agent's error to hear about, spelled out rather than coerced.
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      `practice_setup expects an object with any of the keys ${PRACTICE_SETUP_KEYS.join(", ")}; received ${
        Array.isArray(value) ? "an array" : quote(value)
      }.`,
    );

  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (k) => !(PRACTICE_SETUP_KEYS as readonly string[]).includes(k),
  );
  if (unknownKeys.length > 0)
    throw new Error(
      `practice_setup does not accept ${unknownKeys.join(", ")}. Allowed keys: ${PRACTICE_SETUP_KEYS.join(", ")}.`,
    );
  if (Object.keys(record).length === 0)
    throw new Error(
      `practice_setup needs at least one of ${PRACTICE_SETUP_KEYS.join(", ")} — an empty patch changes nothing.`,
    );

  const cfg = isSpokenPracticeMode(snapshot.mode)
    ? MODE_VOCABULARY[snapshot.mode]
    : null;
  const patch: PracticeSetupPatch = {};

  if ("focus" in record) {
    const raw = record.focus;
    if (typeof raw !== "string" || !raw.trim())
      throw new Error(
        `practice_setup.focus must be a non-empty plain-text string — the ${
          cfg ? cfg.focusLabel.toLowerCase() : "focus"
        } for this session, not JSON and not a JSON-encoded string, no code fence. Received ${quote(raw)}.`,
      );
    patch.focus = raw;
  }

  if ("difficulty" in record) {
    const raw = record.difficulty;
    if (
      typeof raw !== "string" ||
      !(DIFFICULTY_OPTIONS as readonly string[]).includes(raw)
    )
      throw new Error(
        `practice_setup.difficulty must be exactly one of ${list(DIFFICULTY_OPTIONS)} — these are the only levels the picker offers. Received ${quote(raw)}.`,
      );
    patch.difficulty = raw;
  }

  if ("count" in record) {
    const raw = record.count;
    if (
      typeof raw !== "number" ||
      !Number.isInteger(raw) ||
      !(PROMPT_COUNT_OPTIONS as readonly number[]).includes(raw)
    )
      throw new Error(
        `practice_setup.count must be exactly one of ${list(PROMPT_COUNT_OPTIONS)} — these are the only prompt counts the picker offers. Received ${quote(raw)}.`,
      );
    patch.count = raw;
  }

  if ("deck_id" in record) {
    const raw = record.deck_id;
    if (!snapshot.offersDeckGrounding)
      throw new Error(
        `practice_setup.deck_id does not apply to ${
          cfg ? cfg.label : snapshot.mode
        } — that mode has no deck picker, so there is no input to fill. Ground it with source_text instead.`,
      );
    if (raw !== "" && raw !== null && typeof raw !== "string")
      throw new Error(
        `practice_setup.deck_id must be the id of one of the learner's decks, or "" to use no deck. Received ${quote(raw)}.`,
      );
    const deckId = raw == null ? "" : (raw as string);
    if (deckId && !snapshot.decks.some((d) => d.id === deckId))
      throw new Error(
        snapshot.decks.length === 0
          ? `practice_setup.deck_id ${quote(deckId)} is not one of the learner's decks — they have none loaded, so pass "" and ground the session with source_text instead.`
          : `practice_setup.deck_id ${quote(deckId)} is not one of the learner's decks. Read available_decks first; right now it holds ${snapshot.decks
              .map((d) => `"${d.name}" (${d.id})`)
              .join(", ")}.`,
      );
    patch.deckId = deckId;
  }

  if ("source_text" in record) {
    const raw = record.source_text;
    if (typeof raw !== "string")
      throw new Error(
        `practice_setup.source_text must be a plain-text string (pass "" to clear it) — the notes or passage to ground the session in, not JSON and not a JSON-encoded string. Received ${quote(raw)}.`,
      );
    patch.pasted = raw;
  }

  // The two grounding sources are not independent: the form HIDES the paste box
  // while a deck is chosen, so a state with both set would put text into an
  // input the learner cannot see (and `buildDeckSource` would win anyway).
  // Judge the RESULT of the patch, so sending the deck and the text that
  // replaces it in one call is fine.
  //
  // Only a deck this mode actually renders counts. A deck chosen under an
  // earlier mode survives the switch in component state but is hidden and
  // ignored by handleStart, so it must not block writing source_text here.
  const nextDeckId = snapshot.offersDeckGrounding
    ? (patch.deckId ?? snapshot.deckId)
    : "";
  const nextPasted = patch.pasted ?? snapshot.pasted;
  if (nextDeckId && nextPasted.trim())
    throw new Error(
      "A session grounds in a deck OR in pasted material, never both — the paste box is hidden while a deck is selected. Send deck_id and source_text in the SAME call so one clears the other: pass source_text \"\" to keep the deck, or deck_id \"\" to keep the pasted text.",
    );

  return patch;
}
