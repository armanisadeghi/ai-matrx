/** Which enrollment the page is showing, from the two sources that can claim it.
 *
 * Two competing intents, and BOTH are real:
 *   - the URL (`?enrollment=`), because an assist chip deep-links here and that
 *     navigation must win on the very render it arrives — synchronizing it into
 *     state in an effect briefly fetched the previously selected enrollment and
 *     turned an expected stale selection into a queued 404;
 *   - the user's click in the list, because a page where clicking a row does
 *     nothing is broken.
 *
 * 🚨 The first rule used to be absolute (`deepLinked ?? selected ?? first`),
 * which meant that ONCE a chip had put `?enrollment=` in the URL, every other
 * row in the list was dead — you could click them forever and the detail panel
 * never moved. Found 2026-08-22 while writing the click-path for exactly that
 * journey. The tie is broken by RECENCY, not by precedence: a selection is
 * stamped with the deep link it was made under, so the user's click wins until
 * a NEW deep link arrives, and then that newer intent wins.
 */
export type EnrollmentSelection = {
  id: string;
  /** The `?enrollment=` value at the moment the user clicked. */
  deepLinkAtClick: string | null;
};

export function selectEnrollmentId(
  deepLinkedEnrollment: string | null,
  selection: EnrollmentSelection | null,
  firstActiveEnrollment?: string,
): string | null {
  if (selection && selection.deepLinkAtClick === deepLinkedEnrollment) {
    return selection.id;
  }
  return deepLinkedEnrollment ?? selection?.id ?? firstActiveEnrollment ?? null;
}
