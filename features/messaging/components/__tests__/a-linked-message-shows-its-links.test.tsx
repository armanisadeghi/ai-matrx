/**
 * AGENTS-ON-DATA item 4 — the seventh surface. "Link a record…" on a message wrote the link and
 * nothing showed it. Now a message with a link draws the shared Linked section under it, a
 * message without one draws nothing, and a thread asks which messages have links in ONE pair of
 * reads — never one read per bubble.
 */
import { expect, it, jest } from "@jest/globals";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calls: string[] = [];
jest.mock("@/features/scopes/host/associationsStore", () => ({
  associationsDataSource: {
    rpc: async (fn: string) => {
      calls.push(fn);
      if (fn === "assoc_for_targets") {
        return { data: [{ source_id: "rec-1", source_type: "record", target_id: "m-2", target_type: "dm_message", role: "anchored_to" }], error: null };
      }
      return { data: [], error: null };
    },
  },
  getAssociationsStore: () => ({
    subscribe: () => () => undefined,
    getEdges: () => ({ status: "idle", edges: [], fetchedAt: null, error: null }),
  }),
}));
jest.mock("@/features/scopes/components/linked-records/LinkedRecordsSection", () => ({
  ANCHORED_TO: "anchored_to",
  isLinkEdge: (_self: string, e: { role: string | null }) => e.role === "anchored_to",
  LinkedRecordsSection: ({ id }: { id: string }) => <section data-testid={`linked-${id}`}>Linked</section>,
}));

import { MessageLinks, forgetMessageLinks } from "../MessageLinks";

it("one pair of reads for the whole thread, and only the linked message shows its links", async () => {
  forgetMessageLinks();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <>
        <MessageLinks messageId="m-1" title="Sam" />
        <MessageLinks messageId="m-2" title="Sam" />
        <MessageLinks messageId="m-3" title="Ana" />
      </>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(calls.sort()).toEqual(["assoc_for_sources", "assoc_for_targets"]);
  expect(host.querySelector('[data-testid="linked-m-2"]')).not.toBeNull();
  expect(host.querySelector('[data-testid="linked-m-1"]')).toBeNull();
  expect(host.querySelector('[data-testid="linked-m-3"]')).toBeNull();
});
