import { IN_APP_RSVP_ROUTE, respondThroughServer } from "./in-app-rsvp";

type Req = { path: string; method?: string; body?: Record<string, unknown>; requireAuth?: boolean };
const meetingId = "e113c373-a006-45aa-a00e-f46a3cd89e78" as Parameters<typeof respondThroughServer>[1];

function apiAnswering(status: number, body: unknown) {
  const seen: Req[] = [];
  return {
    seen,
    api: {
      request: async (input: Req) => {
        seen.push(input);
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
        } as unknown as Response;
      },
    } as unknown as Parameters<typeof respondThroughServer>[0],
  };
}

describe("an in-app Going? answer goes through the server that tells the host", () => {
  it("posts the answer, signed in, to the meeting's rsvp route", async () => {
    const { api, seen } = apiAnswering(200, { ok: true, rsvp_state: "accepted", host_notified: true });
    const result = await respondThroughServer(api, meetingId, "accepted");
    expect(seen).toEqual([
      expect.objectContaining({
        path: IN_APP_RSVP_ROUTE(meetingId),
        method: "POST",
        requireAuth: true,
        body: { answer: "accepted", note: null },
      }),
    ]);
    expect(result).toEqual({ routeMissing: false, hostNotified: true });
  });

  it("a refusal throws the server's own sentence and remedy", async () => {
    const { api } = apiAnswering(403, {
      detail: {
        error: "meet_error",
        message: "You are not on this meeting's invitation list.",
        remedy: "Ask the host to invite you; only invited people answer Going?.",
      },
    });
    await expect(respondThroughServer(api, meetingId, "declined")).rejects.toMatchObject({
      message: "You are not on this meeting's invitation list.",
      remedy: "Ask the host to invite you; only invited people answer Going?.",
    });
  });

  it("a server without the route yet says so instead of failing the answer", async () => {
    const { api } = apiAnswering(404, { detail: "Not Found" });
    await expect(respondThroughServer(api, meetingId, "tentative")).resolves.toEqual({
      routeMissing: true,
      hostNotified: false,
    });
  });
});
