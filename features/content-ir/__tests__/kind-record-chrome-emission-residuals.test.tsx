/**
 * DD-131 slice 1 residuals from V-45 (final verification of `wine_tasting`).
 *
 * V-45 §3.1: after a SECOND emission lands in the same conversation, the
 * FIRST block's "All N Wine Tastings" count stayed stale until a full page
 * reload — the save path already announced itself on the record bus, but the
 * emission/discovery path (an aidream-written row a strip merely READS) never
 * did. V-45 §3.4: after a successful client save, the strip kept offering
 * "Save this Wine Tasting" instead of flipping to the record-bound state —
 * real for any strip with no `chat.message.id` to re-query by (e.g. the Shape
 * Studio's live-preview chrome), because the save left nothing for its own
 * per-message read to find.
 *
 * These tests drive the REAL `KindRecordChrome` component (React 19,
 * `react-dom/client` + `act`, no testing-library — matches this repo's other
 * hook/component tests, e.g. `lib/durable-run/useDurableRun.honest-wait.test.tsx`).
 * Only the service module (the network boundary) is mocked.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "org-1",
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async () => true),
}));

const serviceMock = {
  countKindRecords: jest.fn(),
  fetchRecordsProducedByMessage: jest.fn(),
  saveRecordFromBlock: jest.fn(),
  confirmKindRecords: jest.fn(),
  archiveKindRecords: jest.fn(),
};

// The REAL bus — the whole point of these tests is that the bus fan-out
// actually reaches every strip, so it must not be mocked.
import {
  subscribeToKindRecordChanges,
  notifyKindRecordsChanged,
} from "@/features/content-ir/records/record-change-bus";

jest.mock("@/features/content-ir/records/kind-record-service", () => ({
  ...serviceMock,
  subscribeToKindRecordChanges:
    jest.requireActual("@/features/content-ir/records/record-change-bus")
      .subscribeToKindRecordChanges,
  notifyKindRecordsChanged:
    jest.requireActual("@/features/content-ir/records/record-change-bus")
      .notifyKindRecordsChanged,
}));

import "@/features/content-ir/records/record-kinds";
import { KindRecordChrome } from "@/features/content-ir/records/KindRecordChrome";

function flush() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("DD-131 slice 1 residuals (V-45)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  function mount(el: React.ReactElement): void {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(el));
  }

  it("§3.1 RED-then-GREEN: a second EMISSION re-counts the FIRST block without a reload", async () => {
    // Block A: mounted first, its own message produced no record yet, org
    // held 1 (some earlier row). Block B: a LATER message whose row aidream
    // already wrote server-side by the time this strip mounts (an
    // "emission" — never a client save, so nothing calls
    // `storeKindRecord()`/`notifyKindRecordsChanged` for it directly).
    let orgCount = 1;
    serviceMock.countKindRecords.mockImplementation(async () => ({
      ok: true,
      value: orgCount,
    }));
    serviceMock.fetchRecordsProducedByMessage.mockImplementation(
      async ({ messageId }: { messageId: string }) => {
        if (messageId === "msg-a") return { ok: true, value: [] };
        // Block B's own message already has a server-written row.
        return {
          ok: true,
          value: [
            {
              id: "rec-b",
              title: "V45 Chablis",
              kind: "wine_tasting",
              confirmation: "unconfirmed" as const,
              archivedAt: null,
              createdAt: new Date().toISOString(),
            },
          ],
        };
      },
    );

    mount(
      <KindRecordChrome kind="wine_tasting" messageId="msg-a" value={{}} />,
    );
    await flush();
    expect(container.textContent).toContain("All 1 Wine Tasting");

    // The org now holds 2 (block B's emission landed) — simulate the count
    // moving as it would in the real database.
    orgCount = 2;

    // Block B mounts (its message's row already exists server-side — an
    // emission, not a save through this strip).
    const containerB = document.createElement("div");
    document.body.appendChild(containerB);
    const rootB = createRoot(containerB);
    act(() =>
      rootB.render(
        <KindRecordChrome kind="wine_tasting" messageId="msg-b" value={{}} />,
      ),
    );
    await flush();

    // Block A's strip, still mounted, NEVER reloaded and never wrote
    // anything itself — this is the exact stale-count shape of V-45 §3.1.
    // The fix under test: discovering block B's server-written row must
    // announce it on the bus so block A re-reads.
    expect(container.textContent).toContain("All 2 Wine Tasting");

    act(() => rootB.unmount());
    containerB.remove();
  });

  it("§3.4 RED-then-GREEN: a successful save flips the strip to the saved state with no re-query available", async () => {
    // No `messageId` — the Shape Studio's live-preview chrome (e.g. the Test
    // tab's "Fill with AI" run), which has no `chat.message.id` to re-query
    // records by. Before the fix, `onSave` had no way to learn its own write
    // existed and kept offering "Save this Wine Tasting" forever.
    serviceMock.countKindRecords.mockResolvedValue({ ok: true, value: 6 });
    serviceMock.saveRecordFromBlock.mockResolvedValue({
      ok: true,
      value: {
        id: "rec-new",
        title: "V45 Person Save Two",
        kind: "wine_tasting",
        confirmation: "confirmed" as const,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        provenanceWarning: null,
      },
    });

    mount(<KindRecordChrome kind="wine_tasting" value={{ vintage: 2018 }} />);
    await flush();

    expect(container.textContent).toContain("Save this Wine Tasting");

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Save this Wine Tasting"),
    );
    expect(saveButton).toBeTruthy();
    await act(async () => {
      saveButton!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // The affordance must flip to the record-bound state — same branch the
    // chat block draws once a record exists — not keep offering to save.
    expect(container.textContent).not.toContain("Save this Wine Tasting");
    expect(container.textContent).toContain("V45 Person Save Two");
  });
});
