/**
 * The client resolver, validator and editor field split must TOLERATE the
 * settings-translation rule language (contract K6) before any data uses it:
 * a rule carrying a K6 field validates clean and resolves to exactly the
 * control it resolved to without that field. Also pins `to_default`, the
 * server field the old hand-written list had lost.
 */

import type { AiSetting, ControlRule } from "../../types";
import {
  RULE_FIELDS,
  buildControlRows,
  readOnlyRuleFields,
  resolveControlForKey,
  validateRuleShape,
} from "../resolveControls";
import {
  CONTRACT_RULE_FIELDS,
  SERVER_RULE_FIELDS,
} from "../controlRuleFields.generated";

const reasoningEffort = {
  key: "reasoning_effort",
  value_type: "enum",
  canonical_values: ["auto", "none", "low", "medium", "high"],
  canonical_min: null,
  canonical_max: null,
  default_value: "medium",
  is_system: true,
} as unknown as AiSetting;

const maxTokens = {
  key: "max_output_tokens",
  value_type: "integer",
  canonical_values: null,
  canonical_min: 1,
  canonical_max: 200000,
  default_value: 4096,
  is_system: true,
} as unknown as AiSetting;

const enumBase: ControlRule = {
  provider_key: "reasoning_effort",
  value_map: { low: "low", medium: "medium", high: "high", none: null },
  default: "medium",
};
const numberBase: ControlRule = { clamp: { min: 16, max: 64000 } };

/** One realistic value per K6 field (+ to_default), shaped per the contract. */
const K6_SAMPLES: Record<string, unknown> = {
  off: { omit: true, why: "provider has no off; unset is the off" },
  from_number: [
    { lte: 1024, to: "low" },
    { lte: 8192, to: "medium" },
    { lte: null, to: "high" },
  ],
  to_number: { low: 1024, medium: 8192, high: 24576 },
  accepts: ["low", "medium", "high"],
  drop: true,
  why: "not offered on this endpoint",
  to_default: ["auto"],
};

describe("generated rule field list", () => {
  it("includes to_default and every K6 field", () => {
    for (const f of ["to_default", ...Object.keys(K6_SAMPLES)]) {
      expect(RULE_FIELDS).toContain(f);
    }
    expect(SERVER_RULE_FIELDS).toContain("to_default");
    for (const f of CONTRACT_RULE_FIELDS) {
      expect(SERVER_RULE_FIELDS).not.toContain(f);
    }
  });
});

describe.each(Object.entries(K6_SAMPLES))("rule carrying %s", (field, value) => {
  const withField = (base: ControlRule) =>
    ({ ...base, [field]: value }) as ControlRule;

  it("passes shape validation", () => {
    expect(validateRuleShape(withField(enumBase))).toEqual([]);
    expect(validateRuleShape(withField(numberBase))).toEqual([]);
  });

  it("resolves to the same enum control as without it", () => {
    expect(
      resolveControlForKey("reasoning_effort", withField(enumBase), reasoningEffort, null),
    ).toEqual(resolveControlForKey("reasoning_effort", enumBase, reasoningEffort, null));
  });

  it("resolves to the same numeric control as without it", () => {
    expect(
      resolveControlForKey("max_output_tokens", withField(numberBase), maxTokens, 32000),
    ).toEqual(resolveControlForKey("max_output_tokens", numberBase, maxTokens, 32000));
  });

  it("is carried through the family/override merge and shown read-only", () => {
    const rows = buildControlRows(
      { reasoning_effort: enumBase },
      { reasoning_effort: { [field]: value } as ControlRule },
      [reasoningEffort],
      null,
    );
    const plain = buildControlRows(
      { reasoning_effort: enumBase },
      {},
      [reasoningEffort],
      null,
    );
    expect(rows[0].resolved).toEqual(plain[0].resolved);
    expect((rows[0].merged as Record<string, unknown>)[field]).toEqual(value);
    expect(rows[0].provenance.override).toContain(field);
    expect(readOnlyRuleFields(withField(enumBase))).toContainEqual({ field, value });
  });
});

describe("still strict where it should be", () => {
  it("flags a field the server does not define", () => {
    const issues = validateRuleShape({ ...enumBase, made_up: 1 } as ControlRule);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("made_up");
  });

  it("keeps editor-handled fields out of the read-only list", () => {
    expect(readOnlyRuleFields(enumBase)).toEqual([]);
  });
});
