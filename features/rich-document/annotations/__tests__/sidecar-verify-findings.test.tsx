/**
 * @jest-environment jsdom
 *
 * RC-B11 — the verifier's findings (common-docs projects/rich-content-unification/evidence/
 * verify-RC-B11.md), each as a case that fails on the code the verifier tested:
 *
 *   F2  a Retry after a lost response reuses the SAME request id (and a landed write is found);
 *   F3  a failed reply / edit keeps the person's text on screen with the reason and Retry;
 *   F4  errors reach the person as plain sentences, never developer text;
 *   F5  Add → Comment puts the caret in the composer;
 *   F6  own echoes are recognised by write identity — the same person's other tab is delivered;
 *       an edit from a stale base is an honest conflict, never a silent overwrite;
 *   F7  Ctrl/Cmd+Alt+M after selecting text moves focus into the toolbar; arrows move within it.
 *
 * The UI runs for real (provider, hook, panel, toolbar, Radix menus); only the network edge
 * (service.ts calls, realtime channel, title reads) is replaced.
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
import { EditConflictError, humanError } from "../errors";
import { createEchoLedger, isOwnEcho } from "../echo";

const BODY = "## Kiln\n\nVent the kiln for the first two hours.";
const SOURCE = { token: "document", id: "doc-1", title: "Kiln", body: BODY, contentVersion: 1 };

function thread(over: Record<string, unknown> = {}) {
  return {
    key: "comment:c1", kind: "comment", saveState: "confirmed", anchor: null,
    author: { id: "me", name: "You" }, mine: true, createdAt: "2026-09-25T10:00:00Z",
    body: "Is two hours enough?", replies: [], commentId: "c1", version: 3, ...over,
  };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.clearAllMocks();
  service.listCommentThreads.mockResolvedValue({ items: [thread()], collaborationDoors: true });
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush(n = 6) {
  for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function mount() {
  await act(async () => {
    root.render(
      <AnnotationSidecarProvider source={SOURCE}>
        <AnnotatedContent><h2>Kiln</h2><p>Vent the kiln for the first two hours.</p></AnnotatedContent>
        <AnnotationPanel />
      </AnnotationSidecarProvider>,
    );
  });
  await flush();
}

const byText = (text: string, sel = "button") =>
  [...container.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent?.trim() === text);

async function typeInto(el: HTMLTextAreaElement, text: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(el: Element, key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

describe("F3 — a failed reply or edit keeps the text on screen with Retry", () => {
  it("keeps a failed reply's text, shows the reason, and offers Retry", async () => {
    service.addComment.mockRejectedValueOnce(humanError("posting your comment", Object.assign(new Error("503"), { status: 503 })));
    await mount();
    await act(async () => byText("Reply")!.click());
    const box = container.querySelector<HTMLTextAreaElement>("textarea")!;
    await typeInto(box, "Add fifteen minutes for thick pieces.");
    await act(async () => byText("Reply")!.click());
    await flush();
    const still = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(still?.value).toBe("Add fifteen minutes for thick pieces.");
    expect(container.textContent).toMatch(/couldn't reach the server/i);
    expect(byText("Retry")).toBeTruthy();
  });

  it("a Retry of that reply sends the SAME request id (F2 for replies)", async () => {
    service.addComment
      .mockRejectedValueOnce(humanError("posting your comment", new Error("Failed to fetch")))
      .mockResolvedValueOnce("r-1");
    await mount();
    await act(async () => byText("Reply")!.click());
    await typeInto(container.querySelector("textarea")!, "Checked.");
    await act(async () => byText("Reply")!.click());
    await flush();
    await act(async () => byText("Retry")!.click());
    await flush();
    const [first, second] = service.addComment.mock.calls.map((c) => c[0].clientRequestId);
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it("keeps the edit open with the text when saving fails", async () => {
    service.editComment.mockRejectedValueOnce(humanError("saving your edit", new Error("Failed to fetch")));
    await mount();
    const more = container.querySelector<HTMLElement>("button[aria-label='More']")!;
    await press(more, "Enter");
    await flush();
    const edit = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((m) => m.textContent === "Edit");
    expect(edit).toBeTruthy();
    await act(async () => edit!.click());
    await flush();
    const box = container.querySelector<HTMLTextAreaElement>("textarea")!;
    await typeInto(box, "Is two hours enough for stoneware?");
    await act(async () => byText("Save")!.click());
    await flush();
    expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Is two hours enough for stoneware?");
    expect(byText("Retry")).toBeTruthy();
  });
});

describe("F6 — an edit from a stale base is an honest conflict", () => {
  it("shows the other version and keeps mine, then replaces only when asked", async () => {
    service.editComment
      .mockRejectedValueOnce(new EditConflictError("Two hours is the minimum.", 4))
      .mockResolvedValueOnce(5);
    await mount();
    await press(container.querySelector("button[aria-label='More']")!, "Enter");
    await flush();
    await act(async () => [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((m) => m.textContent === "Edit")!.click());
    await flush();
    await typeInto(container.querySelector("textarea")!, "Three hours for thick pieces.");
    await act(async () => byText("Save")!.click());
    await flush();
    expect(container.textContent).toMatch(/Someone changed this comment while you were editing it/);
    expect(container.textContent).toContain("Two hours is the minimum.");
    expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Three hours for thick pieces.");
    expect(service.editComment).toHaveBeenCalledTimes(1);
    await act(async () => byText("Replace theirs with mine")!.click());
    await flush();
    const forced = service.editComment.mock.calls[1];
    expect(forced[2]).toBe("Three hours for thick pieces.");
    expect(forced[4]).toBe(true); // force only after the person chose it
  });
});

describe("F2 — a Retry of a failed top-level comment reuses its request id", () => {
  it("sends the same id on Retry", async () => {
    service.addComment
      .mockRejectedValueOnce(humanError("posting your comment", new Error("Failed to fetch")))
      .mockResolvedValueOnce("c-9");
    await mount();
    const add = byText("Add")!;
    await press(add, "Enter");
    await flush();
    await act(async () => [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((m) => /Comment on the document/.test(m.textContent ?? ""))!.click());
    await flush();
    const box = container.querySelector<HTMLTextAreaElement>("aside textarea")!;
    await typeInto(box, "Glaze shelf is cracked.");
    await press(box, "Enter");
    await flush();
    await act(async () => byText("Retry")!.click());
    await flush();
    const ids = service.addComment.mock.calls.map((c) => c[0].clientRequestId);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
  });
});

describe("F5 — the Add menu's composer takes focus", () => {
  it("puts the caret in the composer after Add → Comment", async () => {
    await mount();
    await press(byText("Add")!, "Enter");
    await flush();
    const item = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((m) => /Comment on the document/.test(m.textContent ?? ""))!;
    await press(item, "Enter");
    await flush(10);
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/Comment/);
  });
});

describe("F7 — keyboard path into the selection toolbar", () => {
  it("Ctrl+Alt+M after a selection focuses the toolbar; arrows move within it", async () => {
    await mount();
    const p = [...container.querySelectorAll("p")].find((x) => x.textContent?.includes("Vent the kiln"))!;
    await act(async () => {
      const t = p.firstChild as Text;
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, "Vent the kiln".length);
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    });
    await press(document.body, "m", { code: "KeyM", ctrlKey: true, altKey: true });
    await flush();
    const toolbar = document.querySelector("[role=toolbar][aria-label='Annotate the selected passage']")!;
    expect(toolbar).toBeTruthy();
    expect(toolbar.contains(document.activeElement)).toBe(true);
    const first = document.activeElement;
    await press(document.activeElement!, "ArrowDown");
    expect(document.activeElement).not.toBe(first);
    expect(toolbar.contains(document.activeElement)).toBe(true);
  });
});

describe("F4 — people read sentences, never developer text", () => {
  it.each([
    [{ code: "42501", message: "cmt_add: you cannot comment on this record (document/…)" }, /permission/i],
    [{ message: "association type is not a registered entity type (platform.entity_types) — add it to the registry + upgrade @ai-matrx/associations, never guess a token" }, /next app update/i],
    [new Error("Failed to fetch"), /Retry is safe/i],
    [{ code: "XX000", message: "relation \"x\" does not exist" }, /did not go through .*\(error XX000\)/i],
  ])("%#", (raw, expected) => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const e = humanError("posting your comment", raw);
    expect(e.message).toMatch(expected);
    expect(e.message).not.toMatch(/registry|@ai-matrx|platform\.|cmt_add|relation|entity_types/);
    spy.mockRestore();
  });
});

describe("F6 — own echoes by write identity, never by time", () => {
  it("delivers the same person's other tab and drops only this tab's own writes", () => {
    const ledger = createEchoLedger();
    ledger.createdRequestIds.add("req-A");
    ledger.writtenVersions.set("c1", 5);
    ledger.deletedIds.add("c2");
    expect(isOwnEcho("INSERT", { id: "n1", client_request_id: "req-A" }, ledger)).toBe(true);
    expect(isOwnEcho("INSERT", { id: "n2", client_request_id: "req-B" }, ledger)).toBe(false); // my other tab
    expect(isOwnEcho("UPDATE", { id: "c1", version: 5 }, ledger)).toBe(true);
    expect(isOwnEcho("UPDATE", { id: "c1", version: 6 }, ledger)).toBe(false); // edited elsewhere after mine
    expect(isOwnEcho("UPDATE", { id: "c3", version: 2 }, ledger)).toBe(false);
    expect(isOwnEcho("UPDATE", { id: "c2", deleted_at: "now" }, ledger)).toBe(true);
    expect(isOwnEcho("UPDATE", { id: "c1" }, ledger)).toBe(false); // no version (door not applied) → deliver
  });
});
