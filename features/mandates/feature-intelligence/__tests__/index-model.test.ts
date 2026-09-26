import { buildDirectory, matchFeature, matchStrength, summarize } from "../index-model";

const defs = [
  { mandate_key: "flashcards.generate_cards", label: "Flashcards — Generate Cards", description: "Writes study cards from a source", goal: null },
  { mandate_key: "flashcards.grade", label: "Flashcards — Grade Answer", description: null, goal: "Mark an answer right or wrong" },
  { mandate_key: "notes.organize", label: "Notes Organizer", description: "Files a note into folders", goal: null },
  { mandate_key: "seo.site_intake", label: "Marketing — Site Intake", description: null, goal: null },
];

const holders = [
  { mandateKey: "flashcards.generate_cards", holderName: "Card Smith", holderType: "agent", status: "active" as const },
  { mandateKey: "flashcards.grade", holderName: "Grader Flow", holderType: "workflow", status: "active" as const },
  { mandateKey: "notes.organize", holderName: "None", holderType: null, status: "draft" as const },
];

const dir = buildDirectory(defs, holders);
const card = (feature: string) => dir.find((row) => row.feature === feature)!;

describe("intelligence directory", () => {
  it("strips the feature label from job names and counts agents and workflows equally", () => {
    expect(card("flashcards").jobs.map((j) => j.name)).toEqual(["Generate Cards", "Grade Answer"]);
    expect(summarize(card("flashcards"))).toEqual({ agents: 1, workflows: 1, notRunning: 0, known: true });
    expect(summarize(card("notes"))).toMatchObject({ notRunning: 1, known: true });
  });

  it("strips the Domain name too, and search finds a card by its Domain", () => {
    expect(card("seo").jobs.map((j) => j.name)).toEqual(["Site Intake"]);
    expect(matchFeature(card("seo"), "marketing")).toEqual({ kind: "name" });
    expect(matchFeature(card("flashcards"), "education")).toEqual({ kind: "name" });
  });

  it("knows nothing about holders until the member list answers", () => {
    expect(summarize(buildDirectory(defs).find((r) => r.feature === "flashcards")!).known).toBe(false);
  });

  it("finds a feature by its name, a job, what a job does, a place, and who runs it", () => {
    expect(matchFeature(card("flashcards"), "flash")).toEqual({ kind: "name" });
    expect(matchFeature(card("flashcards"), "grade answer")).toEqual({ kind: "job", text: "Grade Answer" });
    expect(matchFeature(card("flashcards"), "study cards")).toEqual({ kind: "job", text: "Generate Cards" });
    expect(matchFeature(card("flashcards"), "right or wrong")).toEqual({ kind: "job", text: "Grade Answer" });
    expect(matchFeature(card("flashcards"), "grader flow")).toEqual({ kind: "holder", text: "Grader Flow" });
    const place = card("flashcards").places[0];
    expect(matchFeature(card("flashcards"), place.label)).toMatchObject({ kind: expect.stringMatching(/place|job|name/) });
    expect(matchFeature(card("notes"), "grader")).toBeNull();
  });

  it("ranks the name above one-thing matches above words spread across several", () => {
    const spread = matchFeature(card("flashcards"), "study wrong")!;
    expect(matchStrength(spread)).toBe(0);
    expect(matchStrength({ kind: "name" })).toBe(2);
    expect(matchStrength({ kind: "job", text: "x" })).toBe(1);
  });
});
