/**
 * @jest-environment jsdom
 *
 * RC-B11 — AN EDIT IS JUDGED AGAINST THE TEXT IT STARTED FROM (localhost walk 2026-09-26, two tabs
 * as admin@admin.com: tab B saved first, realtime reloaded tab A's thread underneath its open
 * editor, and tab A's stale save went through as version 3 — a silent overwrite).
 *
 * The compare-and-swap base (body + version) is frozen when the editor OPENS; a reload while it
 * is open never moves it, so the door refuses the stale save and the person sees both texts.
 *
 * Use case: two tutors editing the same comment on "Graduated Symbol Map" in a study guide.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
}
if (!("randomUUID" in globalThis.crypto)) {
  let n = 0;
  (globalThis.crypto as unknown as { randomUUID: () => string }).randomUUID = () =>
    `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

const service = {
  listCommentThreads: jest.fn(),
  listEdgeItems: jest.fn(),
  addComment: jest.fn(),
  editComment: jest.fn(),
  deleteComment: jest.fn(),
  resolveComment: jest.fn(),
  createHighlight: jest.fn(),
  deleteHighlight: jest.fn(),
  linkRecord: jest.fn(),
  unlinkRecord: jest.fn(),
  notifyMentions: jest.fn(),
  rewriteHighlightEdge: jest.fn(),
  saveHighlightNote: jest.fn(),
  mentionCandidates: jest.fn(async () => []),
};
jest.mock("../service", () => service);
jest.mock("@ai-matrx/realtime/react", () => ({ useChannel: jest.fn() }));
jest.mock("@ai-matrx/realtime", () => ({ defineChannelNamespace: () => ({ topic: () => "t" }) }));
jest.mock("@/features/scopes/host/associationsStore", () => ({
  getAssociationsStore: () => ({ titles: { fetch: async () => new Map() } }),
}));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({ tryGetEntityInfo: () => null }));
jest.mock("@/features/scopes/service/associationCandidates", () => ({ searchCandidatesAcrossTokens: jest.fn(async () => []) }));
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "me" }));
jest.mock("@/lib/organizations/organizationRequiredError", () => ({ isOrganizationRequiredError: () => false }));
jest.mock("@/lib/organizations/organizationRefusalToast", () => ({ organizationRefusalMessage: () => "" }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({ EntityRef: () => null }));
jest.mock("@/components/rich-content/RichContent", () => ({ RichContent: ({ source }: { source: string }) => <span>{source}</span> }));
jest.mock("../LinkRecordSheet", () => ({ LinkRecordSheet: () => null }));

import { AnnotatedContent, AnnotationSidecarProvider } from "../AnnotationSidecar";
import { AnnotationPanel } from "../AnnotationPanel";
import { useChannel } from "@ai-matrx/realtime/react";

const BODY = "## Maps\n\nA graduated symbol map changes the size of a symbol.";
const SOURCE = { token: "note", id: "guide-2", title: "Maps", body: BODY, contentVersion: 1 };
const thread = (body: string, version: number) => ({
  key: "comment:c1", kind: "comment", saveState: "confirmed", anchor: null,
  author: { id: "me", name: "You" }, mine: true, createdAt: "2026-09-26T02:00:00Z",
  body, replies: [], commentId: "c1", version,
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick"] });
  jest.clearAllMocks();
  service.listCommentThreads.mockResolvedValue({ items: [thread("Size = magnitude?", 3)], collaborationDoors: true });
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  service.editComment.mockResolvedValue(4);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});
async function flush(n = 6) {
  for (let i = 0; i < n; i++) await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); await Promise.resolve(); });
}
const byText = (text: string, sel = "button, [role=menuitem]") =>
  [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent?.trim() === text);

it("a realtime reload while the editor is open does not move the edit's base version", async () => {
  await act(async () => {
    root.render(
      <AnnotationSidecarProvider source={SOURCE}>
        <AnnotatedContent><h2>Maps</h2><p>A graduated symbol map changes the size of a symbol.</p></AnnotatedContent>
        <AnnotationPanel />
      </AnnotationSidecarProvider>,
    );
  });
  await flush();
  // Open the editor on version 3.
  const more = container.querySelector<HTMLButtonElement>("button[aria-label='More']")!;
  await act(async () => {
    more.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }));
    more.click();
  });
  await flush();
  await act(async () => byText("Edit")!.click());
  await flush();
  expect(container.querySelector("textarea")).not.toBeNull();

  // Someone else saves: realtime delivers, the thread reloads at version 4 with their text.
  service.listCommentThreads.mockResolvedValue({ items: [thread("Size shows magnitude.", 4)], collaborationDoors: true });
  const cfg = (useChannel as jest.Mock).mock.calls.map((c) => c[0]).filter((s) => s?.postgresChanges).at(-1);
  await act(async () => cfg.postgresChanges[0].onChange({ row: { id: "c1", version: 4 }, payload: { eventType: "UPDATE" } }));
  await flush();

  // My save is judged against version 3 — what I started from.
  const box = container.querySelector<HTMLTextAreaElement>("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Symbol size = data magnitude.");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => byText("Save", "button")!.click());
  await flush();
  expect(service.editComment).toHaveBeenCalled();
  const [, , , base] = service.editComment.mock.calls.at(-1)!;
  expect(base).toEqual({ body: "Size = magnitude?", version: 3 });
});
