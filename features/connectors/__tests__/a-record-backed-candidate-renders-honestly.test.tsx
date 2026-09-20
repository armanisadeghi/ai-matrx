/**
 * A RECORD-BACKED CANDIDATE (a synced calendar event) RENDERS HONESTLY IN THE
 * ATTACH PICKER — F-71.
 *
 * aidream lane F-62 made `calendar_event` attachable through its OWN Record
 * (`communication.calendar_event`, never a live Google read): `/connections/
 * resources` now returns candidates carrying `record_table` and an EMPTY
 * `permission_level` (the server's access chokepoint already passed before the
 * row could ever be listed). Before this lane the client's `AttachableCandidate`
 * type carried none of `resource_id` / `record_table` / `permission_level`, the
 * picker had no way to open a candidate as its own Record, and no kind's
 * `add_more` sentence ever reached the screen — so a calendar event row was
 * indistinguishable from a picked file with nowhere to open and no explanation
 * for why it can't be "chosen" like a Google Doc.
 *
 * RED ON HEAD (pre-F-71): the picker never calls the item-presentation opener at
 * all (no `record_table` branch existed), and no `add_more` text is rendered
 * anywhere in the component. GREEN once the row carries an explicit "open in
 * place" control and the kind's `add_more` sentence renders as plain text.
 *
 * Real DOM, real component, no react-dom/test-utils shortcuts — same pattern as
 * `the-refused-row-opens-the-provider-window.test.tsx`.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AttachableCandidate } from "../attachments.service";
import type {
  AttachableResource,
  PendingAttachment,
} from "../attachable-resources";

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

const CALENDAR_ADD_MORE =
  "AI Matrx can only attach calendar events it has already synced for you. " +
  "Open your agenda (the dashboard's Upcoming panel or the Google agenda " +
  "window) and refresh it, then the meeting is here.";

const ATTACHABLE: AttachableResource[] = [
  {
    resource_type: "calendar_event",
    source: "inventory",
    label: "Calendar event",
    add_more: CALENDAR_ADD_MORE,
    // F-62: the server declares Record-backing on the KIND row itself.
    record_table: "communication.calendar_event",
  },
];

/** The verifier's own shape (F-62/F-71): id, `record_table`, no permission. */
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

const DETACHED_MEETING: AttachableCandidate = {
  resource_id: "22222222-2222-4222-8222-222222222222",
  provider: "google",
  resource_type: "calendar_event",
  resource_ref: "evt-detached",
  display_name: "Old planning sync",
  link: null,
  detail: "Calendar event · 2026-08-01T10:00:00+00:00 · no longer syncing (detached)",
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

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  fetchAttachableResources.mockResolvedValue([LIVE_MEETING, DETACHED_MEETING]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchAttachableResources.mockReset();
  openItem.mockReset();
});

describe("a Record-backed candidate's row", () => {
  it("shows the kind's detail line and the sync word when detached, never a bare wire token", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Quarterly review");
    expect(text).toContain("Calendar event · 2026-09-21T15:00:00+00:00");
    expect(text).toContain("Old planning sync");
    expect(text).toContain("no longer syncing (detached)");
  });

  it("never renders an empty permission_level as 'no access' or a broken badge", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text.toLowerCase()).not.toContain("no access");
    expect(text.toLowerCase()).not.toContain("undefined");
    expect(text.toLowerCase()).not.toContain("null");
  });

  it("opens as its Record in place through the item-presentation opener, not the join link", async () => {
    await mount();
    const openButton = document.body.querySelector(
      `button[aria-label="Open Quarterly review"]`,
    );
    expect(openButton).not.toBeNull();
    click(openButton!);
    expect(openItem).toHaveBeenCalledWith(
      "calendar_event",
      "11111111-1111-4111-8111-111111111111",
      { name: "Quarterly review" },
    );
  });

  it("still offers the meeting's own join link as a SEPARATE door", async () => {
    await mount();
    const joinLink = document.body.querySelector(
      `a[aria-label="Join Quarterly review"]`,
    ) as HTMLAnchorElement | null;
    expect(joinLink).not.toBeNull();
    expect(joinLink!.getAttribute("href")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("attaches through the same checkbox-and-commit door as a picked file", async () => {
    const onAttach = jest.fn().mockResolvedValue(undefined);
    await mount(onAttach);
    const toggle = [...document.body.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Quarterly review"),
    );
    expect(toggle).toBeDefined();
    click(toggle!);
    const attachBtn = [...document.body.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").startsWith("Attach"),
    );
    expect(attachBtn).toBeDefined();
    click(attachBtn!);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onAttach).toHaveBeenCalledTimes(1);
    const picks = onAttach.mock.calls[0]?.[0];
    expect(picks).toEqual([
      expect.objectContaining({
        provider: "google",
        resource_type: "calendar_event",
        resource_ref: "evt-live",
        display_name: "Quarterly review",
      }),
    ]);
  });
});

describe("V-21: the two doors are touch-sized and distinguishable without hover", () => {
  // Hostile verifier V-21 (N4 MED, 468e1bd8): both doors were bare
  // `h-3 w-3` icons with no touch sizing, distinguished only by
  // `aria-label`/`title` on hover — a mis-tap on "join" opened the record
  // instead of joining the meeting. Every comparable control in this system
  // sizes for touch (`AgendaPanel`'s own "Join the meeting" /
  // "Open in Google Calendar" pair uses `max-sm:min-h-11`).

  it("gives the record-open button a phone-width touch target", async () => {
    await mount();
    const openButton = document.body.querySelector(
      `button[aria-label="Open Quarterly review"]`,
    );
    expect(openButton).not.toBeNull();
    expect(openButton!.className).toMatch(/max-sm:min-h-11/);
    expect(openButton!.className).toMatch(/max-sm:min-w-11/);
  });

  it("gives the join-meeting link a phone-width touch target", async () => {
    await mount();
    const joinLink = document.body.querySelector(
      `a[aria-label="Join Quarterly review"]`,
    );
    expect(joinLink).not.toBeNull();
    expect(joinLink!.className).toMatch(/max-sm:min-h-11/);
    expect(joinLink!.className).toMatch(/max-sm:min-w-11/);
  });

  it("gives the two doors distinct accessible names that do not depend on hover", async () => {
    await mount();
    const openButton = document.body.querySelector(
      `button[aria-label="Open Quarterly review"]`,
    );
    const joinLink = document.body.querySelector(
      `a[aria-label="Join Quarterly review"]`,
    );
    expect(openButton).not.toBeNull();
    expect(joinLink).not.toBeNull();
    expect(openButton!.getAttribute("aria-label")).not.toBe(
      joinLink!.getAttribute("aria-label"),
    );
  });

  it("visually distinguishes the outbound join door from the in-place open door", async () => {
    await mount();
    const openButton = document.body.querySelector(
      `button[aria-label="Open Quarterly review"]`,
    );
    const joinLink = document.body.querySelector(
      `a[aria-label="Join Quarterly review"]`,
    );
    expect(openButton).not.toBeNull();
    expect(joinLink).not.toBeNull();
    // The join door reads as an outbound link (text-primary); the record
    // door reads as an in-place open (text-muted-foreground) — never the
    // same class list.
    expect(joinLink!.className).toMatch(/text-primary/);
    expect(openButton!.className).not.toMatch(/text-primary/);
    expect(openButton!.className).not.toBe(joinLink!.className);
  });
});

describe("the kind's add_more sentence, never a Picker button for a meeting", () => {
  it("renders the server's own remedy sentence as plain text", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toContain(CALENDAR_ADD_MORE);
  });

  it("never wraps that sentence in a clickable control", async () => {
    await mount();
    const clickableWithSentence = [
      ...document.body.querySelectorAll("button, a"),
    ].find((el) => (el.textContent ?? "").includes(CALENDAR_ADD_MORE));
    expect(clickableWithSentence).toBeUndefined();
  });

  it("never offers a 'Choose…' picker affordance for the meeting kind", async () => {
    await mount();
    const chooseButtons = [...document.body.querySelectorAll("button")].filter(
      (b) => /choose/i.test(b.textContent ?? ""),
    );
    expect(chooseButtons).toEqual([]);
  });
});

describe("F-73: the add_more sentence survives an empty or filtered-out list", () => {
  // Bugbot on 497023a0: `recordKindAddMoreSentences` derived "is this kind
  // Record-backed" from a VISIBLE candidate carrying `record_table`, so the
  // remedy sentence vanished exactly when the person needed it most — no
  // synced meetings yet, or every one hidden by their own search text.

  it("still shows the remedy when the server returns NO candidates at all", async () => {
    fetchAttachableResources.mockResolvedValue([]);
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toContain(CALENDAR_ADD_MORE);
  });

  it("still shows the remedy when a search filters every candidate off screen", async () => {
    await mount();
    const search = document.body.querySelector(
      `input[aria-label="Search Google Calendar event"]`,
    ) as HTMLInputElement | null;
    expect(search).not.toBeNull();
    act(() => {
      search!.dispatchEvent(
        Object.assign(new Event("input", { bubbles: true }), {
          simulated: true,
        }),
      );
    });
    // React controlled-input change: set value then fire a real change event.
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setValue.call(search, "nothing matches this at all");
      search!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Nothing matched");
    expect(text).toContain(CALENDAR_ADD_MORE);
  });
});
