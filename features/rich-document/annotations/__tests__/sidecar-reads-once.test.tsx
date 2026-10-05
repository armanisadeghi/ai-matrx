/**
 * @jest-environment jsdom
 *
 * THE REMOUNT LAW FOR THE ANNOTATION SIDECAR — one source's comments, highlights and links are read
 * ONCE per tab and kept current by ONE pair of channels, however many views hold them.
 *
 * SUT: `useAnnotationSidecar` + `sidecarStore.ts`.
 * Breaks it catches: the sidecar reading `cmt_list` / `platform.associations` again on a remount
 * (a board tile waking from sleep, a Remove + Undo) or for a second view of the same note; a channel
 * per mount instead of per source; a change notice that no longer re-reads; an older read's answer
 * landing over a newer one; a source kept "current" after nothing watched it any more.
 *
 * Use case: a renovation punch-list note open in two places on a person's board while a site lead
 * comments on it from her phone.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  restoreHighlight: jest.fn(),
  restoreComment: jest.fn(),
  linkRecord: jest.fn(),
  unlinkRecord: jest.fn(),
  notifyMentions: jest.fn(),
  rewriteHighlightEdge: jest.fn(),
  saveHighlightNote: jest.fn(),
  canEditSource: jest.fn(async () => true),
};
jest.mock("../service", () => service);
const mockRealtime = { open: jest.fn(() => ({ close: jest.fn() })) as jest.Mock };
jest.mock("@ai-matrx/realtime/react", () => ({ useChannel: jest.fn(), useRealtimeManager: () => mockRealtime }));
jest.mock("@ai-matrx/realtime", () => ({
  defineChannelNamespace: (spec: { foreignTopic?: string; namespace: string; parts: string[] }) => ({
    topic: (parts: Record<string, string>) =>
      [spec.foreignTopic ?? `mx:${spec.namespace}`, ...spec.parts.map((k) => parts[k])].join(":"),
  }),
}));
jest.mock("@/features/scopes/host/associationsStore", () => ({
  getAssociationsStore: () => ({ titles: { fetch: async () => new Map() } }),
}));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({ tryGetEntityInfo: () => null }));
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "me" }));
jest.mock("@/lib/organizations/organizationRequiredError", () => ({ isOrganizationRequiredError: () => false }));
jest.mock("@ai-matrx/chat/host/org", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/org"),
  ...(() => ({ organizationRefusalMessage: () => "" }))(),
}));

import { useAnnotationSidecar } from "../useAnnotationSidecar";
import { SIDECAR_GRACE_MS } from "../sidecarStore";

const SOURCE = { token: "note", id: "punch-list-7", title: "Punch list", body: "Kitchen: re-caulk the sink.", contentVersion: 1 };

const comment = (id: string, body: string) => ({
  key: `comment:${id}`, kind: "comment", saveState: "confirmed", anchor: null,
  author: { id: "lead", name: "Dana" }, mine: false, createdAt: "2026-10-03T08:00:00Z",
  body, replies: [], commentId: id, version: 1,
});

function View({ label }: { label: string }) {
  const sidecar = useAnnotationSidecar(SOURCE);
  return (
    <p data-view={label}>
      {sidecar.state.loading ? "loading" : sidecar.state.items.map((i) => i.body).join(" | ")}
    </p>
  );
}

let container: HTMLDivElement;
let root: Root;
const reads = () => service.listCommentThreads.mock.calls.length;
const edgeReads = () => service.listEdgeItems.mock.calls.length;
const shown = (label: string) => container.querySelector(`[data-view="${label}"]`)?.textContent;
const commentSpec = () =>
  (mockRealtime.open.mock.calls.map((c) => c[0]) as Array<{ topic: string; postgresChanges?: Array<{ onChange: (e: unknown) => void }> }>)
    .filter((s) => s.postgresChanges)
    .at(-1)!;

async function flush(ms = 0) {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick"] });
  jest.clearAllMocks();
  service.listCommentThreads.mockResolvedValue({ items: [comment("c1", "Grout is cracked by the dishwasher.")], collaborationDoors: true });
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  act(() => (jest.requireActual("../sidecarStore") as typeof import("../sidecarStore")).resetSidecarStoreForTests());
  container.remove();
  jest.useRealTimers();
});

it("reads once for a remount and a second view, and opens one pair of channels for the source", async () => {
  await act(async () => root.render(<View label="tile" />));
  await flush();
  expect(shown("tile")).toBe("Grout is cracked by the dishwasher.");
  expect([reads(), edgeReads()]).toEqual([1, 1]);

  // Sleep and wake / Remove and Undo: the view's effects are torn down and run again.
  act(() => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<><View label="tile" /><View label="page" /></>));
  await flush();
  expect(shown("tile")).toBe("Grout is cracked by the dishwasher.");
  expect(shown("page")).toBe("Grout is cracked by the dishwasher.");
  expect([reads(), edgeReads()]).toEqual([1, 1]);
  // The comments channel and the delete/restore notice channel — once, not per view or per mount.
  expect(mockRealtime.open.mock.calls.map((c) => (c[0] as { topic: string }).topic)).toEqual([
    "mx:annotation-sidecar-comments:punch-list-7",
    "comments:note:punch-list-7",
  ]);
});

it("re-reads once when someone else comments, and every view shows it", async () => {
  await act(async () => root.render(<><View label="tile" /><View label="page" /></>));
  await flush();
  service.listCommentThreads.mockResolvedValue({
    items: [comment("c1", "Grout is cracked by the dishwasher."), comment("c2", "Tile arrives Thursday.")],
    collaborationDoors: true,
  });
  await act(async () => commentSpec().postgresChanges![0].onChange({ row: { id: "c2" }, payload: { eventType: "INSERT" } }));
  await flush(300);
  expect(reads()).toBe(2);
  expect(shown("tile")).toBe("Grout is cracked by the dishwasher. | Tile arrives Thursday.");
  expect(shown("page")).toBe("Grout is cracked by the dishwasher. | Tile arrives Thursday.");
});

it("drops an older read's answer that lands after a newer one", async () => {
  let answerFirst: (v: unknown) => void = () => {};
  service.listCommentThreads.mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve; }));
  await act(async () => root.render(<View label="tile" />));
  await flush();
  // A change notice asks again while the first read is still out; the second answers first.
  service.listCommentThreads.mockResolvedValueOnce({ items: [comment("c3", "Sink re-caulked.")], collaborationDoors: true });
  await act(async () => commentSpec().postgresChanges![0].onChange({ row: { id: "c3" }, payload: { eventType: "INSERT" } }));
  await flush(300);
  expect(shown("tile")).toBe("Sink re-caulked.");
  await act(async () => answerFirst({ items: [comment("c1", "Grout is cracked by the dishwasher.")], collaborationDoors: true }));
  await flush();
  expect(shown("tile")).toBe("Sink re-caulked.");
});

it("reads again once nothing watched the source past the grace", async () => {
  await act(async () => root.render(<View label="tile" />));
  await flush();
  act(() => root.unmount());
  await flush(SIDECAR_GRACE_MS + 1);
  root = createRoot(container);
  await act(async () => root.render(<View label="tile" />));
  await flush();
  expect(reads()).toBe(2);
});
