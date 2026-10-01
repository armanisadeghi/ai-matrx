import type { ApiCallError } from "@/lib/api/call-api";
import { liveRunRequestId } from "../live-run-rejoin";

// Break named: a reload mid-run treats the server's "still generating" refusal
// as a failure (dead end) or a different error as a live run (rejoins nothing).
const refusal = (serverDetail: unknown, status = 409): ApiCallError => ({
  type: "validation_error",
  message: "This episode is still generating; rejoin its live stream.",
  status,
  serverDetail,
});

const LIVE = "038ca293-2315-457b-9e32-9a95217d1c85";
const OTHER = "884f72ac-8141-40e9-b4de-62bed55fe987";

describe("liveRunRequestId", () => {
  it.each([
    ["FastAPI detail", { detail: { code: "run_in_progress", request_id: LIVE } }, LIVE],
    ["platform envelope", { details: { code: "run_in_progress", request_id: OTHER } }, OTHER],
    ["top level", { code: "run_in_progress", request_id: LIVE }, LIVE],
  ])("reads the live request id from the %s shape", (_label, body, expected) => {
    expect(liveRunRequestId(refusal(body))).toBe(expected);
  });

  it.each([
    ["another 409", refusal({ detail: { code: "conflict", request_id: LIVE } })],
    ["a 404 with the same body", refusal({ detail: { code: "run_in_progress", request_id: LIVE } }, 404)],
    ["no request id", refusal({ detail: { code: "run_in_progress" } })],
    ["no error", null],
  ])("is null for %s", (_label, error) => {
    expect(liveRunRequestId(error)).toBeNull();
  });
});
