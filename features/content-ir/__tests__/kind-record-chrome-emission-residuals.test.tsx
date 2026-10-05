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
  fetchMessageLandings: jest.fn(),
  confirmKindRecords: jest.fn(),
  archiveKindRecords: jest.fn(),
  keepStoreOutput: jest.fn(),
  archiveStoreOutput: jest.fn(),
  countStoreOutputs: jest.fn(),
  saveKindOutput: jest.fn(),
};

// The REAL bus — the whole point of these tests is that the bus fan-out
// actually reaches every strip, so it must not be mocked.
import {
  subscribeToKindRecordChanges,
  notifyKindRecordsChanged,
} from "@/features/content-ir/records/record-change-bus";

jest.mock("@/features/content-ir/records/kind-record-service", () => ({
  ...serviceMock,
  landingForBlock: jest.requireActual("@ai-matrx/records/core").outcomeForBlock,
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
    serviceMock.fetchMessageLandings.mockImplementation(async (messageId: string) => {
      if (messageId === "3c1e5a7b-9d2f-4e6a-8b0c-1d2e3f4a5b6c") {
        return { ok: true, value: { messageId, landings: [] } };
      }
      // Block B's own message already has a server-written (old kind-store) row.
      return {
        ok: true,
        value: {
          messageId,
          landings: [
            {
              store: "kind_instance" as const,
              recordId: "rec-b",
              organizationId: "org-1",
              kind: "wine_tasting",
              fingerprint: null,
              ordinal: null,
              blockId: null,
              tableId: null,
              state: "saved" as const,
              title: "V45 Chablis",
              unconfirmed: true,
              archivedAt: null,
              createdAt: new Date().toISOString(),
              refusal: null,
              fromSource: false,
            },
          ],
        },
      };
    });

    mount(
      <KindRecordChrome kind="wine_tasting" durableMessageId="3c1e5a7b-9d2f-4e6a-8b0c-1d2e3f4a5b6c" value={{}} />,
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
        <KindRecordChrome kind="wine_tasting" durableMessageId="7f6e5d4c-3b2a-4190-8a7b-6c5d4e3f2a1b" value={{}} />,
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

  it("§3.4 retired with the kind store: a strip with no message offers no Save into it (KINDS-GLUE §7.3)", async () => {
    // The Shape Studio's live-preview chrome has no `chat.message.id`. Its Save used to write the
    // retired `content_ir.kind_instance`; the store takes no new rows, so the strip says the
    // truth — not saved — and offers no control that would write there.
    serviceMock.countKindRecords.mockResolvedValue({ ok: true, value: 6 });

    mount(<KindRecordChrome kind="wine_tasting" value={{ vintage: 2018 }} />);
    await flush();
    await flush();

    expect(container.textContent).toContain("Not saved");
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(serviceMock.fetchMessageLandings).not.toHaveBeenCalled();
  });

  const MSG = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const storeLanding = {
    store: "record" as const,
    recordId: "rec-saved",
    organizationId: "org-1",
    kind: "wine_tasting",
    fingerprint: "fp-1",
    ordinal: 0,
    blockId: null,
    tableId: "tbl-1",
    state: "saved" as const,
    title: "Saved Chablis",
    unconfirmed: true,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    refusal: null,
    fromSource: false,
  };

  function click(label: string): Promise<void> {
    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
    if (!button) throw new Error(`no "${label}" button in: ${container.textContent}`);
    return act(async () => {
      button.click();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("door 5: an unsaved output in a message offers Save, and a Save that lands flips to Saved", async () => {
    let landed = false;
    serviceMock.countKindRecords.mockResolvedValue({ ok: true, value: 0 });
    serviceMock.countStoreOutputs.mockResolvedValue({ ok: true, value: 1 });
    serviceMock.fetchMessageLandings.mockImplementation(async (messageId: string) => ({
      ok: true,
      value: { messageId, landings: landed ? [storeLanding] : [] },
    }));
    serviceMock.saveKindOutput.mockImplementation(async () => {
      landed = true;
      return { ok: true, value: { landed: ["rec-saved"], alreadySaved: [], notSaved: null } };
    });

    mount(<KindRecordChrome kind="wine_tasting" durableMessageId={MSG} fingerprint="fp-1" value={{}} />);
    await flush();
    expect(container.textContent).toContain("Not saved");

    await click("Save");
    await flush();
    await flush();

    expect(serviceMock.saveKindOutput).toHaveBeenCalledWith({ messageId: MSG, fingerprint: "fp-1", kind: "wine_tasting" });
    expect(container.textContent).toContain("Saved Chablis");
    expect(container.textContent).not.toContain("Not saved");
  });

  it("door 5: a Save the store did not take says so instead of going quiet", async () => {
    serviceMock.countKindRecords.mockResolvedValue({ ok: true, value: 0 });
    serviceMock.fetchMessageLandings.mockImplementation(async (messageId: string) => ({
      ok: true,
      value: { messageId, landings: [] },
    }));
    serviceMock.saveKindOutput.mockResolvedValue({
      ok: true,
      value: { landed: [], alreadySaved: [], notSaved: "Your tables did not take this wine tasting: vintage must be a number" },
    });

    mount(<KindRecordChrome kind="wine_tasting" durableMessageId={MSG} fingerprint="fp-1" value={{}} />);
    await flush();
    await click("Save");
    await flush();
    await flush();

    expect(container.textContent).toContain("vintage must be a number");
  });

  it("door 5: a Save of an output an earlier version already saved says so and offers no second Save", async () => {
    serviceMock.countKindRecords.mockResolvedValue({ ok: true, value: 0 });
    serviceMock.fetchMessageLandings.mockImplementation(async (messageId: string) => ({
      ok: true,
      value: { messageId, landings: [] },
    }));
    serviceMock.saveKindOutput.mockResolvedValue({
      ok: true,
      value: { landed: [], alreadySaved: ["rec-old"], notSaved: null },
    });

    mount(<KindRecordChrome kind="wine_tasting" durableMessageId={MSG} fingerprint="fp-1" value={{}} />);
    await flush();
    await click("Save");
    await flush();
    await flush();

    expect(container.textContent).toContain("Already saved");
    expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.includes("Save"))).toBe(false);
  });
});
