/**
 * THE RECOVERY BANNER HYDRATES THROUGH THE EXTERNAL DRAFT STORE. On the server
 * snapshot (version -1) it renders nothing, so SSR and the first client render
 * agree; once the browser store publishes and the note is fully loaded, a
 * draft the server does not hold is offered back. This used to be asserted by
 * grepping the component source for `useSyncExternalStore(` — a change
 * detector. Now the component is rendered against a controllable draft store.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NoteDraftRecoveryBanner } from "./NoteDraftRecoveryBanner";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let draftsVersion = -1;
const listeners = new Set<() => void>();
const publish = (version: number) => {
  draftsVersion = version;
  for (const l of listeners) l();
};
jest.mock("@ai-matrx/kit/drafts", () => ({
  getDraftsVersion: () => draftsVersion,
  subscribeDrafts: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
}));

const T = Date.parse("2026-09-14T10:00:00.000Z");
const draft = { key: "note:n1", entityId: "n1", namespace: "note", ownerId: "u1", content: "orphaned words", capturedAt: T, reason: "unload", label: "N" };
const discard = jest.fn();
jest.mock("../utils/notesDrafts", () => ({
  discardNoteDraft: (id: string) => discard(id),
  getNoteDraft: () => draft,
}));
jest.mock("@/features/text-diff/service/versionService", () => ({ fetchVersions: jest.fn(async () => []) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn() } }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/components/agent-copy/clipboard", () => ({ writeClipboard: jest.fn() }));
jest.mock("@/features/overlays/openers/diffViewerWindow", () => ({ useOpenDiffViewerWindow: () => jest.fn() }));
jest.mock("@/utils/datetime", () => ({ formatRelativeTime: () => "an hour ago" }));

let fetchStatus: "list" | "full" = "full";
jest.mock("../redux/selectors", () => ({
  selectNoteContent: () => () => "saved body",
  selectNoteFetchStatus: () => () => fetchStatus,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) => selector({ userAuth: { id: "u1" } }),
}));

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("draft recovery hydration boundary (behaviour)", () => {
  beforeEach(() => {
    draftsVersion = -1;
    fetchStatus = "full";
    discard.mockClear();
  });

  it("renders nothing on the server snapshot, then offers the orphaned draft once the browser store publishes", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(<NoteDraftRecoveryBanner noteId="n1" onRestore={() => {}} />);
    });
    expect(host.textContent).toBe("");

    await act(async () => publish(1));
    await flush();
    expect(host.textContent).toContain("Unsaved text found");
    expect(discard).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("waits for the complete note before judging — a list-only record shows no banner", async () => {
    fetchStatus = "list";
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(<NoteDraftRecoveryBanner noteId="n1" onRestore={() => {}} />);
    });
    await act(async () => publish(1));
    await flush();
    expect(host.textContent).toBe("");
    await act(async () => root.unmount());
  });
});
