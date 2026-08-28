/**
 * THE INTERRUPT CONTRACT (SPEC-workflow-ui-contract §4) — the pure half.
 *
 * What these lock down, in the order they can go wrong:
 *
 *  1. Every §4.1 presentation field DEFAULTS to today's behavior, so a server
 *     that predates the block renders exactly as before. That compatibility
 *     promise is the one this file exists to keep honest.
 *  2. The approval preset derives Approve/Reject and posts the SAME body — no
 *     second shape and no second endpoint (§4.2).
 *  3. Provenance is never implied. `decisionLine` cannot render a bare
 *     "Approved": an escalated decision that reads as a human's is the exact
 *     failure `matrx_decision` exists to prevent.
 */

import {
  answerFieldsOf,
  approvalResumeValue,
  decisionLine,
  escalationLine,
  isApprovalQuestion,
  kindContextValue,
  parseInterruptPayload,
  plainContextEntries,
  readSettledDecision,
  unansweredFields,
} from "../interrupt-view";

const APPROVAL_SCHEMA = {
  type: "object",
  properties: {
    approved: { type: "boolean" },
    note: { type: "string" },
  },
  required: ["approved"],
};

describe("parseInterruptPayload — §4.1 defaults reproduce today's screen", () => {
  it("a payload with none of the new keys reads as a panel free_text question", () => {
    const view = parseInterruptPayload({ prompt: "Pick one" });
    expect(view.prompt).toBe("Pick one");
    expect(view.preset).toBe("free_text");
    expect(view.presentation).toBe("panel");
    expect(view.title).toBeNull();
    expect(view.componentRef).toBeNull();
    expect(view.escalation).toBeNull();
  });

  it("an empty payload still asks a question rather than rendering nothing", () => {
    expect(parseInterruptPayload({}).prompt).toBe(
      "This workflow is waiting for your answer.",
    );
    expect(parseInterruptPayload(null).preset).toBe("free_text");
  });

  it("reads the whole presentation block when the server sends it", () => {
    const view = parseInterruptPayload({
      prompt: "Ship it?",
      title: "Approve the draft",
      presentation: "showcase",
      preset: "approval",
      component_ref: "draft_card",
      surface: "workflow_render",
      schema_hint: APPROVAL_SCHEMA,
    });
    expect(view.title).toBe("Approve the draft");
    expect(view.presentation).toBe("showcase");
    expect(view.preset).toBe("approval");
    expect(view.componentRef).toBe("draft_card");
  });

  it("an unrecognized preset degrades to free_text, never to a crash", () => {
    expect(parseInterruptPayload({ preset: "wizard" }).preset).toBe("free_text");
  });

  it("freezes the escalation block, and ignores one with no deadline", () => {
    const view = parseInterruptPayload({
      escalation: {
        deadline_at: "2026-08-28T12:00:00Z",
        waiting_since: "2026-08-28T11:00:00Z",
        fallback: "agent",
        agent_id: null,
      },
    });
    expect(view.escalation?.deadlineAt).toBe("2026-08-28T12:00:00Z");
    expect(view.escalation?.fallback).toBe("agent");
    expect(
      parseInterruptPayload({ escalation: { after_seconds: 600 } }).escalation,
    ).toBeNull();
  });
});

describe("the kind-carrying context — §3's routing rule, applied to a question", () => {
  it("finds the marker on a named context value, whole and unstripped", () => {
    const found = kindContextValue({
      note: "ignore me",
      draft: { __kind: "study_pack", title: "Cells" },
    });
    expect(found?.kind).toBe("study_pack");
    expect(found?.name).toBe("draft");
    // THE KIND MARKER LAW: the value travels whole, `__kind` included.
    expect(found?.value).toEqual({ __kind: "study_pack", title: "Cells" });
  });

  it("finds the marker on the context map ITSELF", () => {
    const found = kindContextValue({ __kind: "quiz_set", title: "Cells" });
    expect(found?.kind).toBe("quiz_set");
    expect(found?.name).toBeNull();
    // A map that IS the instance has no leftover plain entries to list.
    expect(plainContextEntries({ __kind: "quiz_set", title: "x" }, null)).toEqual(
      [],
    );
  });

  it("a kindless context is not a kind, and its entries stay plain facts", () => {
    expect(kindContextValue({ who: "Dana", count: 3 })).toBeNull();
    expect(plainContextEntries({ who: "Dana", count: 3 }, null)).toEqual([
      { name: "who", value: "Dana" },
      { name: "count", value: 3 },
    ]);
  });
});

describe("answerFieldsOf — a VALUE contract, never a component choice", () => {
  it("no schema hint yields the one free-text field keyed `answer`", () => {
    const fields = answerFieldsOf(null);
    expect(fields).toHaveLength(1);
    // `answer` is what HumanInputOutput.answer is populated from — a bare
    // string, or any other key, is refused by the engine.
    expect(fields[0].name).toBe("answer");
    expect(fields[0].valueType).toBe("string");
  });

  it("a schema that cannot express an answer degrades to the box", () => {
    expect(answerFieldsOf({ type: "string" })[0].name).toBe("answer");
    expect(answerFieldsOf({ type: "object", properties: {} })[0].name).toBe(
      "answer",
    );
  });

  it("maps each property to its value type, its label and its requiredness", () => {
    const fields = answerFieldsOf({
      type: "object",
      properties: {
        headline: { type: "string", title: "The headline" },
        copies: { type: "integer" },
        publish_now: { type: "boolean" },
        channel: { type: "string", enum: ["email", "sms"] },
      },
      required: ["headline"],
    });
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.headline.label).toBe("The headline");
    expect(byName.headline.required).toBe(true);
    expect(byName.copies.valueType).toBe("number");
    expect(byName.publish_now.valueType).toBe("boolean");
    expect(byName.publish_now.required).toBe(false);
    // An enum is the closed set of admissible values — part of the contract,
    // which is why it survives to the renderer.
    expect(byName.channel.options).toEqual(["email", "sms"]);
    // A property with no title is humanized, never shown as a raw key.
    expect(byName.publish_now.label).toBe("Publish now");
  });

  it("carries a declared kind and a NAMED variant, and invents neither", () => {
    const [field] = answerFieldsOf({
      type: "object",
      properties: { rating: { type: "number", kind: "score", variant: "slider" } },
    });
    expect(field.kind).toBe("score");
    expect(field.variant).toBe("slider");
    // Nothing here decides a component; that is resolveVariantComponent's job.
    expect(field).not.toHaveProperty("component");
  });

  it("only REQUIRED empties block the send; false and 0 are answers", () => {
    const fields = answerFieldsOf({
      type: "object",
      properties: {
        headline: { type: "string" },
        publish_now: { type: "boolean" },
        copies: { type: "integer" },
      },
      required: ["headline", "publish_now", "copies"],
    });
    expect(unansweredFields(fields, {})).toHaveLength(3);
    expect(
      unansweredFields(fields, {
        headline: "hi",
        publish_now: false,
        copies: 0,
      }),
    ).toHaveLength(0);
  });
});

describe("§4.2 — the approval preset", () => {
  it("is recognized from the preset", () => {
    expect(
      isApprovalQuestion(parseInterruptPayload({ preset: "approval" })),
    ).toBe(true);
  });

  it("is recognized from a hand-written {approved, note} schema", () => {
    expect(
      isApprovalQuestion(
        parseInterruptPayload({ schema_hint: APPROVAL_SCHEMA }),
      ),
    ).toBe(true);
  });

  it("is NOT claimed by a form that merely contains an `approved` field", () => {
    expect(
      isApprovalQuestion(
        parseInterruptPayload({
          schema_hint: {
            type: "object",
            properties: {
              approved: { type: "boolean" },
              budget: { type: "number" },
            },
          },
        }),
      ),
    ).toBe(false);
  });

  it("posts the derived shape, and omits an empty note rather than sending ''", () => {
    expect(approvalResumeValue(true, "")).toEqual({ approved: true });
    expect(approvalResumeValue(true, "   ")).toEqual({ approved: true });
    expect(approvalResumeValue(false, " looks wrong ")).toEqual({
      approved: false,
      note: "looks wrong",
    });
  });
});

describe("the deadline, while the question waits", () => {
  const DEADLINE = "2026-08-28T12:00:00Z";
  const at = (iso: string) => Date.parse(iso);
  const escalation = parseInterruptPayload({
    escalation: { deadline_at: DEADLINE, fallback: "agent" },
  }).escalation;

  it("says when the run stops waiting, and who decides", () => {
    expect(escalationLine(escalation, at("2026-08-28T11:48:00Z"))).toBe(
      "Auto-continues in 12 min — an agent decides",
    );
    expect(escalationLine(escalation, at("2026-08-28T09:00:00Z"))).toBe(
      "Auto-continues in 3 hr — an agent decides",
    );
  });

  it("names the default answer when that is the fallback", () => {
    const withDefault = parseInterruptPayload({
      escalation: { deadline_at: DEADLINE, fallback: "default_answer" },
    }).escalation;
    expect(escalationLine(withDefault, at("2026-08-28T11:30:00Z"))).toBe(
      "Auto-continues in 30 min — the default answer decides",
    );
  });

  it("stops promising a future once the deadline has passed", () => {
    expect(escalationLine(escalation, at("2026-08-28T12:30:00Z"))).toBe(
      "Past the deadline — an agent may decide now",
    );
  });

  it("a question with no deadline grows no countdown", () => {
    expect(escalationLine(null)).toBeNull();
  });
});

describe("§4.2 — provenance is surfaced, ALWAYS", () => {
  const human = {
    authority: "human",
    actor_id: "u-1",
    actor_label: "Dana Reyes",
    decided_at: "2026-08-28T11:00:00Z",
    escalated: false,
  };
  const agent = {
    authority: "agent",
    actor_id: "a-1",
    actor_label: "Decision Fallback",
    decided_at: "2026-08-28T12:00:01Z",
    escalated: true,
  };

  it("reads an approval whose keys the engine folded into `extras`", () => {
    // The client posts {approved, note}; `HumanInputOutput` declares neither,
    // so the engine folds them into `extras` (client_payload.py).
    const decision = readSettledDecision("ask", {
      answer: null,
      extras: { approved: true, note: "ship it" },
      matrx_decision: human,
    });
    expect(decision?.approved).toBe(true);
    expect(decision?.note).toBe("ship it");
    expect(decisionLine(decision!)).toBe("Approved by Dana Reyes");
  });

  it("never lets an escalated decision read as a person's", () => {
    const decision = readSettledDecision("ask", {
      extras: { approved: true },
      matrx_decision: agent,
    })!;
    expect(decisionLine(decision)).toBe(
      "Auto-approved by Decision Fallback after the deadline",
    );
  });

  it("names the default answer when that decided", () => {
    const decision = readSettledDecision("ask", {
      extras: { approved: false },
      matrx_decision: { ...agent, authority: "default", actor_label: null },
    })!;
    expect(decisionLine(decision)).toBe(
      "Auto-rejected by the default answer after the deadline",
    );
  });

  it("an UNSTAMPED decision says so out loud instead of implying a person", () => {
    const decision = readSettledDecision("ask", { extras: { approved: true } })!;
    expect(decision.provenance).toBeNull();
    expect(decisionLine(decision)).toBe("Approved — decider not recorded");
  });

  it("a non-approval decision still carries its decider", () => {
    const decision = readSettledDecision("ask", {
      answer: "the blue one",
      matrx_decision: human,
    })!;
    expect(decision.approved).toBeNull();
    expect(decisionLine(decision)).toBe("Decided by Dana Reyes");
  });

  it("a garbage provenance stamp is no stamp at all", () => {
    const decision = readSettledDecision("ask", {
      extras: { approved: true },
      matrx_decision: { authority: "the vibes" },
    })!;
    expect(decision.provenance).toBeNull();
  });
});
