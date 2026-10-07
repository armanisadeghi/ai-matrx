/**
 * @jest-environment jsdom
 *
 * THE READING SET ON A SAVED RECORD (chair ruling 2026-09-26): notes and chat answers carry the
 * SAME sidecar the study guide uses, mounted ONCE (annotations/RecordAnnotations), anchored to the
 * record, with a Notes & comments dock placed the Google Docs way.
 *
 *   1. A saved record's content becomes an annotation zone of the one selection toolbar.
 *   2. Inside a host that already has a sidecar (the study guide), no second one is mounted.
 *   3. The dock never opens by itself: it opens on the person's own act (a comment) — as the
 *      record's `comment-thread` canvas tab (never a floating right panel), outside the content,
 *      so the content keeps its width — and the tab and the dock close together.
 *   8. Anything can open a record's threads in the canvas, focused on one thread; a record that is
 *      not rendered here still shows its canonical thread there.
 *   4. The ⋯ "Notes & comments" toggle is present only when the record holds something.
 *   5. Highlight and Private note are ABSENT on a kind with no annotates pair (a chat answer
 *      until its pairs exist) — never offered to refuse.
 *   6. Which record a ContentSource is: note, chat answer, saved working document; never raw.
 *
 * Use case: a site lead reads an assistant answer about scrap-yard intake and comments on the
 * sentence about weighing aluminum.
 */
import { noteIdentityContentSource } from "@/features/notes/richDocumentSource";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
}

const service = {
  listCommentThreads: jest.fn(),
  listEdgeItems: jest.fn(),
  annotationPairs: jest.fn(async () => ({ highlights: true, links: true })),
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
  canEditSource: jest.fn(async () => false),
};
jest.mock("../service", () => service);
// The sidecar's live half opens through the realtime manager, once per source (sidecarStore.ts).
const mockRealtime = { open: jest.fn(() => ({ close: jest.fn() })) as jest.Mock };
jest.mock("@ai-matrx/realtime/react", () => ({ useChannel: jest.fn(), useRealtimeManager: () => mockRealtime }));
jest.mock("@ai-matrx/realtime", () => ({ defineChannelNamespace: () => ({ topic: () => "t" }) }));
jest.mock("@/features/scopes/host/associationsStore", () => ({ getAssociationsStore: () => ({ titles: { fetch: async () => new Map() } }) }));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({ tryGetEntityInfo: () => ({}) }));
jest.mock("@/features/scopes/service/associationCandidates", () => ({ searchCandidatesAcrossTokens: jest.fn(async () => ({ results: [], failures: [] })) }));
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "me" }));
jest.mock("@/lib/organizations/organizationRequiredError", () => ({ isOrganizationRequiredError: () => false }));
jest.mock("@ai-matrx/chat/host/org", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/org"),
  ...(() => ({ organizationRefusalMessage: () => "" }))(),
}));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({ EntityRef: () => null }));
jest.mock("@ai-matrx/rich-content/levels/RichContent", () => ({ RichContent: ({ source }: { source: string }) => <span>{source}</span> }));
jest.mock("../LinkRecordSheet", () => ({ LinkRecordSheet: () => null }));
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));
jest.mock("@ai-matrx/associations/react", () => ({
  CommentThread: ({ token, id }: { token: string; id: string }) => <p data-standalone-thread={`${token}:${id}`}>thread</p>,
}));
// jsdom has no layout: the column's tab strip scrolls the active tab into view.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

import { RecordAnnotations } from "../RecordAnnotations";
import { AnnotationSidecarProvider, AnnotatedContent } from "../AnnotationSidecar";
import { zonesContaining } from "@ai-matrx/rich-content/selection-toolbar/selection-zones";
import { ANNOTATION_HOST_KEY, annotationSelectionProvider, type AnnotationSelectionHost } from "../annotation-actions";
import { dockStateFor, resetDocksForTest, toggleDockFor } from "../record-annotations-store";
import { CanvasColumn, CanvasProvider, registerCanvasKind, useCanvas } from "@ai-matrx/canvas/react";
import type { CanvasController } from "@ai-matrx/canvas";
import { COMMENT_THREAD_CANVAS_KIND, openCommentThread } from "../canvas/commentThreadKind";
import { annotationRecordOf } from "../record-of-source";
import type { AnnotationSidecarApi } from "../useAnnotationSidecar";

const BODY = "Weigh every inbound load of scrap aluminum before it reaches the baler.";
const ANSWER = { token: "message", id: "msg-1", title: "Chat answer", body: BODY, contentVersion: 1 };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  resetDocksForTest();
  service.listCommentThreads.mockResolvedValue({ items: [], collaborationDoors: true });
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  service.annotationPairs.mockImplementation(async () => ({ highlights: true, links: true }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => (jest.requireActual("../sidecarStore") as typeof import("../sidecarStore")).resetSidecarStoreForTests());
  act(() => root.unmount());
  container.remove();
});

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

registerCanvasKind(COMMENT_THREAD_CANVAS_KIND);
let canvas: CanvasController | null = null;
function CanvasProbe() {
  canvas = useCanvas();
  return null;
}

/** The answer in the page, beside the app's one canvas column. */
async function mountAnswer({ answer = true }: { answer?: boolean } = {}) {
  await act(async () => {
    root.render(
      <CanvasProvider persistence={null} hotkeys={false}>
        <CanvasProbe />
        <div data-testid="content">
          {answer ? (
            <RecordAnnotations record={ANSWER}>
              <p data-testid="answer">{BODY}</p>
            </RecordAnnotations>
          ) : null}
        </div>
        <CanvasColumn />
      </CanvasProvider>,
    );
  });
  await settle();
}
const THREAD_TAB = "comment-thread::message:msg-1";
const tabs = () => Object.keys(canvas!.getState().items);

const answerText = () => container.querySelector('[data-testid="answer"]')!.firstChild;
const annotationZones = (node: Node | null) => zonesContaining(node).filter((z) => ANNOTATION_HOST_KEY in (z.contribution.host ?? {}));
/** The live sidecar api, read the way the toolbar reads it: from the zone's annotation host. */
const api = (): AnnotationSidecarApi =>
  (annotationZones(answerText())[0].contribution.host![ANNOTATION_HOST_KEY] as AnnotationSelectionHost).api;
const dock = () => document.querySelector<HTMLElement>('[data-annotation-dock="message:msg-1"]');

it("1 — a saved record's content is an annotation zone anchored to that record", async () => {
  await mountAnswer();
  const zones = annotationZones(answerText());
  expect(zones).toHaveLength(1);
  expect(service.listCommentThreads).toHaveBeenCalledWith(expect.objectContaining({ token: "message", id: "msg-1" }));
});

it("2 — inside a host that already has a sidecar, no second one is mounted", async () => {
  const guide = { token: "note", id: "guide-1", title: "Intake guide", body: BODY, contentVersion: 2 };
  await act(async () => {
    root.render(
      <AnnotationSidecarProvider source={guide}>
        <AnnotatedContent>
          <RecordAnnotations record={ANSWER}>
            <p data-testid="answer">{BODY}</p>
          </RecordAnnotations>
        </AnnotatedContent>
      </AnnotationSidecarProvider>,
    );
  });
  await settle();
  expect(annotationZones(answerText())).toHaveLength(1);
  expect(service.listCommentThreads).not.toHaveBeenCalledWith(expect.objectContaining({ id: "msg-1" }));
});

it("3 — the dock opens on the person's own comment as the record's canvas tab, and closes with it", async () => {
  await mountAnswer();
  expect(dock()).toBeNull();
  expect(tabs()).toEqual([]);
  const content = container.querySelector('[data-testid="content"]')!;
  const before = content.innerHTML;
  service.addComment.mockResolvedValue({ id: "c1" });
  await act(async () => { await api().postComment({ body: "Which scale — the truck scale or the floor scale?", anchor: null }); });
  await settle();
  // One tab keyed by the record; the panel is inside it — never a fixed panel of its own.
  expect(tabs()).toEqual([THREAD_TAB]);
  const opened = dock();
  expect(opened).not.toBeNull();
  expect(opened!.closest(`[data-comment-thread-slot="${THREAD_TAB}"]`)).not.toBeNull();
  expect(document.querySelector(".fixed[data-annotation-dock]")).toBeNull();
  expect(content.contains(opened)).toBe(false);
  expect(content.innerHTML).toBe(before);

  // The person closes the tab: the dock closes.
  await act(async () => { canvas!.close(THREAD_TAB as never); });
  await settle();
  expect(dock()).toBeNull();
  expect(dockStateFor("message:msg-1")?.open).toBe(false);

  // The ⋯ toggle opens the same tab; toggling it off closes the tab too.
  await act(async () => toggleDockFor("message:msg-1"));
  await settle();
  expect(tabs()).toEqual([THREAD_TAB]);
  expect(dock()).not.toBeNull();
  await act(async () => toggleDockFor("message:msg-1"));
  await settle();
  expect(tabs()).toEqual([]);
});

it("8 — a receipt link opens the record's threads in the canvas, focused on the thread", async () => {
  service.listCommentThreads.mockResolvedValue({
    items: [
      { key: "comment:c1", kind: "comment", saveState: "confirmed", anchor: null, author: { id: "me", name: "You" }, mine: true, createdAt: "2026-09-26T10:00:00Z", body: "Truck scale or floor scale?", replies: [{ id: "r1", version: 1, body: "The truck scale.", author: { id: null, name: "Intake agent" }, createdAt: "2026-09-26T10:01:00Z", mine: false }], commentId: "c1", version: 1 },
      { key: "comment:c2", kind: "comment", saveState: "confirmed", anchor: null, author: { id: "me", name: "You" }, mine: true, createdAt: "2026-09-26T10:02:00Z", body: "Who signs the ticket?", replies: [], commentId: "c2", version: 1 },
    ],
    collaborationDoors: true,
  });
  await mountAnswer();
  // A reply's id brings its root's card forward.
  await act(async () => { openCommentThread(canvas, { entity: "message", id: "msg-1", title: "Chat answer", focus: "r1" }); });
  await settle();
  expect(tabs()).toEqual([THREAD_TAB]);
  expect(dockStateFor("message:msg-1")?.open).toBe(true);
  const card = (key: string) => dock()!.querySelector(`[data-annotation-key="${key}"]`);
  expect(card("comment:c1")?.getAttribute("aria-current")).toBe("true");
  expect(card("comment:c2")?.getAttribute("aria-current")).toBeNull();
});

it("9 — an agent's reply names the agent, with no Edit on its words", async () => {
  service.listCommentThreads.mockResolvedValue({
    items: [
      { key: "comment:c1", kind: "comment", saveState: "confirmed", anchor: null, author: { id: "me", name: "You" }, mine: true, createdAt: "2026-09-26T10:00:00Z", body: "Truck scale or floor scale?", replies: [{ id: "r1", version: 1, body: "The truck scale.", author: { id: "me", name: "Scrap Intake Advisor", agent: { id: "agent-intake", name: "Scrap Intake Advisor" } }, createdAt: "2026-09-26T10:01:00Z", mine: true }], commentId: "c1", version: 1 },
    ],
    collaborationDoors: true,
  });
  await mountAnswer();
  await act(async () => toggleDockFor("message:msg-1"));
  await settle();
  const reply = dock()!.querySelector('[data-agent-author="agent-intake"]');
  expect(reply?.textContent).toContain("Scrap Intake Advisor");
  const row = reply!.closest("div")!.parentElement!;
  const buttons = [...row.querySelectorAll("button")].map((b) => b.textContent);
  expect(buttons).not.toContain("Edit");
  expect(buttons).toContain("Delete");
});

it("8b — a record not rendered here still shows its canonical thread in the tab", async () => {
  await mountAnswer({ answer: false });
  await act(async () => { openCommentThread(canvas, { entity: "task", id: "task-9", title: "Ship pricing page" }); });
  await settle();
  expect(tabs()).toEqual(["comment-thread::task:task-9"]);
  expect(document.querySelector('[data-standalone-thread="task:task-9"]')).not.toBeNull();
});

it("4 — the ⋯ toggle is present only when the record holds something", async () => {
  await mountAnswer();
  expect(dockStateFor("message:msg-1")).toEqual({ count: 0, open: false });
  resetDocksForTest();
  service.listCommentThreads.mockResolvedValue({
    items: [{ key: "comment:c1", kind: "comment", saveState: "confirmed", anchor: null, author: { id: "me", name: "You" }, mine: true, createdAt: "2026-09-26T10:00:00Z", body: "Truck scale.", replies: [], commentId: "c1", version: 1 }],
    collaborationDoors: true,
  });
  act(() => root.unmount());
  // A fresh tab: the sidecar keeps a source's annotations for the tab (sidecarStore.ts), so a
  // remount alone renders the kept answer and reads nothing.
  act(() => (jest.requireActual("../sidecarStore") as typeof import("../sidecarStore")).resetSidecarStoreForTests());
  root = createRoot(container);
  await mountAnswer();
  expect(dockStateFor("message:msg-1")).toEqual({ count: 1, open: false });
});

it("5 — Highlight and Private note are absent on a kind with no annotates pair", async () => {
  service.annotationPairs.mockImplementation(async () => ({ highlights: false, links: false }));
  await mountAnswer();
  expect(api().state.capabilities.highlights).toBe(false);
  expect(api().state.capabilities.links).toBe(false);
  // The highlight actions ask the host's capability.
  const zone = annotationZones(answerText())[0];
  const host = zone.contribution.host![ANNOTATION_HOST_KEY] as AnnotationSelectionHost;
  const range = document.createRange();
  range.setStart(answerText()!, 0);
  range.setEnd(answerText()!, 5);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  const target = { kind: "selection", host: { [ANNOTATION_HOST_KEY]: host } } as never;
  const actions = await annotationSelectionProvider.actions(target);
  const highlight = actions.find((a) => a.id === "selection:highlight-yellow")!;
  expect(highlight.eligible?.(target)).toEqual({ status: "absent" });
});

it("6 — which saved record a ContentSource is", () => {
  expect(annotationRecordOf({ type: "chat-message", messageId: "263550e7-eb60-4e8e-97ee-e19297126ebe", conversationId: "c1" })).toMatchObject({ token: "message", id: "263550e7-eb60-4e8e-97ee-e19297126ebe", href: "/chat/c1" });
  expect(annotationRecordOf(noteIdentityContentSource("11111111-1111-4111-8111-111111111111", "s"))).toMatchObject({ token: "note", id: "11111111-1111-4111-8111-111111111111" });
  expect(annotationRecordOf({ type: "working-document", conversationId: "c1", kind: "working", documentId: "d1" })).toMatchObject({ token: "document", id: "d1" });
  expect(annotationRecordOf({ type: "working-document", conversationId: "c1", kind: "working", documentId: null })).toBeNull();
  expect(annotationRecordOf({ type: "raw" })).toBeNull();
});

it("7 — the ⋯ row finds the dock of a record the host names explicitly (the studio's raw source)", async () => {
  // The registry is mocked to capture the one registration (the real provider pulls the whole app).
  const registered: import("@ai-matrx/rich-content/rich-document/types").RichDocumentAction[] = [];
  jest.doMock("@ai-matrx/rich-content/rich-document/actions/provider", () => ({ registerAction: (a: import("@ai-matrx/rich-content/rich-document/types").RichDocumentAction) => registered.push(a) }));
  let store!: typeof import("../record-annotations-store");
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("../../actions/handlers/annotations");
    // The same module instance the handler reads.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    store = require("../record-annotations-store");
  });
  const { registerDock, setDockCount } = store;
  const action = registered.find((a) => a.id === "notes-and-comments")!;
  const ctx = { source: { type: "raw" }, callbacks: { annotationRecordKey: () => "document:kiln-log" } } as never;
  expect(action.visible!(ctx)).toBe(false);
  const off = registerDock("studio-preview", "document:kiln-log");
  setDockCount("studio-preview", 2);
  expect(action.visible!(ctx)).toBe(true);
  expect(typeof action.label === "function" ? action.label(ctx) : action.label).toBe("Notes & comments (2)");
  action.run(ctx);
  expect(store.dockStateFor("document:kiln-log")).toEqual({ count: 2, open: true });
  // No record named and none in the source: absent.
  expect(action.visible!({ source: { type: "raw" } } as never)).toBe(false);
  off();
});
