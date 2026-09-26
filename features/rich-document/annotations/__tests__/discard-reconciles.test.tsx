/**
 * @jest-environment jsdom
 *
 * RC-B11 verify round 2, finding 2 — DISCARD RECONCILES WITH THE SERVER. A highlight whose save
 * landed but whose answer was lost showed "Not saved"; Discard only forgot the draft, and the
 * highlight came back on reload. Discard now finds the landed row by the draft's own client request
 * id and removes it (soft delete); a draft that never landed simply goes.
 *
 * Use case: a student on a train highlights "statistical", the answer is lost, she discards it.
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

import { AnnotatedContent, AnnotationSidecarProvider, useSidecar } from "../AnnotationSidecar";
import { AnnotationPanel } from "../AnnotationPanel";
import { humanError } from "../errors";
import { buildTextAnchor } from "../anchor";

const BODY = "## Maps\n\nShades represent statistical data.";
const anchor = buildTextAnchor(BODY, BODY.indexOf("statistical"), BODY.indexOf("statistical") + 11, 1);
const SOURCE = { token: "note", id: "guide-6", title: "Maps", body: BODY, contentVersion: 1 };
const lost = () => humanError("saving", Object.assign(new Error("504"), { status: 504 }));

let container: HTMLDivElement;
let root: Root;
let sidecar: ReturnType<typeof useSidecar> | null = null;
function Grab() { sidecar = useSidecar(); return null; }
beforeEach(() => {
  jest.clearAllMocks();
  service.listCommentThreads.mockResolvedValue({ items: [], collaborationDoors: true });
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  service.deleteHighlight.mockResolvedValue(undefined);
  service.deleteComment.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function flush() { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
async function mount() {
  await act(async () => {
    root.render(
      <AnnotationSidecarProvider source={SOURCE}>
        <Grab />
        <AnnotatedContent><h2>Maps</h2><p>Shades represent statistical data.</p></AnnotatedContent>
        <AnnotationPanel />
      </AnnotationSidecarProvider>,
    );
  });
  await flush();
}
const discard = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Discard")!;

it("discarding a highlight whose save may have landed removes the landed row by its request id", async () => {
  service.createHighlight.mockRejectedValue(lost());
  await mount();
  await act(async () => { await sidecar!.api.addHighlight(anchor, "yellow"); });
  await flush();
  const requestId = (service.createHighlight.mock.calls[0][0] as { clientRequestId: string }).clientRequestId;
  await act(async () => discard().click());
  await flush();
  expect(service.deleteHighlight).toHaveBeenCalledWith(requestId);
  expect(container.textContent).not.toContain("Not saved");
});

it("discarding a comment whose create landed soft-deletes the landed comment", async () => {
  service.addComment.mockRejectedValue(lost());
  await mount();
  await act(async () => { await sidecar!.api.postComment({ body: "Per shift?", anchor }); });
  await flush();
  const requestId = (service.addComment.mock.calls[0][0] as { clientRequestId: string }).clientRequestId;
  service.listCommentThreads.mockResolvedValueOnce({
    items: [{ key: "comment:c9", kind: "comment", saveState: "confirmed", anchor, author: { id: "me", name: "You" }, mine: true,
      createdAt: "2026-09-26T02:00:00Z", body: "Per shift?", replies: [], commentId: "c9", clientRequestId: requestId }],
    collaborationDoors: true,
  });
  await act(async () => discard().click());
  await flush();
  expect(service.deleteComment).toHaveBeenCalledWith("c9");
});
