/**
 * @jest-environment jsdom
 *
 * THE DOOR LAW on the passage link picker (RC-B11 verify): it offers ONLY the kinds the
 * relationship registry lets link to this source — never a choice that fails when clicked.
 * An unreachable registry is said, not replaced by "everything".
 *
 * Use case: a student links a conversation to the "equal value" passage of a study guide; a kind
 * with no registered pair (say, a deal) is simply not offered.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pickerProps: Array<{ tokens?: string[] }> = [];
jest.mock("@ai-matrx/associations/react", () => ({
  UniversalAssociationPicker: (p: { tokens?: string[] }) => { pickerProps.push(p); return <div data-testid="picker">{(p.tokens ?? ["ALL"]).join(",")}</div>; },
}));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@ai-matrx/design-system", () => ({
  // The engine's modules use the real class helper at load.
  cn: (...c: unknown[]) => c.filter((x) => typeof x === "string" && x).join(" "),
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "me" }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "me" }));
// The picker's own lister check: pickable kinds with a title column or a host lister. Mirrors the
// live registry for this source — fc_card, document and record link but cannot be listed.
jest.mock("@/features/scopes/registry/entityRegistry", () => ({
  listableTokens: () => ["assessment", "conversation", "fc_set", "note", "study_media", "task"],
}));
jest.mock("../AnnotationSidecar", () => ({ useSidecar: () => ({ source: { token: "note", id: "guide-1" } }) }));
const linkableKinds = jest.fn();
jest.mock("../service", () => ({ linkableKinds: (...a: unknown[]) => linkableKinds(...a) }));

import { LinkRecordPickerSheet, LinkRecordSheet } from "../LinkRecordSheet";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  pickerProps.length = 0;
  linkableKinds.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function render() {
  await act(async () => {
    root.render(<LinkRecordSheet open onOpenChange={() => {}} passage={null} onLink={async () => true} />);
  });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
}

it("offers only kinds the registry lets link here AND the picker can list", async () => {
  linkableKinds.mockResolvedValue(["assessment", "conversation", "document", "fc_card", "fc_set", "note", "record", "study_media"]);
  await render();
  expect(linkableKinds).toHaveBeenCalledWith("note");
  // Registered AND listable only: document, fc_card and record would list nothing — not offered.
  expect(pickerProps.at(-1)?.tokens).toEqual(["assessment", "conversation", "fc_set", "note", "study_media"]);
  expect(container.textContent).not.toContain("task");
});

it("says so when the registry cannot be asked — never falls back to every kind", async () => {
  linkableKinds.mockRejectedValue(new Error("We couldn't reach the server while finding what can be linked here."));
  await render();
  expect(pickerProps).toHaveLength(0);
  expect(container.querySelector("[role=alert]")?.textContent).toContain("finding what can be linked here");
});

it("says nothing can be linked when no pair is registered", async () => {
  linkableKinds.mockResolvedValue([]);
  await render();
  expect(pickerProps).toHaveLength(0);
  expect(container.textContent).toContain("Nothing can be linked to this yet");
});

/**
 * STORE RECORDS (CHAIR-REACH, 2026-10-03): "Unit 4B" in a Units table could not be found from a
 * CRM person's "Link a record…" — `listableTokens()` hides the `record` kind although it lists
 * through `custom.records_search`. The right-click picker (LinkRecordOverlay) offers it; the
 * annotation sidecar, which cannot read that link back, still does not; and a store record is
 * never offered on a store record (record ↔ record is the store's relation columns).
 */
async function renderPicker(targetToken: string, storeRecords: boolean) {
  await act(async () => {
    root.render(
      <LinkRecordPickerSheet open onOpenChange={() => {}} targetToken={targetToken} title="Link to Dana Whitcomb" onLink={async () => true} storeRecords={storeRecords} />,
    );
  });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
}

it("offers store records where the host asks for them, and nowhere else", async () => {
  linkableKinds.mockResolvedValue(["note", "party", "record"]);
  await renderPicker("party", true);
  expect(pickerProps.at(-1)?.tokens).toEqual(["note", "record"]);
  await renderPicker("party", false);
  expect(pickerProps.at(-1)?.tokens).toEqual(["note"]);
});
