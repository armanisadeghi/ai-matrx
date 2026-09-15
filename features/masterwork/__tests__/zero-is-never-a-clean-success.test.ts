/**
 * THE SUMMARY EVERY INGEST DIALOG PRINTS MUST NOT CONGRATULATE ITSELF ON ZERO.
 *
 * Found on production 2026-09-15 by driving the Meeting Scavenger against a
 * real platform meeting: the lane read 96 of the chosen speaker's moments
 * correctly, the distiller honestly found no judgment in a meeting that is
 * entirely scheduling and small talk, and the dialog printed
 *
 *   "0 suggested rules added as drafts. Every quote verified word-for-word
 *    against your source."
 *
 * — a screen verifying zero quotes while the Expert looks at an empty Rulebook
 * and concludes the product is broken. They are right to.
 *
 * `describeIngest` is the ONE summary shared by every lane's dialog, so this
 * guard covers all of them at once. The last case is the plant: it is the exact
 * pre-fix string, asserted to be gone.
 */
import {
  describeIngest,
  type IngestSummary,
} from "../components/detail/IngestSourceDialog";

const clean: IngestSummary = {
  added: 0,
  duplicatesSkipped: 0,
  quotesUnverified: 0,
  failedChunks: 0,
  skippedWords: 0,
  followupSeed: null,
  alreadyDistilled: 0,
};

describe("a run that read its source and found nothing", () => {
  it("says what happened instead of reporting a clean zero", () => {
    const said = describeIngest(clean);
    expect(said).toContain("found nothing in it we could turn into a rule");
    expect(said).toContain("Nothing was added");
    // It also tells the person what to do next, which is the half that makes
    // it honest rather than merely accurate.
    expect(said).toMatch(/try one where you were deciding something/i);
  });

  it("never claims to have verified quotes it never had", () => {
    expect(describeIngest(clean)).not.toContain("Every quote verified");
    expect(describeIngest(clean)).not.toContain("0 suggested rules");
  });

  it("still names a REAL cause when there is one", () => {
    // Everything was a duplicate: that is a different, already-honest zero and
    // it must keep its own sentence rather than be swallowed by the new one.
    const duplicates = { ...clean, duplicatesSkipped: 4 };
    const said = describeIngest(duplicates);
    expect(said).toContain("4 duplicates skipped");
    expect(said).not.toContain("found nothing in it we could turn into a rule");

    // Parts of the source failed: the missing-parts sentence is the cause and
    // still leads.
    const failed = { ...clean, failedChunks: 2, skippedWords: 900 };
    const saidFailed = describeIngest(failed);
    expect(saidFailed).toContain("Not all of it could be read");
    expect(saidFailed).not.toContain("found nothing in it we could turn into a rule");
  });

  it("never says 'found nothing' about a source it refused to read twice", () => {
    // The default `redistill="refuse"`: this Rulebook already holds rules from
    // these sources, so zero is correct and "we found nothing in it" would be a
    // flat lie about a source that already produced rules.
    const said = describeIngest({ ...clean, alreadyDistilled: 2 });
    expect(said).toContain("already in this Rulebook");
    expect(said).not.toContain("found nothing in it we could turn into a rule");
  });

  it("is unchanged for a run that actually produced rules", () => {
    const worked = { ...clean, added: 3 };
    const said = describeIngest(worked);
    expect(said).toContain("3 suggested rules added as drafts");
    expect(said).toContain("Every quote verified word-for-word");
  });
});
