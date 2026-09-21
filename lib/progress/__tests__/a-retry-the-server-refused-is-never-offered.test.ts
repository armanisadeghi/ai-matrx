/**
 * 🚨 TWO SCREENS MUST NEVER TELL A PERSON TO DO WHAT THE SERVER JUST REFUSED.
 *
 * ## The defect this guards (fifteenth cold walk, 2026-09-20, blocking C)
 *
 * `POST /masterworks/understudy/refresh` answered 500 with aidream's
 * `build_defect` envelope — the best failure sentence in the product:
 *
 *   This part of the server was built wrong and cannot run: it is missing
 *   'origin_override_for' from aidream.services.conversation_context.scope.
 *   That is our defect, not anything you did, and trying again will fail the
 *   same way until it is fixed. It was recorded as <32 hex> so it can be
 *   traced. Nothing you sent was changed or lost.
 *
 * Five surfaces went down behind that one import, and two of them answered it
 * by telling the Expert to retry:
 *
 *   Understudy : "Try again, or reload the page; it costs nothing and takes a
 *                 second."  — with a live **Try again** button under it.
 *   Your words : "We couldn't load your words right now. Nothing is lost —
 *                 try again."  — same button.
 *
 * And the bench printed the server's sentence verbatim, module path and
 * 32-hex trace id included, at a non-technical Expert.
 *
 * The run box was the ONE surface that repeated the server's warning, and it
 * only got there because someone wrote that sentence by hand. A per-surface
 * habit is not a rule, so the rule is `serverRefusal` and this is the guard
 * over it: the envelope's meaning, the two tokens that never reach prose, and
 * the honest negative — a failure that MIGHT clear still gets its remedy.
 */

import {
  DEFAULT_FAILURE_REMEDY,
} from "../honestSummary";
import {
  namesAModulePath,
  namesATraceId,
  namesAnExceptionClass,
  retryIsPointless,
  serverRefusal,
} from "../failureSentence";

/** The trace id production printed, and the envelope it rode in. */
const TRACE_ID = "9f2c1d4ab8e7460fa1c3d5e6b7889900";

/** Verbatim, from the walk's own capture of the 500 body. */
const BUILD_DEFECT_ENVELOPE = {
  error: "build_defect",
  message: "Internal server error: ImportError",
  user_message:
    "This part of the server was built wrong and cannot run: it is missing " +
    "'origin_override_for' from aidream.services.conversation_context.scope. " +
    "That is our defect, not anything you did, and trying again will fail the " +
    `same way until it is fixed. It was recorded as ${TRACE_ID} so it can be ` +
    "traced. Nothing you sent was changed or lost.",
  request_id: TRACE_ID,
};

/** How `callApi` hands that envelope to a surface. */
const apiCallError = {
  type: "http_error" as const,
  status: 500,
  message: BUILD_DEFECT_ENVELOPE.user_message,
  serverDetail: BUILD_DEFECT_ENVELOPE,
};

/** How `operationFailed` re-wraps it on the way to the Understudy card. */
const thrownError = new Error("We couldn't refresh the Understudy.", {
  cause: apiCallError,
});

describe("a server that said retrying is futile is believed", () => {
  it.each([
    ["the envelope itself", BUILD_DEFECT_ENVELOPE],
    ["the callApi error", apiCallError],
    ["the Error operationFailed threw", thrownError],
    ["the bare sentence, envelope lost", BUILD_DEFECT_ENVELOPE.user_message],
  ])("recognises it through %s", (_what, raw) => {
    expect(retryIsPointless(raw)).toBe(true);
    expect(serverRefusal(raw).retryIsPointless).toBe(true);
  });

  it("renders the server's own remedy and never bolts a retry onto it", () => {
    const refusal = serverRefusal(thrownError, {
      // The Understudy card's own words — the ones that contradicted the
      // server. Passing them is what the card does; they must be DROPPED.
      remedy: "Try again, or reload the page; it costs nothing and takes a second.",
    });

    expect(refusal.text).toContain("That is our defect");
    expect(refusal.text).toContain("fail the same way until it is fixed");
    expect(refusal.text).toContain("Nothing you sent was changed or lost");

    expect(refusal.text.toLowerCase()).not.toContain("try again, or reload");
    expect(refusal.text.toLowerCase()).not.toContain("it costs nothing");
  });

  it("carries neither a module path nor a trace id in the sentence", () => {
    const refusal = serverRefusal(BUILD_DEFECT_ENVELOPE);

    expect(refusal.text).not.toContain(
      "aidream.services.conversation_context.scope",
    );
    expect(namesAModulePath(refusal.text)).toBe(false);
    expect(namesATraceId(refusal.text)).toBe(false);
    expect(namesAnExceptionClass(refusal.text)).toBe(false);

    // The trace id is real and useful — it comes back for a MUTED detail
    // line, which is the only place it is allowed to be.
    expect(refusal.traceId).toBe(TRACE_ID);
    // And the raw server text survives for an admin, never for the Expert.
    expect(refusal.detail).toBe(BUILD_DEFECT_ENVELOPE.user_message);
  });

  it("still says something a person can read after the path is gone", () => {
    const { text } = serverRefusal(BUILD_DEFECT_ENVELOPE);
    expect(text).toContain("a piece of it is missing");
    expect(text).not.toMatch(/\bfrom\s*\./);
    expect(text).not.toMatch(/\s{2,}/);
  });
});

describe("the honest negative — a failure that might clear keeps its remedy", () => {
  it("leaves an ordinary read failure retryable, in the server's own words", () => {
    const refusal = serverRefusal(
      { error: "internal_error", user_message: "The bench record could not be read." },
      { remedy: DEFAULT_FAILURE_REMEDY },
    );
    // `false` is what keeps the surface's Try again button on screen. The
    // sentence itself is the server's and is not edited — same rule as
    // `humanFailureSentence`: a sentence that explained itself is left alone.
    expect(refusal.retryIsPointless).toBe(false);
    expect(refusal.text).toBe("The bench record could not be read.");
  });

  it("carries the surface's remedy when the server said nothing usable", () => {
    const refusal = serverRefusal(
      { error: "internal_error", user_message: "" },
      { remedy: DEFAULT_FAILURE_REMEDY },
    );
    expect(refusal.retryIsPointless).toBe(false);
    expect(refusal.text).toContain(DEFAULT_FAILURE_REMEDY);
  });

  it("does not read a timeout or a rate limit as a build defect", () => {
    expect(retryIsPointless("The provider did not answer in time.")).toBe(false);
    expect(retryIsPointless("Too many requests. Please slow down.")).toBe(false);
    expect(
      retryIsPointless("Select an organization before sending this request."),
    ).toBe(false);
  });

  it("says so out loud when the server sent no sentence at all", () => {
    const refusal = serverRefusal(null, { remedy: "Reload to try again." });
    expect(refusal.retryIsPointless).toBe(false);
    expect(refusal.text).toContain("The server did not say why.");
    expect(refusal.text).toContain("Reload to try again.");
  });

  it("never lets SQL or a stack through, refusal or not", () => {
    const refusal = serverRefusal(
      "Matrx ORM | QueryTimeoutError … Query: INSERT INTO docproc.processed_documents (id) VALUES ($1, $2",
    );
    expect(refusal.text).not.toContain("INSERT INTO");
    expect(refusal.detail).toContain("INSERT INTO");
  });
});

describe("the run box's own sentence is the same reading", () => {
  it("reads the workflow engine's deterministic refusal as futile too", () => {
    expect(
      retryIsPointless(
        "This one is on us: running it again will most likely stop at the same place.",
      ),
    ).toBe(true);
  });
});
