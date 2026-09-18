/**
 * F-73 (Cursor Bugbot on 497023a0): OPENING A RECORD FROM THE ATTACH PICKER
 * MUST NOT LEAVE IT BEHIND A FOCUS-TRAPPED MODAL.
 *
 * The Record-backed row's "Open" control (F-71) calls `openItem(...)`, which
 * opens the calendar event's own window/detail primitive through the overlay
 * system while the attach `<Dialog>` (line ~243) is still mounted. A MODAL
 * Radix Dialog (the default, and what this component shipped with) traps
 * focus and hides everything else from assistive tech — so the record opened
 * behind it with no way to reach it, exactly the class this repo's platform
 * contract (see `CmsPageAiActionDialog.tsx`) already fixes elsewhere with
 * `modal={false}` on a dialog that can launch a WindowPanel.
 *
 * RED ON HEAD (pre-fix): the `<Dialog>` passes no `modal` prop at all, so
 * Radix defaults it to modal (trapping focus) — `capturedDialogProps.modal`
 * is `undefined`, never `false`. GREEN once the picker's Dialog carries the
 * same `modal={false}` contract, non-destructively (it never closes itself to
 * open a record, so the person's in-progress selection survives).
 *
 * The Dialog primitive is mocked here (rather than exercised through real
 * Radix internals) so the assertion is a direct, deterministic read of the
 * prop this component passes — not a guess at Radix's internal focus-trap
 * DOM shape, which is not a contract this test should depend on.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AttachableCandidate } from "../attachments.service";
import type {
  AttachableResource,
  PendingAttachment,
} from "../attachable-resources";

let capturedDialogProps: Record<string, unknown> = {};

jest.mock("@/components/ui/dialog", () => {
  const ReactLocal = require("react");
  return {
    Dialog: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
      capturedDialogProps = props;
      return props.open ? ReactLocal.createElement("div", null, props.children) : null;
    },
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
let closed = false;

async function mount(
  onAttach: (picks: PendingAttachment[]) => Promise<void> | void = async () => {},
) {
  closed = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ResourceAttachPicker
        isOpen
        onClose={() => {
          closed = true;
        }}
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
  fetchAttachableResources.mockResolvedValue([LIVE_MEETING]);
  capturedDialogProps = {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchAttachableResources.mockReset();
  openItem.mockReset();
});

describe("the attach picker's Dialog while a record can be opened from inside it", () => {
  it("passes modal={false} so a record opened from inside it is reachable and focusable", async () => {
    await mount();
    expect(capturedDialogProps.modal).toBe(false);
  });

  it("does not close itself (and so does not drop the in-progress selection) when a record is opened", async () => {
    await mount();
    // Select the candidate before opening its record.
    const toggle = [...document.body.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Quarterly review"),
    );
    expect(toggle).toBeDefined();
    click(toggle!);

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
    // The picker never called onClose to open the record — selection intact.
    expect(closed).toBe(false);
    const attachBtn = [...document.body.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").startsWith("Attach"),
    );
    expect(attachBtn?.textContent).toContain("1");
  });
});
