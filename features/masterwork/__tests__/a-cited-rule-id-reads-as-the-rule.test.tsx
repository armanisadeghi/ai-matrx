/**
 * D14 (cold walk 12, 2026-09-20) — a rule id the ruling cites must reach the
 * Expert as the rule's own name with a door to it, and an id we cannot PROVE
 * must reach her exactly as the agent wrote it.
 *
 * PROVEN FAILING FIRST, four ways, against the code as it stands:
 *   · delete the `rule.id.slice(0, 48)` claim in `buildRuleCitationIndex`
 *     → "a stored id truncated at mint time" reddens (the real D14 case).
 *   · make the unknown-handle branch fall back to a nearest match
 *     → "an id that names no rule" reddens.
 *   · drop the `MasterworkRulesProvider` from `EncoreRunPage`
 *     → "the Encore deliverable" reddens.
 *   · remove `masterwork_result` from SHAPE_BLOCK_DISPATCH or from
 *     SYSTEM_KIND_DEFINITIONS → "the kind is registered" reddens.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  buildRuleCitationIndex,
  linkRuleCitations,
  RULE_ID_MINT_LENGTH,
} from "../ruleCitations";
import type { RulebookRule } from "../types";
import {
  MASTERWORK_RESULT_BLOCK_TYPE,
  MASTERWORK_RESULT_KIND,
  MASTERWORK_RESULT_KIND_DEFINITIONS,
} from "@/features/content-ir/kinds/masterwork-result";
import { SYSTEM_KIND_DEFINITIONS } from "@/features/content-ir/registry/system-kinds";
import { extractDispatchKeysFromText } from "@/features/content-ir/registry/shape-doctor-extract";
import { MasterworkResultBlock } from "@/components/mardown-display/blocks/masterwork/MasterworkResultBlock";
import { MasterworkRulesProvider } from "../rules-context/MasterworkRulesContext";

// The platform markdown primitive is not what this guard is about: capture the
// exact markdown the component hands it, which IS what the Expert then reads.
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content?: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}));

// The provider reads the Rulebook when a surface hands it only an id.
const getRulebook = jest.fn();
jest.mock("../service", () => ({
  getRulebook: (id: string) => getRulebook(id),
}));

// React 19 wants the act environment declared before the first root renders.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RULEBOOK_ID = "a18eb3de-ebb7-4e02-895e-c4ab534aa24f";

/**
 * THE WALK'S REAL ROWS, read out of `platform.rulebook` a18eb3de on
 * 2026-09-20 — the four ids D14 caught on screen and the names beside them.
 *
 * 🚨 READ THE PAIR. `kebabRuleId(name)` does NOT reproduce these ids: the
 * distiller minted them from its own slug before the final name was settled
 * ("Prohibit Sprinkler Head Adjustments Before Answering Pressure Question"
 * would kebab to `prohibit-sprinkler-head-adjustments-before-answe`). That is
 * exactly why the resolver indexes the STORED id and nothing derived from the
 * name: a name-derived key would have resolved none of the four, and a fuzzy
 * one would have been free to resolve them to the wrong rule.
 */
const LONG_NAME =
  "Prohibit Sprinkler Head Adjustments Before Answering Pressure Question";
const TRUNCATED_ID = "prohibit-head-adjustments-before-pressure-testin";

function rule(id: string, name: string): RulebookRule {
  return {
    id,
    name,
    section: "S1",
    statement: `${name}.`,
    severity: "major",
  };
}

const RULES: RulebookRule[] = [
  rule(TRUNCATED_ID, LONG_NAME),
  rule(
    "dynamic-pressure-drop-points-to-mainlinepoc-not",
    "Dynamic Pressure Drop Points At The Mainline",
  ),
];

const INDEX = buildRuleCitationIndex(RULEBOOK_ID, RULES);

describe("a rule id the ruling cites", () => {
  it("is a real stored id cut at the mint length, not a test fiction", () => {
    // Read off the live Rulebook (see the header). If the fixture ever stops
    // being a 48-char cut, this guard is no longer testing D14's shape.
    expect(TRUNCATED_ID).toHaveLength(RULE_ID_MINT_LENGTH);
    expect(TRUNCATED_ID.endsWith("testin")).toBe(true); // cut mid-word
  });

  it("reads as the rule's name, linked to it on the Rulebook screen", () => {
    const out = linkRuleCitations(
      `Ray broke ${TRUNCATED_ID} before he ever set a catch-can.`,
      INDEX,
    );
    expect(out).toBe(
      `Ray broke [${LONG_NAME}](/masterwork/${RULEBOOK_ID}#rule-${TRUNCATED_ID}) ` +
        "before he ever set a catch-can.",
    );
    expect(out).not.toContain(`broke ${TRUNCATED_ID}`);
  });

  it("resolves a stored id truncated at mint time even when the row is longer", () => {
    const longer = `${TRUNCATED_ID}-2`;
    const index = buildRuleCitationIndex(RULEBOOK_ID, [
      rule(longer, LONG_NAME),
    ]);
    expect(linkRuleCitations(`See ${TRUNCATED_ID}.`, index)).toContain(
      `#rule-${longer}`,
    );
  });

  it("resolves the same id written as inline code", () => {
    expect(linkRuleCitations(`See \`${TRUNCATED_ID}\`.`, INDEX)).toBe(
      `See [${LONG_NAME}](/masterwork/${RULEBOOK_ID}#rule-${TRUNCATED_ID}).`,
    );
  });
});

describe("an id we cannot prove", () => {
  it("that names no rule is left exactly as the agent wrote it", () => {
    const text = "It also brushes against never-let-a-zone-run-dry-on-clay.";
    expect(linkRuleCitations(text, INDEX)).toBe(text);
  });

  it("two rules would both answer to is dropped, never guessed at", () => {
    const index = buildRuleCitationIndex(RULEBOOK_ID, [
      rule(`${TRUNCATED_ID}-2`, "One reading"),
      rule(`${TRUNCATED_ID}-3`, "Another reading"),
    ]);
    expect(linkRuleCitations(`See ${TRUNCATED_ID}.`, index)).toBe(
      `See ${TRUNCATED_ID}.`,
    );
  });

  it("never rewrites a fenced code block, an existing link or a URL", () => {
    const text = [
      "```json",
      `{"rule_id": "${TRUNCATED_ID}"}`,
      "```",
      `[already cited](/masterwork/x#rule-${TRUNCATED_ID})`,
      `https://example.com/${TRUNCATED_ID}`,
    ].join("\n");
    expect(linkRuleCitations(text, INDEX)).toBe(text);
  });

  it("renders verbatim when no Rulebook is in scope", () => {
    const text = `Ray broke ${TRUNCATED_ID}.`;
    expect(linkRuleCitations(text, null)).toBe(text);
  });
});

/** The same bare react-dom harness the sibling masterwork guards use. */
async function render(node: React.ReactElement): Promise<{
  text: () => string;
  unmount: () => Promise<void>;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(node);
  });
  return {
    text: () => container.textContent ?? "",
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("the Encore deliverable", () => {
  beforeEach(() => {
    getRulebook.mockReset();
    getRulebook.mockResolvedValue({ id: RULEBOOK_ID, rules: RULES });
  });

  it("shows the rule's name and its door, never the raw slug", async () => {
    const view = await render(
      <MasterworkRulesProvider rulebookId={RULEBOOK_ID} rules={RULES}>
        <MasterworkResultBlock
          serverData={{
            deliverable: "# Your quote letter\n\nDear Autumn,",
            approach: null,
            ruling: `This breaks ${TRUNCATED_ID}.`,
          }}
        />
      </MasterworkRulesProvider>,
    );
    expect(view.text()).toContain(
      `[${LONG_NAME}](/masterwork/${RULEBOOK_ID}#rule-${TRUNCATED_ID})`,
    );
    expect(view.text()).not.toContain(`breaks ${TRUNCATED_ID}`);
    expect(view.text()).toContain("Dear Autumn,");
    await view.unmount();
  });

  it("reads the Rulebook itself when the surface hands it only an id", async () => {
    const view = await render(
      <MasterworkRulesProvider rulebookId={RULEBOOK_ID}>
        <MasterworkResultBlock
          serverData={{ ruling: `This breaks ${TRUNCATED_ID}.` }}
        />
      </MasterworkRulesProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(getRulebook).toHaveBeenCalledWith(RULEBOOK_ID);
    expect(view.text()).toContain(`#rule-${TRUNCATED_ID}`);
    await view.unmount();
  });

  it("with no Rulebook in scope prints what the agent wrote and invents nothing", async () => {
    const view = await render(
      <MasterworkResultBlock
        serverData={{ ruling: `This breaks ${TRUNCATED_ID}.` }}
      />,
    );
    expect(view.text()).toBe(`This breaks ${TRUNCATED_ID}.`);
    await view.unmount();
  });

  it("a refused Rulebook read leaves the ruling verbatim, never blanked", async () => {
    getRulebook.mockRejectedValue(new Error("denied"));
    const view = await render(
      <MasterworkRulesProvider rulebookId={RULEBOOK_ID}>
        <MasterworkResultBlock
          serverData={{ ruling: `This breaks ${TRUNCATED_ID}.` }}
        />
      </MasterworkRulesProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.text()).toBe(`This breaks ${TRUNCATED_ID}.`);
    await view.unmount();
  });
});

describe("the masterwork_result kind", () => {
  it("is registered — a compiled definition with a render key that resolves", () => {
    const definition = SYSTEM_KIND_DEFINITIONS.find(
      (d) => d.kind === MASTERWORK_RESULT_KIND,
    );
    expect(definition).toBeDefined();
    expect(definition?.legacyBlockType).toBe(MASTERWORK_RESULT_BLOCK_TYPE);
    expect(typeof definition?.toLegacyServerData).toBe("function");

    // The render key must exist in the dispatch table — a dangling key changes
    // nothing at runtime while the registry keeps claiming coverage. Read off
    // the LIVE file by text (the dispatch table drags the whole lazy component
    // tree behind an import), exactly as the shape doctor's own gate does.
    const { keys, failures } = extractDispatchKeysFromText(
      readFileSync(
        resolve(
          process.cwd(),
          "components/mardown-display/chat-markdown/block-registry/block-dispatch.tsx",
        ),
        "utf8",
      ),
      {},
    );
    expect(failures.map((f) => f.literal)).not.toContain(
      MASTERWORK_RESULT_BLOCK_TYPE,
    );
    expect(keys).toContain(MASTERWORK_RESULT_BLOCK_TYPE);
  });

  it("declines a payload with neither a ruling nor a deliverable", () => {
    const [definition] = MASTERWORK_RESULT_KIND_DEFINITIONS;
    const envelope = {
      root: {
        kind: MASTERWORK_RESULT_KIND,
        kindState: "checked",
        status: "complete",
        value: { ruling: "", deliverable: null, approach: "An angle" },
      },
    };
    expect(definition.toLegacyServerData?.(envelope as never)).toBeUndefined();
  });
});
