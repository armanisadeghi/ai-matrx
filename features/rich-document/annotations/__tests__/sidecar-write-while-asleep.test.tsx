/**
 * @jest-environment jsdom
 *
 * A WRITE NEVER WAITS FOR THE READ GATE. `live: false` holds a source's reads and live channel
 * (a chat answer scrolled out of view); it must never make a write a silent no-op.
 *
 * SUT: `useAnnotationSidecar(source, { live })`.
 * Break it catches (2026-10-03, Remarks verification): the chat host flips `live` on activity in the
 * same tick the comment is posted, the hook still held `source = null`, and `postComment` returned
 * null — the person's comment vanished with no row, no draft, no error, and no remark chip.
 *
 * Use case: a bakery owner comments on a passage of an older chat answer about where to keep daily sales.
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
jest.mock("@/lib/organizations/organizationRefusalToast", () => ({ organizationRefusalMessage: () => "" }));


import { useAnnotationSidecar } from "../useAnnotationSidecar";

const ANSWER = {
  token: "message",
  id: "answer-sqlite-vs-redis",
  title: "SQLite or Redis for daily sales",
  body: "SQLite is a lightweight, file-based relational database.",
  contentVersion: 1,
  conversationId: "bakery-chat",
};

let api: ReturnType<typeof useAnnotationSidecar> | null = null;
function Answer({ live }: { live: boolean }) {
  api = useAnnotationSidecar(ANSWER, { live });
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  service.listCommentThreads.mockResolvedValue({ items: [], collaborationDoors: true });
  service.listEdgeItems.mockResolvedValue({ highlights: [], links: [] });
  service.addComment.mockResolvedValue("comment-1");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  act(() => (jest.requireActual("../sidecarStore") as typeof import("../sidecarStore")).resetSidecarStoreForTests());
  container.remove();
});

it("holds the reads while asleep", async () => {
  await act(async () => root.render(<Answer live={false} />));
  expect(service.listCommentThreads).not.toHaveBeenCalled();
});

it("writes a comment posted while the source is asleep, and reports its id", async () => {
  await act(async () => root.render(<Answer live={false} />));
  const written = jest.fn();
  await act(async () => {
    await api!.postComment({
      body: "Our register is a tablet that sleeps at night. Does that change your pick?",
      anchor: null,
      onWritten: written,
    });
  });
  expect(service.addComment).toHaveBeenCalledTimes(1);
  expect(service.addComment.mock.calls[0][0]).toMatchObject({ source: { token: "message", id: "answer-sqlite-vs-redis" } });
  expect(written).toHaveBeenCalledWith("comment-1");
});
