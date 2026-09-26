import {
  buildDirectory,
  matchFeature,
  matchStrength,
  summarize,
} from "../index-model";

const defs = [
  {
    mandate_key: "flashcards.generate_cards",
    label: "Flashcards — Generate Cards",
    description: "Writes study cards from a source",
    goal: null,
  },
  {
    mandate_key: "flashcards.grade",
    label: "Flashcards — Grade Answer",
    description: null,
    goal: "Mark an answer right or wrong",
  },
  {
    mandate_key: "notes.organize",
    label: "Notes Organizer",
    description: "Files a note into folders",
    goal: null,
  },
  {
    mandate_key: "seo.site_intake",
    label: "Marketing — Site Intake",
    description: null,
    goal: null,
  },
];

const holders = [
  {
    mandateKey: "flashcards.generate_cards",
    holderName: "Card Smith",
    holderType: "agent",
    status: "active" as const,
  },
  {
    mandateKey: "flashcards.grade",
    holderName: "Grader Flow",
    holderType: "workflow",
    status: "active" as const,
  },
  {
    mandateKey: "notes.organize",
    holderName: "None",
    holderType: null,
    status: "draft" as const,
  },
];

const dir = buildDirectory(defs, holders);
const card = (feature: string) => dir.find((row) => row.feature === feature)!;

describe("intelligence directory", () => {
  it("strips the feature label from job names and counts agents and workflows equally", () => {
    expect(card("flashcards").jobs.map((j) => j.name)).toEqual([
      "Generate Cards",
      "Grade Answer",
    ]);
    expect(summarize(card("flashcards"))).toEqual({
      agents: 1,
      workflows: 1,
      notRunning: 0,
      known: true,
    });
    expect(summarize(card("notes"))).toMatchObject({
      notRunning: 1,
      known: true,
    });
  });

  it("strips the Domain name too, and search finds a card by its Domain", () => {
    expect(card("seo").jobs.map((j) => j.name)).toEqual(["Site Intake"]);
    expect(matchFeature(card("seo"), "marketing")).toEqual({ kind: "name" });
    expect(matchFeature(card("flashcards"), "education")).toEqual({
      kind: "name",
    });
  });

  it("knows nothing about holders until the member list answers", () => {
    expect(
      summarize(buildDirectory(defs).find((r) => r.feature === "flashcards")!)
        .known,
    ).toBe(false);
  });

  it("finds a feature by its name, a job, what a job does, a place, and who runs it", () => {
    expect(matchFeature(card("flashcards"), "flash")).toEqual({ kind: "name" });
    expect(matchFeature(card("flashcards"), "grade answer")).toEqual({
      kind: "job",
      text: "Grade Answer",
    });
    expect(matchFeature(card("flashcards"), "study cards")).toEqual({
      kind: "job",
      text: "Generate Cards",
    });
    expect(matchFeature(card("flashcards"), "right or wrong")).toEqual({
      kind: "job",
      text: "Grade Answer",
    });
    expect(matchFeature(card("flashcards"), "grader flow")).toEqual({
      kind: "holder",
      text: "Grader Flow",
    });
    const place = card("flashcards").places[0];
    expect(matchFeature(card("flashcards"), place.label)).toMatchObject({
      kind: expect.stringMatching(/place|job|name/),
    });
    expect(matchFeature(card("notes"), "grader")).toBeNull();
  });

  it("ranks the name above one-thing matches above words spread across several", () => {
    const spread = matchFeature(card("flashcards"), "study wrong")!;
    expect(matchStrength(spread)).toBe(0);
    expect(matchStrength({ kind: "name" })).toBe(2);
    expect(matchStrength({ kind: "job", text: "x" })).toBe(1);
  });
});

describe("directory sections (Arman, 2026-09-26)", () => {
  const { buildDomains } = jest.requireActual("../index-model");
  const sections = buildDomains(
    [
      "chat.default_new_chat",
      "voice.intro",
      "memory.observer",
      "app.city_explorer",
      "agent_factory.structure_builder",
      "iteration.architect",
      "orchestras.role_describer",
      "tools.summarize_content",
      "orchestration.tool_failure_standoff_decision",
      "education.page_guidance",
      "shortcut.translate_to_persian",
    ].map((mandate_key) => ({ mandate_key })),
  ) as {
    domain: string;
    label: string;
    features: { feature: string; label: string }[];
  }[];
  const sectionOf = (feature: string) =>
    sections.find((section) =>
      section.features.some((row) => row.feature === feature),
    )?.label;

  it("Agents holds only agent and system-prompt authoring", () => {
    const agents = sections.find((section) => section.domain === "agents");
    expect(agents?.features.map((row) => row.feature).sort()).toEqual([
      "agent-iteration",
      "agent-studio",
    ]);
  });

  it("Chat is its own section; nothing sits under Agents because an agent fills it", () => {
    expect(sectionOf("chat")).toBe("Chat");
    expect(sectionOf("voice")).toBe("Chat");
    expect(sectionOf("agent-memory")).toBe("Chat");
    expect(sectionOf("orchestras")).toBe("Workflows");
    expect(sectionOf("agent-tools")).toBe("Platform");
    expect(sectionOf("execution-runtime")).toBe("Platform");
  });

  it("Agent Apps, then Not yet assigned, close the page", () => {
    expect(sections.slice(-2).map((section) => section.label)).toEqual([
      "Agent Apps",
      "Not yet assigned",
    ]);
    expect(
      sections[sections.length - 1].features.map((row) => row.label),
    ).toEqual(["Education", "Not yet assigned to a domain"]);
  });
});

describe("the card never promises more than the page shows", () => {
  it("drops definitions the member list does not return from this seat, once it answers", () => {
    const { buildDirectory: build } = jest.requireActual("../index-model");
    const rows = build(
      [{ mandate_key: "app.mine" }, { mandate_key: "app.someone_elses" }],
      [{ mandateKey: "app.mine", holderName: "A", holderType: "agent", status: "active" }],
    ) as { feature: string; jobs: unknown[] }[];
    expect(rows.find((row) => row.feature === "agent-apps")?.jobs).toHaveLength(1);
    const before = build([{ mandate_key: "app.mine" }, { mandate_key: "app.someone_elses" }]) as { feature: string; jobs: unknown[] }[];
    expect(before.find((row) => row.feature === "agent-apps")?.jobs).toHaveLength(2);
  });
});
