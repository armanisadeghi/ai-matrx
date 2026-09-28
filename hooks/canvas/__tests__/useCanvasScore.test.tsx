/**
 * canvas.canvas_scores refuses every client write (SECURITY-SWEEP 2026-09-21), so a
 * score inserted straight into the table failed for everyone — found 2026-09-28.
 * The hook's only write path is the canvas.submit_canvas_score door; this proves it
 * calls the door with the organization named explicitly, maps the door's result
 * (rank / high score / own best come from the door, which sees every score), and
 * never writes the table. The door is proven live by scripts/canvas-score-view/live-proof.mjs.
 */
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, settle } from "@/test-utils/renderHook";

const rpc = jest.fn();
const tableWrites: string[] = [];
const builder: Record<string, unknown> = {};
for (const m of ["select", "is", "eq", "order", "limit"]) builder[m] = () => builder;
builder.single = async () => ({ data: null, error: null });
for (const m of ["insert", "upsert", "update", "delete"]) {
  builder[m] = () => {
    tableWrites.push(m);
    return builder;
  };
}
const client = {
  schema: () => ({ from: () => builder, rpc: (...a: unknown[]) => rpc(...a) }),
};

jest.mock("@/utils/supabase/client", () => ({ createClient: () => client }));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "user-1" }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: async () => "org-1" }));
jest.mock("@/lib/organizations/organizationRefusalToast", () => ({
  withOrganizationRefusalShown: (_verb: string, fn: () => Promise<string>) => fn(),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));

import { useCanvasScore } from "../useCanvasScore";

function wrapper({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useCanvasScore", () => {
  beforeEach(() => {
    tableWrites.length = 0;
    rpc.mockReset().mockResolvedValue({
      data: {
        score: { id: "score-1", score: 7, attempt_number: 2 },
        rank: 3,
        is_high_score: false,
        beats_own_best: true,
        attempt_number: 2,
      },
      error: null,
    });
  });

  it("submits through the door with the organization named, never writing the table", async () => {
    const h = await renderHook(() => useCanvasScore("canvas-1"), { wrapper });
    let result: unknown;
    await h.act(async () => {
      result = await h.current.submitScoreAsync({ score: 7, max_score: 10, completed: true, time_taken: 42 });
    });
    await settle(h, () => rpc.mock.calls.length > 0, "score door called");
    expect(rpc).toHaveBeenCalledWith("submit_canvas_score", {
      p_canvas_id: "canvas-1",
      p_score: 7,
      p_max_score: 10,
      p_completed: true,
      p_organization_id: "org-1",
      p_time_taken: 42,
      p_data: {},
    });
    expect(result).toMatchObject({
      score: { id: "score-1" },
      rank: 3,
      is_high_score: false,
      is_personal_best: true,
      xp_earned: 5 + 10 + 25,
    });
    expect(tableWrites).toEqual([]);
    await h.unmount();
  });

  it("surfaces a door refusal instead of pretending the score was recorded", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "canvas not found or not visible to you" } });
    const h = await renderHook(() => useCanvasScore("canvas-1"), { wrapper });
    let caught: unknown;
    await h.act(async () => {
      try {
        await h.current.submitScoreAsync({ score: 1, max_score: 10, completed: false });
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toMatchObject({ message: "canvas not found or not visible to you" });
    expect(tableWrites).toEqual([]);
    await h.unmount();
  });
});
