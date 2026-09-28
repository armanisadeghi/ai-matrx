import {
  parseAssignResourcesValue,
  parseAttachContentValue,
  parseDetachContentValue,
  parseUnassignResourcesValue,
  parseUpdateClassValue,
} from "../classHubAgentWrites";
import type { CurrentClass } from "../classAgentWrites";

const DECK = "11111111-1111-4111-8111-111111111111";
const QUIZ = "22222222-2222-4222-8222-222222222222";

const bio: CurrentClass = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  slug: "ap-biology",
  name: "AP Biology",
  description: "",
  settings: {
    examDates: [{ id: "e1", title: "Midterm", date: "2026-10-15" }],
    teacher: "Dr. Chen",
    accessMode: "closed",
  },
};
const chem: CurrentClass = {
  ...bio,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  slug: "chem",
  name: "Chemistry",
};

describe("update_class value", () => {
  it("changes only the sent fields on the open class", () => {
    const plan = parseUpdateClassValue({ description: "Honors" }, bio, [bio, chem]);
    expect(plan.id).toBe(bio.id);
    expect(plan.patch.description).toBe("Honors");
    expect(plan.patch.settings.teacher).toBe("Dr. Chen");
    expect(plan.patch.settings.examDates).toHaveLength(1);
    expect(plan.changed).toEqual(["description"]);
  });

  it("refuses a rename onto another class, naming update_class", () => {
    expect(() => parseUpdateClassValue({ name: "Chemistry" }, bio, [bio, chem])).toThrow(
      /update_class/,
    );
  });

  it("refuses an array or a different class id", () => {
    expect(() => parseUpdateClassValue([{ name: "X" }], bio, [bio])).toThrow(/JSON OBJECT/);
    expect(() => parseUpdateClassValue({ id: chem.id, name: "X" }, bio, [bio, chem])).toThrow(
      /only the class open on this page/,
    );
  });
});

describe("content and assignment lists", () => {
  it("attaches new items and refuses ones already tagged, listing every problem", () => {
    expect(parseAttachContentValue([{ token: "fc_set", id: DECK }], new Set())).toEqual([
      { token: "fc_set", id: DECK },
    ]);
    let message = "";
    try {
      parseAttachContentValue(
        [
          { token: "fc_set", id: DECK },
          { token: "widget", id: QUIZ },
          { token: "note", id: "nope" },
        ],
        new Set([`fc_set:${DECK}`]),
      );
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/already in study_content/);
    expect(message).toMatch(/token must be one of/);
    expect(message).toMatch(/must be the record's UUID/);
  });

  it("detaches only what is tagged", () => {
    expect(() =>
      parseDetachContentValue([{ token: "note", id: DECK }], new Set()),
    ).toThrow(/not in study_content/);
  });

  it("assigns decks and quizzes with an optional due date, refusing bad dates and repeats", () => {
    expect(
      parseAssignResourcesValue([
        { token: "fc_set", id: DECK, due_date: "2026-11-01" },
        { token: "assessment", id: QUIZ },
      ]),
    ).toEqual([
      { token: "fc_set", id: DECK, dueDate: "2026-11-01" },
      { token: "assessment", id: QUIZ, dueDate: null },
    ]);
    expect(() =>
      parseAssignResourcesValue([{ token: "fc_set", id: DECK, due_date: "2026-02-30" }]),
    ).toThrow(/real date/);
    expect(() =>
      parseAssignResourcesValue([
        { token: "fc_set", id: DECK },
        { token: "fc_set", id: DECK },
      ]),
    ).toThrow(/repeats/);
    expect(() => parseAssignResourcesValue([{ token: "note", id: DECK }])).toThrow(
      /token must be one of/,
    );
  });

  it("unassigns only what is assigned; a string value is refused", () => {
    expect(() =>
      parseUnassignResourcesValue([{ token: "fc_set", id: DECK }], new Set()),
    ).toThrow(/not in assignments/);
    expect(() => parseUnassignResourcesValue("fc_set", new Set())).toThrow(/JSON ARRAY/);
  });
});
