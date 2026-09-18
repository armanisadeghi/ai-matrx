/**
 * F-80 held on desktop but STILL OPEN below 640px (V-22, VERIFY-R7-FIX-WAVE
 * NEW-4): the two secondary doors on a Record-backed row ("Open" / "Join")
 * carried F-80's `max-sm:min-h-11 max-sm:min-w-11` touch floor and a visible
 * `sm:` label, but at PHONE width the label vanished (`hidden sm:inline`),
 * leaving two icon-only doors told apart only by hover/tint — and the
 * PRIMARY select control of the row (the actual point of the picker) carried
 * no touch floor at all, so the most-tapped control was the smallest thing
 * on screen.
 *
 * This test carries the class, not the two doors: every interactive control
 * on a candidate row (the primary select button, both secondary doors, the
 * search field, and the footer's Cancel/Attach) must clear the 44px floor at
 * phone width, AND the two doors must stay distinguishable without hover —
 * a short visible text label at every width, per F-80's "distinct without
 * hover" standard.
 *
 * RED on HEAD: the primary select button, the search input and the footer
 * buttons carry no `max-sm:min-h-11`, and both doors' labels are
 * `hidden sm:inline` (present in the DOM but invisible below `sm`).
 *
 * The Dialog primitive is mocked exactly as
 * `opening-a-record-does-not-trap-the-picker.test.tsx` mocks it, so this
 * reads the component's own className/text output directly rather than
 * depending on Radix's internal DOM shape or jsdom's (nonexistent) media
 * query evaluation.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AttachableCandidate } from "../attachments.service";
import type {
  AttachableResource,
  PendingAttachment,
} from "../attachable-resources";

jest.mock("@/components/ui/dialog", () => {
  const ReactLocal = require("react");
  return {
    Dialog: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
      props.open ? ReactLocal.createElement("div", null, props.children) : null,
    DialogContent: ({ children }: { children?: React.ReactNode }) =>
      ReactLocal.createElement("div", null, children),
    DialogDescription: ({ children }: { children?: React.ReactNode }) =>
      ReactLocal.createElement("div", null, children),
    DialogFooter: ({ children }: { children?: React.ReactNode }) =>
      ReactLocal.createElement("div", null, children),
    DialogHeader: ({ children }: { children?: React.ReactNode }) =>
      ReactLocal.createElement("div", null, children),
    DialogTitle: ({ children }: { children?: React.ReactNode }) =>
      ReactLocal.createElement("div", null, children),
  };
});

const fetchAttachableResources = jest.fn();
jest.mock("../attachments.service", () => ({
  fetchAttachableResources: (...args: unknown[]) =>
    fetchAttachableResources(...args),
}));

const openItem = jest.fn();
jest.mock("@/features/item-presentation/useOpenItemPresentation", () => ({
  useOpenItemPresentation: () => openItem,
}));

jest.mock("@/features/github-integration/GitHubConnectionCard", () => ({
  GitHubConnectionCard: () => null,
}));

import { ResourceAttachPicker } from "../ResourceAttachPicker";

const ATTACHABLE: AttachableResource[] = [
  {
    resource_type: "calendar_event",
    source: "inventory",
    label: "Calendar event",
    add_more: "Open your agenda and refresh it.",
    record_table: "communication.calendar_event",
  },
];

// Carries BOTH doors at once (record_table AND link), the row shape NEW-4
// was raised against.
const LIVE_MEETING: AttachableCandidate = {
  resource_id: "11111111-1111-4111-8111-111111111111",
  provider: "google",
  resource_type: "calendar_event",
  resource_ref: "evt-live",
  display_name: "Quarterly review",
  link: "https://meet.google.com/abc-defg-hij",
  detail: "Calendar event · 2026-09-21T15:00:00+00:00",
  permission_level: null,
  record_table: "communication.calendar_event",
  metadata: { __kind: "attached_record_summary" },
};

let container: HTMLDivElement;
let root: Root;

async function mount(
  onAttach: (picks: PendingAttachment[]) => Promise<void> | void = async () => {},
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ResourceAttachPicker
        isOpen
        onClose={() => {}}
        provider="google"
        providerName="Google"
        attachable={ATTACHABLE}
        alreadyAttachedRefs={[]}
        onAttach={onAttach}
      />,
    );
    await Promise.resolve();
  });
}

beforeEach(() => {
  fetchAttachableResources.mockResolvedValue([LIVE_MEETING]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchAttachableResources.mockReset();
  openItem.mockReset();
});

/** A className string carries every one of the given tokens. */
function carries(className: string | null, ...tokens: string[]) {
  const value = className ?? "";
  return tokens.every((token) => value.includes(token));
}

describe("every interactive control on a candidate row meets the phone touch floor", () => {
  it("floors the PRIMARY select control — the most-tapped control in the row", async () => {
    await mount();
    const toggle = [...document.body.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Quarterly review"),
    );
    expect(toggle).toBeDefined();
    expect(carries(toggle!.className, "max-sm:min-h-11")).toBe(true);
  });

  it("floors the search field", async () => {
    await mount();
    const search = document.body.querySelector(
      'input[aria-label="Search Google Calendar event"]',
    );
    expect(search).not.toBeNull();
    expect(carries(search!.className, "max-sm:min-h-11")).toBe(true);
  });

  it("floors both secondary doors on a Record-backed row", async () => {
    await mount();
    const openDoor = document.body.querySelector(
      'button[aria-label="Open Quarterly review"]',
    );
    const joinDoor = document.body.querySelector('a[aria-label="Join Quarterly review"]');
    expect(openDoor).not.toBeNull();
    expect(joinDoor).not.toBeNull();
    expect(
      carries(openDoor!.className, "max-sm:min-h-11", "max-sm:min-w-11"),
    ).toBe(true);
    expect(
      carries(joinDoor!.className, "max-sm:min-h-11", "max-sm:min-w-11"),
    ).toBe(true);
  });

  it("floors the footer's Cancel and Attach controls", async () => {
    await mount();
    const cancelBtn = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Cancel",
    );
    const attachBtn = [...document.body.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").startsWith("Attach"),
    );
    expect(cancelBtn).toBeDefined();
    expect(attachBtn).toBeDefined();
    expect(carries(cancelBtn!.className, "max-sm:min-h-11")).toBe(true);
    expect(carries(attachBtn!.className, "max-sm:min-h-11")).toBe(true);
  });

  it("keeps the two doors distinguishable WITHOUT hover — a visible text label at every width, not `hidden sm:inline`", async () => {
    await mount();
    const openDoor = document.body.querySelector(
      'button[aria-label="Open Quarterly review"]',
    );
    const joinDoor = document.body.querySelector('a[aria-label="Join Quarterly review"]');
    expect(openDoor).not.toBeNull();
    expect(joinDoor).not.toBeNull();

    const openLabel = openDoor!.querySelector("span:last-child");
    const joinLabel = joinDoor!.querySelector("span:last-child");
    expect(openLabel?.textContent).toBe("Open");
    expect(joinLabel?.textContent).toBe("Join");
    // `hidden` (Tailwind's `display: none` utility) is what made the label
    // invisible below `sm` on HEAD — the fix keeps it out of the class list
    // at every width, moving the responsive behavior to stacking instead of
    // hiding.
    expect(openLabel?.className.split(/\s+/)).not.toContain("hidden");
    expect(joinLabel?.className.split(/\s+/)).not.toContain("hidden");
  });
});
