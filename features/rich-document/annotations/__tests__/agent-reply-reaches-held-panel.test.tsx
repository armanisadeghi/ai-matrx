/**
 * @jest-environment jsdom
 *
 * AN AGENT'S THREAD REPLY REACHES THE OPEN PANEL EVEN WHEN REALTIME DROPS THE INSERT.
 *
 * Live 2026-10-08: Arman's comment c2 on a chat answer was answered by the agent through
 * `comment_reply`; the reply row was written (platform.comments, parent = c2's comment, signed by
 * the agent) and cmt_list returns it — but the comments panel never showed it. Supabase realtime
 * logged `PoolingReplicationError` 0.6 s after the insert, so the postgres_changes INSERT was lost,
 * and the kept "fresh" snapshot was never read again. The panel must not depend on realtime alone
 * for a write the chat itself announces: the comment_reply receipt tells every kept view of that
 * record to read again.
 *
 * SUT: `sidecarStore.refreshRecordThreads` + `useAnnotationSidecar`.
 * Use case: a plant-care answer; the person asked "why drainage holes?" on a passage and the
 * General Chat agent answered in that thread.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const service = {
  listCommentThreads: jest.fn(),
  listEdgeItems: jest.fn(async () => ({ highlights: [], links: [] })),
  annotationPairs: jest.fn(async () => ({ highlights: true, links: true })),
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
import { refreshRecordThreads, resetSidecarStoreForTests } from "../sidecarStore";

const SOURCE = { token: "message", id: "answer-1", title: "Chat answer", body: "Use pots with drainage holes.", contentVersion: 1 };

const root = (replies: unknown[]) => ({
  key: "comment:c-root", kind: "comment", saveState: "confirmed", anchor: null,
  author: { id: "me", name: "Arman" }, mine: true, createdAt: "2026-10-08T16:47:26Z",
  body: "Why do drainage holes matter?", replies, commentId: "c-root", version: 1,
});
const agentReply = {
  id: "c-reply", body: "Even careful watering pools at the bottom.", createdAt: "2026-10-08T16:48:08Z", mine: true,
  author: { id: "me", name: "General Chat", avatarUrl: null, agent: { id: "agent-1", name: "General Chat" } }, version: 1,
};

function View() {
  const sidecar = useAnnotationSidecar(SOURCE);
  const item = sidecar.state.items[0];
  return <p>{sidecar.state.loading ? "loading" : item ? `${item.body} / ${item.replies.map((r) => `${r.author.name}: ${r.body}`).join(" | ")}` : "empty"}</p>;
}

let host: HTMLDivElement;
let r: Root;
beforeEach(() => {
  jest.useFakeTimers();
  resetSidecarStoreForTests();
  service.listCommentThreads.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  r = createRoot(host);
});
afterEach(() => {
  act(() => r.unmount());
  host.remove();
  jest.useRealTimers();
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
};

it("the receipt's thread re-reads a held panel: the agent's reply shows, under the agent's name", async () => {
  service.listCommentThreads.mockResolvedValueOnce({ items: [root([])], collaborationDoors: true });
  act(() => r.render(<View />));
  await flush();
  expect(host.textContent).toBe("Why do drainage holes matter? / ");

  // The reply is written server-side; realtime delivers NOTHING (no onChange call).
  service.listCommentThreads.mockResolvedValueOnce({ items: [root([agentReply])], collaborationDoors: true });
  refreshRecordThreads("message", "answer-1");
  await act(async () => { jest.advanceTimersByTime(300); });
  await flush();

  expect(service.listCommentThreads).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("General Chat: Even careful watering pools at the bottom.");
});

it("another record's receipt never re-reads this one", async () => {
  service.listCommentThreads.mockResolvedValue({ items: [root([])], collaborationDoors: true });
  act(() => r.render(<View />));
  await flush();
  refreshRecordThreads("message", "answer-2");
  await act(async () => { jest.advanceTimersByTime(300); });
  await flush();
  expect(service.listCommentThreads).toHaveBeenCalledTimes(1);
});
