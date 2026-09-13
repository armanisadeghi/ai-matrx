/**
 * The stream server's refusal must keep its REASON. `new Error("…failed (409)")`
 * threw it away, so "this browser is already open in another tab" — one click
 * to recover — was indistinguishable from any other failure.
 */

import { mintStreamTicket, StreamConnectError } from "./service";

jest.mock("@/lib/python-client", () => ({
  getJson: jest.fn(),
  postJson: jest.fn(async () => ({
    data: {
      ticket: "one-use",
      expires_at: 1_800_000_000,
      endpoint: "https://stream.aimatrx.com/cb-abc/",
      stream_session_id: "abc",
      control: { control_revision: 3, lease_expires_at: 1_800_000_100, renew_interval_seconds: 20 },
      media: { video: true, audio: false, clipboard: false },
      viewport: { width: 1280, height: 800 },
    },
  })),
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "t" } },
        error: null,
      })),
    },
  },
}));

jest.mock("@/utils/permissions/access", () => ({ getResourceAccess: jest.fn() }));

/** jsdom has no `Response`; this is exactly the surface `streamRequest` reads. */
function claimAnswers(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (typeof body === "string") throw new SyntaxError("not JSON");
      return body;
    },
  })) as unknown as typeof fetch;
}

async function refusal(): Promise<StreamConnectError> {
  try {
    await mintStreamTicket("run-1", "control", false);
  } catch (e) {
    if (e instanceof StreamConnectError) return e;
    throw e;
  }
  throw new Error("expected the claim to be refused");
}

describe("live-view connect refusals keep their reason", () => {
  it("names the already-open-elsewhere case from the REAL production envelope", async () => {
    // Captured verbatim from production 2026-09-13 (request_id trimmed): a
    // normal claim while another live view was connected. The first version of
    // this parser only read `{detail: …}` — the shape it was tested with — and
    // would have missed this body entirely, so "Show it here" never appeared.
    claimAnswers(409, {
      code: "stream_already_connected",
      error: "conflict",
      message: "This browser already has a live controller.",
      user_message: "Something went wrong. Please try again later.",
      details: null,
    });
    const err = await refusal();
    expect(err.code).toBe("stream_already_connected");
    // The specific sentence, not the handler's generic user_message.
    expect(err.message).toBe("This browser already has a live controller.");
    expect(err.status).toBe(409);
  });

  it("still reads a bare FastAPI detail object", async () => {
    claimAnswers(409, {
      detail: { code: "stream_already_connected", message: "This browser already has a live controller." },
    });
    const err = await refusal();
    expect(err.code).toBe("stream_already_connected");
  });

  it("keeps a plain sentence refusal as the message", async () => {
    claimAnswers(403, { detail: "This browser ticket came from a different site." });
    const err = await refusal();
    expect(err.code).toBeNull();
    expect(err.message).toBe("This browser ticket came from a different site.");
  });

  it("falls back to the status when the edge returned something that is not JSON", async () => {
    claimAnswers(502, "<html>bad gateway</html>");
    const err = await refusal();
    expect(err.message).toBe("The live browser connection failed (502).");
  });
});
