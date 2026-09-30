/**
 * Use existing offers the canonical association set, not a hand-flagged few
 * (Arman, 2026-09-30: "You are showing 6 resources when we have dozens").
 * Resources = the registry's resources a Source can read; All adds every other
 * reference-pickable kind. Red on the old code: it offered only the six
 * `source_input_pickable` kinds.
 */
import { offeredKinds } from "./UseExisting";
import { curatedTokens, listableTokens } from "@/features/scopes/registry/entityRegistry";

jest.mock("@ai-matrx/associations/react", () => ({ CONTENT_ROLES: [] }));

describe("Use existing kinds", () => {
  it("offers every readable resource kind by default", () => {
    const pickable = new Set<string>(listableTokens());
    const expected = (curatedTokens() as string[]).filter((t) => pickable.has(t));
    expect(offeredKinds("resources")).toEqual(expected);
    expect(offeredKinds("resources").length).toBeGreaterThan(6);
    for (const t of ["file", "note", "transcript", "rulebook", "processed_document"]) {
      expect(offeredKinds("resources")).toContain(t);
    }
  });

  it("All adds every other pickable kind after the resources, never a duplicate", () => {
    const all = offeredKinds("all");
    const resources = offeredKinds("resources");
    expect(all.slice(0, resources.length)).toEqual(resources);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set<string>([...resources, ...listableTokens()]));
    expect(all.length).toBeGreaterThan(resources.length);
  });
});
