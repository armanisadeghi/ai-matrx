/** @jest-environment node */

/**
 * The stream server requires the same active-organization admission context as
 * the control plane. These tests keep `streamRequest` real and mock only its
 * network/auth/store boundaries, so a hand-rolled fetch cannot satisfy them.
 */

jest.mock("@/lib/python-client", () => {
  const actual = jest.requireActual<typeof import("@/lib/python-client")>(
    "@/lib/python-client",
  );
  return { ...actual, postJson: jest.fn() };
});

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "stream-access-token" } },
        error: null,
      })),
    },
  },
}));

jest.mock("@/lib/services/fingerprint-service", () => ({
  getCachedFingerprint: () => null,
}));
jest.mock("@/lib/api/log-api-target", () => ({ logApiTarget: jest.fn() }));
jest.mock("@/lib/diagnostics/capturePythonClientError", () => ({
  capturePythonClientError: jest.fn(),
  relationPathFromUrl: (path: string) => path.split("?")[0],
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStore: () => mockStore,
  getStoreSingleton: () => mockStore,
}));
jest.mock("@/utils/permissions/access", () => ({ getResourceAccess: jest.fn() }));

import { capturePythonClientError } from "@/lib/diagnostics/capturePythonClientError";
import { postJson } from "@/lib/python-client";
import { supabase } from "@/utils/supabase/client";
import {
  claimStreamTicket,
  mintStreamTicket,
  renewStreamTicket,
  StreamConnectError,
} from "./service";
import type { StreamTicketEnvelope } from "./types";

const TEST_ORGANIZATION_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
let mockActiveOrganizationId: string | null = TEST_ORGANIZATION_ID;

const streamTicket = {
  ticket: "one-use",
  organizationId: TEST_ORGANIZATION_ID,
  expiresAt: 1_800_000_000,
  endpoint: "https://stream.aimatrx.com/cb-abc/",
  protocol: "selkies_webrtc",
  streamSessionId: "abc",
  mode: "control",
  control: {
    controlRevision: 3,
    leaseExpiresAt: 1_800_000_100,
    renewIntervalSeconds: 20,
  },
  media: { video: true, audio: false, clipboard: false },
  viewport: { width: 1280, height: 800 },
} satisfies StreamTicketEnvelope;

const mockStore = {
  getState: () => ({
    appContext: {
      organization_id: mockActiveOrganizationId,
      orgBootstrapResolved: true,
    },
  }),
  subscribe: () => () => undefined,
};

function response(status: number, body?: unknown): Response {
  return new Response(
    body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body),
    { status, headers: { "content-type": "application/json" } },
  );
}

function mintTicketResponse() {
  return {
    data: {
      ticket: streamTicket.ticket,
      expires_at: streamTicket.expiresAt,
      endpoint: streamTicket.endpoint,
      stream_session_id: streamTicket.streamSessionId,
      control: {
        control_revision: streamTicket.control?.controlRevision,
        lease_expires_at: streamTicket.control?.leaseExpiresAt,
        renew_interval_seconds: streamTicket.control?.renewIntervalSeconds,
      },
      media: streamTicket.media,
      viewport: streamTicket.viewport,
    },
  };
}

describe("Cloud Browser stream transport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveOrganizationId = TEST_ORGANIZATION_ID;
    jest.mocked(postJson).mockResolvedValue(mintTicketResponse() as never);
    global.fetch = jest.fn().mockResolvedValue(response(204));
  });

  it.each([
    ["claim", () => claimStreamTicket(streamTicket), "/cb-abc/claim", JSON.stringify({ ticket: "one-use" })],
    ["renewal", () => renewStreamTicket(streamTicket), "/cb-abc/renew", "{}"],
  ])(
    "sends the active organization through the shared transport for %s",
    async (_operation, invoke, expectedPath, expectedBody) => {
      await invoke();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = jest.mocked(global.fetch).mock.calls[0];
      expect(url).toBe(`https://stream.aimatrx.com${expectedPath}`);
      expect(init).toMatchObject({ method: "POST", credentials: "include", body: expectedBody });
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer stream-access-token");
      expect(headers.get("x-organization-id")).toBe(TEST_ORGANIZATION_ID);
    },
  );

  it("refuses stream-ticket minting before networking when no active organization exists", async () => {
    mockActiveOrganizationId = null;

    await expect(mintStreamTicket("run-1", "control")).rejects.toMatchObject({
      code: "organization_context_required",
    });
    expect(postJson).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps the admitted organization when selection changes during minting and renewal", async () => {
    let resolveMint!: (value: ReturnType<typeof mintTicketResponse>) => void;
    jest.mocked(postJson).mockImplementationOnce(
      () => new Promise((resolve) => { resolveMint = resolve; }) as never,
    );

    const minting = mintStreamTicket("run-1", "control");
    await Promise.resolve();
    expect(postJson).toHaveBeenCalledWith(
      "/browser-manager/runs/run-1/stream-ticket",
      { mode: "control", takeover: false },
      { organizationId: TEST_ORGANIZATION_ID },
    );
    mockActiveOrganizationId = "a2222222-2222-4222-8222-222222222222";
    resolveMint(mintTicketResponse());

    const ticket = await minting;
    mockActiveOrganizationId = "b3333333-3333-4333-8333-333333333333";
    await renewStreamTicket(ticket);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(jest.mocked(global.fetch).mock.calls.map(([url]) => url)).toEqual([
      "https://stream.aimatrx.com/cb-abc/claim",
      "https://stream.aimatrx.com/cb-abc/renew",
    ]);
    for (const [, init] of jest.mocked(global.fetch).mock.calls) {
      expect(new Headers(init?.headers).get("x-organization-id")).toBe(
        TEST_ORGANIZATION_ID,
      );
    }
  });

  it("refuses a hostile stream origin before looking up credentials", async () => {
    const hostileTicket = { ...streamTicket, endpoint: "https://attacker.example/cb-abc/" };

    await expect(claimStreamTicket(hostileTicket)).rejects.toThrow(
      "invalid stream address",
    );
    expect(jest.mocked(supabase.auth.getSession)).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    "https://stream.aimatrx.com:8443/cb-abc/",
    "https://stream.aimatrx.com:444/cb-abc/",
  ])("refuses a noncanonical stream port before looking up credentials: %s", async (endpoint) => {
    const noncanonicalTicket = { ...streamTicket, endpoint };

    await expect(claimStreamTicket(noncanonicalTicket)).rejects.toThrow(
      "invalid stream address",
    );
    expect(jest.mocked(supabase.auth.getSession)).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps the already-open-elsewhere code from the production envelope", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response(409, {
        code: "stream_already_connected",
        error: "conflict",
        message: "This browser already has a live controller.",
        user_message: "Something went wrong. Please try again later.",
        details: null,
      }),
    );

    await expect(mintStreamTicket("run-1", "control", false)).rejects.toMatchObject({
      name: "StreamConnectError",
      code: "stream_already_connected",
      message: "This browser already has a live controller.",
      status: 409,
    } satisfies Partial<StreamConnectError>);
    expect(capturePythonClientError).not.toHaveBeenCalled();
  });

  it("captures an unexpected stream-server failure before preserving its response UX", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(502, "<html>bad gateway</html>"));

    await expect(claimStreamTicket(streamTicket)).rejects.toMatchObject({
      name: "StreamConnectError",
      message: "The live browser connection failed (502).",
      status: 502,
    } satisfies Partial<StreamConnectError>);
    expect(capturePythonClientError).toHaveBeenCalledTimes(1);
  });
});
