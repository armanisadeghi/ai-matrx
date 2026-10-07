/**
 * `matrx-admin/agent-apps` edit-mount write targets.
 *
 * The failure these tests exist to prevent is the one the stack cannot catch
 * anywhere else: `PATCH /api/applets/[id]` is a raw `.update(body)`
 * passthrough with no server-side column allow-list, so a validation hole here
 * writes straight to `app.definition`. Every "must throw" case below is a
 * governance/identity column an agent must never reach through authored-copy
 * targets.
 */

import {
  validateAppletCategoryWrite,
  validateAppletMetadataWrite,
} from "@/features/applets/lib/admin-app-write-targets";

const CATEGORIES = ["Productivity", "Content Writing", "Research"];

describe("validateAppletMetadataWrite", () => {
  it("accepts a partial patch and trims", () => {
    expect(
      validateAppletMetadataWrite({ name: "  Recipe Helper  " }),
    ).toEqual({ name: "Recipe Helper" });
  });

  it("treats an empty string as clear for tagline/description", () => {
    expect(
      validateAppletMetadataWrite({ tagline: "", description: "  " }),
    ).toEqual({ tagline: null, description: null });
  });

  it("refuses to blank the name", () => {
    expect(() => validateAppletMetadataWrite({ name: "   " })).toThrow(
      /name cannot be empty/,
    );
  });

  it.each([
    "slug",
    "status",
    "is_featured",
    "is_verified",
    "published_to_web",
    "shown_to",
    "rate_limit_per_ip",
    "component_code",
    "created_by",
  ])("refuses the non-authored field %s", (field) => {
    expect(() =>
      validateAppletMetadataWrite({ description: "ok", [field]: "x" }),
    ).toThrow(/unknown field/);
  });

  it("rejects non-object and non-string values", () => {
    expect(() => validateAppletMetadataWrite("Recipe Helper")).toThrow(
      /expects an object/,
    );
    expect(() => validateAppletMetadataWrite(["a"])).toThrow(
      /expects an object/,
    );
    expect(() => validateAppletMetadataWrite({ tagline: 12 })).toThrow(
      /must be a string/,
    );
  });

  it("rejects an empty patch", () => {
    expect(() => validateAppletMetadataWrite({})).toThrow(
      /at least one of/,
    );
  });

  it("ignores explicit undefined/null (omission keeps the current value)", () => {
    expect(
      validateAppletMetadataWrite({
        name: "Kept",
        tagline: undefined,
        description: null,
      }),
    ).toEqual({ name: "Kept" });
  });
});

describe("validateAppletCategoryWrite", () => {
  it("resolves a case-insensitive match to the vocabulary's canonical casing", () => {
    expect(
      validateAppletCategoryWrite("content writing", CATEGORIES),
    ).toBe("Content Writing");
  });

  it("rejects a category outside the system vocabulary and lists it", () => {
    expect(() =>
      validateAppletCategoryWrite("Wizardry", CATEGORIES),
    ).toThrow(/not a system category.*Productivity, Content Writing, Research/);
  });

  it("rejects empty, non-string, and an unloaded vocabulary", () => {
    expect(() => validateAppletCategoryWrite("", CATEGORIES)).toThrow(
      /cannot be empty/,
    );
    expect(() => validateAppletCategoryWrite(3, CATEGORIES)).toThrow(
      /expects a string/,
    );
    expect(() => validateAppletCategoryWrite("Research", [])).toThrow(
      /has not loaded/,
    );
  });
});

// `app_tags` deliberately has no validator in this module — the edit shell
// imports `validateAppTags` from `features/applets/route/applet-entity-writes`
// so `app.definition.tags` keeps ONE contract across the admin console and the
// user-facing surface. Its behaviour is covered where that validator lives.
