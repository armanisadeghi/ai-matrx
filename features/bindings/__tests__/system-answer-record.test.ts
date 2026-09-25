/**
 * ── THE SYSTEM ANSWER LIVES IN ONE RECORD: THE JOB'S OWN DEFAULT ────────────
 *
 * 🚨 OWNER RULING (Arman, 2026-09-25): the answer a job gives everybody lives
 * in ONE place, the mandate's own default. "If they happened through the UI
 * because something is confusing, that's a massive bug — fix the bug before
 * anything else."
 *
 * THE BUG. Until aidream 1037 the definition default had no column for a map,
 * settings or auto-run, so `systemAnswerRecord()` answered 'global-binding'
 * whenever the system answer carried one, and three screens wrote a
 * platform-wide `mandate.binding` (Holder included) beside the default:
 * `OneBindingWorkspace` (the admin host + the "Global" scope), `BatchMode`
 * ("Global" rung) and `MandateOverridesSimple` (system level). Live on
 * 2026-09-25 one had been written through the admin screen that morning.
 *
 * RED against the tree before this change: the matrix below expected
 * 'global-binding' for three of its rows, and the census found
 * `{ principalType: "global" }` in all three files.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  defaultAnswerSettingsOf,
  systemAnswerRecord,
  systemAnswerSaveWords,
  type SystemAnswerDraft,
} from "../system-answer-record";

const BINDINGS_DIR = join(__dirname, "..");
const WORKSPACE = join(BINDINGS_DIR, "OneBindingWorkspace.tsx");
const FEATURES_DIR = join(BINDINGS_DIR, "..");

const HOLDER_ONLY: SystemAnswerDraft = {
  carriesMapping: false,
  carriesSettings: false,
  carriesAutoRun: false,
};

// ── 1. ONE RECORD, WHATEVER THE ANSWER CARRIES ──────────────────────────────

describe("the record the system answer is written to", () => {
  it.each([
    ["only a holder", {}],
    ["a mapping", { carriesMapping: true }],
    ["settings", { carriesSettings: true }],
    ["an auto-run promise", { carriesAutoRun: true }],
  ] as const)("is the job's own default when the answer carries %s", (_l, extra) => {
    expect(systemAnswerRecord({ ...HOLDER_ONLY, ...extra })).toBe(
      "definition-default",
    );
  });

  it("reads the default's own map, settings and auto-run in a binding's shape", () => {
    const map = { topic: [{ mapType: "offered_value", target: "topic" }] };
    expect(
      defaultAnswerSettingsOf({
        default_consumption_map: map,
        default_config_overrides: { temperature: 0.3 },
        default_auto_run: true,
      }),
    ).toEqual({
      consumption_map: map,
      config_overrides: { temperature: 0.3 },
      auto_run: true,
    });
    expect(defaultAnswerSettingsOf({})).toEqual({
      consumption_map: null,
      config_overrides: null,
      auto_run: null,
    });
  });

  it("names whose answer it is on the Save button, from the job's home", () => {
    const systemHome = { systemHomed: true, homeName: "Matrx System" };
    expect(
      systemAnswerSaveWords("definition-default", {
        exists: false,
        home: systemHome,
      }),
    ).toBe("Set the system answer");
    expect(
      systemAnswerSaveWords("definition-default", {
        exists: true,
        home: systemHome,
      }),
    ).toBe("Save the system answer");
    expect(
      systemAnswerSaveWords("definition-default", {
        exists: false,
        home: { systemHomed: false, homeName: "Write Target Sandbox" },
      }),
    ).toBe("Set Write Target Sandbox's answer");
  });
});

// ── 2. THE CLASS GUARD — NO SCREEN WRITES A PLATFORM-WIDE BINDING ───────────

describe("the census — nothing in features/ asks for a platform-wide binding", () => {
  it("no source file sends principalType 'global' to a binding door", () => {
    const offenders = sourceFilesUnder(FEATURES_DIR).filter((f) =>
      /principalType:\s*"global"/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => f.slice(FEATURES_DIR.length + 1))).toEqual([]);
  });

  it("the workspace writes the system answer through the default door, with its settings", () => {
    const src = readFileSync(WORKSPACE, "utf8");
    expect(src).toContain(
      "const writingDefinitionDefault = systemHost || onDefaultHolderRung;",
    );
    // The default door receives the map, settings and auto-run the binding
    // branch would have sent — built by the same builder.
    expect(src).toContain("consumptionMap: settingsPayload.consumptionMap,");
    expect(src).toContain("autoRun: settingsPayload.autoRun ?? null,");
    // There is no global rung to choose (aidream 1041): the system host
    // stands on the default, and "Global" in a scope picker maps to it.
    expect(src).toMatch(
      /perspective === "system" \? DEFAULT_HOLDER_RUNG : chosenRung/,
    );
    expect(readFileSync(join(BINDINGS_DIR, "ScopeHolderBar.tsx"), "utf8")).toMatch(
      /if \(scope === AGENT_SCOPES\.GLOBAL\) return DEFAULT_HOLDER_RUNG;/,
    );
  });
});

/** Every non-test .ts/.tsx file under a directory, recursively. */
function sourceFilesUnder(dir: string): string[] {
  const { readdirSync, statSync } =
    require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "unused" || entry === "__tests__")
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFilesUnder(full));
    else if (
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !/\.test\.tsx?$/.test(full)
    )
      out.push(full);
  }
  return out;
}
