// features/make/describe/__tests__/the-live-personal-requests-build.test.ts — lane F13.
//
// THE USE CASE. 2026-10-09, www.aimatrx.com, holder v8 of make.describe_template (deep parts as JSON text): three
// personal requests failed — "Track my clients' dog grooming appointments…", "A reading list where I rate books…",
// "Collect RSVPs for my daughter's birthday party…" (runs bff3f04c, 2502f33f, 0d08065f). Two showed the raw text
// "i.fields is not iterable", one "That did not come out right", and every run read `completed`.
// The fixture is those three runs' answers, byte for byte, read from chat.message.
//
// BREAKS THIS CATCHES: a JSON-text part reaching the check unread · the check refusing a one-table personal list
// or a seeded date-time · the box's read throwing a raw JS error instead of its own refusal · a refusal thrown
// OUTSIDE the run's coerce (where the run cannot record it as failed).

import {
  AnswerRefused,
  bindReuses,
  describeDeclaration,
  DesignRefused,
  readDesign,
  type ExistingTable,
} from "../describeTemplate";
import live from "./fixtures/v8-live-outputs-2026-10-09.json";

const answers = live as unknown as Record<string, Record<string, unknown>>;

/** The tables the walk's organization held that the answers reused (ids from the answers' own `reuses`). */
const EXISTING: ExistingTable[] = [
  {
    id: "7f30b67d-4c8a-4ab4-95f7-79b95fda2583",
    name: "Grooming Appointments",
    fields: [
      { key: "dog_name", label: "Dog's name", kind: "text" },
      { key: "breed", label: "Breed", kind: "text" },
      { key: "groomer_name", label: "Groomer's name", kind: "text" },
      { key: "owner_phone", label: "Owner phone", kind: "phone" },
      { key: "next_visit", label: "Next visit", kind: "datetime" },
      { key: "status", label: "Status", kind: "select", choices: ["Booked", "Completed", "Cancelled"] },
      { key: "notes", label: "Notes", kind: "text" },
    ],
  },
  {
    id: "689ea459-e898-438c-aabe-717ac9fe1b19",
    name: "Recommenders",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "connection", label: "How I know them", kind: "select", choices: ["Friend", "Family", "Colleague", "Author or critic", "Other"] },
      { key: "notes", label: "Notes", kind: "text" },
    ],
  },
];

describe("the three live personal requests build", () => {
  it.each(["dog-grooming", "reading-list", "birthday-rsvp"])("%s: the box reads, checks and declares the v8 answer", (name) => {
    const answer = answers[name]!;
    expect(typeof ((answer.template as Record<string, unknown>).tables as unknown[])[0]).toBe("string");
    for (const existing of [EXISTING, []]) {
      const design = readDesign(answer, existing);
      expect(design.checked.ok).toBe(true);
      expect(design.checked.spec.tables.length).toBeGreaterThan(0);
      for (const t of design.checked.spec.tables) expect(Array.isArray(t.fields)).toBe(true);
      const declared = describeDeclaration(bindReuses(design.checked.spec, design.safe.reuses, existing), "5dc930e9-bd65-44a1-8369-af773f6e1a5b", "f13");
      expect(declared).toBeTruthy();
    }
  });

  it("a part that is not JSON is the box's own refusal, never a raw JS error", () => {
    const answer = answers["reading-list"]!;
    const broken = { ...answer, template: { ...(answer.template as object), tables: ["{\"token\":\"book\",\"fields\":"] } };
    let thrown: unknown;
    try {
      readDesign(broken, []);
    } catch (e) {
      thrown = e;
    }
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(thrown).toBeInstanceOf(AnswerRefused);
    expect(String((thrown as Error).message)).not.toMatch(/is not iterable|undefined|Cannot read/);
  });

  it("a table with no fields is refused inside the read (so the run records it), as AnswerRefused", () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const answer = answers["birthday-rsvp"]!;
    const noFields = { ...answer, template: { ...(answer.template as object), tables: [JSON.stringify({ token: "rsvp", name: "RSVPs" })] } };
    let thrown: unknown;
    try {
      readDesign(noFields, []);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AnswerRefused);
    expect(String((thrown as Error).message)).not.toMatch(/is not iterable/);
    if (thrown instanceof DesignRefused) expect((thrown as Error).message.length).toBeGreaterThan(0);
  });
});
