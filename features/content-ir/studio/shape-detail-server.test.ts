/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/utils/supabase/sessionVerdict", () => ({ getSessionVerdict: jest.fn() }));
jest.mock("@/features/content-ir/registry/schema-source-kind-tables", () => ({
  GENERATED_CONTRACT_FAMILY_VALUES: new Set(["agent_io"]),
  kindFamilyFromMetadata: (metadata: { family?: string }) => metadata?.family,
}));

import { createClient } from "@/utils/supabase/server";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { getShapeDetail } from "./shape-detail-server";

const verdict = jest.mocked(getSessionVerdict);
const client = jest.mocked(createClient);
const row = {
  id: "shape-id", kind: "source_manifest", label: "Source Manifest",
  is_active: true, published_to_web: false, version: 2, updated_at: "2026-10-01",
  data: null, emitted_json_schema: { type: "object" }, metadata: {}, created_by: "viewer",
};
function query(result: { data: typeof row | null; error: { message: string } | null }) {
  const chain = {
    schema: jest.fn().mockReturnThis(), from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue(result),
  };
  client.mockResolvedValue(chain as unknown as Awaited<ReturnType<typeof createClient>>);
  return chain;
}
beforeEach(() => jest.clearAllMocks());

it("does not query protected shape data for a settled guest", async () => {
  verdict.mockResolvedValue({ state: "signed_out", isAuthenticated: false, user: null });
  await expect(getShapeDetail("source_manifest")).resolves.toBeNull();
  expect(client).not.toHaveBeenCalled();
});

it("waits for the shared identity hold instead of issuing an anonymous query", async () => {
  const hold = new Error("NEXT_REDIRECT: /auth/verifying");
  verdict.mockRejectedValue(hold);
  await expect(getShapeDetail("icp_hypothesis_set")).rejects.toBe(hold);
  expect(client).not.toHaveBeenCalled();
});

it("uses the settled viewer for ownership without another auth request", async () => {
  verdict.mockResolvedValue({ state: "signed_in", isAuthenticated: true,
    user: { id: "viewer" } as NonNullable<Awaited<ReturnType<typeof getSessionVerdict>>["user"]> });
  const chain = query({ data: row, error: null });
  await expect(getShapeDetail("source_manifest")).resolves.toMatchObject({
    kind: "source_manifest", isOwnedByViewer: true, emittedJsonSchema: { type: "object" },
  });
  expect(chain.eq).toHaveBeenCalledWith("kind", "source_manifest");
});

it("keeps real database failures visible", async () => {
  verdict.mockResolvedValue({ state: "signed_in", isAuthenticated: true,
    user: { id: "other" } as NonNullable<Awaited<ReturnType<typeof getSessionVerdict>>["user"]> });
  query({ data: null, error: { message: "database unavailable" } });
  await expect(getShapeDetail("source_manifest")).rejects.toThrow("database unavailable");
});
