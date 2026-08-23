import { postJson } from "@/lib/python-client";
import { mintStreamTicket, parseHandoffReason } from "./service";

jest.mock("@/lib/python-client", () => ({
  getJson: jest.fn(),
  postJson: jest.fn(),
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-access-token" } },
        error: null,
      })),
    },
  },
}));

jest.mock("@/utils/permissions/access", () => ({
  getResourceAccess: jest.fn(),
}));

const ticketResponse = {
  ticket: "one-use-ticket",
  expires_at: 1_800_000_000,
  endpoint: "https://stream.aimatrx.com/cb-session/",
  stream_session_id: "session",
  control: {
    control_revision: 3,
    lease_expires_at: 1_800_000_100,
    renew_interval_seconds: 20,
  },
  media: { video: true, audio: false, clipboard: false },
  viewport: { width: 1920, height: 1080 },
};

describe("mintStreamTicket", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(postJson).mockResolvedValue({
      data: ticketResponse,
      meta: { requestId: "request-1", status: 200, serverRequestId: null },
    });
    global.fetch = jest.fn(async () => ({ ok: true }) as Response);
  });

  it("does not supersede a live controller on the first connection", async () => {
    await mintStreamTicket("run-1", "control");

    expect(postJson).toHaveBeenCalledWith(
      "/browser-manager/runs/run-1/stream-ticket",
      { mode: "control", takeover: false },
    );
  });

  it("supersedes the prior stream ticket during an explicit reconnect", async () => {
    await mintStreamTicket("run-1", "control", true);

    expect(postJson).toHaveBeenCalledWith(
      "/browser-manager/runs/run-1/stream-ticket",
      { mode: "control", takeover: true },
    );
  });
});

describe("parseHandoffReason", () => {
  it("accepts immediate user takeover and provider-revocation reasons", () => {
    expect(parseHandoffReason("user_requested")).toBe("user_requested");
    expect(parseHandoffReason("session_revoked_by_provider")).toBe(
      "session_revoked_by_provider",
    );
  });

  it("refuses values outside the generated server contract", () => {
    expect(() => parseHandoffReason("invented_reason")).toThrow(
      "Unknown browser handoff reason: invented_reason",
    );
  });
});
