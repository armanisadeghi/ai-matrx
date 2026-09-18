// features/connectors/import/human-sentences.test.ts
//
// F-20 items 4 and 6 (VERIFY-B1-B2-R2 D9 and break K): the import review screens
// print sentences, never machine values. Two survivors of the D9 sweep and one
// latent arithmetic hole:
//
//  * the Contacts badge printed `Will update Ada (matched by
//    external_id:google_contacts)` — a raw column:provider pair at a person;
//  * the Tasks row printed `Due 2026-10-01` from `task.due_at.slice(0, 10)`, an
//    ISO string, in the same file whose helper exists so a date is never one;
//  * `_count_line` could print "import the other -2" when `already` exceeds the
//    tasks read, and the panel rendered that sentence verbatim.

import {
  importMatchKeyWords,
  importTaskCountLine,
} from "./field-labels";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("importMatchKeyWords", () => {
  it("says how a Person was recognised in words", () => {
    expect(importMatchKeyWords("external_id:google_contacts")).toBe(
      "its Google Contacts id",
    );
    expect(importMatchKeyWords("email")).toBe("its email address");
    expect(importMatchKeyWords("phone")).toBe("its phone number");
  });

  it("humanises a key nobody mapped instead of printing the column", () => {
    expect(importMatchKeyWords("name_key")).toBe("its name key");
    expect(importMatchKeyWords("")).toBe("something it already holds");
  });
});

describe("importTaskCountLine", () => {
  it("words the ordinary case", () => {
    expect(
      importTaskCountLine({ title: "My Tasks", total: 12, alreadyHere: 4 }),
    ).toBe("12 tasks in My Tasks, 4 already here, import the other 8.");
  });

  it("never prints a negative remainder (break K)", () => {
    expect(
      importTaskCountLine({ title: "My Tasks", total: 5, alreadyHere: 7 }),
    ).toBe("5 tasks in My Tasks, and all 5 are already here.");
  });

  it("words one task, an empty list and an all-imported list", () => {
    expect(
      importTaskCountLine({ title: "My Tasks", total: 0, alreadyHere: 0 }),
    ).toBe("No tasks in My Tasks.");
    expect(
      importTaskCountLine({ title: "My Tasks", total: 1, alreadyHere: 0 }),
    ).toBe("1 task in My Tasks, none already here, import it.");
    expect(
      importTaskCountLine({ title: "My Tasks", total: 1, alreadyHere: 1 }),
    ).toBe("1 task in My Tasks, and it is already here.");
  });
});

describe("the panels print no machine values", () => {
  const read = (name: string) =>
    readFileSync(join(__dirname, name), "utf8");

  it("the Contacts review never interpolates matched_by raw", () => {
    const source = read("GoogleContactsImportPanel.tsx");
    expect(source).not.toContain("matched by ${plan.matched_by}");
    expect(source).not.toContain("matched by ${contact.matched_by}");
    expect(source).toContain("importMatchKeyWords");
  });

  it("the Tasks review never slices an ISO date", () => {
    const source = read("GoogleTasksImportPanel.tsx");
    expect(source).not.toContain("due_at.slice(0, 10)");
    expect(source).toContain("importDateText(task.due_at)");
  });

  it("the Tasks review words its own counts, so a negative one cannot reach a person", () => {
    const source = read("GoogleTasksImportPanel.tsx");
    expect(source).toContain("importTaskCountLine");
  });
});
