import { stripDuplicatePortionHeading } from "@/lib/markdown/portion-heading";

const SLIDE = { label: "Slide", number: 1, title: "Kickoff" } as const;

describe("stripDuplicatePortionHeading", () => {
  it("strips the exact shape the Office codec emits", () => {
    // aidream matrx-files: `f"## Slide {number}" + (f": {title}" if title else "")`
    const src = "## Slide 1: Kickoff\n\n- Welcome\n- Agenda";
    expect(stripDuplicatePortionHeading(src, SLIDE)).toBe(
      "- Welcome\n- Agenda",
    );
  });

  it("strips a numbered heading when the portion has no title", () => {
    const src = "## Slide 4\n- Body";
    expect(
      stripDuplicatePortionHeading(src, {
        label: "Slide",
        number: 4,
        title: null,
      }),
    ).toBe("- Body");
  });

  it("strips a title-only heading", () => {
    const src = "# Kickoff\n\nBody";
    expect(stripDuplicatePortionHeading(src, SLIDE)).toBe("Body");
  });

  it("matches regardless of case, spacing, separator, and trailing colon", () => {
    for (const heading of [
      "### slide  1 :  kickoff",
      "## Slide 1 - Kickoff",
      "## Slide 1 — Kickoff",
      "## Slide 1 Kickoff",
      "## Slide 1: Kickoff:",
    ]) {
      expect(stripDuplicatePortionHeading(`${heading}\n\nBody`, SLIDE)).toBe(
        "Body",
      );
    }
  });

  it("works for any portion kind, not just slides", () => {
    expect(
      stripDuplicatePortionHeading("## Sheet: Q3\n\n| a |\n| - |", {
        label: "Sheet",
        title: "Q3",
      }),
    ).toBe("| a |\n| - |");
  });

  it("leaves a heading that carries real content alone", () => {
    const src = "## Introduction\n\n- Welcome";
    expect(stripDuplicatePortionHeading(src, SLIDE)).toBe(src);
  });

  it("leaves a heading with extra detail alone when the portion has no title", () => {
    // The codec knows something the divider doesn't — never drop it.
    const src = "## Slide 2: Roadmap\n\nBody";
    expect(
      stripDuplicatePortionHeading(src, {
        label: "Slide",
        number: 2,
        title: null,
      }),
    ).toBe(src);
  });

  it("only ever removes the FIRST heading", () => {
    const src = "## Slide 1: Kickoff\n\nBody\n\n## Slide 1: Kickoff\n\nMore";
    expect(stripDuplicatePortionHeading(src, SLIDE)).toBe(
      "Body\n\n## Slide 1: Kickoff\n\nMore",
    );
  });

  it("does not touch a portion whose body merely starts with the title as prose", () => {
    const src = "Kickoff\n\n- Welcome";
    expect(stripDuplicatePortionHeading(src, SLIDE)).toBe(src);
  });

  it("returns empty / nullish input unchanged", () => {
    expect(stripDuplicatePortionHeading("", SLIDE)).toBe("");
    expect(stripDuplicatePortionHeading(null, SLIDE)).toBe("");
    expect(stripDuplicatePortionHeading(undefined, SLIDE)).toBe("");
    expect(stripDuplicatePortionHeading("   \n\n", SLIDE)).toBe("   \n\n");
  });

  it("returns the source unchanged when the caller has no identity to compare", () => {
    const src = "## Slide 1: Kickoff\n\nBody";
    expect(stripDuplicatePortionHeading(src, {})).toBe(src);
    expect(
      stripDuplicatePortionHeading(src, { label: "Slide", title: "" }),
    ).toBe(src);
  });

  it("empties a title-only portion so the caller can render its own fallback", () => {
    expect(stripDuplicatePortionHeading("## Slide 1: Kickoff", SLIDE)).toBe("");
  });

  it("is idempotent — a second pass changes nothing", () => {
    const once = stripDuplicatePortionHeading("## Slide 1: Kickoff\n\n- a", SLIDE);
    expect(stripDuplicatePortionHeading(once, SLIDE)).toBe(once);
  });
});
