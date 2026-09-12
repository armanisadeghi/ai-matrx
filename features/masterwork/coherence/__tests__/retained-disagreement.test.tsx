/**
 * A SETTLED CONTRADICTION LEAVES STRUCTURE ON THE RULES — the client half.
 *
 * Arman's expertise mandate (2026-09-12): "Surface, retain, and make navigable
 * divergent approaches, dissent, and controversy… without collapsing them into
 * consensus."
 *
 * On HEAD, "Both are right" wrote a state into `metadata.coherence` and nothing
 * else: the two rules were not linked, so a reader who opened either rule alone
 * saw no sign the other existed, and the rule detail had nowhere to show it.
 *
 * Proven failing-then-passing:
 *   - drop `disagrees_with` from `RULE_RELATION_KINDS`/`RULE_RELATION_LABELS`
 *     or the `condition` branch from `RuleRelations` and the render tests fail;
 *   - make `applySettlement` return the rules untouched and the write tests fail.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RuleRelations } from "../../components/detail/RuleRelations";
import { RuleHistory } from "../../components/detail/RuleHistory";
import type { RulebookRule } from "../../types";
import { applySettlement } from "../settlement";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function rule(id: string, statement: string): RulebookRule {
  return { id, name: id.replace(/-/g, " "), section: "G", statement, severity: "major" };
}

const SHORTER = rule("cover-everything-shorter", "Cover everything they cover, and be SHORTER.");
const DEEPER = rule(
  "never-publish-unless-it-beats-top-10",
  "Never publish unless it beats every top-10 page on depth.",
);

describe('settling a contradiction as "both are right"', () => {
  const stamp = { at: "2026-09-12T18:00:00.000Z", settledBy: "expert-1" };

  it("links BOTH rules to each other and keeps the condition", () => {
    const next = applySettlement(
      [SHORTER, DEEPER],
      [SHORTER.id, DEEPER.id],
      "accepted",
      { ...stamp, condition: "On a client site, shorter; on our own site, depth." },
    );
    expect(next).not.toBeNull();
    const byId = Object.fromEntries((next ?? []).map((r) => [r.id, r]));

    // Both positions survive, word for word.
    expect(byId[SHORTER.id].statement).toBe(SHORTER.statement);
    expect(byId[DEEPER.id].statement).toBe(DEEPER.statement);

    for (const [id, other] of [
      [SHORTER.id, DEEPER.id],
      [DEEPER.id, SHORTER.id],
    ]) {
      const link = (byId[id].relates_to ?? []).find(
        (r) => r.kind === "disagrees_with",
      );
      expect(link?.rule_id).toBe(other);
      expect(link?.condition).toBe(
        "On a client site, shorter; on our own site, depth.",
      );
      expect(byId[id].settled_by).toBe("expert-1");
      expect(byId[id].settled_at).toBe(stamp.at);
    }
  });

  it("still links both when the Expert names no condition", () => {
    const next = applySettlement([SHORTER, DEEPER], [SHORTER.id, DEEPER.id], "accepted", stamp);
    const link = (next?.[0].relates_to ?? []).find((r) => r.kind === "disagrees_with");
    expect(link).toBeDefined();
    expect(link?.condition).toBeUndefined();
  });

  it("stamps who ruled on `answered`, and writes nothing on `dismissed`", () => {
    const answered = applySettlement(
      [SHORTER, DEEPER],
      [SHORTER.id, DEEPER.id],
      "answered",
      stamp,
    );
    expect(answered?.[0].settled_by).toBe("expert-1");
    expect(answered?.[0].relates_to).toBeUndefined();
    expect(
      applySettlement([SHORTER, DEEPER], [SHORTER.id, DEEPER.id], "dismissed", stamp),
    ).toBeNull();
  });

  it("never mutates the rules it was given", () => {
    applySettlement([SHORTER, DEEPER], [SHORTER.id, DEEPER.id], "accepted", stamp);
    expect(SHORTER.relates_to).toBeUndefined();
  });
});

describe("the rule detail shows the retained disagreement", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the sibling position and the condition between them", () => {
    const linked: RulebookRule = {
      ...SHORTER,
      relates_to: [
        {
          rule_id: DEEPER.id,
          kind: "disagrees_with",
          condition: "On a client site, shorter; on our own site, depth.",
        },
      ],
    };
    act(() => {
      root.render(<RuleRelations rule={linked} allRules={[linked, DEEPER]} />);
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Disagrees with");
    expect(text).toContain(DEEPER.name);
    expect(text).toContain("On a client site, shorter; on our own site, depth.");
    // The door is real: it points at the sibling rule's anchor.
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      `#rule-${DEEPER.id}`,
    );
  });

  it("says so plainly when both simply hold", () => {
    const linked: RulebookRule = {
      ...SHORTER,
      relates_to: [{ rule_id: DEEPER.id, kind: "disagrees_with" }],
    };
    act(() => {
      root.render(<RuleRelations rule={linked} allRules={[linked, DEEPER]} />);
    });
    expect(container.textContent).toContain("You said both of these hold.");
  });

  it("folds the earlier position open", () => {
    const rewritten: RulebookRule = {
      ...SHORTER,
      history: [
        {
          statement: "Always be shorter than the top result.",
          changed_at: "2026-09-12T17:00:00.000Z",
          changed_by: "tool:rulebook.update_rule:expert-1",
          reason: "she said the earlier wording was wrong",
        },
      ],
    };
    act(() => {
      root.render(<RuleHistory rule={rewritten} />);
    });
    expect(container.textContent).toContain("Earlier position (1)");
    expect(container.textContent).not.toContain("Always be shorter than the top result.");
    act(() => {
      container
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Always be shorter than the top result.");
    expect(container.textContent).toContain("she said the earlier wording was wrong");
  });

  it("renders nothing for a rule no machine has rewritten", () => {
    act(() => {
      root.render(<RuleHistory rule={SHORTER} />);
    });
    expect(container.textContent).toBe("");
  });
});
