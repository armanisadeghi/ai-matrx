/**
 * @jest-environment jsdom
 *
 * RC-B11 low findings (coordinator round 2026-09-25), each failing on the code before this round:
 *   2. a long comment collapses past COMMENT_COLLAPSED_LINES with a keyboard-reachable "Show more";
 *   3. the author edits their own REPLY through the same compare-and-swap door, and an edited
 *      comment or reply says "edited" (from the door's edited_at, never from updated_at);
 *   4. "Report an issue" on a passage files the quote + anchor with the report.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
}

const service = {
  listCommentThreads: jest.fn(), listEdgeItems: jest.fn(), addComment: jest.fn(), editComment: jest.fn(),
  deleteComment: jest.fn(), resolveComment: jest.fn(), createHighlight: jest.fn(), deleteHighlight: jest.fn(),
  linkRecord: jest.fn(), unlinkRecord: jest.fn(), notifyMentions: jest.fn(), rewriteHighlightEdge: jest.fn(),
  saveHighlightNote: jest.fn(), mentionCandidates: jest.fn(async () => []), canEditSource: jest.fn(async () => true),
};
jest.mock("../service", () => service);
jest.mock("@ai-matrx/realtime/react", () => ({ useChannel: jest.fn() }));
jest.mock("@ai-matrx/realtime", () => ({ defineChannelNamespace: () => ({ topic: () => "t" }) }));
jest.mock("@/features/scopes/host/associationsStore", () => ({ getAssociationsStore: () => ({ titles: { fetch: async () => new Map() } }) }));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({ tryGetEntityInfo: () => null }));
jest.mock("@/features/scopes/service/associationCandidates", () => ({ searchCandidatesAcrossTokens: jest.fn(async () => []) }));
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "me" }));
jest.mock("@/lib/organizations/organizationRequiredError", () => ({ isOrganizationRequiredError: () => false }));
jest.mock("@/lib/organizations/organizationRefusalToast", () => ({ organizationRefusalMessage: () => "" }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({ EntityRef: () => null }));
jest.mock("@/components/rich-content/RichContent", () => ({ RichContent: ({ source }: { source: string }) => <span>{source}</span> }));
jest.mock("../LinkRecordSheet", () => ({ LinkRecordSheet: () => null }));

import { AnnotationSidecarProvider } from "../AnnotationSidecar";
import { AnnotationPanel } from "../AnnotationPanel";
import { describeSubject, subjectMetadata } from "@/features/window-panels/windows/feedback-subject";

const SOURCE = { token: "document", id: "doc-1", title: "Kiln", body: "Vent the kiln.", contentVersion: 1 };
const LONG = Array.from({ length: 40 }, (_, i) => `Step ${i + 1}: check the cone pack and log the reading.`).join("\n");

function thread(over: Record<string, unknown> = {}) {
  return {
    key: "comment:c1", kind: "comment", saveState: "confirmed", anchor: null, author: { id: "me", name: "You" },
    mine: true, createdAt: "2026-09-25T10:00:00Z", body: "Short.", replies: [], commentId: "c1", version: 3, ...over,
  };
}

let container: HTMLDivElement;
let root: Root;
const realScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
beforeAll(() => {
  // jsdom has no layout: a node's scrollHeight is its text lines × 20px.
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() { return ((this as HTMLElement).textContent ?? "").split("\n").length * 20; },
  });
  const real = window.getComputedStyle;
  jest.spyOn(window, "getComputedStyle").mockImplementation((el) => {
    const s = real(el);
    return { ...s, lineHeight: "20px", fontSize: "14px" } as CSSStyleDeclaration;
  });
});
afterAll(() => { if (realScrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", realScrollHeight); });
beforeEach(() => {
  jest.clearAllMocks();
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function mount() {
  await act(async () => {
    root.render(<AnnotationSidecarProvider source={SOURCE}><AnnotationPanel /></AnnotationSidecarProvider>);
  });
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const byText = (t: string) => [...container.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.trim() === t);

describe("2 — long comments collapse with a keyboard-reachable Show more", () => {
  it("collapses past the threshold and expands on Show more", async () => {
    service.listCommentThreads.mockResolvedValue({ items: [thread({ body: LONG })], collaborationDoors: true });
    await mount();
    const more = byText("Show more");
    expect(more).toBeTruthy();
    expect(more!.getAttribute("aria-expanded")).toBe("false");
    expect(more!.tagName).toBe("BUTTON");
    await act(async () => more!.click());
    const less = byText("Show less");
    expect(less?.getAttribute("aria-expanded")).toBe("true");
  });

  it("leaves a short comment alone", async () => {
    service.listCommentThreads.mockResolvedValue({ items: [thread()], collaborationDoors: true });
    await mount();
    expect(byText("Show more")).toBeUndefined();
  });
});

describe("3 — the author edits their own reply; edits are marked", () => {
  it("edits a reply through the same CAS door and shows 'edited'", async () => {
    service.listCommentThreads.mockResolvedValue({
      items: [thread({ replies: [{ id: "r1", body: "Yes for new valves", author: { id: "me", name: "You" }, createdAt: "2026-09-25T10:05:00Z", mine: true, version: 2, editedAt: "2026-09-25T10:06:00Z" }] })],
      collaborationDoors: true,
    });
    service.editComment.mockResolvedValue(3);
    await mount();
    expect(container.textContent).toContain("· edited");
    await act(async () => byText("Edit")!.click());
    const box = container.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Old valves need 15 seconds.");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => byText("Save")!.click());
    const [src, id, body, base] = service.editComment.mock.calls[0];
    expect(src.id).toBe("doc-1");
    expect(id).toBe("r1");
    expect(body).toBe("Old valves need 15 seconds.");
    expect(base).toEqual({ body: "Yes for new valves", version: 2 });
  });

  it("an unedited comment says nothing", async () => {
    service.listCommentThreads.mockResolvedValue({ items: [thread({ editedAt: null })], collaborationDoors: true });
    await mount();
    expect(container.textContent).not.toContain("edited");
  });
});

describe("4 — a passage report carries the quote and anchor", () => {
  it("files the passage readable and structured", () => {
    const anchor = { __kind: "text_anchor", content_version: 3, start: 10, end: 25, exact: "chart it in red" };
    const subject = { kind: "text_passage" as const, sourceToken: "note", sourceId: "g-1", sourceTitle: "Periodontal charting", quote: "chart it in red", anchor, href: "/education/study-guides/g-1" };
    expect(describeSubject(subject)).toContain('> chart it in red');
    expect(describeSubject(subject)).toContain("Periodontal charting");
    expect(subjectMetadata(subject)).toMatchObject({ source_token: "note", source_id: "g-1", quote: "chart it in red", anchor });
  });
});
