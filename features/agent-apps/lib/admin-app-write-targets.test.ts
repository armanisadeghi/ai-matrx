/**
 * `matrx-admin/agent-apps` edit-mount write targets.
 *
 * The failure these tests exist to prevent is the one the stack cannot catch
 * anywhere else: `PATCH /api/agent-apps/[id]` is a raw `.update(body)`
 * passthrough with no server-side column allow-list, so a validation hole here
 * writes straight to `app.definition`. Every "must throw" case below is a
 * governance/identity column an agent must never reach through authored-copy
 * targets.
 */

import {
  validateAgentAppCategoryWrite,
  validateAgentAppMetadataWrite,
} from "@/features/agent-apps/lib/admin-app-write-targets";

const CATEGORIES = ["Productivity", "Content Writing", "Research"];

describe("validateAgentAppMetadataWrite", () => {
  it("accepts a partial patch and trims", () => {
    expect(
      validateAgentAppMetadataWrite({ name: "  Recipe Helper  " }),
    ).toEqual({ name: "Recipe Helper" });
  });

  it("treats an empty string as clear for tagline/description", () => {
    expect(
      validateAgentAppMetadataWrite({ tagline: "", description: "  " }),
    ).toEqual({ tagline: null, description: null });
  });

  it("refuses to blank the name", () => {
    expect(() => validateAgentAppMetadataWrite({ name: "   " })).toThrow(
      /name cannot be empty/,
    );
  });

  it.each([
    "slug",
    "status",
    "is_featured",
    "is_verified",
    "is_public",
    "rate_limit_per_ip",
    "component_code",
    "user_id",
  ])("refuses the non-authored field %s", (field) => {
    expect(() =>
      validateAgentAppMetadataWrite({ description: "ok", [field]: "x" }),
    ).toThrow(/unknown field/);
  });

  it("rejects non-object and non-string values", () => {
    expect(() => validateAgentAppMetadataWrite("Recipe Helper")).toThrow(
      /expects an object/,
    );
    expect(() => validateAgentAppMetadataWrite(["a"])).toThrow(
      /expects an object/,
    );
    expect(() => validateAgentAppMetadataWrite({ tagline: 12 })).toThrow(
      /must be a string/,
    );
  });

  it("rejects an empty patch", () => {
    expect(() => validateAgentAppMetadataWrite({})).toThrow(
      /at least one of/,
    );
  });

  it("ignores explicit undefined/null (omission keeps the current value)", () => {
    expect(
      validateAgentAppMetadataWrite({
        name: "Kept",
        tagline: undefined,
        description: null,
      }),
    ).toEqual({ name: "Kept" });
  });
});

describe("validateAgentAppCategoryWrite", () => {
  it("resolves a case-insensitive match to the vocabulary's canonical casing", () => {
    expect(
      validateAgentAppCategoryWrite("content writing", CATEGORIES),
    ).toBe("Content Writing");
  });

  it("rejects a category outside the system vocabulary and lists it", () => {
    expect(() =>
      validateAgentAppCategoryWrite("Wizardry", CATEGORIES),
    ).toThrow(/not a system category.*Productivity, Content Writing, Research/);
  });

  it("rejects empty, non-string, and an unloaded vocabulary", () => {
    expect(() => validateAgentAppCategoryWrite("", CATEGORIES)).toThrow(
      /cannot be empty/,
    );
    expect(() => validateAgentAppCategoryWrite(3, CATEGORIES)).toThrow(
      /expects a string/,
    );
    expect(() => validateAgentAppCategoryWrite("Research", [])).toThrow(
      /has not loaded/,
    );
  });
});

// `app_tags` deliberately has no validator in this module — the edit shell
// imports `validateAppTags` from `features/agent-apps/route/agent-app-entity-writes`
// so `app.definition.tags` keeps ONE contract across the admin console and the
// user-facing surface. Its behaviour is covered where that validator lives.
