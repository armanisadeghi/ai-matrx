import {
  filterMandateConsoleRows,
  mandateConsoleSearchText,
} from "../mandate-console-discovery";
import { readFileSync } from "fs";
import { join } from "path";

describe("admin mandate discovery", () => {
  const rows = [
    {
      key: "flashcards.generate_cards",
      coverage: "green" as const,
      behindLatest: false,
    },
    {
      key: "shortcut.make_flashcards",
      coverage: "green" as const,
      behindLatest: true,
    },
    {
      key: "flashcards.help_live",
      coverage: "red" as const,
      behindLatest: false,
    },
  ];

  it("searches the complete catalogue instead of the default standing queue", () => {
    expect(
      filterMandateConsoleRows(rows, {
        coverageFilter: null,
        behindOnly: true,
        searchQuery: "flashcard",
      }).map((row) => row.key),
    ).toEqual([
      "flashcards.generate_cards",
      "shortcut.make_flashcards",
      "flashcards.help_live",
    ]);
  });

  it("keeps the behind-latest queue as the unsearched default", () => {
    expect(
      filterMandateConsoleRows(rows, {
        coverageFilter: null,
        behindOnly: true,
        searchQuery: "   ",
      }).map((row) => row.key),
    ).toEqual(["shortcut.make_flashcards"]);
  });

  it("still honors an explicit coverage filter during search", () => {
    expect(
      filterMandateConsoleRows(rows, {
        coverageFilter: "red",
        behindOnly: true,
        searchQuery: "flashcard",
      }).map((row) => row.key),
    ).toEqual(["flashcards.help_live"]);
  });

  it("searches human labels, goals, agents, descriptions, and keys", () => {
    const text = mandateConsoleSearchText({
      mandateKey: "flashcards.generate_cards",
      mandateName: "generate_cards",
      label: "Topic deck composer",
      feature: "education",
      agentName: "Flashcard Topic Deck Composer",
      goal: "Create a study deck from any topic",
      mandate: { description: "Produces grounded cards" },
    });

    for (const expected of [
      "flashcards.generate_cards",
      "Topic deck composer",
      "Flashcard Topic Deck Composer",
      "Create a study deck from any topic",
      "Produces grounded cards",
    ]) {
      expect(text).toContain(expected);
    }
  });

  it("keeps labels and ordinary row clicks as doors to the management page", () => {
    const source = readFileSync(
      join(process.cwd(), "features/mandates/admin/MandatesConsole.tsx"),
      "utf8",
    );
    const labelColumn = source.slice(
      source.indexOf('id: "label"'),
      source.indexOf('id: "goal"'),
    );
    expect(labelColumn).toContain("adminMandateHref");
    expect(source).toContain("openOnRowClick: false");
    expect(source).toContain(
      "onRowOpen={(r) => openMandatePage(r.mandateKey)}",
    );
  });
});
