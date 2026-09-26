/**
 * @jest-environment jsdom
 *
 * RC-B11 — A FAILED SAVE NEVER LIES (Arman on production, 2026-09-25: a highlight and a passage
 * comment both said "Something went wrong while saving. Retry…" when the real cause was the
 * switched-off passage gate — which Retry can never get past).
 *
 *   1. the passage gate reaches the person as ITS sentence (what, why, text kept), not a generic one;
 *   2. a refusal Retry cannot change offers no Retry — and a passage comment offers the real
 *      remedy: the same words posted on the whole document;
 *   3. an unrecognised error is NAMED by its code, never "something went wrong" (the server's own
 *      words stay in the console record and copy-for-AI — verify-RC-B11 F4).
 *
 * Use case: a nursing student comments "occurrences — is this per shift?" on a passage of her
 * study guide while passage saving is switched off.
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

import { AnnotatedContent, AnnotationSidecarProvider, useSidecar } from "../AnnotationSidecar";
import { AnnotationPanel } from "../AnnotationPanel";
import { SidecarError, humanError } from "../errors";
import { ANCHOR_WRITES_OFF_SENTENCE } from "../constants";
import { buildTextAnchor } from "../anchor";

const BODY = "## Charting\n\nCount the occurrences of each symptom per shift.";
const SOURCE = { token: "note", id: "guide-1", title: "Charting", body: BODY, contentVersion: 1 };
const anchor = buildTextAnchor(BODY, BODY.indexOf("occurrences"), BODY.indexOf("occurrences") + 11, 1);
const DRAFT = "occurrences — is this per shift or per day?";

let container: HTMLDivElement;
let root: Root;
let sidecar: ReturnType<typeof useSidecar> | null = null;
function Grab() {
  sidecar = useSidecar();
  return null;
}
beforeEach(() => {
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
});
async function flush(n = 6) {
  for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
async function mount() {
  await act(async () => {
    root.render(
      <AnnotationSidecarProvider source={SOURCE}>
        <Grab />
        <AnnotatedContent><h2>Charting</h2><p>Count the occurrences of each symptom per shift.</p></AnnotatedContent>
        <AnnotationPanel />
      </AnnotationSidecarProvider>,
    );
  });
  await flush();
}
const byText = (text: string) => [...container.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.trim() === text);

describe("a failed save says what happened and offers only remedies that work", () => {
  it("the passage gate is its own sentence and cannot be retried", () => {
    const gate = new SidecarError(ANCHOR_WRITES_OFF_SENTENCE, undefined, false);
    const h = humanError("saving", gate);
    expect(h.message).toBe(ANCHOR_WRITES_OFF_SENTENCE);
    expect(h.retryable).toBe(false);
  });

  it("an unrecognised failure is named, never 'something went wrong'", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const h = humanError("saving", { message: "column \"client_request_id\" does not exist", code: "42703" });
    expect(h.message).not.toMatch(/something went wrong/i);
    expect(h.message).toMatch(/did not go through .*\(error 42703\)/);
    expect(h.message).not.toContain("client_request_id"); // developer text stays out (F4)
    expect(h.retryable).toBe(true);
  });

  it("a link kind nobody registered says so in words and offers no Retry (verifier finding)", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const raw = {
      code: "internal",
      message: "Unknown association type: conversation -> note (label: anchored_to). Register it in platform.association_types first.",
      detail: { code: "23514", message: "Unknown association type: conversation -> note (label: anchored_to). Register it in platform.association_types first." },
    };
    const h = humanError("linking the record", raw);
    expect(h.message).toMatch(/^Linking a conversation to a note isn't set up yet/);
    expect(h.message).not.toMatch(/error internal|text changed|platform\./);
    expect(h.retryable).toBe(false);
  });

  it("a gated passage comment keeps the words, offers no Retry, and posts on the whole document", async () => {
    service.addComment.mockImplementation(async (input: { anchor?: unknown }) => {
      if (input.anchor) throw new SidecarError(ANCHOR_WRITES_OFF_SENTENCE, undefined, false);
      return "c-9";
    });
    await mount();
    await act(async () => { await sidecar!.api.postComment({ body: DRAFT, anchor }); });
    await flush();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(ANCHOR_WRITES_OFF_SENTENCE);
    expect(container.textContent).toContain(DRAFT);
    expect(byText("Retry")).toBeUndefined();
    const whole = byText("Post on the whole document");
    expect(whole).toBeTruthy();
    await act(async () => whole!.click());
    await flush();
    const last = service.addComment.mock.calls.at(-1)![0] as { anchor?: unknown; body: string };
    expect(last.anchor ?? null).toBeNull();
    expect(last.body).toBe(DRAFT);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("a transport failure still offers Retry", async () => {
    service.addComment.mockRejectedValue(humanError("saving", Object.assign(new Error("503"), { status: 503 })));
    await mount();
    await act(async () => { await sidecar!.api.postComment({ body: DRAFT, anchor: null }); });
    await flush();
    expect(byText("Retry")).toBeTruthy();
  });
});
