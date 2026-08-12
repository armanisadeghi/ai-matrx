import {
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  PAGE_LIMIT_MIN,
  RESULT_LIMIT_DEFAULT,
  RESULT_LIMIT_MAX,
  RESULT_LIMIT_MIN,
  SCRAPE_MODE_BY_VALUE,
  SCRAPE_MODE_BY_WORKSPACE_MODE,
  SCRAPE_MODE_ENUM_TEXT,
  SCRAPE_MODE_VALUES,
  SCRAPE_MODES,
  isScrapeMode,
  isValidPageLimit,
  isValidResultLimit,
  toScrapeMode,
  toWorkspaceMode,
} from "./scrape-command";

/**
 * This module exists so the enum an agent is TOLD about (manifest prose), the
 * enum its value is CHECKED against (the write handlers), and the enum the UI
 * RENDERS cannot drift apart. These tests lock that guarantee — several of them
 * fail loudly on an edit that would otherwise break only at runtime, inside an
 * agent run, as a confusing refusal.
 */
describe("scrape-command vocabulary", () => {
  it("keeps the public and workspace vocabularies 1:1 and collision-free", () => {
    const values = SCRAPE_MODES.map((m) => m.value);
    const workspaceModes = SCRAPE_MODES.map((m) => m.workspaceMode);
    expect(new Set(values).size).toBe(SCRAPE_MODES.length);
    expect(new Set(workspaceModes).size).toBe(SCRAPE_MODES.length);
  });

  it("exposes every mode through both lookup tables", () => {
    for (const spec of SCRAPE_MODES) {
      expect(SCRAPE_MODE_BY_VALUE[spec.value]).toBe(spec);
      expect(SCRAPE_MODE_BY_WORKSPACE_MODE[spec.workspaceMode]).toBe(spec);
    }
    expect(Object.keys(SCRAPE_MODE_BY_VALUE)).toHaveLength(SCRAPE_MODES.length);
    expect(Object.keys(SCRAPE_MODE_BY_WORKSPACE_MODE)).toHaveLength(
      SCRAPE_MODES.length,
    );
  });

  it("keeps SCRAPE_MODE_VALUES and the enum prose in UI order", () => {
    expect(SCRAPE_MODE_VALUES).toEqual(SCRAPE_MODES.map((m) => m.value));
    expect(SCRAPE_MODE_ENUM_TEXT).toBe(SCRAPE_MODE_VALUES.join(" | "));
  });

  it("gives every mode the prose the write contract interpolates", () => {
    for (const spec of SCRAPE_MODES) {
      expect(spec.summary.trim()).not.toBe("");
      expect(spec.label.trim()).not.toBe("");
    }
  });

  it("declares a live config input for every mode", () => {
    // The `scrape_command` handler refuses a field the resolved mode does not
    // use by reading `spec.input`. An unknown value there would let a URL or
    // keyword stage into an input the user cannot see.
    for (const spec of SCRAPE_MODES) {
      expect(["url", "keyword"]).toContain(spec.input);
    }
  });

  /**
   * `scraper.manifest.ts` builds its contract prose with
   * `SCRAPE_MODES.find((m) => m.usesPageLimit)!.value` (and the same for
   * `usesResultLimit`). That non-null assertion is only sound while EXACTLY one
   * mode carries each flag — zero would throw at module load, and two would
   * silently name the wrong mode in the text an agent is told to trust.
   */
  it("has exactly one page-limited mode and one result-limited mode", () => {
    expect(SCRAPE_MODES.filter((m) => m.usesPageLimit)).toHaveLength(1);
    expect(SCRAPE_MODES.filter((m) => m.usesResultLimit)).toHaveLength(1);
  });

  it("never puts both budgets on the same mode", () => {
    // The two limits address different modes; one mode owning both would make
    // the "applies to X mode only" half of each contract false.
    for (const spec of SCRAPE_MODES) {
      expect(spec.usesPageLimit && spec.usesResultLimit).toBe(false);
    }
  });

  it("only bounds keyword modes — the single-URL mode has no budget", () => {
    for (const spec of SCRAPE_MODES) {
      if (spec.input === "url") {
        expect(spec.usesPageLimit).toBe(false);
        expect(spec.usesResultLimit).toBe(false);
      }
    }
  });
});

describe("isScrapeMode", () => {
  it.each(SCRAPE_MODES.map((m) => m.value))("accepts %s", (value) => {
    expect(isScrapeMode(value)).toBe(true);
  });

  it.each(SCRAPE_MODES.map((m) => m.workspaceMode))(
    "rejects the INTERNAL workspace key %s — agents only speak the public enum",
    (workspaceMode) => {
      // `url` is both a workspace key and a valid `input`; it must never be
      // accepted as a public mode, or `SCRAPE_MODE_BY_VALUE[...]` is undefined
      // and the handler dereferences it.
      expect(SCRAPE_MODE_VALUES).not.toContain(workspaceMode as never);
      expect(isScrapeMode(workspaceMode)).toBe(false);
    },
  );

  it.each([
    ["a near-miss string", "Quick"],
    ["an empty string", ""],
    ["whitespace", "  full  "],
    ["a number", 1],
    ["null", null],
    ["undefined", undefined],
    ["an object", { mode: "quick" }],
    ["an array", ["quick"]],
  ])("rejects %s rather than coercing", (_label, value) => {
    expect(isScrapeMode(value)).toBe(false);
  });
});

describe("mode bridging", () => {
  it("round-trips public → workspace → public for every mode", () => {
    for (const spec of SCRAPE_MODES) {
      expect(toWorkspaceMode(spec.value)).toBe(spec.workspaceMode);
      expect(toScrapeMode(spec.workspaceMode)).toBe(spec.value);
      expect(toScrapeMode(toWorkspaceMode(spec.value))).toBe(spec.value);
    }
  });
});

describe("limit guards", () => {
  describe.each([
    {
      name: "isValidPageLimit",
      guard: isValidPageLimit,
      min: PAGE_LIMIT_MIN,
      max: PAGE_LIMIT_MAX,
      fallback: PAGE_LIMIT_DEFAULT,
    },
    {
      name: "isValidResultLimit",
      guard: isValidResultLimit,
      min: RESULT_LIMIT_MIN,
      max: RESULT_LIMIT_MAX,
      fallback: RESULT_LIMIT_DEFAULT,
    },
  ])("$name", ({ guard, min, max, fallback }) => {
    it("accepts both bounds inclusively", () => {
      expect(guard(min)).toBe(true);
      expect(guard(max)).toBe(true);
    });

    it("accepts the default the UI starts at", () => {
      expect(guard(fallback)).toBe(true);
      expect(fallback).toBeGreaterThanOrEqual(min);
      expect(fallback).toBeLessThanOrEqual(max);
    });

    it("rejects just outside each bound", () => {
      expect(guard(min - 1)).toBe(false);
      expect(guard(max + 1)).toBe(false);
    });

    it("rejects zero and negatives", () => {
      expect(guard(0)).toBe(false);
      expect(guard(-1)).toBe(false);
    });

    it.each([
      ["a fraction in range", 2.5],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
    ])("rejects %s", (_label, value) => {
      expect(guard(value)).toBe(false);
    });

    it.each([
      ["a numeric string", "5"],
      ["an empty string", ""],
      ["null", null],
      ["undefined", undefined],
      ["a boolean", true],
      ["an object", { value: 5 }],
      ["an array", [5]],
    ])("rejects %s rather than coercing it", (_label, value) => {
      // The workspace stores the page count as a STRING in React state, so a
      // guard that accepted "5" would let a string reach `setMaxPages` unchecked
      // and read back as a number it never validated.
      expect(guard(value)).toBe(false);
    });
  });

  it("keeps the unscraped result ceiling well above the page-fetch ceiling", () => {
    // Documented rationale: search hits come back UNSCRAPED (one request),
    // where N pages is N fetches against other people's servers.
    expect(RESULT_LIMIT_MAX).toBeGreaterThan(PAGE_LIMIT_MAX);
    expect(PAGE_LIMIT_MIN).toBeGreaterThan(0);
    expect(RESULT_LIMIT_MIN).toBeGreaterThan(0);
  });
});
