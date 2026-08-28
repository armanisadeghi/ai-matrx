/**
 * THE ADOPTION SEAMS (Volley 5) — source guards on the three joins that the
 * shipped run surface now depends on.
 *
 * Each of these is a rule you cannot see from a rendered page and cannot catch
 * with a type: a component quietly reverting to its own derivation, an
 * exclusion crawling back in beside the rule that replaced it, a silent fork
 * where a loud fallback is required. They are cheap to assert at the source
 * level and expensive to find any other way.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

/** Every shipped .ts/.tsx under the app's own directories — no node_modules. */
function sourceFiles(): string[] {
  const roots = ["features", "app", "components", "lib", "hooks", "utils"];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  for (const root of roots) {
    const full = join(ROOT, root);
    if (existsSync(full)) walk(full);
  }
  return out;
}

const RUN_STAGE = "features/workflow-runtime/components/run/RunStage.tsx";
const RUN_START_FORM = "features/workflow-runtime/components/RunStartForm.tsx";
const SERVED_INPUT = "features/workflow-runtime/served-form/served-input.ts";
const SERVED_RUN_FORM = "features/workflow-runtime/served-form/ServedRunForm.tsx";
const SHARP_MODEL = "features/workflow-runtime/bakeoff/sharp/sharp-model.ts";

describe("the shipped run form is SERVED, and has no second branch", () => {
  const source = read(RUN_START_FORM);

  it("renders through ServedRunForm", () => {
    expect(source).toContain("ServedRunForm");
    expect(source).toContain("useServedRunForm");
  });

  it("has no client-side derivation left to fall back to", () => {
    // This assertion used to be its opposite: it REQUIRED `deriveRunForm` in
    // this file, because the version-skew fallback re-read the definition's
    // io.user_input nodes here. That derivation is deleted repo-wide, so the
    // guard flips — a reintroduced client-side reading of the graph is the
    // regression now.
    expect(source).not.toContain("deriveRunForm");
    expect(source).not.toContain("seedRunFormValues");
    expect(source).not.toContain("RunFormFieldControl");
    expect(source).not.toContain('data-run-form-branch="legacy"');
    // And no second submission shape: node_inputs was the legacy branch's
    // payload, and the served start sends flat `inputs` with input_sources.
    expect(source).not.toContain("nodeInputs");
  });

  it("keeps the skew case SERVED, and loud about what it cannot know", () => {
    // The fallback did not disappear — it moved one layer down, onto the
    // response's own older `sections` schema, so the degraded form still comes
    // from the server rather than from the client re-reading the graph.
    const parser = read(SERVED_INPUT);
    expect(parser).toContain("servedInputsFromSections");
    expect(parser).toContain("derivedFromSections");

    // A degraded surface must never read as a real declaration. The form says
    // which guarantees are missing, by name — sourcing above all, because an
    // input a person must answer EVERY run cannot be expressed by `sections`
    // and therefore will not be gated for one.
    const form = read(SERVED_RUN_FORM);
    expect(form).toContain("derivedFromSections");
    expect(form).toMatch(/EVERY run/);
  });
});

describe("the legacy run-form derivation is GONE, not deprecated", () => {
  const deleted = [
    "features/workflow-runtime/surface/run-form.ts",
    "features/workflow-runtime/components/RunFormFieldControl.tsx",
  ];

  it.each(deleted)("%s does not exist", (relative) => {
    expect(existsSync(join(ROOT, relative))).toBe(false);
  });

  it("no file imports it back", () => {
    // A source sweep, because a reintroduced module would satisfy every type
    // and every rendered page — the whole point of deleting it is that the
    // second answer to "what does this workflow ask for" cannot come back.
    const offenders = sourceFiles().filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        /from\s+["'][^"']*surface\/run-form["']/.test(source) ||
        /from\s+["'][^"']*RunFormFieldControl["']/.test(source)
      );
    });
    expect(offenders).toEqual([]);
  });
});

describe("the shipped run stage adopts the emission contract", () => {
  const source = read(RUN_STAGE);

  it("reserves deliverable slots from the served result schema", () => {
    expect(source).toContain("useResultSchema");
    expect(source).toContain("panelDeliverables");
    expect(source).toContain("showcaseDeliverables");
  });

  it("routes emissions through the contract's own components", () => {
    expect(source).toContain("DeliveredStream");
    expect(source).toContain("ShowcaseSlot");
    expect(source).toContain("splitByPresentation");
  });

  it("keeps LOADING and ERROR apart, so an in-flight promise never paints the degrade", () => {
    // Found in the browser: reading the schema as plain-or-null made a fetch
    // in flight look identical to an unreadable one, so a client-side
    // navigation painted every emission loose in the stream and then re-sorted
    // them into their slots under the reader — the exact shift the reserved
    // slots exist to end. Only a genuine error may degrade.
    expect(source).toContain('schemaState.status === "loading"');
    expect(source).toContain('schemaState.status === "error"');
    expect(source).toMatch(/schemaFailed \? \(\s*<RunDeliverables/);
  });

  it("no longer hand-rolls a second emissions section beside them", () => {
    // `RunEmissions` walked `run.emissions` with no knowledge of the declared
    // deliverables, which is exactly how one payload became two cards.
    expect(source).not.toContain("<RunEmissions");
  });

  it("keeps the D115 boundary — it reaches workflow-emit through no import of its own", () => {
    expect(source).not.toMatch(/from\s+["'][^"']*workflow-emit/);
  });
});

describe("the output.to_frontend exclusion is gone, not deprecated", () => {
  it("sharp-model exports no keepableDeliverables", () => {
    const source = read(SHARP_MODEL);
    expect(source).not.toMatch(/export function keepableDeliverables/);
  });

  it("nothing on the run stage mirrors it", () => {
    // The dedupe (widened key, deliverable slot wins) is the rule; an
    // exclusion beside it would hide the very node the rule renders once.
    expect(read(RUN_STAGE)).not.toContain("output.to_frontend");
  });
});
