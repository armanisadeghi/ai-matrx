import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RsvpInvitation } from "@ai-matrx/meet/react";
import { RSVP_ROUTE, RsvpLanding, sendRsvp } from "./RsvpLanding";

let mockInvitation: RsvpInvitation;
const mockFetch = jest.fn();

jest.mock("@ai-matrx/meet/react", () => {
  const actual = jest.requireActual("@ai-matrx/meet/react");
  return {
    ...actual,
    createMeetRepository: () => ({
      invitationByToken: async () => mockInvitation,
    }),
  };
});
jest.mock("@/lib/redux/hooks", () => ({
  useAppStore: () => ({ getState: () => ({}) }),
}));
jest.mock("@/features/meet/lib/meetBaseUrl", () => ({
  meetBaseUrl: () => "https://server.test",
}));
jest.mock("@/utils/supabase/client", () => (require("@/tests/helpers/emptySupabaseClient") as typeof import("@/tests/helpers/emptySupabaseClient")).emptySupabaseClientModule());

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECRET = "S".repeat(43);

function invitation(
  overrides: Partial<Extract<RsvpInvitation, { ok: true }>["meeting"]> = {},
  rsvpState = "needs_action",
): RsvpInvitation {
  return {
    ok: true,
    meeting: {
      title: "Weekly client check-in",
      slug: "abc-defg-hij",
      scheduledFor: "2026-10-06T17:00:00.000Z",
      durationMinutes: 30,
      timeZone: "America/Los_Angeles",
      agenda: "Open action items",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
      cancelledAt: null,
      cancellationReason: null,
      endedAt: null,
      ...overrides,
    },
    invitee: {
      displayName: "Dana Ruiz",
      email: "dana@acme-renewals.com",
      rsvpState: rsvpState as "needs_action",
      respondedAt: null,
    },
  };
}

function okResponse(state: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      host_notified: true,
      meeting: {
        title: "Weekly client check-in",
        slug: "abc-defg-hij",
        time_zone: "America/Los_Angeles",
      },
      invitee: { display_name: "Dana Ruiz", rsvp_state: state },
    }),
  } as unknown as Response;
}

async function render(answer: string | null) {
  const container = document.createElement("div");
  document.body.append(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(<RsvpLanding secret={SECRET} initialAnswer={answer} />);
  });
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {
    text: () => container.textContent ?? "",
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("sendRsvp — the answer goes through aidream, the secret in the body", () => {
  it("posts {secret, answer, note} to the route and reads the door's payload", async () => {
    const fetchImpl = jest.fn(async () => okResponse("accepted"));
    const result = await sendRsvp(
      "https://server.test",
      SECRET,
      "accepted",
      "See you",
      fetchImpl,
    );
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`https://server.test${RSVP_ROUTE}`);
    expect(url).not.toContain(SECRET);
    expect(JSON.parse(String(init.body))).toEqual({
      secret: SECRET,
      answer: "accepted",
      note: "See you",
    });
    expect(result.ok && result.invitee.rsvpState).toBe("accepted");
    expect(result.hostNotified).toBe(true);
  });

  it("says so when the server cannot take it, and never pretends it saved", async () => {
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchImpl = jest.fn(
      async () => ({ ok: false, status: 404 }) as Response,
    );
    await expect(
      sendRsvp("https://server.test", SECRET, "declined", null, fetchImpl),
    ).rejects.toThrow("not available right now");
    errorSpy.mockRestore();
  });
});

describe("the RSVP page", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it("shows the meeting in its zone with the repeat rule, and records the answer the email link carried", async () => {
    mockInvitation = invitation();
    mockFetch.mockResolvedValue(okResponse("accepted"));
    const view = await render("accepted");
    expect(view.text()).toContain("Weekly client check-in");
    expect(view.text()).toContain("Tuesday, October 6, 2026");
    expect(view.text()).toContain("Every Tuesday");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(view.text()).toContain("You're going. The host has been told.");
    const pressed = view.container.querySelector('button[aria-pressed="true"]');
    expect(pressed?.textContent).toContain("Yes");
    view.unmount();
  });

  it("does not send the same answer twice", async () => {
    mockInvitation = invitation({}, "accepted");
    const view = await render("accepted");
    expect(mockFetch).not.toHaveBeenCalled();
    view.unmount();
  });

  it("an invalid link reads as one sentence and offers nothing to click", async () => {
    mockInvitation = {
      ok: false,
      message:
        "This invitation link is no longer valid — ask the host to send it again.",
    };
    const view = await render("accepted");
    expect(view.text()).toContain("no longer valid");
    expect(view.container.querySelectorAll("button")).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
    view.unmount();
  });

  it("a cancelled meeting says so, takes no answer and offers no join", async () => {
    mockInvitation = invitation({
      cancelledAt: "2026-10-01T00:00:00.000Z",
      cancellationReason: "Client moved to Q1",
    });
    const view = await render("accepted");
    expect(view.text()).toContain(
      "This meeting was cancelled: “Client moved to Q1”",
    );
    expect(view.text()).not.toContain("Going?");
    expect(view.text()).not.toContain("Join the meeting");
    expect(mockFetch).not.toHaveBeenCalled();
    view.unmount();
  });
});
