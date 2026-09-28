/**
 * @jest-environment jsdom
 *
 * THE READING SET ON A SAVED RECORD (chair ruling 2026-09-26): notes and chat answers carry the
 * SAME sidecar the study guide uses, mounted ONCE (annotations/RecordAnnotations), anchored to the
 * record, with a Notes & comments dock placed the Google Docs way.
 *
 *   1. A saved record's content becomes an annotation zone of the one selection toolbar.
 *   2. Inside a host that already has a sidecar (the study guide), no second one is mounted.
 *   3. The dock never opens by itself: it opens on the person's own act (a comment) — floating,
 *      outside the content, so the content keeps its width — and closes from its own header.
 *   4. The ⋯ "Notes & comments" toggle is present only when the record holds something.
 *   5. Highlight and Private note are ABSENT on a kind with no annotates pair (a chat answer
 *      until its pairs exist) — never offered to refuse.
 *   6. Which record a ContentSource is: note, chat answer, saved working document; never raw.
 *
 * Use case: a site lead reads an assistant answer about scrap-yard intake and comments on the
 * sentence about weighing aluminum.
 */
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
jest.mock("@ai-matrx/realtime/react", () => ({ useChannel: jest.fn() }));
jest.mock("@ai-matrx/realtime", () => ({ defineChannelNamespace: () => ({ topic: () => "t" }) }));
jest.mock("@/features/scopes/host/associationsStore", () => ({ getAssociationsStore: () => ({ titles: { fetch: async () => new Map() } }) }));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({ tryGetEntityInfo: () => ({}) }));
jest.mock("@/features/scopes/service/associationCandidates", () => ({ searchCandidatesAcrossTokens: jest.fn(async () => ({ results: [], failures: [] })) }));
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "me" }));
jest.mock("@/lib/organizations/organizationRequiredError", () => ({ isOrganizationRequiredError: () => false }));
jest.mock("@/lib/organizations/organizationRefusalToast", () => ({ organizationRefusalMessage: () => "" }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({ EntityRef: () => null }));
jest.mock("@/components/rich-content/RichContent", () => ({ RichContent: ({ source }: { source: string }) => <span>{source}</span> }));
jest.mock("../LinkRecordSheet", () => ({ LinkRecordSheet: () => null }));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { RecordAnnotations } from "../RecordAnnotations";
import { AnnotationSidecarProvider, AnnotatedContent } from "../AnnotationSidecar";
import { zonesContaining } from "@/components/selection-toolbar/selection-zones";
import { ANNOTATION_HOST_KEY, annotationSelectionProvider, type AnnotationSelectionHost } from "../annotation-actions";
import { dockStateFor, resetDocksForTest } from "../record-annotations-store";
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
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function mountAnswer() {
  await act(async () => {
    root.render(
      <RecordAnnotations record={ANSWER}>
        <p data-testid="answer">{BODY}</p>
      </RecordAnnotations>,
    );
  });
  await settle();
}

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

it("3 — the dock opens on the person's own comment, floats outside the content, and closes from its header", async () => {
  await mountAnswer();
  expect(dock()).toBeNull();
  const before = container.innerHTML;
  service.addComment.mockResolvedValue({ id: "c1" });
  await act(async () => { await api().postComment({ body: "Which scale — the truck scale or the floor scale?", anchor: null }); });
  await settle();
  const opened = dock();
  expect(opened).not.toBeNull();
  // Floating: portaled out of the content, fixed — the content keeps its width.
  expect(container.contains(opened)).toBe(false);
  expect(opened!.className).toContain("fixed");
  expect(container.innerHTML).toBe(before);
  const close = opened!.querySelector<HTMLButtonElement>('button[aria-label="Close notes and comments"]')!;
  await act(async () => close.click());
  expect(dock()).toBeNull();
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
  expect(annotationRecordOf({ type: "chat-message", messageId: "m1", conversationId: "c1" })).toMatchObject({ token: "message", id: "m1", href: "/chat/c1" });
  expect(annotationRecordOf({ type: "note", mode: "identity", noteId: "n1", sourceId: "s" })).toMatchObject({ token: "note", id: "n1" });
  expect(annotationRecordOf({ type: "working-document", conversationId: "c1", kind: "working", documentId: "d1" })).toMatchObject({ token: "document", id: "d1" });
  expect(annotationRecordOf({ type: "working-document", conversationId: "c1", kind: "working", documentId: null })).toBeNull();
  expect(annotationRecordOf({ type: "raw" })).toBeNull();
});

it("7 — the ⋯ row finds the dock of a record the host names explicitly (the studio's raw source)", async () => {
  // The registry is mocked to capture the one registration (the real provider pulls the whole app).
  const registered: import("../../types").RichDocumentAction[] = [];
  jest.doMock("../../actions/provider", () => ({ registerAction: (a: import("../../types").RichDocumentAction) => registered.push(a) }));
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
