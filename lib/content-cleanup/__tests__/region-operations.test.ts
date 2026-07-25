import { cleanContent } from "../clean";
import { buildRegionOperationCards } from "../review";
import { countJsonRegions } from "../region-operations";
import { getProtectedRegions } from "../segment";
import { DEFAULT_ENABLED_OPERATIONS } from "../operations";

const NOTE = `# Reference

Here is the payload:

\`\`\`json
{
  "matrx_version": 1,
  "kind": "reference",
  "type": "file",
  "items": [
    {
      "file_id": "cd743587-3ffc-4a26-a435-e8f4ec31eb3e",
      "label": "TEAM_ACCESS_ONBOARDING.md"
    }
  ]
}
\`\`\`

That's it.`;

describe("region operations — JSON re-print inside protected regions", () => {
  it("does nothing when no region op is enabled", () => {
    const report = cleanContent(NOTE, DEFAULT_ENABLED_OPERATIONS);
    expect(report.regionChanges).toEqual([]);
    expect(report.cleaned).toBe(NOTE);
  });

  it("condenses the JSON block and keeps the fence and the prose", () => {
    const report = cleanContent(NOTE, DEFAULT_ENABLED_OPERATIONS, [
      "condense-json",
    ]);
    expect(report.regionChanges).toHaveLength(1);
    expect(report.cleaned).toContain("# Reference");
    expect(report.cleaned).toContain("That's it.");
    expect(report.cleaned).toContain("```json");
    expect(report.cleaned.split("\n").length).toBeLessThan(
      NOTE.split("\n").length,
    );
    // Still valid JSON, still the same data.
    const body = report.cleaned.split("```json\n")[1]?.split("\n```")[0] ?? "";
    expect(JSON.parse(body)).toEqual({
      matrx_version: 1,
      kind: "reference",
      type: "file",
      items: [
        {
          file_id: "cd743587-3ffc-4a26-a435-e8f4ec31eb3e",
          label: "TEAM_ACCESS_ONBOARDING.md",
        },
      ],
    });
  });

  it("minifies to a single line", () => {
    const report = cleanContent(NOTE, DEFAULT_ENABLED_OPERATIONS, [
      "minify-json",
    ]);
    const body = report.cleaned.split("```json\n")[1]?.split("\n```")[0] ?? "";
    expect(body.includes("\n")).toBe(false);
    expect(report.regionChanges[0]?.linesAfter).toBe(3); // fence + 1 + fence
  });

  it("region ops are mutually exclusive per region — first enabled wins", () => {
    const report = cleanContent(NOTE, DEFAULT_ENABLED_OPERATIONS, [
      "condense-json",
      "minify-json",
    ]);
    expect(report.regionChanges).toHaveLength(1);
    expect(report.regionChanges[0]?.opId).toBe("condense-json");
  });

  it("refuses JSON that only parses tolerantly (comments would be deleted)", () => {
    const withComments = "```json\n{\n  // why\n  \"a\": 1,\n}\n```";
    const report = cleanContent(withComments, [], ["minify-json"]);
    expect(report.regionChanges).toEqual([]);
    expect(report.cleaned).toBe(withComments);
  });

  it("leaves non-JSON fenced code alone", () => {
    const py = "```python\nx = {  'a':   1 }\n```";
    const report = cleanContent(py, DEFAULT_ENABLED_OPERATIONS, ["minify-json"]);
    expect(report.regionChanges).toEqual([]);
    expect(report.cleaned).toBe(py);
  });

  it("counts only re-printable JSON regions", () => {
    const regions = getProtectedRegions(NOTE);
    expect(countJsonRegions(NOTE, regions)).toBe(1);
    const py = "```python\nprint(1)\n```";
    expect(countJsonRegions(py, getProtectedRegions(py))).toBe(0);
  });

  it("produces a review card with real before/after text", () => {
    const report = cleanContent(NOTE, DEFAULT_ENABLED_OPERATIONS, [
      "condense-json",
    ]);
    const [card] = buildRegionOperationCards(report);
    expect(card?.id).toBe("condense-json");
    expect(card?.count).toBe(1);
    const [example] = card?.examples ?? [];
    expect(example?.kind).toBe("region");
    if (example?.kind === "region") {
      expect(example.before).toContain("matrx_version");
      expect(example.after).toContain("matrx_version");
      expect(example.nowLabel).toBe("13 lines");
    }
  });

  it("region rewrites and whitespace ops coexist without corrupting either", () => {
    const messy = `Trailing spaces here.   \n\n\n\n${NOTE}`;
    const report = cleanContent(
      messy,
      ["trim-trailing-whitespace", "collapse-blank-lines"],
      ["minify-json"],
    );
    expect(report.regionChanges).toHaveLength(1);
    expect(report.cleaned).toContain("Trailing spaces here.\n");
    expect(report.cleaned).not.toContain("here.   ");
    const body = report.cleaned.split("```json\n")[1]?.split("\n```")[0] ?? "";
    expect(() => JSON.parse(body) as unknown).not.toThrow();
  });
});
