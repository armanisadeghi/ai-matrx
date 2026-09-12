const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockCaptureError = jest.fn();
const mockGetManifest = jest.fn();

jest.mock("@/lib/toast", () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: mockCaptureError,
}));

jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: mockGetManifest,
}));

// ONLY the network hop is faked. `validateAgainstKind`, `validateStructuralLeg`
// and ajv all run for real — see the value-contract describe block below.
const mockGetKindInputContract = jest.fn();
jest.mock("@/features/content-ir/registry/schema-source-kind-tables", () => ({
  getKindInputContractBySlug: (kind: string) =>
    mockGetKindInputContract(kind),
}));

import {
  applySurfaceWrite,
  listAgentWritableTargets,
  listUnwiredAgentTargets,
  refuseSurfaceWrite,
  __resetUnwiredTargetReports,
} from "./surface-writeback";
import { invalidateKindContractCache } from "@/features/content-ir/registry/validate-against-kind";
import { registerSurfaceRuntime } from "./SurfaceRuntimeContext";

const target = {
  name: "review_field",
  label: "Review field",
  description: "Test target",
  valueType: "string" as const,
  mode: "entity" as const,
  applyPolicy: "ask" as const,
};

describe("surface writeback handler outcomes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetManifest.mockReturnValue({ writeTargets: [target] });
  });

  it("returns an expected domain refusal without an error toast or capture", async () => {
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/test",
        getScope: () => ({}),
        getWriteHandlers: () => ({
          review_field: () =>
            refuseSurfaceWrite("Use the correction target for agent columns."),
        }),
      },
      1,
    );

    const result = await applySurfaceWrite("review_field", "wrong target");

    expect(result).toEqual({
      ok: false,
      refused: true,
      error: "Use the correction target for agent columns.",
    });
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
    unregister();
  });

  it("keeps unexpected handler failures loud", async () => {
    const failure = new Error("Database write failed.");
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/test",
        getScope: () => ({}),
        getWriteHandlers: () => ({
          review_field: () => {
            throw failure;
          },
        }),
      },
      1,
    );

    const result = await applySurfaceWrite("review_field", "value");

    expect(result).toEqual({ ok: false, error: "Database write failed." });
    expect(mockToastError).toHaveBeenCalledWith("Database write failed.");
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "surface-writeback",
        message: "[surface-writeback] Database write failed.",
      }),
    );
    unregister();
  });
});

// ---------------------------------------------------------------------------
// THE VALUE CONTRACT (WP1) — a target naming a registered kind is checked
// against that kind's REAL schema before approval and before the handler.
//
// FORCING FUNCTION: only the network hop is faked (the schema source), and the
// fixture below is the ACTUAL `emitted_json_schema` of the live registered kind
// `word_count_result` (content_ir.kind_definition, read 2026-09-11). Everything
// that decides the verdict — `validateAgainstKind`, `validateStructuralLeg`,
// ajv — runs for real, so this test goes red if the seam stops validating, if
// the validator changes its verdict, or if the degraded-reason contract drifts.
// A mocked validator would have proven nothing.
// ---------------------------------------------------------------------------

const WORD_COUNT_RESULT_SCHEMA = {
  type: "object",
  title: "WordCountOutput",
  required: [
    "characters",
    "characters_no_spaces",
    "words",
    "sentences",
    "paragraphs",
    "lines",
  ],
  properties: {
    lines: { type: "integer", title: "Lines" },
    words: { type: "integer", title: "Words" },
    __kind: {
      type: "string",
      const: "word_count_result",
      default: "word_count_result",
    },
    sentences: { type: "integer", title: "Sentences" },
    characters: { type: "integer", title: "Characters" },
    paragraphs: { type: "integer", title: "Paragraphs" },
    characters_no_spaces: { type: "integer", title: "Characters No Spaces" },
  },
  additionalProperties: false,
} as const;

const CONFORMING_VALUE = {
  __kind: "word_count_result",
  characters: 12,
  characters_no_spaces: 10,
  words: 2,
  sentences: 1,
  paragraphs: 1,
  lines: 1,
};

const kindTarget = {
  name: "counts",
  label: "Counts",
  description: "Test target carrying a declared value contract",
  valueType: "object" as const,
  valueKind: "word_count_result",
  mode: "draft" as const,
  applyPolicy: "auto" as const,
};

describe("surface writeback value contract", () => {
  let handled: unknown[];
  let unregister: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    invalidateKindContractCache();
    handled = [];
    mockGetManifest.mockReturnValue({ writeTargets: [kindTarget] });
    unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/test",
        getScope: () => ({}),
        getWriteHandlers: () => ({
          counts: (value: unknown) => {
            handled.push(value);
          },
        }),
      },
      1,
    );
  });

  afterEach(() => unregister());

  it("applies a value that satisfies the registered kind's real schema", async () => {
    mockGetKindInputContract.mockResolvedValue({
      schema: null,
      emittedJsonSchema: WORD_COUNT_RESULT_SCHEMA,
    });

    const result = await applySurfaceWrite("counts", CONFORMING_VALUE);

    expect(result.ok).toBe(true);
    expect(handled).toEqual([CONFORMING_VALUE]);
  });

  it("refuses a value that fails the kind's schema, before the handler runs", async () => {
    mockGetKindInputContract.mockResolvedValue({
      schema: null,
      emittedJsonSchema: WORD_COUNT_RESULT_SCHEMA,
    });

    // `words` is a string and `lines` is missing — both real ajv failures.
    const result = await applySurfaceWrite("counts", {
      __kind: "word_count_result",
      characters: 12,
      characters_no_spaces: 10,
      words: "two",
      sentences: 1,
      paragraphs: 1,
    });

    expect(result.ok).toBe(false);
    expect(handled).toEqual([]);
    expect(!result.ok && result.error).toContain("word_count_result");
    expect(mockToastError).toHaveBeenCalled();
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({ source: "surface-writeback" }),
    );
  });

  it("refuses loudly when the contract cannot be checked — a skip is never a pass", async () => {
    // The kind the target names is not in the registry at all.
    mockGetKindInputContract.mockResolvedValue(null);

    const result = await applySurfaceWrite("counts", CONFORMING_VALUE);

    expect(result.ok).toBe(false);
    expect(handled).toEqual([]);
    expect(!result.ok && result.error).toContain("kind_not_registered");
    expect(mockToastError).toHaveBeenCalled();
  });

  it("checks USER-origin writes too — the contract is the contract", async () => {
    mockGetKindInputContract.mockResolvedValue({
      schema: null,
      emittedJsonSchema: WORD_COUNT_RESULT_SCHEMA,
    });

    const result = await applySurfaceWrite(
      "counts",
      { not: "a word count" },
      { origin: "user" },
    );

    expect(result.ok).toBe(false);
    expect(handled).toEqual([]);
  });
});

/**
 * THE OFFER IS NEVER WIDER THAN THE WIRING (live defect, 2026-09-12).
 *
 * `matrx-user/masterwork-rulebook` declares `rule_draft`, and is mounted both
 * by the Rulebook detail page (which registers a handler) and by every
 * `/masterwork/[id]/<lane>` route. On a mount with no handler the Masterwork
 * Conductor was told it could stage a rule and found there was nothing to stage
 * it with. The offer builder must drop such a target — and say so.
 */
describe("agent write-target offer", () => {
  const ruleDraft = {
    name: "rule_draft",
    label: "Rule draft",
    description: "Stages a proposed rule in the page's Add/Edit Rule dialog.",
    valueType: "object" as const,
    mode: "draft" as const,
    applyPolicy: "ask" as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetUnwiredTargetReports();
    mockGetManifest.mockReturnValue({ writeTargets: [ruleDraft] });
  });

  it("offers a declared target only when a handler is mounted", () => {
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/masterwork-rulebook",
        getScope: () => ({}),
        getWriteHandlers: () => ({ rule_draft: () => {} }),
      },
      1,
    );

    expect(listAgentWritableTargets().map((entry) => entry.target.name)).toEqual(
      ["rule_draft"],
    );
    expect(listUnwiredAgentTargets()).toEqual([]);
    unregister();
  });

  it("refuses to offer a declared target with no handler, loudly", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const unregister = registerSurfaceRuntime(
      { surfaceName: "matrx-user/masterwork-rulebook", getScope: () => ({}) },
      1,
    );

    expect(listAgentWritableTargets()).toEqual([]);
    expect(
      listUnwiredAgentTargets().map((entry) => entry.target.name),
    ).toEqual(["rule_draft"]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('declares agent-writable target "rule_draft"'),
    );
    // One line per page load, not one per turn.
    listAgentWritableTargets();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    unregister();
  });

  it("still fails loudly if an unwired target is applied anyway", async () => {
    const unregister = registerSurfaceRuntime(
      { surfaceName: "matrx-user/masterwork-rulebook", getScope: () => ({}) },
      1,
    );

    const result = await applySurfaceWrite("rule_draft", { mode: "new" });

    expect(result.ok).toBe(false);
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "surface-writeback",
        message: expect.stringContaining("registered no handler"),
      }),
    );
    unregister();
  });
});

/**
 * WALL W49 (2026-09-12) — a write no open page can apply.
 *
 * The Masterwork Conductor called `apply_surface_write` from the plain
 * `/chat/<id>` tab its own "open the full conversation in a new tab" link
 * opens. That page mounts no surface at all. The seam failed correctly and said
 * so in a toast that named no remedy, the tool answer never reached the server,
 * and the turn ended with nothing on screen.
 *
 * The outcome now has its own shape — `unapplicable` — because the remedy is
 * different from every other failure (go to a page that can apply it), and it
 * is NOT a captured platform defect: nothing in the code is broken.
 */
describe("a write nothing open can apply (W49)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetManifest.mockReturnValue({ writeTargets: [target] });
  });

  it("says so with the remedy, and does not capture a defect, when no surface is mounted", async () => {
    const result = await applySurfaceWrite("rule_draft", { mode: "new" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.unapplicable).toBe(true);
    // The sentence has to carry the fact AND both ways forward.
    expect(result.error).toContain("nothing was written");
    expect(result.error).toContain("conduct page");
    // On screen, with the remedy — not a silent failure.
    expect(mockToastError).toHaveBeenCalledWith(
      "This page can't apply that change",
      expect.objectContaining({
        description: expect.stringContaining("nothing was written"),
      }),
    );
    // Being on the wrong page is not a platform defect.
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it("says so when a surface IS mounted but declares no such target", async () => {
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/test",
        getScope: () => ({}),
        getWriteHandlers: () => ({ review_field: () => undefined }),
      },
      1,
    );

    const result = await applySurfaceWrite("rule_draft", { mode: "new" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.unapplicable).toBe(true);
    expect(result.error).toContain("matrx-user/test");
    expect(mockCaptureError).not.toHaveBeenCalled();
    unregister();
  });

  it("keeps a real page defect a defect — an unwired handler still captures", async () => {
    mockGetManifest.mockReturnValue({
      writeTargets: [{ ...target, name: "rule_draft" }],
    });
    const unregister = registerSurfaceRuntime(
      { surfaceName: "matrx-user/masterwork-rulebook", getScope: () => ({}) },
      1,
    );

    const result = await applySurfaceWrite("rule_draft", { mode: "new" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.unapplicable).toBeUndefined();
    expect(mockCaptureError).toHaveBeenCalled();
    unregister();
  });
});
