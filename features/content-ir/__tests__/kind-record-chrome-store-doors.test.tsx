/**
 * KINDS-GLUE wave 2 §7.3 (slice 3) — THE CHROME NEVER HANDS A STORE RECORD A KIND-STORE DOOR.
 *
 * A block whose output the server lander wrote (a `store: "record"` landing) shows "Saved", and
 * its Confirm, Archive and count go through the record store's verbs (`keepStoreOutput`,
 * `archiveStoreOutput`, `countStoreOutputs`) — never `confirm_kind_instances` /
 * `archive_kind_instances` / `countKindRecords`. An old kind-store row keeps its old doors. When
 * neither store answers there is no Save button, only an honest "Not saved".
 *
 * Drives the REAL `KindRecordChrome` and the REAL matcher (`outcomeForBlock`); only the network
 * boundary (the service's reads and doors) is mocked.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Landing, LandingOutcomes } from "@ai-matrx/records/core";

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async () => true),
}));

const MESSAGE = "3c1e5a7b-9d2f-4e6a-8b0c-1d2e3f4a5b6c";
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";

const service = {
  fetchMessageLandings: jest.fn(),
  keepStoreOutput: jest.fn(async () => ({ ok: true, value: true })),
  archiveStoreOutput: jest.fn(async () => ({ ok: true, value: true })),
  countStoreOutputs: jest.fn(async () => ({ ok: true, value: 3 })),
  confirmKindRecords: jest.fn(async () => ({ ok: true, value: [] })),
  archiveKindRecords: jest.fn(async () => ({ ok: true, value: [] })),
  countKindRecords: jest.fn(async () => ({ ok: true, value: 7 })),
};

jest.mock("@/features/content-ir/records/kind-record-service", () => {
  const bus = jest.requireActual("@/features/content-ir/records/record-change-bus");
  const { outcomeForBlock } = jest.requireActual("@ai-matrx/records/core");
  return {
    ...service,
    landingForBlock: outcomeForBlock,
    subscribeToKindRecordChanges: bus.subscribeToKindRecordChanges,
    notifyKindRecordsChanged: bus.notifyKindRecordsChanged,
  };
});

import "@/features/content-ir/records/record-kinds";
import { KindRecordChrome } from "@/features/content-ir/records/KindRecordChrome";

function landing(over: Partial<Landing>): Landing {
  return {
    store: "record",
    recordId: "11111111-1111-4111-8111-111111111111",
    organizationId: ORG,
    kind: "flashcard_set",
    fingerprint: "fp-knee",
    ordinal: 0,
    blockId: "block-elsewhere",
    tableId: "22222222-2222-4222-8222-222222222222",
    state: "saved",
    title: "Knee rehab cards",
    unconfirmed: true,
    archivedAt: null,
    createdAt: "2026-10-03T10:00:00Z",
    refusal: null,
    fromSource: false,
    ...over,
  };
}

function outcomes(...landings: Landing[]): { ok: true; value: LandingOutcomes } {
  return { ok: true, value: { messageId: MESSAGE, landings } };
}

const KIND_STORE_DOORS = ["confirmKindRecords", "archiveKindRecords", "countKindRecords"] as const;

describe("KindRecordChrome — store records use store doors only", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  async function mount(el: React.ReactElement): Promise<void> {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(el));
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
  }

  async function press(text: string): Promise<void> {
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(text),
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
  }

  it("a store-landed output says Saved; Confirm, Archive and the count are store doors", async () => {
    service.fetchMessageLandings.mockResolvedValue(outcomes(landing({})));
    await mount(
      <KindRecordChrome kind="flashcard_set" durableMessageId={MESSAGE} fingerprint="fp-knee" />,
    );
    expect(container.textContent).toContain("Saved");
    expect(container.textContent).toContain("Knee rehab cards");
    expect(container.textContent).toContain("All 3 Flashcard Sets");
    expect(service.countStoreOutputs).toHaveBeenCalled();

    await press("Confirm");
    expect(service.keepStoreOutput).toHaveBeenCalledWith(expect.objectContaining({ store: "record" }));
    await press("Archive");
    expect(service.archiveStoreOutput).toHaveBeenCalledWith(expect.objectContaining({ store: "record" }), true);

    for (const door of KIND_STORE_DOORS) expect(service[door]).not.toHaveBeenCalled();
  });

  it("matches by fingerprint, not by the block address the edge recorded", async () => {
    service.fetchMessageLandings.mockResolvedValue(outcomes(landing({ blockId: "block-hip" })));
    await mount(
      <KindRecordChrome kind="flashcard_set" durableMessageId={MESSAGE} fingerprint="fp-other" />,
    );
    // Another block's output is never claimed — and an unregistered kind with nothing landed draws nothing.
    expect(container.textContent).toBe("");
  });

  it("an old kind-store row keeps its old doors", async () => {
    service.fetchMessageLandings.mockResolvedValue(
      outcomes(landing({ store: "kind_instance", kind: "wine_tasting", fingerprint: null, tableId: null })),
    );
    await mount(
      <KindRecordChrome kind="wine_tasting" durableMessageId={MESSAGE} fingerprint="fp-wine" />,
    );
    expect(container.textContent).not.toContain("Saved");
    await press("Confirm");
    expect(service.confirmKindRecords).toHaveBeenCalled();
    expect(service.keepStoreOutput).not.toHaveBeenCalled();
  });

  it("neither store answers: no Save button, an honest Not saved", async () => {
    service.fetchMessageLandings.mockResolvedValue(outcomes());
    await mount(
      <KindRecordChrome kind="wine_tasting" durableMessageId={MESSAGE} fingerprint="fp-wine" value={{ vintage: 2018 }} />,
    );
    expect(container.textContent).toContain("Not saved");
    expect(Array.from(container.querySelectorAll("button")).map((b) => b.textContent)).toEqual([]);
  });

  it("a fork's copied output is read-only", async () => {
    service.fetchMessageLandings.mockResolvedValue(outcomes(landing({ fromSource: true })));
    await mount(
      <KindRecordChrome kind="flashcard_set" durableMessageId={MESSAGE} fingerprint="fp-knee" />,
    );
    expect(container.textContent).toContain("From the original");
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
