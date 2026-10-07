/**
 * OPENING THE BELL WRITES THE SEEN MARK — to the person's synced preferences, so the badge is 0 on
 * every device — and asks the server to stamp every shown notice seen (review, 2026-10-07).
 * Red on the pre-2026-10-07 reader: it wrote a browser-only localStorage key and never asked
 * mark_inbox_seen while the triage doors were held.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PlaceMarks } from "../badge";

const savedSeen: PlaceMarks[] = [];
const rpcCalls: string[] = [];
jest.mock("../useInboxMemory", () => ({
  useInboxMemory: () => ({
    ready: true,
    seen: { counts: {}, ids: {} },
    cleared: { counts: {}, ids: {} },
    hiddenSources: [],
    saveSeen: (marks: PlaceMarks) => {
      savedSeen.push(marks);
    },
    saveCleared: () => undefined,
    saveHidden: () => undefined,
  }),
}), { virtual: true }); // virtual: the same test runs against the pre-2026-10-07 reader (red proof)
jest.mock("@/features/approvals/usePendingApprovalCount", () => ({
  usePendingApprovalCount: () => ({ count: 5, unknown: false, storeCount: 0 }),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1", useAppDispatch: () => () => undefined }));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      rpc: async (name: string) => {
        rpcCalls.push(name);
        if (name === "my_inbox_summary") {
          return { data: [{ unseen_needs_you: 2, unseen_direct: 1, unseen_updates: 0, unread: 3, inbox: 3, snoozed: 0, done: 0 }], error: null };
        }
        if (name === "inbox_counts") return { data: [{ organization_id: "o1", organization_name: "Cedar Ridge", waiting: 3, snoozed: 0, overdue: 0 }], error: null };
        if (name === "mark_inbox_seen") return { data: 3, error: null };
        return { data: null, error: { code: "PGRST202", message: "absent" } };
      },
    }),
  }),
}));

import { useInboxCounts, type InboxCounts } from "../useInbox";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let latest: InboxCounts | null = null;
function Probe() {
  latest = useInboxCounts();
  return null;
}

it("opening the bell saves each place's mark and asks mark_inbox_seen", async () => {
  const host = document.createElement("div");
  const root: Root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  // The work read waits for idle (≤ 2 s in a browser; a 500 ms timer here).
  for (let i = 0; i < 20 && (latest?.work ?? null) === null; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
  }
  expect(latest?.badge).toBe(3 + 5 + 3);

  await act(async () => {
    latest?.markSeen();
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(savedSeen.at(-1)?.counts).toEqual({ approvals: 5, work: 3 });
  expect(rpcCalls).toContain("mark_inbox_seen");
  act(() => root.unmount());
});
