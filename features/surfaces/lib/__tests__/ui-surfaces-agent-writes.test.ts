import {
  DEFAULT_PARENT,
  DEFAULT_SORT_ORDER,
  parseCreateSurfacesValue,
  parseDeleteSurfacesValue,
  parseUpdateSurfacesValue,
  type SurfaceWriteContext,
} from "../ui-surfaces-agent-writes";

const ctx: SurfaceWriteContext = {
  clientNames: ["matrx-user", "matrx-admin", "matrx-default"],
  existing: [
    { name: "matrx-default/default", has_manifest: false },
    { name: "matrx-user/notes", has_manifest: true },
    { name: "matrx-user/legacy-thing", has_manifest: false },
  ],
};

describe("parseCreateSurfacesValue", () => {
  it("fills defaults the New surface dialog would", () => {
    const [plan] = parseCreateSurfacesValue(
      [{ name: "matrx-user/pp-test-reports", label: "Reports" }],
      ctx,
    );
    expect(plan).toMatchObject({
      name: "matrx-user/pp-test-reports",
      client_name: "matrx-user",
      label: "Reports",
      parent_surface_name: DEFAULT_PARENT,
      sort_order: DEFAULT_SORT_ORDER,
      is_active: true,
    });
  });

  it("reports every problem at once and creates nothing", () => {
    let message = "";
    try {
      parseCreateSurfacesValue(
        [
          { name: "nope/x" },
          { name: "matrx-user/Bad Name", sort_order: 5 },
          { name: "matrx-user/notes" },
          { name: "matrx-user/a", parent_surface_name: "matrx-user/missing" },
          { name: "matrx-user/a" },
        ],
        ctx,
      );
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('client "nope"');
    expect(message).toContain("lowercase letters");
    expect(message).toContain("sort_order");
    expect(message).toContain("already exists");
    expect(message).toContain("matrx-user/missing");
    expect(message).toContain("more than once");
    expect(message).toMatch(/Nothing was changed\.$/);
  });

  it("accepts null parent as a root surface", () => {
    const [plan] = parseCreateSurfacesValue(
      [{ name: "matrx-admin/pp-root", parent_surface_name: null }],
      ctx,
    );
    expect(plan.parent_surface_name).toBeNull();
  });
});

describe("parseUpdateSurfacesValue", () => {
  it("changes only the fields sent", () => {
    const [plan] = parseUpdateSurfacesValue(
      [{ name: "matrx-user/legacy-thing", is_active: false }],
      ctx,
    );
    expect(plan.patch).toEqual({ is_active: false });
    expect(plan.changed).toEqual(["is_active"]);
  });

  it("refuses manifest-owned fields on a manifested surface but allows sort_order", () => {
    expect(() =>
      parseUpdateSurfacesValue(
        [{ name: "matrx-user/notes", description: "x" }],
        ctx,
      ),
    ).toThrow(/code manifest/);
    const [plan] = parseUpdateSurfacesValue(
      [{ name: "matrx-user/notes", sort_order: 130 }],
      ctx,
    );
    expect(plan.patch).toEqual({ sort_order: 130 });
  });

  it("refuses unknown names, self-parent, unknown fields and empty patches", () => {
    let message = "";
    try {
      parseUpdateSurfacesValue(
        [
          { name: "matrx-user/ghost", is_active: true },
          { name: "matrx-user/legacy-thing", parent_surface_name: "matrx-user/legacy-thing" },
          { name: "matrx-default/default", label: "x" },
          { name: "matrx-default/default" },
        ],
        ctx,
      );
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('"matrx-user/ghost" is not a surface');
    expect(message).toContain("its own parent");
    expect(message).toContain("cannot change label");
    expect(message).toContain("no field to change");
  });
});

describe("parseDeleteSurfacesValue", () => {
  it("accepts names or { name } objects", () => {
    const out = parseDeleteSurfacesValue(
      ["matrx-user/legacy-thing", { name: "matrx-default/default" }],
      ctx,
    );
    expect(out.map((s) => s.name)).toEqual([
      "matrx-user/legacy-thing",
      "matrx-default/default",
    ]);
  });

  it("refuses manifested, unknown and repeated names", () => {
    let message = "";
    try {
      parseDeleteSurfacesValue(
        ["matrx-user/notes", "matrx-user/ghost", "matrx-user/legacy-thing", "matrx-user/legacy-thing"],
        ctx,
      );
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("code manifest");
    expect(message).toContain("ghost");
    expect(message).toContain("more than once");
  });
});
