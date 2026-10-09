/**
 * Re-stamping an edge that already says the same thing writes nothing.
 *
 * SUT: `attachEntityToThread` → `assoc.createAssignment` (the one attach path).
 * Replaced: only the association RPC door (`associationsService`) and the
 * org/user lookups beneath it.
 *
 * The break (RED before 2026-10-02): `ThreadAgentPanel` stamps its agent chat's
 * `conversation → thread` edge with `{ role, agentId }` on every mount, and the
 * old no-op check treated ANY metadata as a change — so every remount, and every
 * board tile waking from sleep, re-wrote the edge (`assoc_add`).
 */

const calls = { add: 0, list: 0 };
const THREAD_ID = "8d1d6955-5e45-4931-a815-ef8a5f8136aa";
const CONVERSATION_ID = "2b6f0c1e-94a7-4d53-b8e2-71c0a5d9e346";
const AGENT_ID = "f3a1c7d2-5e84-4b09-9c6a-0d2e8b7f1a45";
let edgeMetadata: Record<string, unknown> = {};

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForTargets: jest.fn(async () => {
      calls.list += 1;
      return {
        ok: true,
        data: {
          edges: [
            {
              id: "edge-1",
              sourceType: "conversation",
              sourceId: CONVERSATION_ID,
              targetType: "thread",
              targetId: THREAD_ID,
              label: "Lease renewal follow-ups",
              metadata: edgeMetadata,
              createdAt: "2026-10-01T16:20:00.000Z",
            },
          ],
        },
      };
    }),
    add: jest.fn(async () => {
      calls.add += 1;
      return { ok: true, data: { id: "edge-1" } };
    }),
  },
  associationsHelpers: {
    linkEdges: jest.fn(async (edges: unknown[]) => {
      calls.add += edges.length;
      return { ok: true, data: { ids: edges.map(() => "edge-1") } };
    }),
  },
}));
jest.mock("@/features/scopes/service/associationEdges", () => ({
  isContentSourceEdge: () => true,
}));
jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: () => "87a6e699-3622-4869-8843-d0867456c0dd",
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async (id: string | null) => id ?? "7d4e9b21-6c3a-4f8e-b5d2-0a9c1e3f7b64",
}));
jest.mock("@/utils/supabase/projectsDb", () => ({
  projectsDb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { organization_id: "7d4e9b21-6c3a-4f8e-b5d2-0a9c1e3f7b64" }, error: null }),
        }),
      }),
    }),
  }),
}));

import { makeStore } from "@/lib/redux/store";
import { attachEntityToThread } from "@/features/war-room/redux/thunks";
import { assignmentsLoadedForContainer } from "@/features/war-room/redux/slice";
import { containerKey } from "@/features/war-room/types";

beforeEach(() => {
  calls.add = 0;
  calls.list = 0;
});

describe("attaching an edge that already matches", () => {
  it("writes nothing when the server edge already carries the same metadata (store cold)", async () => {
    edgeMetadata = { role: "agent", agentId: AGENT_ID, is_active: true, position: 0 };
    const store = makeStore();
    const ok = await store.dispatch(
      attachEntityToThread(THREAD_ID, "conversation", CONVERSATION_ID, {
        metadata: { role: "agent", agentId: AGENT_ID },
      }),
    );
    expect(ok).toBe(true);
    expect(calls.add).toBe(0);
  });

  it("reads and writes nothing when the store already holds the matching edge (a remount)", async () => {
    edgeMetadata = { role: "agent", agentId: AGENT_ID, is_active: true, position: 0 };
    const store = makeStore();
    store.dispatch(
      assignmentsLoadedForContainer({
        key: containerKey("thread", THREAD_ID),
        assignments: [
          {
            id: "edge-1",
            container_type: "thread",
            container_id: THREAD_ID,
            entity_type: "conversation",
            entity_id: CONVERSATION_ID,
            position: 0,
            is_active: true,
            label: "Lease renewal follow-ups",
            metadata: edgeMetadata as never,
            created_by: null,
            created_at: "2026-10-01T16:20:00.000Z",
          },
        ],
      }),
    );
    for (let mount = 0; mount < 3; mount += 1) {
      await store.dispatch(
        attachEntityToThread(THREAD_ID, "conversation", CONVERSATION_ID, {
          metadata: { role: "agent", agentId: AGENT_ID },
        }),
      );
    }
    expect(calls.list).toBe(0);
    expect(calls.add).toBe(0);
  });

  it("still writes when the stamp changes (a different agent now runs the chat)", async () => {
    edgeMetadata = { role: "agent", agentId: "0c9e2d71-6b3f-4a58-a1d4-e8f27b5c3906", is_active: true, position: 0 };
    const store = makeStore();
    await store.dispatch(
      attachEntityToThread(THREAD_ID, "conversation", CONVERSATION_ID, {
        metadata: { role: "agent", agentId: AGENT_ID },
      }),
    );
    expect(calls.add).toBe(1);
  });
});
