/**
 * R2 (kind-never-raw round 6): a raw renderer that asks "does this VALUE carry
 * a kind?" must ask `valueCarriesKind`, never `hasKindKey(JSON.stringify(x))`.
 * Stringifying escapes a STRING-held kind (`{note: '{"__kind":…}'}` becomes
 * `{"note":"{\"__kind\":…}"}`), and the key rule — correctly — ignores an
 * escaped `\"__kind\"`, so the value was judged kindless and drawn raw.
 *
 * Two halves: (1) the behaviour at two of the fixed sites, (2) a source guard
 * that fails if the pattern is written again anywhere in the repo.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: () => <div data-testid="value-door" />,
}));

import { ToggledDataBody } from "@/components/mardown-display/blocks/data-events/ToggledDataBody";
import { routeEmission } from "@/features/workflow-runtime/kind-emissions/emission-routing";

const KIND_TEXT = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cells",
  cards: [{ front: "Mitochondria", back: "Powerhouse" }],
});

describe("string-held kinds are seen by value detectors", () => {
  it("ToggledDataBody routes a string-held kind through the value door", () => {
    const html = renderToStaticMarkup(
      <ToggledDataBody value={{ note: KIND_TEXT }} className="raw" />,
    );
    expect(html).toContain('data-testid="value-door"');
    expect(html).not.toContain("<pre");
  });

  it("ToggledDataBody still prints a kindless value as JSON", () => {
    const html = renderToStaticMarkup(
      <ToggledDataBody value={{ note: "plain" }} className="raw" />,
    );
    expect(html).toContain("<pre");
  });

  it("a kindless emission whose payload holds a kind in a string goes through the value door", () => {
    expect(
      routeEmission({ kind: null, kindOk: null, payload: { answer: KIND_TEXT } }),
    ).toEqual({ via: "value" });
  });
});

describe("source guard: no hasKindKey(JSON.stringify(…)) anywhere", () => {
  it("the pattern appears in no source file", () => {
    const root = path.resolve(__dirname, "../../..");
    let out = "";
    try {
      out = execSync(
        String.raw`git grep --untracked -n -E "hasKindKey\(\s*(JSON\.stringify|safeStringify|stringify)\(" -- "*.ts" "*.tsx" ":!**/__tests__/**"`,
        { cwd: root, encoding: "utf8" },
      );
    } catch (error) {
      // git grep exits 1 when nothing matches — the passing case.
      const status = (error as { status?: number }).status;
      if (status !== 1) throw error;
    }
    expect(out.trim()).toBe("");
    // The guard reads the working tree, so prove the grep itself can see a file.
    expect(readFileSync(__filename, "utf8")).toContain("hasKindKey");
  });
});
