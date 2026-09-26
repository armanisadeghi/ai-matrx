/**
 * @jest-environment jsdom
 *
 * RC-B11 verify round 2, finding 3 — PHONE WIDTH. The selection toolbar was a positioned popover
 * whose "Highlight" label wrapped a letter per line and whose menu ran off-screen. On a phone it is a
 * full-width bottom sheet above the home indicator, scrolling inside itself; labels never wrap.
 *
 * Use case: a student on an iPhone selects "statistical" in her study guide to highlight it.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.matchMedia !== "function") {
  // PHONE width for this whole file.
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
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
import { buildTextAnchor } from "../anchor";

const BODY = "## Maps\n\nShades represent statistical data.";
const SOURCE = { token: "note", id: "guide-7", title: "Maps", body: BODY, contentVersion: 1 };
let sidecar: ReturnType<typeof useSidecar> | null = null;
function Grab() { sidecar = useSidecar(); return null; }

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  service.listCommentThreads.mockResolvedValue({ items: [], collaborationDoors: true });
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it("the selection toolbar is a bottom sheet on a phone, with a label that never wraps", async () => {
  await act(async () => {
    root.render(
      <AnnotationSidecarProvider source={SOURCE}>
        <Grab />
        <AnnotatedContent><h2>Maps</h2><p>Shades represent statistical data.</p></AnnotatedContent>
      </AnnotationSidecarProvider>,
    );
  });
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const anchor = buildTextAnchor(BODY, BODY.indexOf("statistical"), BODY.indexOf("statistical") + 11, 1);
  await act(async () => sidecar!.setSelection({ anchor, rect: { left: 300, top: 400, bottom: 420, width: 80 } }));
  const bar = document.querySelector<HTMLElement>("[role=toolbar][aria-label='Annotate the selected passage']")!;
  expect(bar).not.toBeNull();
  expect(bar.getAttribute("data-annotation-toolbar")).toBe("sheet");
  expect(bar.style.left).toBe("");
  expect(bar.className).toMatch(/inset-x-0/);
  expect(bar.className).toMatch(/bottom-0/);
  expect(bar.className).toMatch(/pb-safe/);
  const label = [...bar.querySelectorAll("span")].find((s) => s.textContent === "Highlight")!;
  expect(label.className).toMatch(/whitespace-nowrap/);
});
