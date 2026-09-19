/**
 * An upload failure reaches the PERSON, in the server's words — on every surface.
 *
 * SUT: `announceUploadFailures`, the announcement every `uploadFiles` dispatch runs.
 *
 * 🚨 The 2026-09-19 silent failure (`common-docs/projects/acquisition-frontier/
 * own-files/VERIFICATION.md` §15/§16): 21 files dropped on a fresh Rulebook, 21
 * uploads, 21 × `400 matrx-files: this write carries no organization` — and a card
 * that still read "Nothing attached yet", with the reason shown nowhere. The
 * sentences existed the whole time; nothing on that screen said them.
 *
 * Breaks guarded:
 *   1. the failure is announced at all (the literal defect);
 *   2. the SERVER'S sentence is what gets said — not a house sentence that hides it;
 *   3. N identical failures are one sentence, not N toasts (why the announcement
 *      was left out in the first place);
 *   4. distinct reasons are each said — a batch is never collapsed to its first;
 *   5. a clean run stays silent.
 */

import { announceUploadFailures } from "./thunks";

const errorToast = jest.fn();

jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => errorToast(...args),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
}));

/** The exact body files.matrxserver.com returned for all 21 uploads. */
const ORG_REFUSAL =
  "matrx-files: this write carries no organization (owner=87a6e699-3622-4869-8843-d0867456c0dd). " +
  "Pass organization_id= explicitly (the file row's own column, the upload metadata, or the " +
  "request's organization), or run it inside a request context that carries one.";

beforeEach(() => {
  errorToast.mockClear();
});

describe("announceUploadFailures", () => {
  it("says nothing when every file landed", () => {
    announceUploadFailures([]);
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("announces the server's own sentence for a single failure", () => {
    announceUploadFailures([{ name: "sop.pdf", error: ORG_REFUSAL }]);

    expect(errorToast).toHaveBeenCalledTimes(1);
    const [title, options] = errorToast.mock.calls[0] as [
      string,
      { description: string },
    ];
    expect(title).toContain("sop.pdf");
    // The reason a person can act on is the SERVER's, verbatim.
    expect(options.description).toContain("carries no organization");
  });

  it("the 21-file drop is ONE announcement carrying the one real reason", () => {
    const failed = Array.from({ length: 21 }, (_, i) => ({
      name: `source-${i}.pdf`,
      error: ORG_REFUSAL,
    }));

    announceUploadFailures(failed);

    expect(errorToast).toHaveBeenCalledTimes(1);
    const [title, options] = errorToast.mock.calls[0] as [
      string,
      { description: string; id: string },
    ];
    expect(title).toContain("21");
    expect(options.description).toContain("carries no organization");
    // Deduped: the same sentence 21 times is said once.
    expect(
      options.description.match(/carries no organization/g)?.length,
    ).toBe(1);
    expect(typeof options.id).toBe("string");
  });

  it("never collapses a mixed batch to its first reason", () => {
    announceUploadFailures([
      { name: "a.pdf", error: ORG_REFUSAL },
      { name: "b.pdf", error: "File is larger than your plan allows." },
    ]);

    const [, options] = errorToast.mock.calls[0] as [
      string,
      { description: string },
    ];
    expect(options.description).toContain("carries no organization");
    expect(options.description).toContain("larger than your plan allows");
  });

  it("still says something when the server gave no sentence at all", () => {
    announceUploadFailures([{ name: "a.pdf", error: "" }]);

    const [, options] = errorToast.mock.calls[0] as [
      string,
      { description: string },
    ];
    expect(options.description.length).toBeGreaterThan(0);
  });
});
