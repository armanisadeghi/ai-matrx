// features/unified-data/typedAnswers.ts — WHAT A STRANGER TYPED, TURNED INTO
// VALUES, ONCE, FOR EVERY PUBLIC DOOR.
//
// 🚨 WHY THIS FILE EXISTS. AGENT-BUILDS-2's closing walk, 2026-09-21: a
// customer opened Ironclad Mobile Mechanic's public booking page, picked
// 2:00 PM on Tuesday, typed Marcus Delgado, (415) 555-0178, a 2019 Honda CR-V,
// pressed "Book it", and the page answered
//
//     "Vehicle Year takes a number, and it was given a string"
//
// and made no appointment. A browser input hands over a STRING; a Field takes a
// number. The grid's paste and the CSV import each carried their own coercion —
// good ones — and the two doors a STRANGER uses carried none, so a booking page
// over ANY table with a number field was unbookable by anybody.
//
// THE COERCION ITSELF IS NOT HERE. It is `coerceTypedAnswers` in
// `@ai-matrx/records`, the same body the grid's paste and the editors use, so
// a number typed into a public form, pasted into a cell, imported from a CSV
// or entered through a portal all mean the same thing. This file is the ONE
// place the two route handlers agree on how to ASK it and how to answer when
// it refuses.
//
// IT IS THE SERVER'S JOB AND NOT ONLY THE SCREEN'S. The public pages coerce
// too, so a person is told at the box rather than after their slot is held —
// but a route that trusted the browser to have done it would be one
// hand-written POST away from the same 400. The screen is the courtesy; this
// is the contract.
//
// IT DECIDES NOTHING ELSE. Required, the Rules, the cap, the rate window, the
// quarantine Rule, every exposed key and every wall stay the store's, asked by
// custom.form_submit and custom.booking_confirm. This turns strings into
// values and stops.

import { coerceTypedAnswers, type Field } from "@ai-matrx/records";

export interface TypedAnswers {
  /** Ready for the door. */
  values: Record<string, unknown>;
  /**
   * The sentences, in the order the page asks its questions, or null when
   * every answer became a value. Each one names its Field in plain words.
   */
  refusal: string | null;
  /** Field key → its sentence, so a screen can point at the question. */
  byKey: Record<string, string>;
}

/**
 * Coerce what a public page collected against the Fields that page published.
 *
 * `fields` is exactly what `custom.form_public` / `custom.booking_public`
 * already hand back — the Field definitions of the questions being asked — so
 * nothing new is read and no door is opened to work this out.
 */
export function typedAnswersFor(
  fields: Array<Record<string, unknown>> | null | undefined,
  values: Record<string, unknown>,
): TypedAnswers {
  // A page with no resolved Fields coerces nothing rather than guessing. The
  // door still judges the payload and says so in its own words — which is the
  // behaviour that existed before this file, not a new silence.
  if (!Array.isArray(fields) || fields.length === 0) {
    return { values, refusal: null, byKey: {} };
  }

  const coerced = coerceTypedAnswers(fields as unknown as Field[], values);
  const keys = Object.keys(coerced.refusals);
  if (keys.length === 0) return { values: coerced.values, refusal: null, byKey: {} };

  // ONE SENTENCE, IN THE ORDER THE QUESTIONS WERE ASKED, because a person
  // reading it is looking at a form and scanning down it.
  const order = new Map((fields as Array<{ key?: string }>).map((f, at) => [String(f.key ?? ""), at]));
  keys.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return {
    values: coerced.values,
    refusal: keys.map((k) => coerced.refusals[k]).join(" "),
    byKey: coerced.refusals,
  };
}
