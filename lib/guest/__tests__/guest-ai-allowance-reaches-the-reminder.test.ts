/**
 * The server's `guest_ai_allowance_used` refusal reaches the ONE reminder from
 * every shared error path — the HTTP adapter (`captureApiError`, which callApi
 * and the package transports use) and the stream adapter (`captureStreamEvent`,
 * which every NDJSON stream goes through) — with zero per-feature code.
 *
 * Drives the REAL adapters and the REAL capture sink; only the listener is a
 * spy (it stands in for the bridge that opens the overlay).
 */
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { captureApiError } from "@/lib/diagnostics/captureApiError";
import { captureStreamEvent } from "@/lib/diagnostics/captureStreamError";
import {
  onGuestAiAllowanceUsed,
  type GuestAiAllowanceRefusal,
} from "@/lib/guest/guest-ai-allowance";

const SERVER_MESSAGE =
  "You've used your free AI tries. Create a free account to keep going.";

const ENVELOPE = {
  error: "guest_ai_allowance_used",
  message: SERVER_MESSAGE,
  allowance: 3,
  used: 3,
};

const ctx = {
  url: "https://server.app.matrxserver.com/ai/mandates/chat.default_new_chat",
  method: "POST",
  path: "/ai/mandates/{mandate_key}",
};

describe("guest AI allowance → the one reminder", () => {
  let seen: GuestAiAllowanceRefusal[];
  let off: () => void;

  beforeEach(() => {
    clearCapturedErrors();
    seen = [];
    off = onGuestAiAllowanceUsed((r) => seen.push(r));
  });
  afterEach(() => off());

  it("fires on the HTTP 403 envelope and keeps it out of the durable record", () => {
    captureApiError(
      {
        type: "http_error",
        status: 403,
        message: SERVER_MESSAGE,
        serverDetail: ENVELOPE,
      },
      ctx,
    );
    expect(seen).toEqual([
      { message: SERVER_MESSAGE, allowance: 3, used: 3 },
    ]);
    expect(getSnapshot()[0]).toMatchObject({
      code: "guest_ai_allowance_used",
      durable: false,
      // The product working — never a red incident pill for the guest.
      tier: "yellow",
    });
  });

  it("fires when FastAPI wraps the envelope in `detail`", () => {
    captureApiError(
      {
        type: "http_error",
        status: 403,
        message: "Forbidden",
        serverDetail: { detail: ENVELOPE },
      },
      ctx,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.used).toBe(3);
  });

  it("fires on the stream error event", () => {
    captureStreamEvent(
      {
        event: "error",
        data: {
          error_type: "guest_ai_allowance_used",
          message: SERVER_MESSAGE,
          user_message: SERVER_MESSAGE,
        },
      } as unknown as Parameters<typeof captureStreamEvent>[0],
      { requestId: "req-guest" },
    );
    expect(seen).toEqual([
      { message: SERVER_MESSAGE, allowance: null, used: null },
    ]);
    expect(getSnapshot()[0]?.durable).toBe(false);
  });

  it("stays silent for every other refusal, which keeps its durable record", () => {
    captureApiError(
      {
        type: "validation_error",
        status: 403,
        message: "Admin access required",
        serverDetail: { error: "admin_required" },
      },
      ctx,
    );
    captureStreamEvent(
      {
        event: "error",
        data: { error_type: "invalid_request", message: "bad" },
      } as unknown as Parameters<typeof captureStreamEvent>[0],
    );
    expect(seen).toHaveLength(0);
    expect(getSnapshot().every((e) => e.durable !== false)).toBe(true);
  });
});
