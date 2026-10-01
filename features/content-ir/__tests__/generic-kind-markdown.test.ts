/**
 * genericKindMarkdown — the fallback for a kind with no `toMarkdown` facet is
 * READABLE markdown built from the value, never a JSON dump: heading from the
 * instance title, scalars as bold-label list, uniform object arrays as a
 * table, other arrays as nested lists, nested kinds through the kind
 * converter. No `__kind` key and no JSON fence ever (kind-never-raw O1).
 */
import { genericKindMarkdown } from "../kinds/kind-markdown-utils";
import { kindValueToMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";

const POOL_ROUTE = {
  __kind: "pool_route_plan_unregistered",
  name: "Tuesday Irvine route",
  crew: "North crew",
  stops_total: 2,
  chlorine_check: true,
  tags: ["residential", "hoa"],
  stops: [
    { order: 1, pool: "Chen residence", minutes: 25 },
    { order: 2, pool: "Oakwood HOA", minutes: 40 },
  ],
  notes: [{ text: "Gate code changed", by: { person: "Dana" } }, "Bring test strips"],
  study_cards: {
    __kind: "flashcard_set",
    title: "Chlorine basics",
    cards: [{ __kind: "flashcard", front: "Target ppm?", back: "1 to 3 ppm" }],
  },
  supervisor: { person: "Maria Lopez", phone: "+1 949 555 0100" },
};

describe("genericKindMarkdown", () => {
  const md = kindValueToMarkdown(POOL_ROUTE);

  it("never emits the __kind key or a JSON fence", () => {
    expect(md).not.toContain("__kind");
    expect(md).not.toContain("```json");
    expect(md).not.toContain("pool_route_plan_unregistered");
  });

  it("heads with the instance title and lists scalars with bold labels", () => {
    expect(md.startsWith("# Tuesday Irvine route")).toBe(true);
    expect(md).toContain("**Crew:** North crew");
    expect(md).toContain("**Stops total:** 2");
    expect(md).toContain("**Chlorine check:** Yes");
    expect(md).toContain("**Tags:** residential, hoa");
  });

  it("renders a uniform scalar object array as a table", () => {
    expect(md).toContain("| Order | Pool | Minutes |");
    expect(md).toContain("| 2 | Oakwood HOA | 40 |");
  });

  it("renders a mixed array as nested lists", () => {
    expect(md).toContain("- **Text:** Gate code changed");
    expect(md).toMatch(/\n {2,}- \*\*Person:\*\* Dana/);
    expect(md).toContain("- Bring test strips");
  });

  it("renders a nested kind through its own converter", () => {
    expect(md).toContain("Chlorine basics");
    expect(md).toContain("**Front:** Target ppm?");
  });

  it("renders a nested plain object as a section", () => {
    expect(md).toContain("**Person:** Maria Lopez");
  });

  it("works without the nested-kind renderer (falls back to itself)", () => {
    const direct = genericKindMarkdown("pool_route_plan_unregistered", POOL_ROUTE);
    expect(direct).not.toContain("__kind");
    expect(direct).toContain("Chlorine basics");
  });
});
