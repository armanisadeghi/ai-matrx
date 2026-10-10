// A scope type the store spells `practice_areas` opens from an address a person typed as
// `practice-areas` (and the reverse): a slug lookup reads both spellings as the same word.
import { selectScopeBySlugOrId, selectScopeTypeBySlugOrId } from "@/features/scopes/redux/selectors/admin";
import type { Scope, ScopeTypeWithScopes } from "@ai-matrx/records/scopes";

const ORG = "a0000000-0000-4000-8000-000000000001";
const type = { id: "t1", organization_id: ORG, slug: "practice_areas", scopes: [] } as unknown as ScopeTypeWithScopes;
const scope = { id: "s1", scope_type_id: "t1", slug: "estate_planning" } as unknown as Scope;

describe("a scope address opens whichever way its slug is spelled", () => {
  it("finds the type by its hyphenated address", () => {
    expect(selectScopeTypeBySlugOrId.resultFunc([type], ORG, "practice-areas")).toBe(type);
    expect(selectScopeTypeBySlugOrId.resultFunc([type], ORG, "practice_areas")).toBe(type);
    expect(selectScopeTypeBySlugOrId.resultFunc([type], ORG, "practice")).toBeUndefined();
  });
  it("finds the scope by its hyphenated address", () => {
    const find = selectScopeBySlugOrId.resultFunc as (...a: unknown[]) => Scope | undefined;
    expect(find([scope], "t1", "estate-planning")).toBe(scope);
  });
});
