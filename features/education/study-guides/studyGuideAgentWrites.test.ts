import {
  anchorForQuote,
  parseCreateGuideCommentsValue,
  parseCreatePersonalNotesValue,
  parseDeleteGuideCommentsValue,
  parseDeletePersonalNotesValue,
  parseDeleteStudyGuidesValue,
  parseCreateStudyGuidesValue,
  parseGuideContentValue,
  parseUpdateGuideCommentsValue,
  parseUpdatePersonalNotesValue,
  type CurrentComment,
  type CurrentPersonalNote,
} from "./studyGuideAgentWrites";

const guide = {
  body: "# Cells\n\nThe **mitochondria** is the powerhouse of the cell.\n\nRibosomes make proteins. Ribosomes are small.\n",
  version: 3,
};

const notes: CurrentPersonalNote[] = [
  { id: "hl-1", kind: "highlight", quote: "powerhouse of the cell", note: "", color: "yellow" },
  { id: "nt-1", kind: "note", quote: null, note: "Review before Friday", color: "yellow" },
];

const comments: CurrentComment[] = [
  { id: "c-1", parentId: null, quote: "Ribosomes make proteins.", body: "Which organelle?", mine: false, resolved: false, version: 1 },
  { id: "r-1", parentId: "c-1", quote: null, body: "The ribosome", mine: true, resolved: false, version: 1 },
  { id: "c-2", parentId: null, quote: null, body: "Great guide", mine: true, resolved: false, version: 2 },
];

describe("anchorForQuote", () => {
  it("pins a unique quote at the guide's version, markup included", () => {
    const anchor = anchorForQuote("x", "**mitochondria**", guide);
    expect(anchor.exact).toBe("**mitochondria**");
    expect(anchor.content_version).toBe(3);
    expect(anchor.end - anchor.start).toBe("**mitochondria**".length);
  });
  it("refuses a quote that is missing or appears more than once", () => {
    expect(() => anchorForQuote("x", "chloroplast", guide)).toThrow(/not in the guide's text/);
    expect(() => anchorForQuote("x", "Ribosomes", guide)).toThrow(/appears 2 times/);
  });
});

describe("study-guide collection", () => {
  it("creates named guides and supplies an empty body when omitted", () => {
    expect(parseCreateStudyGuidesValue([{ title: "Cell biology" }, { title: "Genetics", content: "# Genes" }])).toEqual([
      { title: "Cell biology", content: "" },
      { title: "Genetics", content: "# Genes" },
    ]);
  });

  it("refuses invalid creates and an archive target other than the open guide", () => {
    expect(() => parseCreateStudyGuidesValue([{ title: "" }, { title: "Two\nlines" }, { title: "Cell biology", extra: true }])).toThrow(/3 problems/);
    expect(() => parseDeleteStudyGuidesValue(["another-guide"], { id: "guide-1", title: "Cell biology" })).toThrow(/not the guide open/);
    expect(parseDeleteStudyGuidesValue([{ id: "guide-1" }], { id: "guide-1", title: "Cell biology" })).toEqual([
      { id: "guide-1", title: "Cell biology" },
    ]);
  });
});

describe("guide_content", () => {
  it("accepts a changed body and refuses empty, identical or non-string values", () => {
    expect(parseGuideContentValue("# New", guide.body)).toBe("# New");
    expect(() => parseGuideContentValue("  ", guide.body)).toThrow(/cannot empty/);
    expect(() => parseGuideContentValue(guide.body, guide.body)).toThrow(/identical/);
    expect(() => parseGuideContentValue({ text: "x" }, guide.body)).toThrow(/as a string/);
  });
});

describe("personal notes", () => {
  it("creates a highlight with a note and a whole-guide note in one list", () => {
    const plans = parseCreatePersonalNotesValue(
      [{ quote: "Ribosomes make proteins.", note: "exam", color: "green" }, { note: "Probe Test note" }],
      guide,
      notes,
    );
    expect(plans[0]).toMatchObject({ quote: "Ribosomes make proteins.", note: "exam", color: "green" });
    expect(plans[0].anchor?.exact).toBe("Ribosomes make proteins.");
    expect(plans[1]).toMatchObject({ quote: null, anchor: null, note: "Probe Test note", color: "yellow" });
  });
  it("refuses a passage already highlighted, a repeated quote, an empty entry and a bad color", () => {
    expect(() => parseCreatePersonalNotesValue([{ quote: "powerhouse of the cell" }], guide, notes)).toThrow(/already highlighted.*hl-1/);
    expect(() =>
      parseCreatePersonalNotesValue([{ quote: "Ribosomes are small." }, { quote: "Ribosomes are small." }], guide, notes),
    ).toThrow(/more than once/);
    expect(() => parseCreatePersonalNotesValue([{}], guide, notes)).toThrow(/needs a quote .* or a note/);
    expect(() => parseCreatePersonalNotesValue([{ note: "a", color: "red" }], guide, notes)).toThrow(/color must be one of/);
    expect(() => parseCreatePersonalNotesValue([{ note: "a", page: 2 }], guide, notes)).toThrow(/does not accept page/);
  });
  it("updates only what changes and refuses unknown ids, no-ops and colors on notes", () => {
    const [plan] = parseUpdatePersonalNotesValue([{ id: "hl-1", note: "Key idea", color: "yellow" }], notes);
    expect(plan).toMatchObject({ id: "hl-1", note: "Key idea", changed: ["note"] });
    expect(plan.color).toBeUndefined();
    expect(() => parseUpdatePersonalNotesValue([{ id: "nope", note: "x" }], notes)).toThrow(/is not one of/);
    expect(() => parseUpdatePersonalNotesValue([{ id: "hl-1", color: "yellow" }], notes)).toThrow(/changes nothing/);
    expect(() => parseUpdatePersonalNotesValue([{ id: "nt-1", color: "blue" }], notes)).toThrow(/only highlights/);
    expect(() => parseUpdatePersonalNotesValue([{ id: "nt-1", note: "" }], notes)).toThrow(/delete_personal_notes/);
  });
  it("deletes by id or { id } and refuses repeats", () => {
    expect(parseDeletePersonalNotesValue(["hl-1", { id: "nt-1" }], notes).map((n) => n.id)).toEqual(["hl-1", "nt-1"]);
    expect(() => parseDeletePersonalNotesValue(["hl-1", "hl-1"], notes)).toThrow(/more than once/);
    expect(() => parseDeletePersonalNotesValue("hl-1", notes)).toThrow(/expects an ARRAY/);
  });
});

describe("guide comments", () => {
  it("creates a passage comment, a suggestion and a reply", () => {
    const plans = parseCreateGuideCommentsValue(
      [
        { body: "Probe Test comment", quote: "Ribosomes are small." },
        { body: "Clearer", quote: "**mitochondria**", suggested_text: "**mitochondrion**" },
        { body: "Probe Test reply", reply_to: "c-1" },
      ],
      guide,
      comments,
    );
    expect(plans[0].anchor?.exact).toBe("Ribosomes are small.");
    expect(plans[1]).toMatchObject({ suggestedText: "**mitochondrion**" });
    expect(plans[2]).toMatchObject({ parentId: "c-1", anchor: null });
  });
  it("refuses a suggestion with no quote, a reply to a reply, an unknown thread and a repeat of my own comment", () => {
    expect(() => parseCreateGuideCommentsValue([{ body: "x", suggested_text: "y" }], guide, comments)).toThrow(/needs quote/);
    expect(() => parseCreateGuideCommentsValue([{ body: "x", reply_to: "r-1" }], guide, comments)).toThrow(/reply to its thread c-1/);
    expect(() => parseCreateGuideCommentsValue([{ body: "x", reply_to: "zz" }], guide, comments)).toThrow(/not a comment thread/);
    expect(() => parseCreateGuideCommentsValue([{ body: "Great guide" }], guide, comments)).toThrow(/already posted/);
    expect(() => parseCreateGuideCommentsValue([{ quote: "Ribosomes are small." }], guide, comments)).toThrow(/body is required/);
  });
  it("edits only my comments, resolves only threads", () => {
    expect(parseUpdateGuideCommentsValue([{ id: "c-2", body: "Great guide!" }], comments)[0]).toMatchObject({
      body: "Great guide!",
      base: { body: "Great guide", version: 2 },
      changed: ["body"],
    });
    expect(parseUpdateGuideCommentsValue([{ id: "c-1", resolved: true }], comments)[0]).toMatchObject({ resolved: true });
    expect(() => parseUpdateGuideCommentsValue([{ id: "c-1", body: "hijack" }], comments)).toThrow(/someone else wrote/);
    expect(() => parseUpdateGuideCommentsValue([{ id: "r-1", resolved: true }], comments)).toThrow(/resolve its thread c-1/);
    expect(() => parseUpdateGuideCommentsValue([{ id: "c-2", resolved: false }], comments)).toThrow(/changes nothing/);
  });
  it("deletes only my comments", () => {
    expect(parseDeleteGuideCommentsValue(["r-1", { id: "c-2" }], comments).map((c) => c.id)).toEqual(["r-1", "c-2"]);
    expect(() => parseDeleteGuideCommentsValue(["c-1"], comments)).toThrow(/someone else/);
  });
});

describe("every problem at once (owner ruling 2026-09-27)", () => {
  const messageOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error("expected a refusal");
  };

  it("create_personal_notes reports bad entries, then repeats and existing highlights", () => {
    const message = messageOf(() =>
      parseCreatePersonalNotesValue(
        [
          { quote: "chloroplast", color: "red" },
          { quote: "Ribosomes make proteins." },
          { quote: "Ribosomes make proteins." },
          { quote: "powerhouse of the cell" },
        ],
        guide,
        notes,
      ),
    );
    const lines = message.split("\n");
    expect(lines[0]).toBe("create_personal_notes was refused: 4 problems.");
    expect(lines[1]).toMatch(/^1\. create_personal_notes\[0\] "chloroplast": color must be one of/);
    expect(lines[2]).toMatch(/^2\. create_personal_notes\[0\] "chloroplast": quote "chloroplast" is not in the guide's text/);
    expect(lines[3]).toMatch(/^3\. .*same quote more than once/);
    expect(lines[4]).toMatch(/^4\. create_personal_notes\[3\]: the person already highlighted .*hl-1/);
  });

  it("update and delete report every unknown id beside item problems", () => {
    const update = messageOf(() =>
      parseUpdatePersonalNotesValue([{ id: "nt-1", color: "blue" }, { id: "zz", note: "x" }], notes),
    );
    expect(update).toMatch(/1\. update_personal_notes\[0\] sets a color/);
    expect(update).toMatch(/2\. update_personal_notes\[1\]\.id "zz" is not one of/);
    const del = messageOf(() => parseDeleteGuideCommentsValue(["c-1", "zz", "c-2", "c-2"], comments));
    expect(del).toMatch(/3 problems/);
    expect(del).toMatch(/1\. delete_guide_comments\[0\] "c-1" was written by someone else/);
    expect(del).toMatch(/2\. delete_guide_comments\[1\] "zz" is not a comment/);
    expect(del).toMatch(/3\. .*"c-2" \(at \[2\], \[3\]\)/);
  });

  it("create_guide_comments reports every problem in one entry and across the list", () => {
    const message = messageOf(() =>
      parseCreateGuideCommentsValue(
        [{ reply_to: "r-1", quote: "x" }, { body: "Great guide" }],
        guide,
        comments,
      ),
    );
    expect(message).toMatch(/create_guide_comments\[0\]\.body is required/);
    expect(message).toMatch(/reply to its thread c-1/);
    expect(message).toMatch(/takes only body/);
    expect(message).toMatch(/already posted "Great guide"/);
    expect(message.endsWith("Nothing was changed.")).toBe(true);
  });
});
