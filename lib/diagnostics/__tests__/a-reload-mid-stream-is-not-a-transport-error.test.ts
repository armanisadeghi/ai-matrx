/**
 * @jest-environment jsdom
 */
/**
 * GUARD — the stream transport sink (the capture that actually fires; the
 * run-ai-stream one is its suppressed duplicate) does not file the drop the
 * browser causes when the person reloads or leaves mid-answer.
 *
 * Real test 2026-10-03 (/chat, reload one second into a timeline answer): the
 * reloaded page showed "1 error" — `stream_transport_lost` "network error",
 * source agent-stream-transport, first seen at the reload instant. The server
 * finished the turn and the new page rejoined it; nothing failed. The same
 * drop while the page stays is still a CLEAR ERROR.
 *
 * Silencing only the sink moved the incident: the send thunks' rejections
 * (instances/execute, instances/smartExecute) were deduped against the sink's
 * row and, with it gone, filed two red rows of their own (browser check,
 * same day). So the gate lives in captureError itself — every capture site.
 */
import { captureError, clearCapturedErrors, getSnapshot } from "@/lib/diagnostics/errorCaptureStore";
import { captureStreamTransportError } from "@/lib/diagnostics/captureStreamError";
import { BackendApiError } from "@/lib/api/errors";
import { resetPageLeavingForTests } from "@ai-matrx/chat/agents/redux/execution-system/utils/page-leaving";

function dropped(): BackendApiError {
  return new BackendApiError({
    code: "stream_transport_lost",
    detail: "network error",
    userMessage: "The connection dropped. Your run is still going on the server — reconnecting to it now.",
  });
}

describe("agent-stream-transport capture and a leaving page", () => {
  beforeEach(() => {
    clearCapturedErrors();
    resetPageLeavingForTests();
  });

  it("captures the drop while the page stays", () => {
    captureStreamTransportError(dropped(), { conversationId: "conv-1" });
    expect(getSnapshot().filter((c) => c.source === "agent-stream-transport")).toHaveLength(1);
  });

  it("does not capture the drop a reload causes", () => {
    window.dispatchEvent(new Event("beforeunload"));
    captureStreamTransportError(dropped(), { conversationId: "conv-1" });
    expect(getSnapshot().filter((c) => c.source === "agent-stream-transport")).toHaveLength(0);
  });

  it("captures again after a cancelled leave", () => {
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pageshow"));
    captureStreamTransportError(dropped(), { conversationId: "conv-1" });
    expect(getSnapshot().filter((c) => c.source === "agent-stream-transport")).toHaveLength(1);
  });

  it("does not let the send thunks' rejections file the same drop instead", () => {
    window.dispatchEvent(new Event("beforeunload"));
    for (const relation of ["instances/execute", "instances/smartExecute"]) {
      captureError({
        source: "redux-rejected",
        relation,
        code: "StreamTransportError",
        name: "StreamTransportError",
        message: "The connection dropped. Your run is still going on the server — reconnecting to it now.",
      });
    }
    expect(getSnapshot()).toHaveLength(0);
  });

  it("a different failure during a leave is still captured", () => {
    window.dispatchEvent(new Event("beforeunload"));
    captureError({ source: "redux-rejected", relation: "instances/execute", code: "TypeError", message: "x is undefined" });
    expect(getSnapshot()).toHaveLength(1);
  });
});
