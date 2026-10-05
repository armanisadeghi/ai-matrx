/** @jest-environment node */
/**
 * The Gemini Live / music setup frame carries the ACTIVE organization as
 * `organization_id` (the server records every voice turn in it). With none
 * selected the frame names none — the session still opens — and the server's
 * `history_held` event is surfaced to the person, never swallowed.
 */

jest.mock("../../host/server/python-client", () => ({
  getAccessTokenOrNull: jest.fn(async () => "voice-jwt"),
  resolveBaseUrl: () => "https://server.example.test",
}));
jest.mock("../../host/org", () => ({ getActiveOrgId: jest.fn() }));
jest.mock("../../host/notify", () => ({ toast: { warning: jest.fn() } }));

import { getActiveOrgId } from "../../host/org";
import { toast } from "../../host/notify";
import { createGoogleRealtimeClient } from "./googleRealtimeClient";

class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}

beforeAll(() => {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
});

async function openAndGetSetup(channel: "live" | "music") {
  const client = createGoogleRealtimeClient(channel, {});
  await client.connect();
  FakeSocket.last.onopen?.();
  return { client, setup: JSON.parse(FakeSocket.last.sent[0]) };
}

describe("googleRealtimeClient setup frame organization", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(["live", "music"] as const)("%s: carries the active organization_id", async (channel) => {
    jest.mocked(getActiveOrgId).mockReturnValue("org-123");
    const { setup } = await openAndGetSetup(channel);
    expect(setup.type).toBe("setup");
    expect(setup.organization_id).toBe("org-123");
  });

  it("names no organization when none is active (session still opens)", async () => {
    jest.mocked(getActiveOrgId).mockReturnValue(null);
    const { setup } = await openAndGetSetup("live");
    expect("organization_id" in setup).toBe(false);
  });

  it("surfaces history_held visibly", async () => {
    jest.mocked(getActiveOrgId).mockReturnValue(null);
    await openAndGetSetup("live");
    FakeSocket.last.onmessage?.({
      data: JSON.stringify({ type: "history_held", message: "Pick an organization to keep this session's history." }),
    });
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });
});
