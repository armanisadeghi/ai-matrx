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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";
import { GitBranch } from "lucide-react";
import {
  RULE_ACTION_KIND_HINTS,
  RULE_ACTION_KIND_LABELS,
  RULE_ACTION_KINDS,
  RULE_ACTION_URGENCIES,
  RULE_ACTION_URGENCY_LABELS,
  RULE_POLICY_LEVEL_LABELS,
  RULE_POLICY_LEVELS,
  type RuleActionKind,
  type RuleActionUrgency,
  type RulePolicyLevel,
  type RuleFieldValues,
  type RuleMoveFieldValues,
  type RulebookSections,
  type RuleSeverity,
} from "../../types";

// The form's field set is declared ONCE, in `../../types` — the editor's state,
// its persisted draft and the context menu all derive from the same shape.
// Re-exported here because this component is the form its consumers import.
export type { RuleFieldValues } from "../../types";

/** The decision fields as a rule stores them — the ONE mapping, so no consumer
 * invents its own. Returns the three clearing `undefined`s for an ordinary
 * rule, so turning the toggle back off actually removes the shape. */
export function policyRulePatch(values: RuleFieldValues) {
  if (!values.isPolicy) {
    return {
      kind: undefined,
      precondition: undefined,
      next_action: undefined,
      action_kind: undefined,
      cost: undefined,
      risk: undefined,
    } as const;
  }
  return {
    kind: "policy",
    precondition: values.precondition.trim() || undefined,
    next_action: values.nextAction.trim() || undefined,
    action_kind: values.actionKind,
    cost: values.cost,
    risk: values.risk,
  } as const;
}

/**
 * The form values as the improve / tidy Mandate reads them: every text field
 * plus the decision shape under its STORED names (`kind`, `next_action`, …),
 * because `useRuleImproveRun` enumerates `RULE_CONTENT_FIELDS`, not the form's
 * camelCase keys. Handing it the raw form values sent a decision rule to the
 * model with an empty kind and next action, so tidy polished the prose and
 * dropped the judgment (Bugbot, 1d692d66). ONE derivation, on top of the ONE
 * storage mapping — never a second spelling of the field names.
 */
export function improveFieldsFrom(values: RuleFieldValues) {
  return { ...values, ...policyRulePatch(values) };
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
  move,
  onMoveChange,
  sections,
  autoFocusName = true,
  idPrefix = "rule",
  omitFields,
}: {
  values: RuleFieldValues;
  onChange: (patch: Partial<RuleFieldValues>) => void;
  /**
   * The MOVE half (contract §2) — the structured "when does it apply / what do
   * you do next" group, held by the host as its own `RuleMoveFieldValues` set
   * because it converts to and from the rule's `move` object rather than to the
   * flat decision columns above. A host that has nowhere to put it (the Final
   * Checkup's SUGGESTION shape) passes neither prop and the block is not
   * rendered — never a fork of this form.
   */
  move?: RuleMoveFieldValues;
  onMoveChange?: (patch: Partial<RuleMoveFieldValues>) => void;
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
      {omitted.has("isPolicy") ? null : (
      <>
      {/* 🚨 THE POLICY RULE (W58). Off by default and silent when off: most
          rules genuinely ARE standing statements, and a form that demanded a
          precondition for every one of them would push Experts to invent
          conditions they do not hold. */}
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label
              htmlFor={`${idPrefix}-is-policy`}
              className="flex items-center gap-1.5"
            >
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
              This is a decision rule
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Turn this on when the rule is a judgment call — &ldquo;when I know
              this much, here&rsquo;s the one thing I do next&rdquo; — rather
              than something that is always true.
            </p>
          </div>
          <Switch
            id={`${idPrefix}-is-policy`}
            checked={values.isPolicy}
            onCheckedChange={(checked) => onChange({ isPolicy: checked })}
          />
        </div>
        {values.isPolicy ? (
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-precondition`}>
                What do you know at this point?
              </Label>
              <ProTextarea
                id={`${idPrefix}-precondition`}
                value={values.precondition}
                onChange={(e) => onChange({ precondition: e.target.value })}
                placeholder="Everything you'd know before making this call — and nothing you wouldn't."
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-next-action`}>
                What do you do next?
              </Label>
              <ProTextarea
                id={`${idPrefix}-next-action`}
                value={values.nextAction}
                onChange={(e) => onChange({ nextAction: e.target.value })}
                placeholder="The one next move — the question you ask, the check you run, what you do."
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label>What kind of move is it?</Label>
              <Select
                value={values.actionKind}
                onValueChange={(v) =>
                  onChange({ actionKind: v as RuleActionKind })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_ACTION_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {RULE_ACTION_KIND_LABELS[kind]} —{" "}
                      {RULE_ACTION_KIND_HINTS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>What does it cost to do?</Label>
                <Select
                  value={values.cost}
                  onValueChange={(v) => onChange({ cost: v as RulePolicyLevel })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_POLICY_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {RULE_POLICY_LEVEL_LABELS[level]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>How risky is doing it?</Label>
                <Select
                  value={values.risk}
                  onValueChange={(v) => onChange({ risk: v as RulePolicyLevel })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_POLICY_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {RULE_POLICY_LEVEL_LABELS[level]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      </>
      )}
      {!move || !onMoveChange || omitted.has("policy") ? null : (
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
                value={move.preconditionSummary ?? ""}
                onChange={(e) =>
                  onMoveChange({ preconditionSummary: e.target.value })
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
                  value={move.preconditionKnown ?? ""}
                  onChange={(e) =>
                    onMoveChange({ preconditionKnown: e.target.value })
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
                  value={move.preconditionUnknown ?? ""}
                  onChange={(e) =>
                    onMoveChange({ preconditionUnknown: e.target.value })
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
                  value={move.nextActionKind || NO_ACTION_KIND}
                  onValueChange={(v) =>
                    onMoveChange({
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
                  value={move.nextActionTarget ?? ""}
                  onChange={(e) =>
                    onMoveChange({ nextActionTarget: e.target.value })
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
                value={move.nextActionBuys ?? ""}
                onChange={(e) => onMoveChange({ nextActionBuys: e.target.value })}
                placeholder="e.g. rules out the worst thing first"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>How costly is it? (1–5)</Label>
                <Select
                  value={move.nextActionCost || NO_SCALE}
                  onValueChange={(v) =>
                    onMoveChange({ nextActionCost: v === NO_SCALE ? "" : v })
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
                  value={move.nextActionRisk || NO_SCALE}
                  onValueChange={(v) =>
                    onMoveChange({ nextActionRisk: v === NO_SCALE ? "" : v })
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
                  value={move.nextActionUrgency || NO_URGENCY}
                  onValueChange={(v) =>
                    onMoveChange({
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
