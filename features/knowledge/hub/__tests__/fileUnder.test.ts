/**
 * Bulk "File under…" writes ONE association per item through the association
 * door — a Segment files its Source, duplicates collapse — and the sentence
 * names the container by its REGISTRY label.
 */
import { fileUnder, keepItems, trashItems } from "@/features/knowledge/hub/hubActions";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";

const note: KnowledgeHit = { entity: "note", id: "n1", title: "Budget", organization_id: "o1" };
const source: KnowledgeHit = { entity: "processed_document", id: "d1", title: "Solicitation", organization_id: "o1" };
const segmentOfSource: KnowledgeHit = {
  entity: "segment",
  id: "g1",
  title: "Solicitation",
  organization_id: "o1",
  segment: { source_id: "d1", source_title: "Solicitation", locator: "p. 7" },
};

const labelFor = (token: string) => getEntityInfo(token as never).label;

describe("file under", () => {
  it("calls the door once per item, little → big, and names the container by its registry label", async () => {
    const add = jest.fn().mockResolvedValue({ ok: true, data: { id: "edge" } });
    const out = await fileUnder(
      [note, source, segmentOfSource],
      { token: "project", id: "p1", title: "Grant 2026" },
      { add, labelFor },
    );
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledWith({
      sourceType: "note",
      sourceId: "n1",
      targetType: "project",
      targetId: "p1",
      orgId: "o1",
      label: "Grant 2026",
    });
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "processed_document", sourceId: "d1" }),
    );
    expect(out.ok).toBe(2);
    expect(out.sentence).toBe(`Filed 2 items under ${labelFor("project")} "Grant 2026".`);
    expect(labelFor("project")).toBe("Project");
  });

  it("a refusal is counted and said, never swallowed", async () => {
    const add = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { id: "e" } })
      .mockResolvedValueOnce({ ok: false, error: { message: "not allowed" } });
    const out = await fileUnder([note, source], { token: "scope", id: "s1", title: "Client Ava" }, { add, labelFor });
    expect(out.ok).toBe(1);
    expect(out.failed).toHaveLength(1);
    expect(out.sentence).toContain("could not be filed");
    expect(out.sentence).toContain("not allowed");
  });
});

describe("keep and trash", () => {
  it("keep saves Sources through the Source door and says other kinds are already kept", async () => {
    const keep = jest.fn().mockResolvedValue(undefined);
    const out = await keepItems([note, source], keep);
    expect(keep).toHaveBeenCalledWith("d1", "o1");
    expect(keep).toHaveBeenCalledTimes(1);
    expect(out.sentence).toBe("Kept 1 Source. 1 other item is already kept — only Sources wait to be kept.");
  });
  it("trash archives each record once through the one archive", async () => {
    const archive = jest.fn().mockResolvedValue(undefined);
    const out = await trashItems([source, segmentOfSource, note], archive);
    expect(archive).toHaveBeenCalledTimes(2);
    expect(archive).toHaveBeenCalledWith("processed_document", "d1", '"Solicitation"');
    expect(out.sentence).toMatch(/^Moved 2 items to Trash/);
  });
});
