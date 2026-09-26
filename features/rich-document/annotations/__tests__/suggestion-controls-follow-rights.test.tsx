/**
 * @jest-environment jsdom
 *
 * RC-B11 verify round 2, finding 1 — SUGGESTION CONTROLS FOLLOW THE PERSON'S REAL RIGHTS.
 * A commenter saw Accept/Reject on someone else's suggestion and Accept failed silently. Accept
 * and Reject change what the record says, so they appear only for someone who can EDIT the record
 * (door law); Reject keeps the suggestion (resolved), never deletes it.
 *
 * Use case: a tutor (editor) and a classmate (commenter) on the same study guide; the classmate's
 * suggestion "frequency → count" is decided by the tutor.
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
  canEditSource: jest.fn(async () => true),
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
import { buildTextAnchor } from "../anchor";

const BODY = "## Maps\n\nDots mark the frequency of a phenomenon.";
const anchor = buildTextAnchor(BODY, BODY.indexOf("frequency"), BODY.indexOf("frequency") + 9, 3);
const SOURCE = { token: "note", id: "guide-5", title: "Maps", body: BODY, contentVersion: 3, save: jest.fn(async () => {}) };
const suggestion = { key: "comment:s1", kind: "suggestion", saveState: "confirmed", anchor, suggestedText: "count",
  author: { id: "someone-else", name: "Classmate" }, mine: false, createdAt: "2026-09-26T02:00:00Z",
  body: "clearer", replies: [], commentId: "s1", version: 1 };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.clearAllMocks();
  service.listCommentThreads.mockResolvedValue({ items: [suggestion], collaborationDoors: true });
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function mount() {
  await act(async () => {
    root.render(
      <AnnotationSidecarProvider source={SOURCE}>
        <AnnotatedContent><h2>Maps</h2><p>Dots mark the frequency of a phenomenon.</p></AnnotatedContent>
        <AnnotationPanel />
      </AnnotationSidecarProvider>,
    );
  });
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const buttons = () => [...container.querySelectorAll("button")].map((b) => b.textContent?.trim());

it("a commenter who cannot edit the record sees no Accept or Reject", async () => {
  service.canEditSource.mockResolvedValue(false);
  await mount();
  expect(container.textContent).toContain("clearer");
  expect(buttons()).not.toContain("Accept");
  expect(buttons()).not.toContain("Reject");
});

it("an editor sees both, and Reject keeps the suggestion (resolved), never deletes it", async () => {
  service.canEditSource.mockResolvedValue(true);
  service.resolveComment.mockResolvedValue(undefined);
  await mount();
  expect(buttons()).toContain("Accept");
  const reject = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Reject")!;
  await act(async () => reject.click());
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(service.resolveComment).toHaveBeenCalledWith("s1", true);
  expect(service.deleteComment).not.toHaveBeenCalled();
});
