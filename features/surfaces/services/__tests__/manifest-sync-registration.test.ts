jest.mock("@/features/surfaces/manifests/registry", () => ({
  ALL_MANIFESTS: [
    {
      surfaceName: "matrx-user/education-flashcard-set",
      client: "matrx-user",
      executionMode: "python-stream",
      description: "",
      label: "Flashcard set",
      values: [],
      groups: [],
      readiness: "partial",
    },
  ],
  getRegisteredSurfaceNames: () => ["matrx-user/education-flashcard-set"],
  getRawManifest: () => undefined,
}));
jest.mock("@/features/surfaces/config/namespace-registry", () => ({
  listRegisteredNamespaces: () => [],
}));
jest.mock("@/lib/organizations/systemOrg", () => ({
  resolveSystemOrgId: async () => "00000000-0000-4000-8000-000000000001",
}));
jest.mock("@ai-matrx/data/db", () => ({ readAllRows: async () => [] }));
import { applyManifestSync } from "../manifest-sync.service";

describe("manifest sync registration admission", () => {
  function client() {
    const upsert = jest.fn(async () => ({
      error: new Error("stop after observed registration write"),
    }));
    const from = jest.fn(() => ({ upsert }));
    const schema = jest.fn(() => ({ from }));
    return { schema, from, upsert };
  }
  it("registers a new manifest by default before attempting child writes", async () => {
    const db = client();
    await expect(
      applyManifestSync(
        db as unknown as Parameters<typeof applyManifestSync>[0],
      ),
    ).rejects.toThrow("stop after observed registration write");
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.from).toHaveBeenCalledWith("ui_surface");
    expect(db.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          name: "matrx-user/education-flashcard-set",
          client_name: "matrx-user",
        }),
      ],
      { onConflict: "name", ignoreDuplicates: true },
    );
  });
  it("refuses an explicitly disabled creation before any write instead of returning skipped success", async () => {
    const db = client();
    await expect(
      applyManifestSync(
        db as unknown as Parameters<typeof applyManifestSync>[0],
        { createMissingSurfaces: false },
      ),
    ).rejects.toThrow(
      "missing registrations: matrx-user/education-flashcard-set",
    );
    expect(db.schema).not.toHaveBeenCalled();
  });
});
