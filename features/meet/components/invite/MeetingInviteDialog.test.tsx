import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MeetingRecord } from "@ai-matrx/meet/react";
import { MeetingInviteDialog } from "./MeetingInviteDialog";

let mockOwner = { isOwner: false, loading: false, error: null as string | null };
const mockShareWithUser = jest.fn();

jest.mock("@/utils/permissions/hooks", () => ({
  useIsOwner: () => mockOwner,
  useSharing: () => ({
    permissions: [],
    loading: false,
    error: null,
    shareWithUser: mockShareWithUser,
    revokeAccess: jest.fn(),
    updateLevel: jest.fn(),
    refresh: jest.fn(),
  }),
}));
jest.mock("@/features/sharing/components/tabs/ShareWithUserTab", () => ({
  ShareWithUserTab: (props: { resourceType: string; resourceId: string }) => (
    <div data-testid="grant-form" data-resource={`${props.resourceType}:${props.resourceId}`} />
  ),
}));
jest.mock("@/features/sharing/components/PermissionsList", () => ({
  PermissionsList: () => <div data-testid="invited-list" />,
}));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

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
  hostUserId: "host-1",
  scheduledFor: "2026-09-28T17:00:00.000Z",
  scheduledDurationMinutes: 30,
  startedAt: null,
  endedAt: null,
  locked: false,
  lobbyEnabled: true,
  recordingPolicy: "host-controlled",
  aiEnabled: true,
  metadata: {},
} as unknown as MeetingRecord;

const link = "https://www.aimatrx.com/meet/952-6de0-d34";

async function renderDialog(signedIn: boolean, overrides: Partial<MeetingRecord> = {}) {
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
    mockOwner = { isOwner: false, loading: false, error: null };
  });

  it("gives everyone the link, the invitation and the calendar", async () => {
    const view = await renderDialog(true);
    const labels = buttonLabels();
    expect(labels).toEqual(expect.arrayContaining(["Copy link", "Share…", "Copy invitation", "Email invitation", "Google Calendar", "Download .ics"]));
    expect((view.body.querySelector('input[aria-label="Meeting link"]') as HTMLInputElement).value).toBe(link);
    expect(view.body.textContent).toContain(`Join: ${link}`);
    expect(view.body.textContent).toContain("No account needed");
    view.unmount();
  });

  it("hides the grant controls from a participant who is not the host, and says who can", async () => {
    const view = await renderDialog(true);
    expect(view.body.querySelector('[data-testid="grant-form"]')).toBeNull();
    expect(view.body.querySelector('[data-testid="invited-list"]')).toBeNull();
    expect(view.body.textContent).toContain("Only the host can invite people by name");
    view.unmount();
  });

  it("hides the grant controls from a guest without asking the share system anything", async () => {
    mockOwner = { isOwner: true, loading: false, error: null };
    const view = await renderDialog(false);
    expect(view.body.querySelector('[data-testid="grant-form"]')).toBeNull();
    expect(view.body.textContent).toContain("The host can invite people by name");
    view.unmount();
  });

  it("gives the host the share system's person search on the meeting record", async () => {
    mockOwner = { isOwner: true, loading: false, error: null };
    const view = await renderDialog(true);
    const form = view.body.querySelector('[data-testid="grant-form"]');
    expect(form).not.toBeNull();
    expect(form?.getAttribute("data-resource")).toBe(`meet_meeting:${meeting.id}`);
    expect(view.body.querySelector('[data-testid="invited-list"]')).not.toBeNull();
    expect(view.body.textContent).toContain("People you invite get a notification and skip the waiting room.");
    view.unmount();
  });

  it("offers no calendar for a meeting without a time", async () => {
    const view = await renderDialog(true, { scheduledFor: null, kind: "instant" });
    expect(buttonLabels()).not.toContain("Google Calendar");
    expect(buttonLabels()).toContain("Copy invitation");
    view.unmount();
  });
});
