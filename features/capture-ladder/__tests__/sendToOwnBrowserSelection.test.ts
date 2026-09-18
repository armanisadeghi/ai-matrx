/**
 * features/capture-ladder/__tests__/sendToOwnBrowserSelection.test.ts
 *
 * "Send the rest to my browser" can NEVER queue a row that did not stop at the
 * person's own browser.
 *
 * Contract: CONTRACT.md §8.2 (the action) enforcing §2 (the ladder's verdict).
 *
 * Why this guard exists as its own file: the button's selection is the one
 * place on the client where a rung could be skipped WITHOUT anybody noticing.
 * The trail guard beside it catches a bad trail we were HANDED; this catches a
 * bad set we would SEND. A widened filter here does not throw, does not warn
 * and does not look wrong on screen — it just quietly asks somebody's own
 * browser to open pages the server never said their sign-in could help with,
 * including pages that are simply gone (a 404 is a 404 in anybody's browser).
 *
 * `selectOwnBrowserUrls` therefore filters AND re-checks, and the re-check
 * reads `next_rung` literally rather than re-calling the predicate — which is
 * what makes the inversion below fail loudly instead of passing silently.
 */

import {
  selectOwnBrowserUrls,
  stoppedAtOwnBrowser,
  NotAnOwnBrowserRowError,
  type LadderCandidate,
} from "@/features/capture-ladder/ladderOutcome";
import type { StopCause, Rung } from "@/features/capture-ladder/types";

function row(
  url: string,
  next: Rung | null,
  stopped: StopCause | null = null,
): LadderCandidate {
  return {
    url,
    ladder: {
      rung_trail: [],
      next_rung: next,
      next_rung_reason: next ? "login_wall" : null,
      next_rung_note: next ? "Your own browser is already signed in." : null,
      stopped_because: stopped,
    },
  };
}

/** A real, mixed batch: one of every outcome the ladder can produce. */
const BATCH: LadderCandidate[] = [
  row("https://members.example.com/post", "own_browser"),
  row("https://paywalled.example.com/a", "own_browser"),
  // The server browser succeeded — there is no next rung at all.
  { url: "https://plain.example.com/ok", ladder: null },
  // Gone. A person's browser cannot help, and the server says so.
  row("https://dead.example.com/404", null, "not_escalatable"),
  // Rung 3 is switched off for this organization.
  row("https://blocked.example.com/x", null, "rung_disabled"),
  // Already at the top of the ladder — the next thing is the PERSON, not their
  // unattended browser. This one is the trap: it is a failure, it does need a
  // person, and it must still not be queued as an own_browser handoff.
  row("https://hard.example.com/y", "human_drive"),
  // The ladder ran out.
  row("https://exhausted.example.com/z", null, "exhausted"),
];

describe("selectOwnBrowserUrls — only rows the server sent to rung 3", () => {
  it("selects exactly the own_browser rows out of a mixed batch", () => {
    expect(selectOwnBrowserUrls(BATCH)).toEqual([
      "https://members.example.com/post",
      "https://paywalled.example.com/a",
    ]);
  });

  it("NEVER includes a row whose next step is the person driving", () => {
    expect(selectOwnBrowserUrls(BATCH)).not.toContain(
      "https://hard.example.com/y",
    );
  });

  it("NEVER includes a row that stopped, for any of the three stop causes", () => {
    const chosen = selectOwnBrowserUrls(BATCH);
    for (const url of [
      "https://dead.example.com/404",
      "https://blocked.example.com/x",
      "https://exhausted.example.com/z",
    ]) {
      expect(chosen).not.toContain(url);
    }
  });

  it("NEVER includes a row the server said nothing about", () => {
    expect(selectOwnBrowserUrls(BATCH)).not.toContain(
      "https://plain.example.com/ok",
    );
  });

  it("returns nothing at all when no row stopped at own_browser", () => {
    const none = BATCH.filter((r) => !stoppedAtOwnBrowser(r));
    expect(selectOwnBrowserUrls(none)).toEqual([]);
  });

  it("queues one page once, even when it appears twice in the batch", () => {
    const twice = [
      row("https://members.example.com/post", "own_browser"),
      row("https://members.example.com/post", "own_browser"),
    ];
    expect(selectOwnBrowserUrls(twice)).toEqual([
      "https://members.example.com/post",
    ]);
  });

  /**
   * THE GUARD ITSELF. If the filter is ever widened, inverted or mistyped, the
   * post-condition must refuse — loudly, at the button — rather than hand a
   * wrong set to the network. Proven here by feeding the function a set the
   * filter can only produce if it is broken.
   */
  it("throws rather than return a row that is not an own_browser row", () => {
    // `selectOwnBrowserUrls` is given rows; the only way a non-own_browser row
    // reaches the post-condition is a broken filter. Simulate exactly that by
    // handing it a row whose ladder MUTATES between filter and re-check — the
    // shape a stale or racing row set has in production.
    const treacherous = (): LadderCandidate => {
      let reads = 0;
      return {
        url: "https://hard.example.com/y",
        get ladder() {
          reads += 1;
          // First read (the filter) says own_browser; the re-check sees truth.
          return reads === 1
            ? { next_rung: "own_browser" as const }
            : { next_rung: "human_drive" as const };
        },
      };
    };

    expect(() => selectOwnBrowserUrls([treacherous()])).toThrow(
      NotAnOwnBrowserRowError,
    );
    // …and the sentence names the law it is protecting, not a code.
    expect(() => selectOwnBrowserUrls([treacherous()])).toThrow(/skip a rung/);
  });
});
