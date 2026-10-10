import { describeKitGenerate, parseGenerateInKit, restoreKitGenerateRequest } from "../kitWrites";
import { buildKitDetailScope, kitOutlineEntries, kitOutlineStatus } from "../kitSurfaceScope";
import type { StudyKit } from "../kitService";

const art = (targetKind: "deck" | "quiz" | "summary" | "practice_test", artifactType: string, id: string, title: string) => ({
  edgeId: `e-${id}`, artifactType, artifactId: id, targetKind, title, href: `/x/${id}`, detail: null, sourceTitle: "Chem", createdAt: "2026-09-20T00:00:00Z",
});
const kit: StudyKit = {
  sourceType: "file", sourceId: "k1", title: "Chemistry", createdAt: "2026-09-20T00:00:00Z", sources: [],
  artifacts: [art("deck", "fc_set", "deck-1", "Main deck"), art("quiz", "assessment", "quiz-1", "Quiz 1"), art("summary", "study_media", "sum-1", "Summary")],
};
const outline = [{ id: "s1", title: "Isotopes" }, { id: "s2", title: "Bonding" }];

describe("generate_in_kit validation", () => {
  it("plans cloze cards into a live deck of this kit, sections resolved by title", () => {
    const plan = parseGenerateInKit({ kind: "deck", into: "deck-1", count: 20, card_kinds: ["cloze"], instruction: " isotopes ", section_titles: ["isotopes"] }, kit, outline);
    expect(plan).toMatchObject({ kind: "deck", count: 20, cardKinds: ["cloze"], instruction: "isotopes", sectionIds: ["s1"], sectionTitles: ["Isotopes"] });
    expect(plan.into).toEqual({ id: "deck-1", title: "Main deck", artifactType: "fc_set" });
  });
  it("accepts a new aid with no into", () => {
    expect(parseGenerateInKit({ kind: "quiz", count: 6, question_types: ["true_false"] }, kit, outline).into).toBeUndefined();
    expect(parseGenerateInKit({ kind: "mind_map" }, kit, []).kind).toBe("mind_map");
  });
  it("tells the agent every problem at once", () => {
    const problems = (v: unknown) => { try { parseGenerateInKit(v, kit, outline); return ""; } catch (e) { return (e as Error).message; } };
    expect(problems({ kind: "poster" })).toMatch(/kind must be one of/);
    expect(problems({ kind: "audio" })).toMatch(/kind must be one of/);
    expect(problems({ kind: "deck", into: "nope" })).toMatch(/not a member of this kit/);
    expect(problems({ kind: "deck", into: "quiz-1" })).toMatch(/is a quiz, not a deck/);
    expect(problems({ kind: "summary", into: "sum-1" })).toMatch(/only works with kind deck/);
    expect(problems({ kind: "deck", section_titles: ["Nope"] })).toMatch(/not an outline section. Sections: Isotopes \| Bonding/);
    expect(problems({ kind: "deck", section_titles: ["Isotopes"] })).toBe("");
    expect(() => parseGenerateInKit({ kind: "deck", section_titles: ["Isotopes"] }, kit, [])).toThrow(/needs an outline/);
    expect(problems({ kind: "deck", count: 0 })).toMatch(/whole number from 1 to 100/);
    expect(problems({ kind: "deck", count: 101 })).toMatch(/1 to 100/);
    expect(problems({ kind: "deck", card_kinds: ["haiku"] })).toMatch(/not one of basic, cloze/);
    expect(problems({ kind: "quiz", card_kinds: ["cloze"] })).toMatch(/only applies to kind deck/);
    expect(problems({ kind: "deck", question_types: ["true_false"] })).toMatch(/only applies to kind quiz/);
    expect(problems({ kind: "deck", extra: 1 })).toMatch(/extra is not a field/);
    const many = problems({ kind: "deck", count: 0, card_kinds: ["haiku"], into: "nope" });
    expect(many).toMatch(/count/); expect(many).toMatch(/card_kinds/); expect(many).toMatch(/into/);
    expect(problems([])).toMatch(/needs an object/);
  });
  it("round-trips through the run marker and names what it makes", () => {
    const plan = parseGenerateInKit({ kind: "deck", into: "deck-1", count: 5 }, kit, outline);
    const back = restoreKitGenerateRequest(JSON.parse(JSON.stringify(plan)));
    expect(back).toEqual(plan);
    expect(restoreKitGenerateRequest({ kind: "audio" })).toBeNull();
    expect(describeKitGenerate(plan)).toBe('5 flashcards for "Main deck"');
    expect(describeKitGenerate(parseGenerateInKit({ kind: "quiz" }, kit, []))).toBe("a new quiz");
  });
});

describe("kit outline in the scope", () => {
  const base = { sourceId: "k1", sourceType: "file", kit, loading: false, loadError: false, stats: {}, statsLoading: false, statsFailed: false };
  const coverage = { rows: [{ sectionId: "s1", title: "Isotopes", cards: 3, questions: 1 }, { sectionId: "s2", title: "Bonding", cards: 0, questions: 0 }], unmapped: { cards: 0, questions: 0 }, max: 4 };
  it("lists sections in order with counts and a status", () => {
    const scope = buildKitDetailScope({ ...base, outline: { sections: outline, coverage, building: false, stale: false } }) as unknown as Record<string, unknown>;
    expect(scope.outline).toEqual([{ title: "Isotopes", cards: 3, questions: 1 }, { title: "Bonding", cards: 0, questions: 0 }]);
    expect(scope.outline_status).toBe("ready");
  });
  it("says none / building / stale", () => {
    expect(kitOutlineStatus({ sectionCount: 0, building: false, stale: false })).toBe("none");
    expect(kitOutlineStatus({ sectionCount: null, building: false, stale: false })).toBe("none");
    expect(kitOutlineStatus({ sectionCount: 2, building: true, stale: false })).toBe("building");
    expect(kitOutlineStatus({ sectionCount: 2, building: false, stale: true })).toBe("stale");
    const none = buildKitDetailScope({ ...base, outline: { sections: [], coverage: null, building: false, stale: false } }) as unknown as Record<string, unknown>;
    expect(none.outline_status).toBe("none");
    expect(none.outline).toBeUndefined();
    expect(kitOutlineEntries(null, null)).toEqual([]);
  });
});
