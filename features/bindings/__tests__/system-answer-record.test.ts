/**
 * ── THE SYSTEM ANSWER HAS ONE WRITE PATH, AND THE CODE PICKS THE RECORD ──────
 *
 * 🚨 THE ORDER THIS GUARDS (Arman's standing default, FIX-R13/A, on top of
 * D19): *"the three controls write THE SYSTEM ANSWER; storage is not a
 * question put to a person."*
 *
 * FIX-R9-UI deleted the rung cell's **"Set System-wide binding instead"**
 * button from the admin host — correctly, because it asked the reader to
 * choose between "the job's own default" and "a platform-wide binding", and
 * that distinction is STORAGE. But nothing replaced it, so a NEW platform-wide
 * binding could not be created from that screen at all, and the page kept a
 * `useState` rung that no longer followed the data.
 *
 * The fix is not a third button. `systemAnswerRecord()` is the ONE place the
 * rule lives, `OneBindingWorkspace.writeBinding` is the ONE call site that
 * consults it, and this file proves both — the rule over its whole matrix, and
 * the call site by census rather than by snapshot.
 *
 * RED against the tree at `5c9e56eedc`: the module did not exist, the admin
 * host's rung was `useState`-held, and the binding branch keyed its
 * platform-wide refusals off `rung === "global"` — which is exactly the hole
 * that would have let an admin create a global binding with the super-admin
 * check skipped.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  hasLiveGlobalBinding,
  systemAnswerRecord,
  systemAnswerSaveWords,
  type SystemAnswerDraft,
} from "../system-answer-record";

const BINDINGS_DIR = join(__dirname, "..");
const WORKSPACE = join(BINDINGS_DIR, "OneBindingWorkspace.tsx");
const FEATURES_DIR = join(BINDINGS_DIR, "..");

const HOLDER_ONLY: SystemAnswerDraft = {
  hasGlobalBinding: false,
  carriesMapping: false,
  carriesSettings: false,
  carriesAutoRun: false,
};

// ── 1. THE RULE, over its whole matrix ──────────────────────────────────────

describe("which record the system answer is written to", () => {
  it("is the definition's own default when the answer names ONLY a holder", () => {
    expect(systemAnswerRecord(HOLDER_ONLY)).toBe("definition-default");
  });

  it.each([
    ["a mapping", { carriesMapping: true }],
    ["settings", { carriesSettings: true }],
    ["an auto-run promise", { carriesAutoRun: true }],
  ] as const)(
    "is the platform-wide binding when the answer also carries %s",
    (_label, extra) => {
      expect(systemAnswerRecord({ ...HOLDER_ONLY, ...extra })).toBe(
        "global-binding",
      );
    },
  );

  it("is the platform-wide binding once one exists, whatever the draft carries", () => {
    // The binding OUTRANKS the definition default. Writing the definition
    // underneath it would save a row that changes nothing and report success.
    expect(
      systemAnswerRecord({ ...HOLDER_ONLY, hasGlobalBinding: true }),
    ).toBe("global-binding");
  });

  it("reads a live global binding through ONE predicate", () => {
    expect(hasLiveGlobalBinding([])).toBe(false);
    expect(
      hasLiveGlobalBinding([{ principal_type: "user", is_enabled: true }]),
    ).toBe(false);
    // A disabled row is not an answer — it must not pull the page onto a rung
    // whose record nothing runs.
    expect(
      hasLiveGlobalBinding([{ principal_type: "global", is_enabled: false }]),
    ).toBe(false);
    expect(
      hasLiveGlobalBinding([{ principal_type: "global", is_enabled: true }]),
    ).toBe(true);
    // `is_enabled` absent means enabled — the column defaults true.
    expect(hasLiveGlobalBinding([{ principal_type: "global" }])).toBe(true);
  });

  it("names the record on the SAVE BUTTON — a label, never a paragraph", () => {
    const creating = systemAnswerSaveWords("global-binding", { exists: false });
    expect(creating).toBe("Set the system answer for everyone");
    expect(creating.split(".").length).toBe(1);
    expect(systemAnswerSaveWords("definition-default", { exists: false })).toBe(
      "Set the system answer",
    );
    // Once it exists, both records are just "the system answer" — the reader
    // is never asked to think about storage twice.
    expect(systemAnswerSaveWords("global-binding", { exists: true })).toBe(
      "Save the system answer",
    );
    expect(
      systemAnswerSaveWords("definition-default", { exists: true }),
    ).toBe("Save the system answer");
  });
});

// ── 2. EXACTLY ONE CALL SITE DECIDES ────────────────────────────────────────

describe("the census — one decider, and no second one can grow", () => {
  it("has exactly one component that calls BOTH doors", () => {
    const files = filesUnder(FEATURES_DIR).filter(
      (f) =>
        (f.endsWith(".ts") || f.endsWith(".tsx")) &&
        !f.includes("__tests__") &&
        // The API module DEFINES both doors; it does not choose between them.
        !f.endsWith(join("mandates", "overrides.ts")),
    );
    const deciders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return (
        src.includes("putMandateDefaultHolder(") &&
        src.includes("putMandateBinding(")
      );
    });
    expect(deciders.map((f) => f.slice(FEATURES_DIR.length + 1))).toEqual([
      join("bindings", "OneBindingWorkspace.tsx"),
    ]);
  });

  it("makes that one branch read the RULE, not the rung", () => {
    const src = readFileSync(WORKSPACE, "utf8");
    // The branch itself.
    expect(src).toContain("if (writingDefinitionDefault) {");
    expect(src).toContain("systemAnswerRecord({");
    // RED: the pre-change source had `if (onDefaultHolderRung) {` here, so a
    // system host that carried a map wrote the holder alone and dropped it.
    expect(src).not.toContain("if (onDefaultHolderRung) {");
  });

  it("keys every platform-wide refusal off the RECORD, never off the rung", () => {
    const src = readFileSync(WORKSPACE, "utf8");
    // RED: `rung === "global" && !canBindGlobal` and `rung === "global" &&
    // systemHolderIsPersonal` — both skipped entirely when the record flipped
    // to a binding on a job standing on the bottom rung.
    expect(src).toContain("writesForEveryone && !canBindGlobal");
    expect(src).toContain("writesForEveryone && systemHolderIsPersonal");
    expect(src).not.toContain('rung === "global" && !canBindGlobal');
    expect(src).not.toContain('rung === "global" && systemHolderIsPersonal');
    // …and the wire principal too: a `default:` branch would have written the
    // ADMIN'S OWN personal row for the platform's answer.
    expect(src).not.toContain('rung === "global"\n          ? { principalType: "global" }');
  });

  it("lets the admin host's rung FOLLOW THE DATA, so it can create either record", () => {
    const src = readFileSync(WORKSPACE, "utf8");
    // The rung is derived on the system perspective. RED: it was
    // `useState(pinned?.[0] ?? …)`, seeded once — so the page stayed on the
    // definition-default rung after the save that created the binding above it.
    expect(src).toContain("const [chosenRung, setRung]");
    expect(src).toMatch(
      /const rung: WorkspaceRung =\s*\n\s*perspective === "system"/,
    );
    expect(src).toContain("hasLiveGlobalBinding(data.bindings)");
  });
});

/** Every file under a directory, recursively. */
function filesUnder(dir: string): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "unused") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}
