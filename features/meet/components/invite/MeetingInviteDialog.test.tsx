import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MeetingInvitee, MeetingRecord } from "@ai-matrx/meet/react";
import { MeetingInviteDialog } from "./MeetingInviteDialog";

const HOST = "host-1";
let mockUserId: string | null = HOST;
let mockInvitees: MeetingInvitee[] = [];
const mockAddInvitees = jest.fn();
const mockAnnounce = jest.fn();

jest.mock("@ai-matrx/meet/react", () => {
  const actual = jest.requireActual("@ai-matrx/meet/react");
  return {
    ...actual,
    useMeetHost: () => ({
      identity: {
        userId: mockUserId,
        organizationId: "org-1",
        displayName: "Host",
      },
      api: {},
      repository: {
        invitees: async () => mockInvitees,
        addInvitees: (...args: unknown[]) => {
          mockAddInvitees(...args);
          return Promise.resolve([]);
        },
      },
    }),
    announceMeeting: (...args: unknown[]) => {
      mockAnnounce(...args);
      return Promise.resolve({
        invitations: 1,
        updates: 0,
        cancellations: 0,
        alreadyCurrent: 0,
        remindersQueued: 0,
        remindersCancelled: 0,
      });
    },
  };
});
jest.mock("@/features/messaging/hooks/useUserConnections", () => ({
  useUserConnections: () => ({
    connections: [],
    isLoading: false,
    error: null,
  }),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const meeting = {
  id: "7b1c3d2e-0000-4000-8000-000000000001",
  organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  roomName: "room-1",
  slug: "952-6de0-d34",
  title: "Weekly client check-in",
  kind: "scheduled",
  hostUserId: HOST,
  scheduledFor: "2026-09-28T17:00:00.000Z",
  scheduledDurationMinutes: 30,
  timeZone: "America/Los_Angeles",
  recurrenceRule: null,
  startedAt: null,
  endedAt: null,
  locked: false,
  lobbyEnabled: true,
  recordingPolicy: "host-controlled",
  aiEnabled: true,
  metadata: {},
} as unknown as MeetingRecord;

const invitee = (overrides: Partial<MeetingInvitee>): MeetingInvitee =>
  ({
    id: "inv-1",
    meetingId: meeting.id,
    userId: null,
    email: "dana@acme-renewals.com",
    displayName: "Dana Ruiz",
    role: "invitee",
    rsvpState: "accepted",
    respondedAt: null,
    rsvpNote: null,
    lastSentSequence: 0,
    lastSentAt: "2026-09-27T10:00:00.000Z",
    ...overrides,
  }) as MeetingInvitee;

const link = "https://www.aimatrx.com/meet/952-6de0-d34";

async function renderDialog(
  signedIn: boolean,
  overrides: Partial<MeetingRecord> = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MeetingInviteDialog
        open
        onOpenChange={() => undefined}
        meeting={{ ...meeting, ...overrides } as MeetingRecord}
        link={link}
        signedIn={signedIn}
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    body: document.body,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function buttonLabels(): string[] {
  return Array.from(document.body.querySelectorAll("button, a")).map(
    (el) => el.textContent?.trim() ?? "",
  );
}

describe("MeetingInviteDialog", () => {
  beforeEach(() => {
    mockUserId = HOST;
    mockInvitees = [];
    mockAddInvitees.mockClear();
    mockAnnounce.mockClear();
  });

  it("gives everyone the link, the invitation and the calendar", async () => {
    const view = await renderDialog(true);
    const labels = buttonLabels();
    expect(labels).toEqual(
      expect.arrayContaining([
        "Copy link",
        "Share…",
        "Copy invitation",
        "Email invitation",
        "Google Calendar",
        "Outlook",
        "Download .ics",
      ]),
    );
    expect(
      (
        view.body.querySelector(
          'input[aria-label="Meeting link"]',
        ) as HTMLInputElement
      ).value,
    ).toBe(link);
    expect(view.body.textContent).toContain(`Join: ${link}`);
    view.unmount();
  });

  it("speaks meeting words, never the share dialog's (no permission picker, no 'Share with')", async () => {
    mockInvitees = [invitee({})];
    const view = await renderDialog(true);
    const text = view.body.textContent ?? "";
    expect(
      view.body.querySelector('input[aria-label="Add guests"]'),
    ).not.toBeNull();
    expect(text).toContain("Dana Ruiz");
    expect(text).toContain("Yes");
    for (const shareWord of [
      "Share with User",
      "Can view",
      "Viewer",
      "Add everyone in an organization",
      "Not shared with anyone",
    ]) {
      expect(text).not.toContain(shareWord);
    }
    view.unmount();
  });

  it("adds a guest through the invitees door and emails the invitation", async () => {
    const view = await renderDialog(true);
    const input = view.body.querySelector(
      'input[aria-label="Add guests"]',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "sam@northwind-supply.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockAddInvitees).toHaveBeenCalledTimes(1);
    expect(mockAddInvitees.mock.calls[0]![0]).toBe(meeting.id);
    expect(mockAddInvitees.mock.calls[0]![1]).toEqual([
      { email: "sam@northwind-supply.com", role: "invitee" },
    ]);
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("shows a participant who is not the host the list and no controls", async () => {
    mockUserId = "someone-else";
    mockInvitees = [
      invitee({ userId: "someone-else" as MeetingInvitee["userId"] }),
    ];
    const view = await renderDialog(true);
    expect(
      view.body.querySelector('input[aria-label="Add guests"]'),
    ).toBeNull();
    expect(view.body.textContent).toContain("Dana Ruiz");
    view.unmount();
  });

  it("tells a guest who can add people, without reading anything", async () => {
    const view = await renderDialog(false);
    expect(
      view.body.querySelector('input[aria-label="Add guests"]'),
    ).toBeNull();
    expect(view.body.textContent).toContain("The host can add guests");
    view.unmount();
  });

  it("puts a recurring meeting's rule on the calendar links, and drops Outlook web which cannot carry it", async () => {
    const view = await renderDialog(true, {
      kind: "recurring",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    } as Partial<MeetingRecord>);
    const google = Array.from(view.body.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("Google Calendar"),
    );
    expect(
      new URL(google!.getAttribute("href")!).searchParams.get("recur"),
    ).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO");
    expect(buttonLabels()).not.toContain("Outlook");
    expect(view.body.textContent).toContain("Repeats: Every Monday");
    view.unmount();
  });

  it("offers no calendar for a meeting without a time", async () => {
    const view = await renderDialog(true, {
      scheduledFor: null,
      kind: "instant",
    });
    expect(buttonLabels()).not.toContain("Google Calendar");
    expect(buttonLabels()).toContain("Copy invitation");
    view.unmount();
  });
});
