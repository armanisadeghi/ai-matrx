// features/exports/consent.ts
//
// THE CONFIRMED SENTENCE.
//
// 🚨 The server stores this string VERBATIM as the consent record and refuses
// the send (403 `consent_required`) without it. So it is built once, here,
// rendered to the person exactly as built, and posted exactly as rendered —
// never re-phrased between the screen and the wire. If the words on the button
// and the words in the permit could differ, the permit would be worthless.
//
// It must state three things plainly, because that is what the person is
// agreeing to: HOW MANY items, WHICH Rulebook, and that an AI model will read
// their text.

export interface ConfirmedSentenceInput {
  count: number;
  /** True when the person chose "everything matching this filter". */
  everythingMatching: boolean;
  /** The server's own words for the filter, or ours when it has not spoken. */
  filterDescription: string;
  libraryName: string;
  rulebookName: string;
}

export function buildConfirmedSentence(input: ConfirmedSentenceInput): string {
  const items = `${input.count.toLocaleString()} ${input.count === 1 ? "item" : "items"}`;
  const which = input.everythingMatching
    ? `${items} — every item ${input.filterDescription.trim() || "in this view"} —`
    : items;
  return (
    `I am sending ${which} from "${input.libraryName}" to the Rulebook ` +
    `"${input.rulebookName}" as Sources. The text of those items will be read ` +
    `by an AI model.`
  );
}
