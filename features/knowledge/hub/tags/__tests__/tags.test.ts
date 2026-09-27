/**
 * Tags are filing (KNOWLEDGE-HUB §4): Tag files each record through
 * `file_under_tag`; a `#tag` chip filters `within` the tag scope(s) — tags
 * first, then a scope of that exact name, else it says nothing has it; and
 * container refs go out in the wire's `{type, id}` shape (the service's
 * EntityRef refuses `name`).
 */
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: jest.fn() } }));
jest.mock("@/features/organizations/service", () => ({ getUserOrganizations: jest.fn() }));
jest.mock("@/features/scopes/service/associationCandidates", () => ({
  searchCandidatesAcrossTokens: jest.fn(),
}));

import type { KnowledgeHit, KnowledgeQuery, KnowledgeSection } from "@/features/knowledge/api/knowledgeSearch";
import { hitTags, resolveTagRefs, tagItems, wireWithin } from "@/features/knowledge/hub/tags/tagActions";
import { normalizeTagName, tagSlug } from "@/features/knowledge/hub/tags/tagApi";
import { withMentionResolution } from "@/features/knowledge/api/mentionResolution";
import { searchCandidatesAcrossTokens } from "@/features/scopes/service/associationCandidates";

const note: KnowledgeHit = { entity: "note", id: "n1", title: "Budget" };
const segment: KnowledgeHit = {
  entity: "segment",
  id: "g1",
  title: "p. 7",
  segment: { source_id: "d1", source_title: "Solicitation" },
};

describe("tagItems", () => {
  it("files each record once under the tag (a Segment tags its Source)", async () => {
    const door = jest.fn().mockResolvedValue("scope-1");
    const out = await tagItems([note, segment, segment], "#grant 2026", door);
    expect(door).toHaveBeenCalledTimes(2);
    expect(door).toHaveBeenCalledWith("note", "n1", "grant 2026");
    expect(door).toHaveBeenCalledWith("processed_document", "d1", "grant 2026");
    expect(out.sentence).toBe("Tagged 2 items #grant 2026.");
  });

  it("says a refusal in the server's words, and refuses an empty name without writing", async () => {
    const door = jest.fn().mockRejectedValue(new Error("You cannot file this record."));
    const out = await tagItems([note], "grant", door);
    expect(out.ok).toBe(0);
    expect(out.sentence).toBe('Nothing was tagged #grant. "Budget" was not tagged: You cannot file this record.');
    const empty = await tagItems([note], "  #  ", door);
    expect(empty.sentence).toMatch(/needs a name/);
  });
});

describe("names", () => {
  it("normalizes what was typed and slugs it like the database", () => {
    expect(normalizeTagName("##  Grant   2026 ")).toBe("Grant 2026");
    expect(tagSlug("Grant 2026!")).toBe("grant-2026");
    expect(hitTags({ ...note, tags: ["a", " a ", "b", 3] } as unknown as KnowledgeHit)).toEqual(["a", "b"]);
    expect(hitTags(note)).toEqual([]);
  });
});

describe("resolveTagRefs", () => {
  const q: KnowledgeQuery = { mode: "find", within: [{ type: "tag", name: "grant" }, { type: "project", id: "p1" }] };

  it("tags first: every tag scope with the slug, one per organization", async () => {
    const findScope = jest.fn();
    const out = await resolveTagRefs(q, async () => [{ id: "t-org1" }, { id: "t-org2" }], findScope);
    expect(out.unresolved).toEqual([]);
    expect(out.query.within).toEqual([
      { type: "project", id: "p1" },
      { type: "scope", id: "t-org1" },
      { type: "scope", id: "t-org2" },
    ]);
    expect(findScope).not.toHaveBeenCalled();
  });

  it("no tag → a scope of that exact name; nothing → reported unresolved", async () => {
    const viaScope = await resolveTagRefs(q, async () => [], async () => ({ type: "scope", id: "s9", name: "grant" }));
    expect(viaScope.query.within).toContainEqual({ type: "scope", id: "s9" });
    const none = await resolveTagRefs(q, async () => [], async () => null);
    expect(none.unresolved).toEqual(["grant"]);
  });

  it("wireWithin sends resolved refs as {type, id} only", () => {
    expect(wireWithin({ mode: "find", within: [{ type: "project", id: "p1", name: "Grant" }] }).within).toEqual([
      { type: "project", id: "p1" },
    ]);
  });
});

describe("withMentionResolution (hub and ⌘K)", () => {
  it("a #tag reaches the runner as the tag scope(s), in the wire's shape", async () => {
    const runner = jest.fn().mockResolvedValue([]);
    const wrapped = withMentionResolution(runner, undefined, async () => [{ id: "t1" }]);
    await wrapped({ mode: "find", within: [{ type: "tag", name: "grant" }, { type: "project", id: "p1", name: "X" }] });
    expect(runner.mock.calls[0][0].within).toEqual([
      { type: "project", id: "p1" },
      { type: "scope", id: "t1" },
    ]);
  });

  it("a #tag nobody has never runs the search: every section answers, Sources says why", async () => {
    (searchCandidatesAcrossTokens as jest.Mock).mockResolvedValue({ results: [], failures: [] });
    const runner = jest.fn();
    const seen: KnowledgeSection[] = [];
    const wrapped = withMentionResolution(runner, undefined, async () => []);
    const sections = await wrapped({ mode: "find", within: [{ type: "tag", name: "nope" }] }, { onSection: (s) => seen.push(s) });
    expect(runner).not.toHaveBeenCalled();
    expect(seen).toHaveLength(sections.length);
    expect(sections.find((s) => s.key === "sources")?.error?.message).toMatch(/No tag is named #nope yet/);
  });
});
