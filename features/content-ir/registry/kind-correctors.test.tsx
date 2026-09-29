/**
 * A draft_critique reaches NO renderer uncorrected, on any path.
 *
 * The case is the kind's own canonical example as stored on 2026-09-29: it states
 * 17 points and 6/10 while its three criteria sum to 3. Every path that takes a
 * value to a renderer is exercised here — the shape preview's streaming, reload and
 * server-partial paths (the same production code the chat uses), the complete-text
 * normalize (DB-loaded messages), the live-preview session, the direct-object
 * instance render, and the db-component reader — and each must show the rubric's
 * numbers with the change recorded where the reader can see it.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { IR_ENVELOPE_KEY, ParseSession, isCanonicalBlockIR, type CanonicalBlockIR } from "@ai-matrx/content-ir";
import { memoizedRegionEnvelope, withIrEnvelope } from "./region-envelope-memo";
import {
  KIND_CORRECTED_NOTICE,
  correctKindEnvelope,
  correctKindValue,
  envelopeFromCompleteValue,
  kindCorrectionsOf,
  sessionEnvelope,
} from "./kind-correctors";
import { runRenderPath } from "../render-paths/run-path";
import { RENDER_PATHS } from "../render-paths/paths";
import { blockKindCorrections } from "../react/db-component/DbKindComponentImpl";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

const seen: unknown[] = [];
jest.mock("@ai-matrx/content-ir-react", () => {
  const actual = jest.requireActual("@ai-matrx/content-ir-react");
  return {
    ...actual,
    KindInstanceRender: (props: { value: unknown }) => {
      seen.push(props.value);
      return null;
    },
  };
});

const KIND = "draft_critique";
/** content_ir.kind_example 38514e49… (canonical) as stored 2026-09-29. */
const CANONICAL = {
  __kind: KIND,
  score: 6,
  points: 17,
  verdict: "workshopable",
  criteria: [
    { id: 1, note: "The news is in the first sentence.", score: 2 },
    { id: 2, note: "The reporter's recent story is not named.", score: 1 },
    { id: 3, note: "No number or proof anywhere in the body.", score: 0 },
  ],
  offenses: [],
  line_notes: [],
  next_moves: [],
  lede_rewrite: "x",
  improved_since: [],
};
// No criterion 8 → a release (24 max); 3 of 24 scales to 3.25 → upper half of 0-5 → 2.
const RUBRIC = { points: 3, score: 2, verdict: "start_over" };

function rubricOf(value: unknown) {
  const v = value as Record<string, unknown>;
  return { points: v.points, score: v.score, verdict: v.verdict };
}

function noticesOf(envelope: CanonicalBlockIR | null | undefined): string[] {
  return (envelope?.root.residue?.notices ?? [])
    .filter((n) => n.code === KIND_CORRECTED_NOTICE)
    .map((n) => n.message);
}

function principalEnvelope(pathId: (typeof RENDER_PATHS)[number]["id"]): CanonicalBlockIR {
  const run = runRenderPath(pathId, KIND, { ...CANONICAL });
  if (!run) throw new Error(`${pathId} produced no run`);
  const envelopes = run.blocks
    .map((b) => b.metadata?.[IR_ENVELOPE_KEY])
    .filter(isCanonicalBlockIR)
    .filter((e) => e.root.kind === KIND);
  expect(envelopes.length).toBeGreaterThan(0);
  return envelopes[envelopes.length - 1];
}

describe("the one correction step, on every path to a renderer", () => {
  it("the value corrector itself: 17 / 6 with criteria summing 3 → 3 / 2 / start_over", () => {
    const out = correctKindValue(KIND, CANONICAL);
    expect(rubricOf(out.value)).toEqual(RUBRIC);
    expect(out.corrections.some((c) => c.includes("points was 17"))).toBe(true);
  });

  const blockPaths = RENDER_PATHS.filter((p) => p.streams || p.id === "reload" || p.id === "server_partial");
  it.each(blockPaths.map((p) => [p.id] as const))("shape-preview path %s carries the rubric's numbers", (pathId) => {
    const envelope = principalEnvelope(pathId);
    expect(rubricOf(envelope.root.value)).toEqual(RUBRIC);
    expect(noticesOf(envelope).length).toBeGreaterThan(0);
  });

  it("complete text (DB-loaded messages, re-split) is corrected and says so", () => {
    const source = JSON.stringify(CANONICAL, null, 2);
    expect(rubricOf(memoizedRegionEnvelope(source)!.root.value)).toEqual(RUBRIC);
    const lines = kindCorrectionsOf(withIrEnvelope(source, undefined));
    expect(lines.some((l) => l.includes("points was 17"))).toBe(true);
  });

  it("a live parse session's complete envelope is corrected", () => {
    const session = new ParseSession({ identity: "kind-correctors-test", schemas: {} });
    session.write(JSON.stringify(CANONICAL));
    session.end();
    expect(rubricOf(sessionEnvelope(session)!.root.value)).toEqual(RUBRIC);
  });

  it("a stored value (reload, nested kinds, XML finalize) is corrected; the fix is idempotent", () => {
    const once = envelopeFromCompleteValue({ ...CANONICAL }, KIND);
    expect(rubricOf(once.root.value)).toEqual(RUBRIC);
    expect(correctKindEnvelope(once)).toBe(once);
  });

  it("the direct-object instance render (kind-instance loads, shape preview 'direct') corrects and shows the notice", async () => {
    const { default: KindInstanceRender } = await import("../studio/components/KindInstanceRender");
    seen.length = 0;
    const html = renderToStaticMarkup(<KindInstanceRender kind={KIND} value={{ ...CANONICAL }} />);
    expect(rubricOf(seen[seen.length - 1])).toEqual(RUBRIC);
    expect(html).toContain("Corrected by code before display");
  });

  it("the db-component reader corrects a pasted block that never had an envelope", () => {
    const lines = blockKindCorrections(JSON.stringify(CANONICAL), undefined);
    expect(lines.some((l) => l.includes("points was 17"))).toBe(true);
  });

  it("a critique that cannot be scored is shown as written, and says so", () => {
    const broken = { __kind: KIND, criteria: "none", points: 7 };
    const out = correctKindValue(KIND, broken);
    expect(out.value).toBe(broken);
    expect(out.corrections[0]).toMatch(/could not be checked/);
  });

  it("other kinds are untouched, by reference", () => {
    const env = envelopeFromCompleteValue({ __kind: "wine_tasting", rating: 3 }, "wine_tasting");
    expect(correctKindEnvelope(env)).toBe(env);
  });
});
