/**
 * FORCING FUNCTION: a title derived from markdown never carries its syntax.
 *
 * The break this catches (RC-B2 re-verification, 2026-09-25): a pasted note
 * titled from its raw first line ("# AP Chemistry Nomenclature …") named the
 * flashcard set, quiz and memory aid made from it, so every one of them read
 * "# AP Chemistry …". The derivation sites each stripped a different subset
 * of syntax by hand (or none).
 *
 * Use case: a chemistry teacher pasting unit notes; a dispatcher's route note.
 */
import {
  displayTitle,
  plainTitleFromMarkdown,
  withDisplayTitle,
} from "@/components/markdown-core/plain-title";
import { generateLabelFromContent } from "@/features/notes/hooks/useAutoLabel";
import { pastedNotesTitle } from "@/features/education/onboard/pasted-notes-title";

describe("plainTitleFromMarkdown", () => {
  it.each([
    ["# AP Chemistry Nomenclature: Ionic Compounds\n\nCations first.", "AP Chemistry Nomenclature: Ionic Compounds"],
    ["## **Unit 3** — *Stoichiometry* ##\nbody", "Unit 3 — Stoichiometry"],
    ["---\ntitle: x\n---\n\n> Route board for `North Industrial`\n", "Route board for North Industrial"],
    ["```bash\npnpm dev\n```\n- [ ] Call [Harbor Commercial](https://example.com) at 9", "Call Harbor Commercial at 9"],
    ["1. Balance \\(H_2 + O_2\\) first\n2. then", "Balance \\(H_2 + O_2\\) first"],
    ["Plain first line with snake_case_name\nsecond", "Plain first line with snake_case_name"],
    ["\n\n<route_note>Tuesday pickups</route_note>", "Tuesday pickups"],
  ])("%j → %j", (source, expected) => {
    expect(plainTitleFromMarkdown(source)).toBe(expected);
  });

  it("cuts long titles at a word boundary", () => {
    expect(
      plainTitleFromMarkdown("# The periodic table groups elements by valence electrons", { maxLength: 30 }),
    ).toBe("The periodic table groups…");
  });

  it("is idempotent on a clean title and keeps an all-syntax title readable", () => {
    expect(displayTitle("AP Chemistry Nomenclature")).toBe("AP Chemistry Nomenclature");
    expect(displayTitle("# AP Chemistry Nomenclature")).toBe("AP Chemistry Nomenclature");
    expect(displayTitle("---")).toBe("---");
  });
});

describe("every title derivation goes through the projection", () => {
  it("a pasted note's title (the set / quiz / memory aid name) has no heading marker", () => {
    expect(pastedNotesTitle("# AP Chemistry Nomenclature\n\nCations first.")).toBe(
      "AP Chemistry Nomenclature",
    );
    expect(pastedNotesTitle("  ", undefined)).toBe("Pasted notes");
    expect(pastedNotesTitle("# ignored", "  Unit 3 review ")).toBe("Unit 3 review");
  });

  it("a note's auto-label strips emphasis and links, not only leading markers", () => {
    expect(generateLabelFromContent("# **Route** board for [Harbor](https://x.co)\nbody")).toBe(
      "Route board for Harbor",
    );
  });
});

describe("stored titles display clean without rewriting storage", () => {
  it("a set row read with a syntax title shows the clean name; a clean row is returned as-is", () => {
    const stored = { id: "set-1", name: "# AP Chemistry Nomenclature", topic: "chemistry" };
    const shown = withDisplayTitle(stored, "name");
    expect(shown).toEqual({ id: "set-1", name: "AP Chemistry Nomenclature", topic: "chemistry" });
    expect(stored.name).toBe("# AP Chemistry Nomenclature");
    const clean = { id: "set-2", name: "Route Safety Basics", topic: null };
    expect(withDisplayTitle(clean, "name")).toBe(clean);
  });
});
