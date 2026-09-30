/**
 * Terminal codes never reach a screen (2026-09-30: the directive builder showed
 * a server/ORM error with its colour codes). Both shapes that arrive are
 * covered: the real ESC sequences, including multi-parameter and cursor codes,
 * and the ESC-less leftovers some transports produce.
 */

import { humanizeBackendError, stripTerminalCodes } from "../errors";

const ESC = "\u001b";
const RAW = `${ESC}[1;31mDatabaseError${ESC}[0m: ${ESC}[2Krelation "x" does not exist [1;33mHint[0m: check it`;

describe("stripTerminalCodes", () => {
  it("removes ESC colour, multi-parameter and cursor sequences", () => {
    expect(stripTerminalCodes(RAW)).toBe(
      'DatabaseError: relation "x" does not exist Hint: check it',
    );
  });

  it("keeps newlines and ordinary brackets", () => {
    expect(stripTerminalCodes("line [a]\nline [2]")).toBe("line [a]\nline [2]");
  });

  it("answers empty for nothing", () => {
    expect(stripTerminalCodes(null)).toBe("");
    expect(stripTerminalCodes(undefined)).toBe("");
  });
});

describe("humanizeBackendError", () => {
  it("never returns a terminal code", () => {
    const out = humanizeBackendError(RAW) ?? "";
    expect(out).not.toMatch(/\u001b|\[\d{1,3}(;\d{1,3})*m|\[2K/);
  });
});
