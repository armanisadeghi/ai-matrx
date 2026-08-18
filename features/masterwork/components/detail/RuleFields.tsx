"use client";

// features/masterwork/components/detail/RuleFields.tsx
//
// The ONE plain-language rule form field set — "What's the rule? Why? How
// would you catch someone breaking it? How bad is breaking it?" — consumed by
// BOTH the edit dialog (RuleEditorDialog) and the Add-rule window's manual
// tab. Never re-declare these fields beside a consumer. Every textarea is
// ProTextarea (mic + transcription — module invariant 5).

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";
import type { RulebookSections, RuleSeverity } from "../../types";

export interface RuleFieldValues {
  name: string;
  statement: string;
  rationale: string;
  detection: string;
  quote: string;
  severity: RuleSeverity;
  section: string;
}

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
  omitFields?: ReadonlyArray<keyof RuleFieldValues>;
}) {
  const omitted = new Set(omitFields ?? []);
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
