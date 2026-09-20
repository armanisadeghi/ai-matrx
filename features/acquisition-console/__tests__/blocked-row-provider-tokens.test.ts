/**
 * 🚨 A RAW PROVIDER TOKEN NEVER REACHES THE "WHAT HAPPENED" CELL.
 *
 * cold-walk-13 friction (common-docs/projects/masterwork-methods-census/
 * jobs-bar-2026-09-16/cold-walk-13/README.md): "Raw provider tokens on the
 * acquisition console: `LOGIN_REQUIRED` and `ProxyError` inside otherwise
 * excellent person-facing sentences." — `parseBlockRow` fell back to the raw
 * `platform.acquisition_block.error_class` value whenever the row had no
 * `error_sentence`, and the column printed that value verbatim.
 *
 * This exercises the real contract function (not a re-implementation): a
 * block row with no `error_sentence` and a known `error_class` gets a plain
 * sentence with no leftover detail; an unrecognised `error_class` gets the
 * generic "a provider error" sentence with the raw token moved to
 * `whereDetail` (rendered as secondary text by `columns.tsx`'s `whereCell`,
 * never inside the sentence); and a row that DOES carry `error_sentence`
 * is untouched — the fix only touches the fallback.
 */

import { parseBlockRow } from "../contract";

function blockEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "block-1",
    input_ref: "https://example.test/video/1",
    input_label: "Example video",
    unblock_note: null,
    lawful_route: null,
    first_seen_at: "2026-09-16T00:00:00Z",
    last_seen_at: "2026-09-16T00:00:00Z",
    occurrence_count: 1,
    ...overrides,
  };
}

describe("parseBlockRow — provider tokens never reach the sentence", () => {
  it("turns a known raw error_class token into a plain sentence with no detail", () => {
    const row = parseBlockRow(
      blockEntry({ error_class: "LOGIN_REQUIRED", error_sentence: null }),
      0,
    );
    expect(row.where).not.toContain("LOGIN_REQUIRED");
    expect(row.where.toLowerCase()).toContain("sign in");
    expect(row.whereDetail).toBeUndefined();
  });

  it("turns ProxyError into a plain sentence with no detail", () => {
    const row = parseBlockRow(
      blockEntry({ error_class: "ProxyError", error_sentence: null }),
      0,
    );
    expect(row.where).not.toContain("ProxyError");
    expect(row.where.toLowerCase()).toContain("connection");
    expect(row.whereDetail).toBeUndefined();
  });

  it("keeps an unrecognised error_class out of the sentence and files it as detail", () => {
    const row = parseBlockRow(
      blockEntry({ error_class: "SomeNewVendorCode", error_sentence: null }),
      0,
    );
    expect(row.where).not.toContain("SomeNewVendorCode");
    expect(row.where.toLowerCase()).toContain("a provider error");
    expect(row.whereDetail).toBe("SomeNewVendorCode");
  });

  it("leaves a real error_sentence exactly as the server wrote it", () => {
    const row = parseBlockRow(
      blockEntry({
        error_class: "ProxyError",
        error_sentence: "The site answered with a bot check.",
      }),
      0,
    );
    expect(row.where).toBe("The site answered with a bot check.");
    expect(row.whereDetail).toBeUndefined();
  });

  it("still has a plain fallback when neither field is present", () => {
    const row = parseBlockRow(
      blockEntry({ error_class: null, error_sentence: null }),
      0,
    );
    expect(row.where.length).toBeGreaterThan(0);
    expect(row.whereDetail).toBeUndefined();
  });
});
