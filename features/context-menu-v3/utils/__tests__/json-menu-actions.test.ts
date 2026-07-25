import {
  buildJsonMenuSection,
  jsonSectionLabel,
} from "../json-menu-actions";

const BLOB = `{
  "matrx_version": 1,
  "kind": "reference",
  "type": "file",
  "items": [
    {
      "file_id": "cd743587-3ffc-4a26-a435-e8f4ec31eb3e",
      "label": "TEAM_ACCESS_ONBOARDING.md"
    }
  ]
}`;

function build(text: string, canWrite: boolean) {
  const replaced: string[] = [];
  const copied: string[] = [];
  const section = buildJsonMenuSection({
    text,
    canWrite,
    onReplace: (n) => replaced.push(n),
    onCopy: (n) => {
      copied.push(n);
    },
  });
  return { section, replaced, copied };
}

describe("buildJsonMenuSection", () => {
  it("returns null for ordinary prose", () => {
    expect(build("just a sentence, nothing more", true).section).toBeNull();
    expect(build("", true).section).toBeNull();
  });

  it("offers the JSON verbs on a bare object", () => {
    const { section } = build(BLOB, true);
    const ids = section?.actions.map((a) => a.id) ?? [];
    expect(ids).toContain("json-condense");
    expect(ids).toContain("json-minify");
    expect(ids).toContain("json-sort-keys");
    expect(ids).toContain("json-add-fence");
    expect(ids).toContain("json-copy-minified");
    // Already pretty-printed — "Expand" would be a no-op, so it is not offered.
    expect(ids).not.toContain("json-expand");
  });

  it("offers fence removal (not addition) on a fenced block", () => {
    const { section } = build("```json\n" + BLOB + "\n```", true);
    const ids = section?.actions.map((a) => a.id) ?? [];
    expect(ids).toContain("json-strip-fence");
    expect(ids).not.toContain("json-add-fence");
  });

  it("rewrites in place on an editable surface", () => {
    const { section, replaced, copied } = build(BLOB, true);
    section?.actions.find((a) => a.id === "json-minify")?.run();
    expect(copied).toEqual([]);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.includes("\n")).toBe(false);
    expect(JSON.parse(replaced[0] ?? "")).toEqual(JSON.parse(BLOB));
  });

  it("copies instead of rewriting on a read-only surface", () => {
    const { section, replaced, copied } = build(BLOB, false);
    expect(section?.writes).toBe(false);
    expect(section?.actions[0]?.label.startsWith("Copy ")).toBe(true);
    section?.actions.find((a) => a.id === "json-condense")?.run();
    expect(replaced).toEqual([]);
    expect(copied).toHaveLength(1);
  });

  it("carries a real before/after hint", () => {
    const { section } = build(BLOB, true);
    const minify = section?.actions.find((a) => a.id === "json-minify");
    expect(minify?.hint).toBe("11 lines -> 1 line");
  });

  it("sorting keys preserves the current layout", () => {
    const { section, replaced } = build('{"b":1,"a":2}', true);
    section?.actions.find((a) => a.id === "json-sort-keys")?.run();
    expect(replaced[0]).toBe('{"a":2,"b":1}'); // stayed on one line
  });

  it("surfaces a parse error instead of hiding a broken JSON selection", () => {
    const { section } = build('{"a": 1,,,}', true);
    expect(section?.actions).toHaveLength(1);
    expect(section?.actions[0]?.disabled).toBe(true);
    expect(section?.actions[0]?.label).toBe("Invalid JSON");
    expect(jsonSectionLabel(section!)).toBe("JSON (invalid)");
  });

  it("labels the section with the shape and size", () => {
    const { section } = build(BLOB, true);
    expect(jsonSectionLabel(section!)).toBe("JSON object · 11 lines");
    const arr = build("[1, 2, 3]", true).section;
    expect(jsonSectionLabel(arr!)).toBe("JSON array · 1 line");
  });
});
