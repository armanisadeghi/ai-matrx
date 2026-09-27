/**
 * @jest-environment jsdom
 *
 * THE ONE SELECTION TOOLBAR — behaviour a person relies on, through the real
 * root, the real Alchemy registry + package selection layout, and the real
 * annotation sidecar (only the network edge is replaced):
 *
 *   • reading: a student selects "statistical" in her study guide and sees the
 *     reading set (five highlight colours, comment, suggest); a highlight
 *     saves through the sidecar exactly as before (createHighlight, quote kept);
 *   • editing: the same text inside an editable zone shows no highlight
 *     colours (the knob's default) but keeps Comment;
 *   • phone width: the toolbar docks at the bottom edge (never beside the
 *     selection, so it never fights the native selection menu);
 *   • keyboard: Ctrl+Alt+M focuses the first control, arrows move, Esc closes
 *     and focus returns to where it was.
 */

import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let phone = false;
window.matchMedia = ((q: string) => ({ matches: phone, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
}
if (!("randomUUID" in globalThis.crypto)) {
  let n = 0;
  (globalThis.crypto as unknown as { randomUUID: () => string }).randomUUID = () =>
    `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}
// jsdom has no layout: give ranges a box so the toolbar has somewhere to sit.
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => ({ left: 300, top: 400, bottom: 420, right: 380, width: 80, height: 20, x: 300, y: 400, toJSON() {} }) as DOMRect;
}

const service = {
  listCommentThreads: jest.fn(),
  listEdgeItems: jest.fn(),
  addComment: jest.fn(),
  editComment: jest.fn(),
  deleteComment: jest.fn(),
  resolveComment: jest.fn(),
  createHighlight: jest.fn(async () => ({ documentId: "d-1", edgeId: "e-1" })),
  deleteHighlight: jest.fn(),
  linkRecord: jest.fn(),
  unlinkRecord: jest.fn(),
  notifyMentions: jest.fn(),
  rewriteHighlightEdge: jest.fn(),
  saveHighlightNote: jest.fn(),
  mentionCandidates: jest.fn(async () => []),
  canEditSource: jest.fn(async () => true),
};
jest.mock("@/features/rich-document/annotations/service", () => service);
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
jest.mock("@/features/rich-document/annotations/LinkRecordSheet", () => ({ LinkRecordSheet: () => null }));
// The root's identity + knob reads (the knob answers "not loaded": the code default holds).
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({ useEffectiveKnob: () => undefined }));
// The frame is split out with next/dynamic in the app; here it loads synchronously.
jest.mock("next/dynamic", () => () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../SelectionToolbarFrame").default;
});

import { createActionRegistry } from "@ai-matrx/alchemy/actions";
import { AlchemyActionsProvider } from "@ai-matrx/alchemy/react/host";
import type { AlchemyHostPorts } from "@ai-matrx/alchemy/ports";
import { resolveAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { AnnotatedContent, AnnotationSidecarProvider, useSidecar } from "@/features/rich-document/annotations/AnnotationSidecar";
import { toast } from "@/lib/toast";
import { SelectionToolbarRoot } from "../SelectionToolbarRoot";
import { useSelectionZone } from "../selection-zones";

const BODY = "## Maps\n\nShades represent statistical data.";
const SOURCE = { token: "note", id: "guide-7", title: "Maps", body: BODY, contentVersion: 1 };

const ports = {
  icons: { resolve: resolveAlchemyIcon },
  diagnostics: { capture: jest.fn() },
  notify: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
} as unknown as AlchemyHostPorts;

/** An editable wrapper zone (what a rich editor registers). */
function EditableZone({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useSelectionZone(el, { editable: true });
  return <div ref={setEl}>{children}</div>;
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  phone = false;
  jest.clearAllMocks();
  service.listCommentThreads.mockResolvedValue({ items: [], collaborationDoors: true });
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.getSelection()?.removeAllRanges();
});

async function flush(n = 8) {
  for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

let sidecar: ReturnType<typeof useSidecar> | null = null;
function Grab() {
  sidecar = useSidecar();
  return null;
}

async function mount(editable = false) {
  const registry = createActionRegistry({ ports });
  const content = (
    <AnnotatedContent>
      <h2>Maps</h2>
      <p>Shades represent statistical data.</p>
    </AnnotatedContent>
  );
  await act(async () => {
    root.render(
      <AlchemyActionsProvider ports={ports} registry={registry}>
        <AnnotationSidecarProvider source={SOURCE}>
          <Grab />
          {editable ? <EditableZone>{content}</EditableZone> : content}
        </AnnotationSidecarProvider>
        <SelectionToolbarRoot />
      </AlchemyActionsProvider>,
    );
  });
  await flush();
}

async function selectWord(word: string, opts: { pointer?: boolean } = { pointer: true }) {
  const p = [...container.querySelectorAll("p")].find((x) => x.textContent?.includes(word))!;
  const t = p.firstChild as Text;
  const at = t.textContent!.indexOf(word);
  await act(async () => {
    const r = document.createRange();
    r.setStart(t, at);
    r.setEnd(t, at + word.length);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    document.dispatchEvent(new Event("selectionchange"));
    if (opts.pointer) document.dispatchEvent(Object.assign(new MouseEvent("pointerup", { bubbles: true, clientX: 320, clientY: 410 })));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  await flush();
}

const toolbar = () => document.querySelector<HTMLElement>("[data-selection-toolbar]");
const labels = () => [...(toolbar()?.querySelectorAll("button") ?? [])].map((b) => b.getAttribute("aria-label"));

it("reading: the reading set shows, and a highlight saves through the sidecar exactly as before", async () => {
  await mount();
  await selectWord("statistical");
  expect(toolbar()?.getAttribute("data-selection-toolbar")).toBe("floating");
  expect(toolbar()?.getAttribute("data-selection-mode")).toBe("read");
  expect(labels()).toEqual(expect.arrayContaining([
    "Highlight yellow", "Highlight green", "Highlight blue", "Highlight pink", "Highlight purple",
    "Comment", "Suggest an edit",
  ]));
  // Only ONE selection popup exists in the document.
  expect(document.querySelectorAll("[role=toolbar]").length).toBe(1);

  const yellow = toolbar()!.querySelector<HTMLButtonElement>("button[aria-label='Highlight yellow']")!;
  await act(async () => { yellow.click(); });
  await flush();
  expect(service.createHighlight).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(service.createHighlight.mock.calls[0])).toContain("statistical");
  expect(toolbar()).toBeNull();
});

it("editing: no highlight colours by default (the knob), Comment stays", async () => {
  await mount(true);
  await selectWord("statistical");
  expect(toolbar()?.getAttribute("data-selection-mode")).toBe("edit");
  expect(labels()).toContain("Comment");
  expect(labels()).not.toContain("Highlight yellow");
  expect(labels()).not.toContain("Suggest an edit");
});

it("phone: the toolbar docks at the bottom edge instead of sitting beside the selection", async () => {
  phone = true;
  await mount();
  await selectWord("statistical");
  const bar = toolbar()!;
  expect(bar.getAttribute("data-selection-toolbar")).toBe("docked");
  expect(bar.style.left).toBe("");
  expect(bar.style.bottom).toContain("safe-area-inset-bottom");
  expect(bar.className).toMatch(/inset-x-2/);
});

it("keyboard: Ctrl+Alt+M focuses the toolbar, arrows move, Esc closes and focus returns", async () => {
  await mount();
  const opener = document.createElement("button");
  opener.textContent = "before";
  container.appendChild(opener);
  opener.focus();
  await selectWord("statistical", { pointer: false });
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "m", code: "KeyM", ctrlKey: true, altKey: true, bubbles: true }));
  });
  await flush(20);
  const bar = toolbar()!;
  expect(bar.contains(document.activeElement)).toBe(true);
  const first = document.activeElement;
  await act(async () => {
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  expect(document.activeElement).not.toBe(first);
  expect(bar.contains(document.activeElement)).toBe(true);
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await flush();
  expect(toolbar()).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it("reattach: a pending reattach opens the toolbar straight into its question, and Reattach here completes it", async () => {
  service.listCommentThreads.mockResolvedValue({
    items: [{ key: "comment:c1", kind: "comment", saveState: "confirmed", anchor: null, author: { id: "me", name: "You" }, mine: true, createdAt: "2026-09-25T10:00:00Z", body: "Which data?", replies: [], commentId: "c1", version: 1 }],
    collaborationDoors: true,
  });
  await mount();
  await act(async () => sidecar!.setPendingReattach("comment:c1"));
  await selectWord("statistical");
  const panel = document.querySelector<HTMLElement>("[data-selection-panel]")!;
  expect(panel.textContent).toContain("Move this comment to the selected text?");
  const reattach = [...panel.querySelectorAll("button")].find((b) => b.textContent === "Reattach here")!;
  await act(async () => { reattach.click(); });
  await flush();
  expect(sidecar!.pendingReattach).toBeNull();
  expect(toolbar()).toBeNull();
  expect(toast.success).toHaveBeenCalledWith("Reattached to the new passage.");
});
