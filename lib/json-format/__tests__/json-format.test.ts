import { detectJson } from "../detect";
import { formatJsonText, stringifyJson } from "../format";

const REFERENCE_BLOB = `{
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

const FENCED = "```json\n" + REFERENCE_BLOB + "\n```";

describe("detectJson", () => {
  it("detects a bare object", () => {
    const d = detectJson(REFERENCE_BLOB);
    expect(d.ok).toBe(true);
    expect(d.looksLikeJson).toBe(true);
    expect(d.parser).toBe("strict");
    expect(d.root).toBe("object");
    expect(d.fence).toBeNull();
  });

  it("peels a json code fence and preserves surrounding prose", () => {
    const d = detectJson(`Here it is:\n\n${FENCED}\n\nDone.`);
    expect(d.ok).toBe(true);
    expect(d.fence?.lang).toBe("json");
    expect(d.fence?.closed).toBe(true);
    expect(d.leading).toBe("Here it is:\n\n");
    expect(d.trailing).toBe("\n\nDone.");
    expect(d.payload).toBe(REFERENCE_BLOB);
  });

  it("accepts a bare fence with no language", () => {
    expect(detectJson("```\n{\"a\": 1}\n```").ok).toBe(true);
  });

  it("refuses a fence that declares another language", () => {
    const d = detectJson('```python\n{"a": 1}\n```');
    expect(d.ok).toBe(false);
    expect(d.looksLikeJson).toBe(false);
  });

  it("parses tolerantly and says so", () => {
    const d = detectJson('{ a: 1, b: "two", }');
    expect(d.ok).toBe(true);
    expect(d.parser).toBe("tolerant");
  });

  it("flags bracket-shaped garbage as json-like but not ok", () => {
    const d = detectJson('{"a": 1,,,}');
    expect(d.ok).toBe(false);
    expect(d.looksLikeJson).toBe(true);
    expect(d.error).toBeTruthy();
  });

  it("ignores prose and bare scalars", () => {
    expect(detectJson("just some words").looksLikeJson).toBe(false);
    expect(detectJson("42").looksLikeJson).toBe(false);
    expect(detectJson("").looksLikeJson).toBe(false);
  });
});

describe("stringifyJson", () => {
  const value = JSON.parse(REFERENCE_BLOB) as never;

  it("minifies to a single line with no optional whitespace", () => {
    expect(stringifyJson(value, { style: "minify" })).toBe(
      '{"matrx_version":1,"kind":"reference","type":"file","items":[{"file_id":"cd743587-3ffc-4a26-a435-e8f4ec31eb3e","label":"TEAM_ACCESS_ONBOARDING.md"}]}',
    );
  });

  it("condenses to a readable few lines", () => {
    // 11 lines in, 5 out — scalars packed onto one line, the nested item
    // inlined because it fits the width budget.
    expect(stringifyJson(value, { style: "compact" })).toBe(
      [
        "{",
        '  "matrx_version": 1, "kind": "reference", "type": "file",',
        '  "items": [',
        '    { "file_id": "cd743587-3ffc-4a26-a435-e8f4ec31eb3e", "label": "TEAM_ACCESS_ONBOARDING.md" }',
        "  ]",
        "}",
      ].join("\n"),
    );
  });

  it("never exceeds the target width when it can avoid it", () => {
    const out = stringifyJson(value, { style: "compact", width: 60 });
    const overflow = out.split("\n").filter((l) => l.length > 60 && !l.includes("cd743587"));
    expect(overflow).toEqual([]);
    expect(JSON.parse(out)).toEqual(value);
  });

  it("pretty-prints one entry per line", () => {
    expect(stringifyJson(value, { style: "pretty" })).toBe(
      JSON.stringify(value, null, 2),
    );
  });

  it("sorts keys at every depth when asked", () => {
    const out = stringifyJson(
      JSON.parse('{"b":1,"a":{"z":1,"y":2}}') as never,
      { style: "minify", sortKeys: true },
    );
    expect(out).toBe('{"a":{"y":2,"z":1},"b":1}');
  });

  it("keeps empty containers inline", () => {
    expect(stringifyJson(JSON.parse('{"a":[],"b":{}}') as never, { style: "pretty" }))
      .toBe('{\n  "a": [],\n  "b": {}\n}');
  });
});

describe("formatJsonText", () => {
  it("round-trips every style back to the same value", () => {
    for (const style of ["minify", "compact", "pretty"] as const) {
      const r = formatJsonText(REFERENCE_BLOB, { style });
      expect(r.ok).toBe(true);
      expect(JSON.parse(r.text)).toEqual(JSON.parse(REFERENCE_BLOB));
    }
  });

  it("preserves the fence and the prose around it", () => {
    const input = `Here it is:\n\n${FENCED}\n\nDone.`;
    const r = formatJsonText(input, { style: "minify" });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(
      'Here it is:\n\n```json\n{"matrx_version":1,"kind":"reference","type":"file","items":[{"file_id":"cd743587-3ffc-4a26-a435-e8f4ec31eb3e","label":"TEAM_ACCESS_ONBOARDING.md"}]}\n```\n\nDone.',
    );
  });

  it("strips the fence on request", () => {
    const r = formatJsonText(FENCED, { style: "minify", fence: "strip" });
    expect(r.text.startsWith("{")).toBe(true);
    expect(r.text.includes("```")).toBe(false);
  });

  it("adds a json fence to bare JSON on request", () => {
    const r = formatJsonText('{"a":1}', { style: "pretty", fence: "add" });
    expect(r.text).toBe('```json\n{\n  "a": 1\n}\n```');
  });

  it("preserves fence indentation", () => {
    const r = formatJsonText('  ```json\n  {"a":1}\n  ```', { style: "minify" });
    expect(r.text).toBe('  ```json\n  {"a":1}\n  ```');
  });

  it("leaves an unterminated fence unterminated", () => {
    const r = formatJsonText('```json\n{"a": 1}', { style: "minify" });
    expect(r.text).toBe('```json\n{"a":1}');
  });

  it("returns the input untouched when the text is not JSON", () => {
    const input = "Some prose that is not JSON at all.";
    const r = formatJsonText(input, { style: "minify" });
    expect(r.ok).toBe(false);
    expect(r.changed).toBe(false);
    expect(r.text).toBe(input);
    expect(r.error).toBeTruthy();
  });

  it("reports no change when already in the target shape", () => {
    const minified = '{"a":1}';
    expect(formatJsonText(minified, { style: "minify" }).changed).toBe(false);
  });
});
