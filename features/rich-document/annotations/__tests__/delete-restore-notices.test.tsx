/**
 * @jest-environment jsdom
 *
 * RC-B11 × RC-A2g — a comment deleted or restored in another tab leaves or returns without a
 * reload. A soft delete is invisible to postgres_changes (RLS hides the row), so the database
 * broadcasts a notice on the private topic `comments:<entity_type>:<entity_id>` (ids only) and
 * the sidecar re-reads its thread; this tab's own delete is not re-read twice.
 *
 * Use case: a tutor removes a wrong comment on a study guide while the student has it open.
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
// Topics built the way the package builds a foreign topic: root + ":" + parts in order.
jest.mock("@ai-matrx/realtime", () => ({
  defineChannelNamespace: (spec: { foreignTopic?: string; namespace: string; parts: string[] }) => ({
    topic: (parts: Record<string, string>) => [spec.foreignTopic ?? `mx:${spec.namespace}`, ...spec.parts.map((k) => parts[k])].join(":"),
  }),
}));
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

const SOURCE = { token: "note", id: "guide-3", title: "Maps", body: "## Maps\n\nDot density maps.", contentVersion: 1 };
const thread = { key: "comment:c1", kind: "comment", saveState: "confirmed", anchor: null, author: { id: "me", name: "You" }, mine: true,
  createdAt: "2026-09-26T02:00:00Z", body: "Wrong unit here.", replies: [], commentId: "c1", version: 1 };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick"] });
  jest.clearAllMocks();
  service.listCommentThreads.mockResolvedValue({ items: [thread], collaborationDoors: true });
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  service.deleteComment.mockResolvedValue(undefined);
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
function noticeSpec() {
  const specs = (useChannel as jest.Mock).mock.calls.map((c) => c[0]).filter(Boolean);
  return specs.reverse().find((s: { topic: string }) => s.topic === "comments:note:guide-3");
}
async function mount() {
  await act(async () => {
    root.render(
      <AnnotationSidecarProvider source={SOURCE}>
        <AnnotatedContent><h2>Maps</h2><p>Dot density maps.</p></AnnotatedContent>
        <AnnotationPanel />
      </AnnotationSidecarProvider>,
    );
  });
  await flush();
}

it("joins the record's private notice topic and re-reads the thread on delete and restore", async () => {
  await mount();
  const spec = noticeSpec();
  expect(spec).toBeTruthy();
  expect(spec.private).toBe(true);
  expect(spec.wire).toEqual({ mode: "raw" });
  expect(spec.broadcast.map((b: { event: string }) => b.event).sort()).toEqual(["comment.deleted", "comment.restored"]);
  expect(spec.eventKey("broadcast", { id: "n-1" })).toBe("n-1");

  service.listCommentThreads.mockClear();
  service.listCommentThreads.mockResolvedValue({ items: [], collaborationDoors: true });
  const deleted = spec.broadcast.find((b: { event: string }) => b.event === "comment.deleted");
  await act(async () => deleted.onMessage({ data: { id: "n-1", comment_id: "c1", entity_type: "note", entity_id: "guide-3", op: "deleted", at: "t" } }));
  await flush();
  expect(service.listCommentThreads).toHaveBeenCalled();
  expect(container.textContent).not.toContain("Wrong unit here.");

  service.listCommentThreads.mockResolvedValue({ items: [thread], collaborationDoors: true });
  const restored = noticeSpec().broadcast.find((b: { event: string }) => b.event === "comment.restored");
  await act(async () => restored.onMessage({ data: { id: "n-2", comment_id: "c1", op: "restored" } }));
  await flush();
  expect(container.textContent).toContain("Wrong unit here.");
});

it("does not re-read for the notice of this tab's own delete", async () => {
  await mount();
  const more = container.querySelector<HTMLButtonElement>("button[aria-label='More']")!;
  await act(async () => { more.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 })); more.click(); });
  await flush();
  const del = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((m) => m.textContent?.trim() === "Delete")!;
  await act(async () => del.click());
  await flush();
  service.listCommentThreads.mockClear();
  const deleted = noticeSpec().broadcast.find((b: { event: string }) => b.event === "comment.deleted");
  await act(async () => deleted.onMessage({ data: { id: "n-3", comment_id: "c1", op: "deleted" } }));
  await flush();
  expect(service.listCommentThreads).not.toHaveBeenCalled();
});
