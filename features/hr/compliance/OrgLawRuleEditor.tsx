// features/hr/compliance/OrgLawRuleEditor.tsx
//
// AUTHORING ONE OF THIS ORGANIZATION'S OWN RULES (D25, §3).
//
// 🚨 A REFUSAL IS NEVER A CLAMP. When the server answers `unlawful_configuration`
// it has ALREADY written the sentence an HR admin needs — which jurisdiction, what
// the law requires, what to do instead — and how many employees it affects. That
// sentence is rendered verbatim and nothing is saved. Quietly lowering the value to
// the legal floor and saving "successfully" would tell an employer their policy is
// what they typed when it is not.
//
// 🚨 "SAVE ANYWAY" EXISTS ONLY FOR WARNINGS, AND ONLY AFTER THEY ARE ON SCREEN.
// `warnings_unacknowledged` is advisory law — law we hold but have not verified —
// and advisory law WARNS, never blocks (§3.2). So the retry that carries
// `p_accept_warnings` is a second, deliberate human click, never a flag this form
// sets on its own and never one it remembers for the next save.
//
// The parameters editor is schema-driven only where the schema is flat. See
// `law-parameters.ts` for why a partial form would be worse than a JSON field.

"use client";

import { useId, useState } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

import { readHrLawValidation, saveHrOrgLawRule } from "../service";
import { isHrDenied, type HrDenied, type HrLawRuleClass, type HrLawValidationFinding, type HrOrgLawRule } from "../types";
import { LawCitationLine } from "./LawRuleCard";
import { flatParameterFields, type LawParamField } from "./law-parameters";

export type LawJurisdictionOption = { key: string; name: string };

type FieldValue = string | boolean;

function initialFieldValues(
  fields: LawParamField[],
  parameters: Record<string, unknown>,
): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of fields) {
    const current = parameters[field.key];
    if (field.kind === "boolean") {
      values[field.key] = current === true;
    } else if (typeof current === "string" || typeof current === "number") {
      values[field.key] = String(current);
    } else {
      values[field.key] = "";
    }
  }
  return values;
}

/** Empty means "not set", and an unset key is simply absent — never a null we invented. */
function fieldValuesToParameters(
  fields: LawParamField[],
  values: Record<string, FieldValue>,
): { parameters: Record<string, unknown> } | { error: string } {
  const parameters: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (field.kind === "boolean") {
      parameters[field.key] = value === true;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "") {
      if (field.required) {
        return { error: `${field.label} is required by this rule class.` };
      }
      continue;
    }
    if (field.kind === "number") {
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) {
        return { error: `${field.label} must be a number.` };
      }
      parameters[field.key] = parsed;
      continue;
    }
    parameters[field.key] = text;
  }
  return { parameters };
}

function FindingList({
  findings,
  tone,
}: {
  findings: HrLawValidationFinding[];
  tone: "violation" | "warning";
}) {
  return (
    <ul className="space-y-3">
      {findings.map((finding, index) => (
        <li key={`${finding.code ?? "finding"}-${index}`} className="space-y-1">
          {/* The server's sentence, verbatim — it is written for this reader. */}
          <p className="text-sm font-medium text-foreground">{finding.message}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {finding.jurisdiction_name ? (
              <span>Jurisdiction: {finding.jurisdiction_name}</span>
            ) : null}
            {finding.affected_employees !== null ? (
              <span>
                Employees affected today: {finding.affected_employees}
              </span>
            ) : null}
            {finding.field ? <span>Setting: {finding.field}</span> : null}
          </div>
          <LawCitationLine citation={finding.citation} />
          {tone === "violation" && finding.required !== null ? (
            <p className="text-xs text-muted-foreground">
              Required: {JSON.stringify(finding.required)}
              {finding.configured !== null
                ? ` · You entered: ${JSON.stringify(finding.configured)}`
                : ""}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function RefusalPanel({
  refusal,
  onSaveAnyway,
  busy,
}: {
  refusal: HrDenied;
  onSaveAnyway: () => void;
  busy: boolean;
}) {
  const validation = readHrLawValidation(refusal);

  if (refusal.reason === "unlawful_configuration") {
    return (
      <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <p className="text-sm font-semibold text-foreground">
            Nothing was saved — this policy would be unlawful where you operate.
          </p>
        </div>
        {validation && validation.violations.length > 0 ? (
          <FindingList findings={validation.violations} tone="violation" />
        ) : (
          <p className="text-sm text-muted-foreground">
            {refusal.detail ?? "The server refused this configuration."}
          </p>
        )}
      </div>
    );
  }

  if (refusal.reason === "warnings_unacknowledged") {
    return (
      <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <p className="text-sm font-semibold text-foreground">
            Read this before saving. Nothing has been saved yet.
          </p>
        </div>
        {validation && validation.warnings.length > 0 ? (
          <FindingList findings={validation.warnings} tone="warning" />
        ) : (
          <p className="text-sm text-muted-foreground">
            {refusal.detail ?? "The server raised a warning about this configuration."}
          </p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onSaveAnyway} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save anyway
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
      <p className="text-sm text-foreground">
        {refusal.detail ??
          "The server refused this rule, and nothing was saved."}
      </p>
    </div>
  );
}

export function OrgLawRuleEditor({
  organizationId,
  classes,
  jurisdictions,
  rule,
  onSaved,
  onCancel,
}: {
  organizationId: string;
  /** Only classes an org may configure. A class it may never touch is not offered. */
  classes: HrLawRuleClass[];
  jurisdictions: LawJurisdictionOption[];
  /** Present → editing that rule. Absent → adding one. */
  rule: HrOrgLawRule | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const [classSlug, setClassSlug] = useState(rule?.rule_class ?? classes[0]?.slug ?? "");
  const [jurisdictionKey, setJurisdictionKey] = useState(
    rule?.jurisdiction_key ?? jurisdictions[0]?.key ?? "US",
  );
  const [effectiveFrom, setEffectiveFrom] = useState(rule?.effective_from ?? "");
  const [basis, setBasis] = useState(rule?.basis ?? "");
  const selected = classes.find((entry) => entry.slug === classSlug) ?? null;
  const fields = flatParameterFields(selected?.parameter_schema ?? null);
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    fields ? initialFieldValues(fields, rule?.parameters ?? {}) : {},
  );
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(rule?.parameters ?? {}, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<HrDenied | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const chooseClass = (slug: string) => {
    setClassSlug(slug);
    setRefusal(null);
    setProblem(null);
    const next = classes.find((entry) => entry.slug === slug) ?? null;
    const nextFields = flatParameterFields(next?.parameter_schema ?? null);
    setValues(nextFields ? initialFieldValues(nextFields, {}) : {});
    setJsonText("{}");
  };

  const save = async (acceptWarnings: boolean) => {
    setProblem(null);
    if (!classSlug) {
      setProblem("Choose which rule you are setting.");
      return;
    }

    let parameters: Record<string, unknown>;
    if (fields) {
      const built = fieldValuesToParameters(fields, values);
      if ("error" in built) {
        setProblem(built.error);
        return;
      }
      parameters = built.parameters;
    } else {
      try {
        const parsed: unknown = JSON.parse(jsonText || "{}");
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setProblem("The parameters must be a JSON object.");
          return;
        }
        parameters = parsed as Record<string, unknown>;
      } catch {
        setProblem("That is not valid JSON, so nothing was sent.");
        return;
      }
    }

    setBusy(true);
    setRefusal(null);
    const result = await saveHrOrgLawRule({
      organizationId,
      draft: {
        id: rule?.id ?? null,
        rule_class: classSlug,
        jurisdiction_key: jurisdictionKey,
        effective_from: effectiveFrom.trim() || null,
        parameters,
        basis: basis.trim() || null,
      },
      acceptWarnings,
    });
    setBusy(false);

    if (result.ok) {
      toast.success(rule ? "Your rule was updated." : "Your rule was added.");
      onSaved();
      return;
    }
    if (isHrDenied(result)) {
      setRefusal(result);
      return;
    }
    setProblem(result.message);
  };

  return (
    <div className="space-y-4 rounded-md border border-border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-class`} className="text-sm font-medium">
            Which rule
          </Label>
          <Select value={classSlug} onValueChange={chooseClass} disabled={Boolean(rule)}>
            <SelectTrigger id={`${uid}-class`}>
              <SelectValue placeholder="Choose a rule" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((entry) => (
                <SelectItem key={entry.slug} value={entry.slug}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected ? (
            <p className="text-sm text-muted-foreground">
              {selected.org_configurable === "more_generous_only"
                ? "You may be more generous than the law here. You may never be less."
                : "You choose inside the envelope the law defines here."}
              {selected.description ? ` ${selected.description}` : ""}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-jurisdiction`} className="text-sm font-medium">
            Where it applies
          </Label>
          <Select value={jurisdictionKey} onValueChange={setJurisdictionKey}>
            <SelectTrigger id={`${uid}-jurisdiction`}>
              <SelectValue placeholder="Choose a jurisdiction" />
            </SelectTrigger>
            <SelectContent>
              {jurisdictions.map((entry) => (
                <SelectItem key={entry.key} value={entry.key}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-from`} className="text-sm font-medium">
            In force from
          </Label>
          <Input
            id={`${uid}-from`}
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Leave it empty and the rule starts today — an org policy starts when the
            organization adopts it.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-basis`} className="text-sm font-medium">
            Why this policy
          </Label>
          <Input
            id={`${uid}-basis`}
            value={basis}
            placeholder="Handbook section, board decision, union agreement…"
            onChange={(event) => setBasis(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">What this rule says</p>
        {fields ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`${uid}-${field.key}`} className="text-sm font-medium">
                  {field.label}
                  {field.required ? <span className="text-destructive"> *</span> : null}
                </Label>
                {field.kind === "boolean" ? (
                  <div className="flex h-9 items-center">
                    <Switch
                      id={`${uid}-${field.key}`}
                      checked={values[field.key] === true}
                      onCheckedChange={(checked) =>
                        setValues((prev) => ({ ...prev, [field.key]: checked }))
                      }
                    />
                  </div>
                ) : field.kind === "enum" ? (
                  <Select
                    value={typeof values[field.key] === "string" ? (values[field.key] as string) : ""}
                    onValueChange={(value) =>
                      setValues((prev) => ({ ...prev, [field.key]: value }))
                    }
                  >
                    <SelectTrigger id={`${uid}-${field.key}`}>
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`${uid}-${field.key}`}
                    inputMode={field.kind === "number" ? "decimal" : undefined}
                    value={typeof values[field.key] === "string" ? (values[field.key] as string) : ""}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Textarea
              aria-label="Rule parameters as JSON"
              value={jsonText}
              rows={10}
              className="font-mono text-xs"
              onChange={(event) => setJsonText(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              This rule&apos;s shape is nested, so it is edited as JSON rather than a form
              that would silently drop the parts it cannot draw. The server validates
              whatever you send.
            </p>
          </div>
        )}
      </div>

      {problem ? (
        <p className="text-sm text-destructive" role="alert">
          {problem}
        </p>
      ) : null}

      {refusal ? (
        <RefusalPanel refusal={refusal} busy={busy} onSaveAnyway={() => void save(true)} />
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => void save(false)} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {rule ? "Save changes" : "Add this rule"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
