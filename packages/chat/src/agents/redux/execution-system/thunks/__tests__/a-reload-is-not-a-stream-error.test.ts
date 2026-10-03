/**
 * GUARD — reloading or leaving the page mid-answer is the person's choice,
 * not a red error.
 *
 * Real test 2026-10-03 (/chat): reload one second into an answer. The browser
 * cancels the live stream as the page goes, fetch reports it as a dropped
 * socket (`stream_transport_lost`), and run-ai-stream filed it as a CLEAR
 * ERROR in the Error Inspector — which survives the reload, so the reloaded
 * page greeted the person with "1 error" for a run that finished fine on the
 * server and was rejoined. The same drop while the page STAYS is still a
 * captured failure.
 */
import { shouldCaptureStreamFailure } from "../run-ai-stream";
import { resetPageLeavingForTests } from "../../utils/page-leaving";

function transportLost(): Error {
  return Object.assign(new Error("network error"), {
    code: "stream_transport_lost",
  });
}

describe("stream transport loss and a leaving page", () => {
  afterEach(() => resetPageLeavingForTests());

  it("captures a dropped stream while the page stays", () => {
    expect(shouldCaptureStreamFailure(transportLost())).toBe(true);
  });

  it("does not capture the drop the browser causes on reload / navigation", () => {
    window.dispatchEvent(new Event("beforeunload"));
    expect(shouldCaptureStreamFailure(transportLost())).toBe(false);
  });

  it("captures again once a cancelled leave brings the page back", () => {
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pageshow"));
    expect(shouldCaptureStreamFailure(transportLost())).toBe(true);
  });

  it("a genuine crash during a leave is still captured", () => {
    window.dispatchEvent(new Event("pagehide"));
    expect(shouldCaptureStreamFailure(new Error("stream crashed"))).toBe(true);
  });
});
