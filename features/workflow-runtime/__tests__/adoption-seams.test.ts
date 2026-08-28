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

import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

const RUN_STAGE = "features/workflow-runtime/components/run/RunStage.tsx";
const RUN_START_FORM = "features/workflow-runtime/components/RunStartForm.tsx";
const SHARP_MODEL = "features/workflow-runtime/bakeoff/sharp/sharp-model.ts";

describe("the shipped run form is SERVED, with a loud fallback", () => {
  const source = read(RUN_START_FORM);

  it("renders through ServedRunForm", () => {
    expect(source).toContain("ServedRunForm");
    expect(source).toContain("useServedRunForm");
  });

  it("gates the legacy derivation on the served surface being absent", () => {
    // `surfaceServed` IS the version-skew guard: the endpoint answered AND the
    // answer carried a real declaration. A fork on anything else (a try/catch,
    // an empty-array check) would be the silent one.
    expect(source).toContain("surfaceServed");
    expect(source).toContain("deriveRunForm");
  });

  it("marks the fallback branch visibly — never a silent fork", () => {
    expect(source).toContain('data-run-form-branch="legacy"');
    // The banner must actually explain the consequence, not just exist.
    expect(source).toMatch(/declared input surface/);
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
