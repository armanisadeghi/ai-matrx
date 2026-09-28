/**
 * canvas.canvas_likes refuses every client write (SECURITY-SWEEP 2026-09-21), so a
 * like written straight to the table fails for everyone — the 2026-09-28 outage.
 * The hook's only write path is the canvas.set_canvas_like door; this proves it
 * calls the door (with the organization named explicitly on a like) and never
 * writes the table. The door itself is proven live by scripts/canvas-like/live-proof.mjs.
 */
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, settle } from "@/test-utils/renderHook";

const rpc = jest.fn();
const tableWrites: string[] = [];
const builder: Record<string, unknown> = {};
for (const m of ["select", "is", "eq"]) builder[m] = () => builder;
builder.maybeSingle = async () => ({ data: null, error: null });
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
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));

import { useCanvasLike } from "../useCanvasLike";

function wrapper({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useCanvasLike", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: 1, error: null });
    tableWrites.length = 0;
  });

  it("likes through the door with the organization named, never writing the table", async () => {
    const h = await renderHook(() => useCanvasLike("canvas-1"), { wrapper });
    await h.act(() => h.current.toggleLike());
    await settle(h, () => rpc.mock.calls.length > 0, "like door called");
    expect(rpc).toHaveBeenCalledWith("set_canvas_like", {
      p_canvas_id: "canvas-1",
      p_liked: true,
      p_organization_id: "org-1",
    });
    expect(tableWrites).toEqual([]);
    await h.unmount();
  });

  it("unlikes through the door (archive), never writing the table", async () => {
    builder.maybeSingle = async () => ({ data: { id: "like-1" }, error: null });
    const h = await renderHook(() => useCanvasLike("canvas-1"), { wrapper });
    await settle(h, (v) => v.hasLiked, "existing like loaded");
    await h.act(() => h.current.toggleLike());
    await settle(h, () => rpc.mock.calls.length > 0, "unlike door called");
    expect(rpc).toHaveBeenCalledWith("set_canvas_like", { p_canvas_id: "canvas-1", p_liked: false });
    expect(tableWrites).toEqual([]);
    await h.unmount();
  });
});
