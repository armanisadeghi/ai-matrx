/**
 * The screen's words for NOT SET / OFF / a value must match what the ENGINE sends.
 *
 * `wire_cases.json` is written by aidream `scripts/export_translation_wire_cases.py`: for every live
 * proposed or agent cell it runs the real engine (`run_engine` on the live catalog) and records, per
 * state, the wire entries that cell causes. This test runs the screen's one renderer
 * (`describeUnset` / `describeOff` / `describeValue`, which `plainRule` words) on the same rule and
 * fails when a description promises "nothing sent" while the engine sends something, names a value
 * the engine does not send, or says the server shapes a value the engine never sends.
 *
 * Third verifier (V3): "Deep Research · Visualization: Sent unchanged" while the engine sends
 * `auto` when not set, and Claude "-max" rows hid "not set runs at extra-high effort".
 */
import cases from "./wire_cases.json";
import { describeOff, describeUnset, describeValue, plainRule, type WireOutcome } from "../model";
import type { ControlRule } from "../../types";
import type { TranslationSetting } from "../types";

type Wire = Record<string, unknown> | null;
type Case = {
  cell_id: string;
  consumed_by: string | null;
  setting_key: string;
  offering: string;
  rule: ControlRule;
  setting: Partial<TranslationSetting>;
  engine: { unset: Wire; off?: Wire; values: Record<string, Wire> };
};

const ALL = (cases as { cases: Case[] }).cases;

function leaves(v: unknown): string[] {
  if (v && typeof v === "object" && !Array.isArray(v)) return Object.values(v).flatMap(leaves);
  return [JSON.stringify(v)];
}

/** Why the description disagrees with the engine's wire, or null when it agrees. */
export function disagreement(outcome: WireOutcome, wire: Wire): string | null {
  if (wire === null) return null; // the engine raised: not a description question
  const sent = Object.values(wire).flatMap(leaves);
  const claim = outcome.claim;
  if (claim.kind === "nothing" && sent.length > 0)
    return `says "${outcome.text}" but the engine sends ${JSON.stringify(wire)}`;
  if (claim.kind === "something" && sent.length === 0)
    return `says "${outcome.text}" but the engine sends nothing`;
  if (claim.kind === "value") {
    if (sent.length === 0) return `says "${outcome.text}" but the engine sends nothing`;
    const missing = leaves(claim.value).filter((l) => !sent.includes(l));
    if (missing.length > 0) return `says "${outcome.text}" but the engine sends ${JSON.stringify(wire)}`;
  }
  return null;
}

function check(c: Case): string[] {
  const setting = c.setting as TranslationSetting;
  const ctx = { consumedBy: c.consumed_by };
  const out: string[] = [];
  const at = `${c.setting_key} on ${c.offering} (cell ${c.cell_id.slice(0, 8)})`;
  const unset = disagreement(describeUnset(c.rule, c.setting_key), c.engine.unset);
  if (unset) out.push(`${at} NOT SET: ${unset}`);
  if (c.engine.off !== undefined) {
    const off = describeOff(c.rule, c.setting_key, setting, ctx);
    const why = off ? disagreement(off, c.engine.off) : "the screen shows no Off line";
    if (why) out.push(`${at} OFF: ${why}`);
  }
  for (const [token, wire] of Object.entries(c.engine.values)) {
    const why = disagreement(describeValue(c.rule, c.setting_key, JSON.parse(token), ctx), wire);
    if (why) out.push(`${at} ${token}: ${why}`);
  }
  return out;
}

describe("the screen describes every state exactly as the engine sends it", () => {
  it("has live cases to judge", () => {
    expect(ALL.length).toBeGreaterThan(50);
  });

  it("no live cell's NOT SET / OFF / value description disagrees with the engine", () => {
    const found = ALL.flatMap(check);
    expect(found).toEqual([]);
  });

  it("names the decisions the third verifier found hidden", () => {
    const viz = ALL.find((c) => c.cell_id.startsWith("a88ca618"));
    expect(viz && plainRule(viz.rule, viz.setting_key, viz.setting as TranslationSetting)).toMatch(
      /^Not set → sends auto/,
    );
    const max = ALL.find((c) => c.cell_id.startsWith("9498fb14"));
    expect(max && plainRule(max.rule, max.setting_key, max.setting as TranslationSetting)).toMatch(
      /^Not set → runs at extra-high effort · Off → sends thinking disabled/,
    );
  });

  it("the guard fails on a description that hides a sent default (proof it can fail)", () => {
    const wrong: WireOutcome = { text: "Nothing sent", tone: "nothing", claim: { kind: "nothing" } };
    expect(disagreement(wrong, { visualization: "auto" })).not.toBeNull();
    const wrongValue: WireOutcome = { text: "low", tone: "send", claim: { kind: "value", value: "low" } };
    expect(disagreement(wrongValue, { "output_config.effort": "xhigh" })).not.toBeNull();
  });
});
