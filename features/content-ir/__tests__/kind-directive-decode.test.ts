/**
 * The ONE decoder — and the containment of the ONE legacy surface.
 *
 * Two things are proven here:
 *
 * 1. A CURRENT two-key shell decodes to a routable directive. This is the live
 *    break the Kind Directives frontend half closed: aidream ships
 *    `{"__kind":"directive_v1_reference_conversation_value","items":[…]}` and,
 *    until this landed, `isMatrxEnvelope` (presence of `matrx_version`) said
 *    "not an envelope" and the user saw raw JSON.
 * 2. A STORED 4-key shell still decodes — through the shim, into the identical
 *    result, flagged `legacyShell: true` and counted. Old conversations keep
 *    rendering forever; nothing else about them is different by the time a
 *    decision is made.
 */

import {
  DirectiveDecodeError,
  decodeDirective,
  tryDecodeDirective,
} from "@/features/content-ir/directives/decode";
import {
  legacyShellUses,
  resetLegacyShellUses,
} from "@/features/content-ir/directives/legacyShell";

beforeEach(() => resetLegacyShellUses());

describe("the current two-key shell", () => {
  it("decodes a reference directive", () => {
    const decoded = decodeDirective({
      __kind: "directive_v1_reference_conversation_value",
      items: [{ key: "research_brief" }],
    });
    expect(decoded).not.toBeNull();
    expect(decoded!.directiveClass).toBe("reference");
    expect(decoded!.noun).toBe("conversation_value");
    expect(decoded!.items).toEqual([{ key: "research_brief" }]);
    expect(decoded!.legacyShell).toBe(false);
    expect(decoded!.parsed.inContent).toBe(true);
    expect(decoded!.parsed.executes).toBe(false);
    // Nothing was translated: the current shell never touches the shim.
    expect(legacyShellUses()).toBe(0);
  });

  it("decodes a write directive and reports its position law", () => {
    const decoded = decodeDirective({
      __kind: "directive_v1_create_task",
      items: [{ name: "Ship it" }],
    });
    expect(decoded!.parsed.capability).toBe("side_effect");
    expect(decoded!.parsed.executes).toBe(true);
    // A side effect that arrives as CONTENT is inert — never auto-applied.
    expect(decoded!.parsed.inContent).toBe(false);
  });

  it("normalizes the round-trippable shell with __kind first", () => {
    const decoded = decodeDirective({
      __kind: "directive_v1_action_plan_tree",
      items: [{ site_id: "s" }],
    });
    expect(Object.keys(decoded!.shell)).toEqual(["__kind", "items"]);
  });

  it("is null for anything that is not a directive", () => {
    expect(decodeDirective({ __kind: "flashcard_set", cards: [] })).toBeNull();
    expect(decodeDirective("nope")).toBeNull();
    expect(decodeDirective(null)).toBeNull();
    expect(decodeDirective([{ __kind: "directive_v1_reference_note" }])).toBeNull();
  });

  it("REFUSES a malformed slug in the reserved namespace, loudly", () => {
    expect(() =>
      decodeDirective({ __kind: "directive_v1_mutate_task", items: [] }),
    ).toThrow(DirectiveDecodeError);
    // The forgiving read used at render seams reports and returns null — a bad
    // fence never takes the whole message block down, and never goes silent.
    const reasons: string[] = [];
    expect(
      tryDecodeDirective({ __kind: "directive_v1_mutate_task", items: [] }, (m) =>
        reasons.push(m),
      ),
    ).toBeNull();
    expect(reasons[0]).toMatch(/malformed directive slug/);
  });
});

describe("the retired 4-key shell — stored content only", () => {
  it("decodes a stored reference fence into the identical new-shell result", () => {
    const stored = decodeDirective({
      matrx_version: 1,
      kind: "reference",
      type: "note",
      items: [{ id: "n1", label: "Meeting" }],
    })!;
    const current = decodeDirective({
      __kind: "directive_v1_reference_note",
      items: [{ id: "n1", label: "Meeting" }],
    })!;
    expect(stored.slug).toBe(current.slug);
    expect(stored.directiveClass).toBe(current.directiveClass);
    expect(stored.noun).toBe(current.noun);
    expect(stored.items).toEqual(current.items);
    expect(stored.shell).toEqual(current.shell);
    // The one difference — and it is telemetry, not behavior.
    expect(stored.legacyShell).toBe(true);
    expect(legacyShellUses()).toBe(1);
  });

  it("collapses the two old side-effect kinds onto the new classes", () => {
    expect(
      decodeDirective({
        matrx_version: 1,
        kind: "output_directive",
        type: "create:task",
        items: [],
      })!.slug,
    ).toBe("directive_v1_create_task");
    expect(
      decodeDirective({
        matrx_version: 1,
        kind: "function",
        type: "plan_tree",
        items: [],
      })!.slug,
    ).toBe("directive_v1_action_plan_tree");
    expect(
      decodeDirective({
        matrx_version: 1,
        kind: "output_directive",
        type: "context_groom",
        items: [],
      })!.slug,
    ).toBe("directive_v1_action_context_groom");
  });

  it("REFUSES an old shell whose GENUINE directive claim cannot be honored", () => {
    // A known retired kind with a type that is not a legal noun IS a directive
    // claim — refusing it loudly is correct.
    expect(() =>
      decodeDirective({
        matrx_version: 1,
        kind: "reference",
        type: "Not A Noun",
        items: [],
      }),
    ).toThrow(/does not map onto the Kind Directives grammar/);
  });

  it("A-10.3: a non-directive object carrying matrx_version is NOT a directive — null, never an alarm", () => {
    // The retired sentinel alone is not a directive claim. Before this fix,
    // every one of these THREW a user-visible DirectiveDecodeError.
    expect(decodeDirective({ matrx_version: 2, payload: { x: 1 } })).toBeNull();
    expect(
      decodeDirective({ matrx_version: 1, kind: "not_a_kind", type: "note", items: [] }),
    ).toBeNull();
    expect(decodeDirective({ matrx_version: 1, kind: 7, type: "note" })).toBeNull();
    // And the forgiving seam agrees without calling onError.
    const reasons: string[] = [];
    expect(
      tryDecodeDirective({ matrx_version: 2, payload: { x: 1 } }, (m) => reasons.push(m)),
    ).toBeNull();
    expect(reasons).toEqual([]);
  });
});
