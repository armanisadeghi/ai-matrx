/**
 * canvas.canvas_views refuses every client write (SECURITY-SWEEP 2026-09-21), so the
 * view insert the shared-canvas page made failed for everyone — found 2026-09-28.
 * The hook's only write path is the canvas.record_canvas_view door, called for a
 * signed-in viewer with their SELECTED organization (never the canvas's), and never
 * for a guest. This proves the door call and that the table is never written.
 */
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, settle } from "@/test-utils/renderHook";

const rpc = jest.fn();
const tableWrites: string[] = [];
const builder: Record<string, unknown> = {};
for (const m of ["insert", "upsert", "update", "delete"]) {
  builder[m] = () => {
    tableWrites.push(m);
    return Promise.resolve({ data: null, error: null });
  };
}
const client = {
  schema: () => ({ from: () => builder, rpc: (...a: unknown[]) => rpc(...a) }),
};
let userId: string | null = "user-1";
let activeOrg: string | null = "viewer-org";

jest.mock("@/utils/supabase/client", () => ({ createClient: () => client }));
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => userId }));
jest.mock("@/lib/organizations/activeOrg", () => ({ getActiveOrgId: () => activeOrg }));
jest.mock("@/features/canvas/shared/resolveSharedCanvas", () => ({
  resolveSharedCanvas: async () => ({ id: "canvas-1", organization_id: "canvas-owner-org", title: "T" }),
}));

import { useSharedCanvas } from "../useSharedCanvas";

function wrapper({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useSharedCanvas view tracking", () => {
  beforeEach(() => {
    tableWrites.length = 0;
    rpc.mockReset().mockResolvedValue({ data: true, error: null });
    userId = "user-1";
    activeOrg = "viewer-org";
  });

  it("records a signed-in view through the door in the viewer's selected organization", async () => {
    const h = await renderHook(() => useSharedCanvas("canvas-1"), { wrapper });
    await settle(h, () => rpc.mock.calls.length > 0, "view door called");
    expect(rpc).toHaveBeenCalledWith(
      "record_canvas_view",
      expect.objectContaining({ p_canvas_id: "canvas-1", p_organization_id: "viewer-org" }),
    );
    expect(rpc.mock.calls[0][1].p_session_id).toMatch(/^session_/);
    expect(tableWrites).toEqual([]);
    await h.unmount();
  });

  it("records nothing for a guest", async () => {
    userId = null;
    const h = await renderHook(() => useSharedCanvas("canvas-1"), { wrapper });
    await settle(h, (v) => !!v.data, "canvas loaded");
    expect(rpc).not.toHaveBeenCalled();
    expect(tableWrites).toEqual([]);
    await h.unmount();
  });
});
