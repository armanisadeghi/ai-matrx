/**
 * 🚨 A MACHINE TOKEN NEVER STANDS INSIDE AN ENGLISH SENTENCE.
 *
 * COLD WALK 20, DEFECT B (2026-09-22, production v0.4.2135 AND v0.4.2139).
 * Ten rows of `/acquisition`'s Block Ledger — WHAT HAPPENED column — read
 * exactly the text in `THE TEN ROWS` below. `LOGIN_REQUIRED` is YouTube's own
 * `playabilityStatus.status` enum; `ProxyError` is a Python exception class
 * from `type(exc).__name__`. Both were interpolated straight into the sentence
 * by `aidream/services/media_catalog/adapters/youtube_adapter.py` (lines 945
 * and 979), stored whole in `platform.acquisition_block.error_sentence`, and
 * rendered verbatim by `personFacingSentence`.
 *
 * WHY EVERY EXISTING GUARD READ GREEN. `lib/progress/__tests__/
 * a-class-name-is-never-a-reason.test.ts` asserts `providerErrorSentence
 * ("LOGIN_REQUIRED")` and `("ProxyError")` are clean — and they are, because
 * that function takes a BARE token as the whole field value. The live rows put
 * the token inside a five-clause paragraph, where `BARE_CLASS` (anchored
 * `^…$`) cannot see it and no `MACHINE_SHAPES` entry matches. And
 * `features/acquisition-console/__tests__/blocked-row-provider-tokens.test.ts`
 * sets `error_sentence: null` on every token case, so the `error_class` branch
 * — which never carries these tokens live — is the only one it exercises.
 *
 * THE FIXTURES BELOW ARE THE REAL ROWS, byte for byte, read out of production
 * `platform.acquisition_block` (13 matching rows: 10 `bot_wall`/`decision`,
 * 3 `request_error`/`open`).
 *
 * Proven failing-then-passing: remove the `liftEmbeddedMachineTokens` branch
 * from `personFacingSentence` and every assertion in the first two blocks
 * fails with the token still in `text`.
 */
import {
  liftEmbeddedMachineTokens,
  personFacingSentence,
} from "../failureSentence";

/** The `bot_wall` sentence, verbatim, on ten live rows. */
const THE_TEN_ROWS =
  "YouTube would not answer what captions this video has — it asked the server " +
  "to prove it is not a robot (LOGIN_REQUIRED). YouTube said: \"Sign in to " +
  "confirm you're not a bot\". Nothing is known about this video's captions; it " +
  "has NOT been shown to have none. YouTube could not be reached to ask what " +
  "captions this video has (ProxyError), so nothing is known about them yet. " +
  "You have not set up a computer to browse through yet. This server has no " +
  "browser running, so the video's page could not be opened in one.";

/** The `request_error` sentence, verbatim, on the other three live rows. */
const THE_OTHER_THREE =
  "YouTube could not be reached to ask what captions this video has " +
  "(ProxyError), so nothing is known about them yet. A second address was " +
  "tried and refused too: YouTube could not be reached to ask what captions " +
  "this video has (ProxyError), so nothing is known about them yet.";

const MACHINE_TOKENS = /LOGIN_REQUIRED|ProxyError/;

describe("the ten /acquisition rows cold walk 20 read", () => {
  it.each([
    ["the bot_wall sentence (10 rows)", THE_TEN_ROWS],
    ["the request_error sentence (3 rows)", THE_OTHER_THREE],
  ])("%s says nothing machine-shaped to a person", (_name, row) => {
    const shown = personFacingSentence(row);
    expect(shown.text).not.toMatch(MACHINE_TOKENS);
    // The token is not deleted from the record — it moves to the muted detail.
    expect(shown.detail).toBe(row);
    expect(shown.detail).toMatch(MACHINE_TOKENS);
  });

  it("keeps every word the server wrote around them", () => {
    const { text } = personFacingSentence(THE_TEN_ROWS);
    // A generic "something went wrong" would have thrown these away. Each one
    // is doing real work for the reader.
    expect(text).toContain("it asked the server to prove it is not a robot.");
    expect(text).toContain(
      "YouTube said: \"Sign in to confirm you're not a bot\".",
    );
    expect(text).toContain("it has NOT been shown to have none.");
    expect(text).toContain(
      "YouTube could not be reached to ask what captions this video has, so " +
        "nothing is known about them yet.",
    );
    expect(text).toContain("This server has no browser running");
    // And it reads as sentences: no orphaned space before punctuation, no
    // double space where the token stood, no empty parentheses.
    expect(text).not.toMatch(/\s[.,;)]/);
    expect(text).not.toMatch(/\(\s*\)/);
    expect(text).not.toMatch(/ {2}/);
  });

  it("names both tokens when asked, in the order they stood", () => {
    expect(liftEmbeddedMachineTokens(THE_TEN_ROWS).tokens).toEqual([
      "LOGIN_REQUIRED",
      "ProxyError",
    ]);
  });
});

describe("the rule is narrow enough not to eat English", () => {
  it.each([
    "The board (HOA) refused to approve the change.",
    "Send the report (PDF) to the district.",
    "We reached the site on the second try (it was slow).",
    "The controller ran three days a week (Mon, Wed, Fri).",
    "YouTube returned an error page, so nothing is known yet.",
  ])("leaves %j exactly as written", (sentence) => {
    expect(personFacingSentence(sentence).text).toBe(sentence);
    expect(personFacingSentence(sentence).detail).toBeUndefined();
  });

  it("still nukes a sentence that is machine text through and through", () => {
    const sql =
      "insert into platform.acquisition_block (id, error_class) values ($1, $2)";
    const shown = personFacingSentence(sql);
    expect(shown.text).not.toContain("acquisition_block");
    expect(shown.detail).toBe(sql);
  });
});

describe("the whole family the same two write seams produce", () => {
  // Every one of these shapes exists live in aidream today — `caption_ladder.py`
  // 197/207/266/281, `transcripts.py` 418/606/767/859, `jobs.py` 1248,
  // `runners.py` 333, `libraries.py` 2232, `gateway.py` 297 — all of them
  // `f"…({type(exc).__name__})…"`. Fixing the instance would have left these.
  it.each([
    ["A home connection could not be reached (ConnectTimeout), so nothing ran.", "ConnectTimeout"],
    ["Our server browser could not open this video's page (TimeoutError).", "TimeoutError"],
    ["Indexing failed (httpx.ReadTimeout) and nothing was written.", "httpx.ReadTimeout"],
    ["The site refused the request (AGE_VERIFICATION_REQUIRED).", "AGE_VERIFICATION_REQUIRED"],
    ["The provider answered (RATE_LIMITED), so we stopped.", "RATE_LIMITED"],
  ])("lifts %j", (sentence, token) => {
    const shown = personFacingSentence(sentence);
    expect(shown.text).not.toContain(token);
    expect(shown.detail).toBe(sentence);
  });
});
