"use client";

/**
 * The editor for ONE column's validation rules, as a popover on its card in
 * Table Settings.
 *
 * It follows the same posture the format-specific controls on that card already
 * take: a compact trigger that says whether anything is set, a popover that
 * holds only the controls this column's type can actually use, and nothing
 * written until the dialog's own Save.
 *
 * THREE things it deliberately will not do:
 *
 *  - It never offers `required`. The card already has the Req checkbox, which
 *    writes `is_required`. A second control for the same fact is how two truths
 *    start.
 *  - It never offers "allowed values" on a CHOICE column. That column's options
 *    already live in its format, they are offered in the picker, and an
 *    off-list value there is legal and amber by design. A second list would
 *    contradict the first.
 *  - It never saves an unparseable pattern. A regex the browser cannot compile
 *    would be silently skipped at validation time — a rule that looks armed and
 *    is not, which is the exact failure mode the platform's no-silent-failure
 *    law exists to prevent. The popover says so, names the parser's complaint,
 *    and refuses.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, ShieldAlert, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input, Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";

import { getFieldFormat } from "@ai-matrx/design-system/field-formats";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";

import {
  describeValidationRules,
  hasValidationRules,
  type ValidationRules,
} from "../validation";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export type ColumnValidationEditorProps = {
  /** The column's storage type (`string` | `number` | `integer` | …). */
  dataType: string;
  /** The column's declared display format — decides which rules make sense. */
  format: FieldFormatConfig | null | undefined;
  value: ValidationRules;
  onChange: (next: ValidationRules) => void;
  className?: string;
  disabled?: boolean;
};

/** Which storage type the column's declared format actually sits on. */
function baseTypeOf(dataType: string, format: FieldFormatConfig | null | undefined): string {
  const def = format ? getFieldFormat(format.id) : null;
  return def?.base ?? dataType;
}

const CHOICE_FORMATS = new Set(["choice", "multi_choice"]);

/** A number input that writes `undefined` when it is emptied, never 0. */
function NumberRule({
  id,
  label,
  value,
  step,
  min,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  step?: number;
  min?: number;
  onChange: (next: number | undefined) => void;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step={step ?? "any"}
        min={min}
        className="h-8 text-xs"
        value={value === undefined ? "" : String(value)}
        placeholder="—"
        onChange={(e) => {
          const raw = e.target.value;
          if (raw.trim() === "") return onChange(undefined);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
      />
    </div>
  );
}

export function ColumnValidationEditor({
  dataType,
  format,
  value,
  onChange,
  className,
  disabled = false,
}: ColumnValidationEditorProps) {
  const base = baseTypeOf(dataType, format);
  const isChoice = format ? CHOICE_FORMATS.has(format.id) : false;
  const numeric = base === "number" || base === "integer";
  const textual = base === "string";

  const summary = useMemo(() => describeValidationRules(value), [value]);
  const armed = hasValidationRules(value);

  // The comma list is edited as TEXT, so a half-typed "Red, " does not lose the
  // trailing item on every keystroke. It is parsed on the way out, once.
  const [allowedText, setAllowedText] = useState<string | null>(null);
  const allowedShown = allowedText ?? (value.allowedValues ?? []).join(", ");

  const patternError = useMemo(() => {
    if (!value.pattern) return null;
    try {
      new RegExp(value.pattern);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "This is not a valid pattern.";
    }
  }, [value.pattern]);

  const set = (patch: Partial<ValidationRules>) => {
    const next: ValidationRules = { ...value, ...patch };
    for (const key of Object.keys(next) as (keyof ValidationRules)[]) {
      if (next[key] === undefined) delete next[key];
    }
    onChange(next);
  };

  return (
    <div className={className}>
      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
        Rules
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-8 w-full justify-start gap-1.5 px-2 text-xs font-normal"
            title={
              armed
                ? summary.join(" • ")
                : "No validation rules on this column — every value is accepted."
            }
          >
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {armed ? summary.join(" • ") : "None"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent sizing="content" align="start" className="space-y-3 p-3">
          <div>
            <p className="text-sm font-medium">Validation rules</p>
            <p className="text-[11px] text-muted-foreground">
              A value that breaks a rule is refused with the reason. Values
              already saved are kept and shown in amber, so you can find them.
            </p>
          </div>

          {numeric && (
            <div className="grid grid-cols-2 gap-2">
              <NumberRule
                id="rule-min"
                label="Minimum"
                value={value.min}
                step={base === "integer" ? 1 : undefined}
                onChange={(next) => set({ min: next })}
              />
              <NumberRule
                id="rule-max"
                label="Maximum"
                value={value.max}
                step={base === "integer" ? 1 : undefined}
                onChange={(next) => set({ max: next })}
              />
            </div>
          )}

          {textual && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <NumberRule
                  id="rule-minlen"
                  label="Min length"
                  value={value.minLength}
                  step={1}
                  min={0}
                  onChange={(next) =>
                    set({
                      minLength:
                        next === undefined ? undefined : Math.max(0, Math.trunc(next)),
                    })
                  }
                />
                <NumberRule
                  id="rule-maxlen"
                  label="Max length"
                  value={value.maxLength}
                  step={1}
                  min={0}
                  onChange={(next) =>
                    set({
                      maxLength:
                        next === undefined ? undefined : Math.max(0, Math.trunc(next)),
                    })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rule-pattern" className="text-[11px] text-muted-foreground">
                  Pattern (regular expression)
                </Label>
                <Input
                  id="rule-pattern"
                  className="h-8 font-mono text-xs"
                  placeholder="^\\d{3}-\\d{4}$"
                  value={value.pattern ?? ""}
                  onChange={(e) =>
                    set({ pattern: e.target.value.trim() === "" ? undefined : e.target.value })
                  }
                />
                {patternError ? (
                  <p className="flex items-start gap-1 text-[11px] text-destructive">
                    <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      {patternError} This rule will NOT be saved until it is a
                      valid pattern — a rule that cannot be read is a rule that
                      does nothing.
                    </span>
                    <ErrorAlchemyMenu error={patternError} />
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Anchor it yourself with <code>^</code> and <code>$</code>, or
                    it matches anywhere in the value.
                  </p>
                )}
              </div>

              {value.pattern && !patternError && (
                <div className="space-y-1">
                  <Label htmlFor="rule-hint" className="text-[11px] text-muted-foreground">
                    Say it in plain English
                  </Label>
                  <Input
                    id="rule-hint"
                    className="h-8 text-xs"
                    placeholder="###-####"
                    value={value.patternHint ?? ""}
                    onChange={(e) =>
                      set({
                        patternHint:
                          e.target.value.trim() === "" ? undefined : e.target.value,
                      })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This is what someone sees when their entry is refused. Without
                    it they are shown the expression itself.
                  </p>
                </div>
              )}

              {!isChoice && (
                <div className="space-y-1">
                  <Label htmlFor="rule-allowed" className="text-[11px] text-muted-foreground">
                    Accept only these values
                  </Label>
                  <Input
                    id="rule-allowed"
                    className="h-8 text-xs"
                    placeholder="Red, Green, Blue"
                    value={allowedShown}
                    onChange={(e) => {
                      setAllowedText(e.target.value);
                      const parsed = e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter((s) => s !== "");
                      set({ allowedValues: parsed.length > 0 ? parsed : undefined });
                    }}
                    onBlur={() => setAllowedText(null)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Separate with commas. Matching ignores capitalisation. For a
                    column people should PICK from, set "Shows as" to Choice
                    instead — that gives them a list, not a rule.
                  </p>
                </div>
              )}
            </>
          )}

          {isChoice && (
            <p className="rounded-md border border-border bg-muted/50 p-2 text-[11px] text-muted-foreground">
              This column's accepted values are its Choice options — edit them in
              "Shows as". An option list and a value rule would be two answers to
              one question.
            </p>
          )}

          <div className="flex items-start gap-2 border-t pt-3">
            <Checkbox
              id="rule-unique"
              checked={value.unique === true}
              onCheckedChange={(checked) =>
                set({ unique: checked === true ? true : undefined })
              }
            />
            <div className="min-w-0">
              <Label htmlFor="rule-unique" className="text-xs">
                No two rows may share a value
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Checked against the rows loaded in the grid. Rows on other pages
                are not compared, so this catches the common mistake — it is not
                a database guarantee.
              </p>
            </div>
          </div>

          {armed && (
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" />
                Applies when you save this dialog
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setAllowedText(null);
                  onChange({});
                }}
              >
                Clear all
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default ColumnValidationEditor;
