"use client";

// features/masterwork/components/detail/RuleFields.tsx
//
// The ONE plain-language rule form field set — "What's the rule? Why? How
// would you catch someone breaking it? How bad is breaking it?" — consumed by
// BOTH the edit dialog (RuleEditorDialog) and the Add-rule window's manual
// tab. Never re-declare these fields beside a consumer. Every textarea is
// ProTextarea (mic + transcription — module invariant 5).

import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";
import {
  RULE_ACTION_KINDS,
  RULE_ACTION_KIND_LABELS,
  RULE_ACTION_URGENCIES,
  RULE_ACTION_URGENCY_LABELS,
  type RuleActionKind,
  type RuleActionUrgency,
  type RulebookSections,
  type RuleMoveFieldValues,
  type RuleSeverity,
} from "../../types";

export interface RuleFieldValues extends Partial<RuleMoveFieldValues> {
  name: string;
  statement: string;
  rationale: string;
  detection: string;
  quote: string;
  severity: RuleSeverity;
  section: string;
}

/**
 * The sentinel a surface passes in `omitFields` to leave the whole policy
 * block out (contract §2) — the Final Checkup edits a SUGGESTION whose shape
 * has nowhere to put a precondition or a next action, so rendering the inputs
 * there would silently discard whatever was typed.
 */
export type RuleFieldOmission = keyof RuleFieldValues | "policy";

/** Radix Select forbids an empty-string item value, so "unset" is a token. */
const NO_ACTION_KIND = "__none__";
const NO_SCALE = "__unset__";
const NO_URGENCY = "__unset__";
const SCALE = ["1", "2", "3", "4", "5"] as const;

export function RuleFields({
  values,
  onChange,
  sections,
  autoFocusName = true,
  idPrefix = "rule",
  omitFields,
}: {
  values: RuleFieldValues;
  onChange: (patch: Partial<RuleFieldValues>) => void;
  sections: RulebookSections;
  autoFocusName?: boolean;
  /** Field ids are `${idPrefix}-name` etc. — the editor's context-menu text
   * replacement targets these ids, so keep the default there. */
  idPrefix?: string;
  /**
   * Fields this surface genuinely cannot own. The Final Checkup edits a
   * SUGGESTION, whose source quote is the Expert's mechanically-verified
   * verbatim evidence — rendering an editable box whose edits are discarded is
   * worse than not rendering it. Omitting a field here is the sanctioned way to
   * say so; forking this form is not.
   */
  omitFields?: ReadonlyArray<RuleFieldOmission>;
}) {
  const omitted = new Set<string>(omitFields ?? []);
  const sectionCodes = Object.keys(sections);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Short name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Always lead with the benefit"
          autoFocus={autoFocusName}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-statement`}>What&apos;s the rule?</Label>
        <ProTextarea
          id={`${idPrefix}-statement`}
          value={values.statement}
          onChange={(e) => onChange({ statement: e.target.value })}
          placeholder="The rule itself, as an instruction."
          rows={6}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-rationale`}>Why does it matter?</Label>
        <ProTextarea
          id={`${idPrefix}-rationale`}
          value={values.rationale}
          onChange={(e) => onChange({ rationale: e.target.value })}
          placeholder="The reasoning behind it — optional but it makes rulings much better."
          rows={6}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-detection`}>
          How would you catch someone breaking it?
        </Label>
        <ProTextarea
          id={`${idPrefix}-detection`}
          value={values.detection}
          onChange={(e) => onChange({ detection: e.target.value })}
          placeholder="What a violation looks like in practice."
          rows={6}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>How bad is breaking it?</Label>
          <Select
            value={values.severity}
            onValueChange={(v) => onChange({ severity: v as RuleSeverity })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">
                Critical — never acceptable
              </SelectItem>
              <SelectItem value="major">Major — a real problem</SelectItem>
              <SelectItem value="minor">Minor — worth fixing</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Belongs in</Label>
          <Select
            value={values.section}
            onValueChange={(v) => onChange({ section: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sectionCodes.map((code) => (
                <SelectItem key={code} value={code}>
                  {sections[code]?.label ?? code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {omitted.has("policy") ? null : (
        <details className="rounded-md border border-border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            When does it apply, and what do you do next? (optional)
          </summary>
          <p className="mt-1 text-xs text-muted-foreground">
            Only for rules about a decision you make as a case unfolds. Leave it
            empty and the rule works exactly as it always has — the rule itself,
            above, is still the whole rule.
          </p>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-precondition-summary`}>
                When does this apply?
              </Label>
              <Input
                id={`${idPrefix}-precondition-summary`}
                value={values.preconditionSummary ?? ""}
                onChange={(e) =>
                  onChange({ preconditionSummary: e.target.value })
                }
                placeholder="e.g. adult with fever, headache and a stiff neck"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-precondition-known`}>
                  What you already know (one per line)
                </Label>
                <ProTextarea
                  id={`${idPrefix}-precondition-known`}
                  value={values.preconditionKnown ?? ""}
                  onChange={(e) =>
                    onChange({ preconditionKnown: e.target.value })
                  }
                  placeholder={"fever\nheadache\nneck stiffness"}
                  rows={4}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-precondition-unknown`}>
                  What you still don&apos;t know (one per line)
                </Label>
                <ProTextarea
                  id={`${idPrefix}-precondition-unknown`}
                  value={values.preconditionUnknown ?? ""}
                  onChange={(e) =>
                    onChange({ preconditionUnknown: e.target.value })
                  }
                  placeholder={"whether the spinal fluid is infected"}
                  rows={4}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label>What kind of step is next?</Label>
                <Select
                  value={values.nextActionKind || NO_ACTION_KIND}
                  onValueChange={(v) =>
                    onChange({
                      nextActionKind:
                        v === NO_ACTION_KIND ? "" : (v as RuleActionKind),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ACTION_KIND}>
                      No next step
                    </SelectItem>
                    {RULE_ACTION_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {RULE_ACTION_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-next-target`}>
                  What exactly do you do?
                </Label>
                <Input
                  id={`${idPrefix}-next-target`}
                  value={values.nextActionTarget ?? ""}
                  onChange={(e) =>
                    onChange({ nextActionTarget: e.target.value })
                  }
                  placeholder="e.g. lumbar puncture (scan first if there are focal signs)"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-next-buys`}>
                What does that step buy you?
              </Label>
              <Input
                id={`${idPrefix}-next-buys`}
                value={values.nextActionBuys ?? ""}
                onChange={(e) => onChange({ nextActionBuys: e.target.value })}
                placeholder="e.g. rules out the worst thing first"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>How costly is it? (1–5)</Label>
                <Select
                  value={values.nextActionCost || NO_SCALE}
                  onValueChange={(v) =>
                    onChange({ nextActionCost: v === NO_SCALE ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SCALE}>Not saying</SelectItem>
                    {SCALE.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>How risky is it? (1–5)</Label>
                <Select
                  value={values.nextActionRisk || NO_SCALE}
                  onValueChange={(v) =>
                    onChange({ nextActionRisk: v === NO_SCALE ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SCALE}>Not saying</SelectItem>
                    {SCALE.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>How soon?</Label>
                <Select
                  value={values.nextActionUrgency || NO_URGENCY}
                  onValueChange={(v) =>
                    onChange({
                      nextActionUrgency:
                        v === NO_URGENCY ? "" : (v as RuleActionUrgency),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_URGENCY}>Not saying</SelectItem>
                    {RULE_ACTION_URGENCIES.map((urgency) => (
                      <SelectItem key={urgency} value={urgency}>
                        {RULE_ACTION_URGENCY_LABELS[urgency]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </details>
      )}
      {omitted.has("quote") ? null : (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-quote`}>
            In the source&apos;s own words (optional)
          </Label>
          <ProTextarea
            id={`${idPrefix}-quote`}
            value={values.quote}
            onChange={(e) => onChange({ quote: e.target.value })}
            placeholder="An exact quote from the book or document this rule comes from."
            rows={6}
          />
        </div>
      )}
    </div>
  );
}
