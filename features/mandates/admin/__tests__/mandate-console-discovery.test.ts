import {
  filterMandateConsoleRows,
  isMandateConsoleDiscovering,
  mandateConsoleSearchText,
  processMandateConsoleRows,
  pruneMandateSelectionToVisible,
} from "../mandate-console-discovery";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
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
        discovering: true,
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
        discovering: false,
      }).map((row) => row.key),
    ).toEqual(["shortcut.make_flashcards"]);
  });

  it("still honors an explicit coverage filter during search", () => {
    expect(
      filterMandateConsoleRows(rows, {
        coverageFilter: "red",
        behindOnly: true,
        discovering: true,
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

  it("opens the full catalogue for column and layered discovery while retaining explicit coverage", () => {
    const state = (overrides: Partial<MatrxDataTableQueryState> = {}) => ({
      page: 1,
      pageSize: 50,
      search: "",
      anyOf: "",
      columnFilters: {},
      sort: null,
      ...overrides,
    });
    expect(isMandateConsoleDiscovering(state())).toBe(false);
    expect(isMandateConsoleDiscovering(state({ columnFilters: { feature: { kind: "select", value: "education" } } }))).toBe(true);
    expect(isMandateConsoleDiscovering(state({ layeredFilters: [{ id: "incomplete", field: "feature", operator: "equals", value: "" }] }))).toBe(false);
    expect(isMandateConsoleDiscovering(state({ layeredFilters: [{ id: "feature-equals", field: "feature", operator: "equals", value: "education" }] }))).toBe(true);

    const catalogue = [
      {
        mandateKey: "current.queue",
        mandateName: "queue",
        label: "Current queue",
        feature: "operations",
        agentName: "Queue agent",
        goal: null,
        mandate: { description: null },
        coverage: "green" as const,
        behindLatest: true,
      },
      {
        mandateKey: "education.current",
        mandateName: "current",
        label: "Education current",
        feature: "education",
        agentName: "Education agent",
        goal: "Teach",
        mandate: { description: "An up-to-date mandate" },
        coverage: "green" as const,
        behindLatest: false,
      },
      {
        mandateKey: "education.red",
        mandateName: "red",
        label: "Education red",
        feature: "education",
        agentName: "Education agent",
        goal: "Teach",
        mandate: { description: "Coverage remains explicit" },
        coverage: "red" as const,
        behindLatest: false,
      },
    ];
    const columns: MatrxColumnDef<(typeof catalogue)[number]>[] = [
      { accessorKey: "feature", header: "Feature", filter: "select" },
      { accessorKey: "mandateName", header: "Mandate" },
    ];

    expect(
      processMandateConsoleRows(catalogue, columns, state({
        columnFilters: { feature: { kind: "select", value: "education" } },
      }), { coverageFilter: null, behindOnly: true }).map((row) => row.mandateKey),
    ).toEqual(["education.current", "education.red"]);
    expect(
      processMandateConsoleRows(catalogue, columns, state({
        columnFilters: { feature: { kind: "select", value: "education" } },
      }), { coverageFilter: "red", behindOnly: true }).map((row) => row.mandateKey),
    ).toEqual(["education.red"]);
    expect(
      processMandateConsoleRows(catalogue, columns, state(), {
        coverageFilter: null,
        behindOnly: true,
      }).map((row) => row.mandateKey),
    ).toEqual(["current.queue"]);
  });

  it("searches non-behind rows, ranks identity matches, sorts, and keeps empty selects empty", () => {
    const state = (overrides: Partial<MatrxDataTableQueryState> = {}) => ({
      page: 1,
      pageSize: 50,
      search: "",
      anyOf: "",
      columnFilters: {},
      sort: null,
      ...overrides,
    });
    const catalogue = [
      {
        mandateKey: "prose.match",
        mandateName: "other",
        label: "Flashcards helper",
        feature: "education",
        agentName: "Agent",
        goal: "Create flashcards",
        mandate: { description: "A flashcards fallback" },
        coverage: "green" as const,
        behindLatest: false,
      },
      {
        mandateKey: "flashcards.generate",
        mandateName: "flashcards",
        label: "Generate",
        feature: "education",
        agentName: "Agent",
        goal: null,
        mandate: { description: null },
        coverage: "red" as const,
        behindLatest: false,
      },
    ];
    const columns: MatrxColumnDef<(typeof catalogue)[number]>[] = [
      { accessorKey: "feature", header: "Feature", filter: "select" },
      { accessorKey: "mandateName", header: "Mandate" },
    ];

    expect(
      processMandateConsoleRows(catalogue, columns, state({ search: "flashcards" }), {
        coverageFilter: null,
        behindOnly: true,
      }).map((row) => row.mandateKey),
    ).toEqual(["flashcards.generate", "prose.match"]);
    expect(
      processMandateConsoleRows(catalogue, columns, state({
        search: "flashcards",
        sort: { id: "mandateName", direction: "asc" },
      }), { coverageFilter: null, behindOnly: true }).map((row) => row.mandateKey),
    ).toEqual(["flashcards.generate", "prose.match"]);
    expect(
      processMandateConsoleRows(catalogue, columns, state({
        columnFilters: { feature: { kind: "select", value: "", values: [] } },
      }), { coverageFilter: null, behindOnly: true }),
    ).toEqual([]);
    expect(
      processMandateConsoleRows(catalogue, columns, state({ search: "flashcards" }), {
        coverageFilter: "red",
        behindOnly: true,
      }).map((row) => row.mandateKey),
    ).toEqual(["flashcards.generate"]);
  });

  it("drops hidden ids before a bulk action can receive them", () => {
    expect(
      pruneMandateSelectionToVisible(
        ["behind", "hidden"],
        [{ id: "behind" }],
      ),
    ).toEqual(["behind"]);
  });

  it("keeps discovered rows available to the console's identity and action paths", () => {
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
    expect(source).toContain("data={allRows}");
    expect(source).toContain("processLocalRows={processConsoleRows}");
    expect(source).toContain("onViewChange={handleViewChange}");
    expect(source).toContain("selectedIds: visibleSelectedIds");
    expect(source).toContain("allRows.find((r) => r.id === id)");
    expect(source).toContain("rowsRef.current = allRows");
  });
});
