/**
 * WALK 13, N3 + N10 — the deliverable reads the same everywhere it is shown.
 *
 * ## The fixture is the real run
 *
 * `workflow.run 40aa2317-8116-4bf9-9064-5d97e48320c8`, built from Rulebook
 * `2fba365b-831a-4cb8-a1bb-51eab3889edc`, read read-only on 2026-09-20. The
 * ruling text and every rule id below are verbatim from those rows — including
 * the `**bold**` the agent wrapped its citations in, which is exactly how they
 * reached the screen.
 *
 * Walk 13 found all twelve ids printed raw on TWO surfaces that walk 12 never
 * covered: the build dialog's run box and `/workflows/runs/<id>`. The resolver
 * was never wrong — it was never reached, because the provider was mounted on
 * two pages and the deliverable is drawn by a component any page can mount.
 *
 * ## PROVEN FAILING FIRST
 *   · drop `MasterworkRulesProvider` from `TryMasterworkBox`
 *     → "every run box" reddens
 *   · drop it from `WorkflowRunPage`
 *     → "the run permalink" reddens
 *   · make a nested provider that resolves nothing return null instead of the
 *     inherited index → "never clobbers an outer scope" reddens
 *   · restore the three-segment handle floor → "a two-segment stored id" reddens
 *   · remove `not_applicable` from the declared-token map → that leg reddens
 *   · stop stripping marks in `deliverableLine` → the N10 preview leg reddens
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  buildRuleCitationIndex,
  deliverableLine,
  linkRuleCitations,
  plainDeclaredTokens,
} from "../ruleCitations";
import type { RulebookRule } from "../types";
import {
  MasterworkRulesProvider,
  useRuleCitationIndex,
} from "../rules-context/MasterworkRulesContext";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RULEBOOK_ID = "2fba365b-831a-4cb8-a1bb-51eab3889edc";
const RUN_ID = "40aa2317-8116-4bf9-9064-5d97e48320c8";
const MASTERWORK_ID = "ca0d2bd2-6be4-483a-bf3a-6a54c0d70935";

/** Verbatim from `platform.rulebook 2fba365b`, read-only, 2026-09-20. */
const LIVE_RULES: Array<[string, string]> = [
  ["pressure-before-parts-always", "Pressure before parts — always"],
  [
    "never-price-what-has-not-been-measured-no-matter",
    "Never price what has not been measured, no matter how hard the customer pushes",
  ],
  [
    "run-catch-can-distribution-uniformity-test-on-th",
    "Run catch-can distribution uniformity test on the worst three zones",
  ],
  [
    "redesign-threshold-low-du-plus-large-dynamic-dro",
    "Redesign threshold: low DU plus large dynamic drop",
  ],
  [
    "boundary-test-does-browning-stop-at-the-zone-lin",
    "Boundary test: does browning stop at the zone line or cross it?",
  ],
  ["three-signs-diagnostic-order", "Three-Sign Controller-Only Diagnostic"],
  // The two-segment ids the old three-segment floor could never have matched.
  ["repair-criteria", "When a repair is warranted"],
  ["redesign-criteria", "When a redesign is warranted"],
];

function rule([id, name]: [string, string]): RulebookRule {
  return { id, name, section: "G", statement: `${name}.`, severity: "major" };
}

const RULES = LIVE_RULES.map(rule);
const INDEX = buildRuleCitationIndex(RULEBOOK_ID, RULES);

/** Verbatim from that run's `show` output, `**bold**` and all. */
const LIVE_RULING =
  "## The Ruling\n\nThis letter is a verdict rendered from a telephone. " +
  "Its besetting sin is **pressure-before-parts-always**, and its twin is " +
  "**never-price-what-has-not-been-measured-no-matter**.\n\n" +
  "**run-catch-can-distribution-uniformity-test-on-th** — violation. Sustained.\n" +
  "**redesign-threshold-low-du-plus-large-dynamic-dro** — not_applicable.\n" +
  "Forbidden by **boundary-test-does-browning-stop-at-the-zone-lin**.";

describe("the ruling from the real run", () => {
  const out = linkRuleCitations(LIVE_RULING, INDEX);

  it("names every cited rule and leaves no raw id behind", () => {
    for (const [id, name] of LIVE_RULES.slice(0, 6)) {
      if (!LIVE_RULING.includes(id)) continue;
      expect(out).toContain(`[${name}](/masterwork/${RULEBOOK_ID}#rule-${id})`);
      // The id survives only inside the link's own href.
      expect(out.replace(/\(\/masterwork\/[^)]*\)/g, "")).not.toContain(id);
    }
  });

  it("keeps the agent's own emphasis and heading around the citation", () => {
    expect(out).toContain("## The Ruling");
    expect(out).toContain("**[Pressure before parts — always]");
  });

  it("turns a declared machine token into the words we meant", () => {
    expect(out).toContain("not applicable");
    expect(out).not.toContain("not_applicable");
    // And with NO Rulebook in hand: an underscore we put there is never the
    // Expert's problem, whether or not her rules are loaded.
    expect(linkRuleCitations("— not_applicable.", null)).toBe(
      "— not applicable.",
    );
    expect(plainDeclaredTokens("status: not_applicable")).toBe(
      "status: not applicable",
    );
  });

  it("resolves a two-segment stored id the old floor would have missed", () => {
    expect(linkRuleCitations("Covered by repair-criteria.", INDEX)).toBe(
      `Covered by [When a repair is warranted](/masterwork/${RULEBOOK_ID}#rule-repair-criteria).`,
    );
  });

  it("still invents nothing — an id that names no rule stays as written", () => {
    const text = "It brushes against no-such-rule-in-this-rulebook.";
    expect(linkRuleCitations(text, INDEX)).toBe(text);
  });
});

describe("the Encore run row preview (N10)", () => {
  it("reads as one plain line — no heading marks, no bold, no raw ids", () => {
    const line = deliverableLine(LIVE_RULING, INDEX);
    expect(line.startsWith("The Ruling This letter is a verdict")).toBe(true);
    expect(line).not.toContain("##");
    expect(line).not.toContain("**");
    expect(line).not.toContain("pressure-before-parts-always");
    expect(line).toContain("Pressure before parts — always");
    expect(line).not.toContain("not_applicable");
    expect(line).not.toContain("\n");
  });

  it("loses no word a person wrote", () => {
    const line = deliverableLine("## Heading\n\n- **bold** item", null);
    expect(line).toBe("Heading bold item");
  });
});

// ── The mounts. A page that renders a deliverable without publishing the
//    rules is the whole of N3, so these read the live files. ──────────────
function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("the surfaces that show a deliverable publish the rules", () => {
  it("every run box does — TryMasterworkBox mounts it on masterworkId", () => {
    const text = source(
      "features/masterwork/components/masterworks/TryMasterworkBox.tsx",
    );
    expect(text).toContain("MasterworkRulesProvider");
    expect(text).toMatch(
      /<MasterworkRulesProvider[^>]*masterworkId=\{masterworkId\}/,
    );
  });

  it("the run permalink does — WorkflowRunPage mounts it on runId", () => {
    const text = source(
      "features/workflow-runtime/components/run/WorkflowRunPage.tsx",
    );
    expect(text).toMatch(/<MasterworkRulesProvider[^>]*runId=\{runId\}/);
  });

  // 🚨 THIS LEG IS ABOUT THE ADDRESS ONLY, AND THAT IS ITS LIMIT (walk 14,
  // defect A). A source grep proved the href string was written and could not
  // see that the page never RENDERED anything for it, so it stayed green
  // through a completely dead click. What the address actually opens is
  // guarded by rendering the real page at it:
  // `features/masterwork/encore/__tests__/the-run-address-opens-the-deliverable.test.tsx`.
  it("the Encore row opens the Encore detail, never the developer run page", () => {
    const text = source("features/masterwork/encore/EncoreRunPage.tsx");
    expect(text).toContain("/masterwork/encore/${masterworkId}?run=${run.id}");
    expect(text).not.toContain("/workflows/runs/");
  });
});

// ── The provider's own behaviour. ────────────────────────────────────────
const getRulebook = jest.fn();
const rulebookIdForMasterwork = jest.fn();
const rulebookIdForRun = jest.fn();
jest.mock("../service", () => ({
  getRulebook: (id: string) => getRulebook(id),
}));
jest.mock("../rules-context/rulebookForRun", () => ({
  rulebookIdForMasterwork: (id: string) => rulebookIdForMasterwork(id),
  rulebookIdForRun: (id: string) => rulebookIdForRun(id),
}));

function Probe() {
  const index = useRuleCitationIndex();
  return <span>{index ? `index:${index.rulebookId}` : "no-index"}</span>;
}

async function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(node);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    text: () => container.textContent ?? "",
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("MasterworkRulesProvider finds the Rulebook itself", () => {
  beforeEach(() => {
    getRulebook
      .mockReset()
      .mockResolvedValue({ id: RULEBOOK_ID, rules: RULES });
    rulebookIdForMasterwork.mockReset().mockResolvedValue(RULEBOOK_ID);
    rulebookIdForRun.mockReset().mockResolvedValue(RULEBOOK_ID);
  });

  it("from a Masterwork id (every run box)", async () => {
    const view = await render(
      <MasterworkRulesProvider masterworkId={MASTERWORK_ID}>
        <Probe />
      </MasterworkRulesProvider>,
    );
    expect(rulebookIdForMasterwork).toHaveBeenCalledWith(MASTERWORK_ID);
    expect(view.text()).toBe(`index:${RULEBOOK_ID}`);
    await view.unmount();
  });

  it("from a run id (the run permalink)", async () => {
    const view = await render(
      <MasterworkRulesProvider runId={RUN_ID}>
        <Probe />
      </MasterworkRulesProvider>,
    );
    expect(rulebookIdForRun).toHaveBeenCalledWith(RUN_ID);
    expect(view.text()).toBe(`index:${RULEBOOK_ID}`);
    await view.unmount();
  });

  it("never clobbers an outer scope when it resolves nothing", async () => {
    rulebookIdForMasterwork.mockResolvedValue(null);
    const view = await render(
      <MasterworkRulesProvider rulebookId={RULEBOOK_ID} rules={RULES}>
        <MasterworkRulesProvider masterworkId="not-a-masterwork">
          <Probe />
        </MasterworkRulesProvider>
      </MasterworkRulesProvider>,
    );
    expect(view.text()).toBe(`index:${RULEBOOK_ID}`);
    await view.unmount();
  });

  it("a run that is not a Masterwork simply publishes nothing", async () => {
    rulebookIdForRun.mockResolvedValue(null);
    const view = await render(
      <MasterworkRulesProvider runId={RUN_ID}>
        <Probe />
      </MasterworkRulesProvider>,
    );
    expect(view.text()).toBe("no-index");
    expect(getRulebook).not.toHaveBeenCalled();
    await view.unmount();
  });
});
