"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, NumberField } from "../FormField";
import { DateField } from "./DateField";
import { OccupationCombobox } from "./OccupationCombobox";
import { WeeklyEarningsField } from "./WeeklyEarningsField";
import type { ClaimDraft } from "../../state/types";

const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"] as const;

interface ClaimHeaderProps {
  claim: ClaimDraft;
  onChange: (patch: Partial<ClaimDraft>) => void;
  className?: string;
}

function isoOrNull(d: Date | undefined): string | null {
  if (!d) return null;
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseIso(value: string | null): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function computeAgeFromDates(
  dob: Date | undefined,
  doi: Date | undefined,
): number | null {
  if (!dob || !doi) return null;
  let age = doi.getFullYear() - dob.getFullYear();
  const monthDiff = doi.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && doi.getDate() < dob.getDate())) {
    age--;
  }
  if (age < 0 || age > 120) return null;
  return age;
}

export function ClaimHeader({ claim, onChange, className }: ClaimHeaderProps) {
  const ageString = claim.age_at_doi == null ? "" : String(claim.age_at_doi);

  // Auto-calc age from DOB + DOI unless the user has explicitly set it. On
  // first mount we treat a loaded age as a "manual override" only when it
  // diverges from what the loaded dates would produce — that way previously
  // auto-computed values continue to track new date edits, while a hand-typed
  // override survives reloads. Typing into the age field locks the value;
  // clearing the field unlocks auto-calc again.
  const manualAgeRef = React.useRef<boolean | null>(null);
  if (manualAgeRef.current === null) {
    const initialComputed = computeAgeFromDates(
      parseIso(claim.date_of_birth),
      parseIso(claim.date_of_injury),
    );
    manualAgeRef.current =
      claim.age_at_doi !== null && claim.age_at_doi !== initialComputed;
  }

  React.useEffect(() => {
    if (manualAgeRef.current) return;
    const dob = parseIso(claim.date_of_birth);
    const doi = parseIso(claim.date_of_injury);
    const computed = computeAgeFromDates(dob, doi);
    if (computed !== claim.age_at_doi) {
      onChange({ age_at_doi: computed });
    }
  }, [claim.date_of_birth, claim.date_of_injury, claim.age_at_doi, onChange]);

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm",
        className,
      )}
    >
      <header className="flex items-start gap-3 mb-6">
        <div className="rounded-lg bg-primary/10 p-2 ring-1 ring-primary/15">
          <User className="h-10 w-10 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Claim
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Applicant, date of injury, and rating context.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 sm:gap-5">
        <div className="lg:col-span-6">
          <Field label="Applicant name" required>
            <Input
              type="text"
              value={claim.applicant_name}
              onChange={(e) => onChange({ applicant_name: e.target.value })}
              placeholder="Jane Doe"
              className="h-11 text-base"
            />
          </Field>
        </div>

        <div className="lg:col-span-6">
          <Field label="Occupation" required>
            <OccupationCombobox
              value={claim.occupational_code}
              onChange={(code) => onChange({ occupational_code: code })}
            />
          </Field>
        </div>

        <div className="lg:col-span-4">
          <Field label="Date of injury" required>
            <DateField
              value={parseIso(claim.date_of_injury)}
              onChange={(d) => onChange({ date_of_injury: isoOrNull(d) })}
              fromYear={1950}
            />
          </Field>
        </div>

        <div className="lg:col-span-4">
          <Field label="Date of birth" required>
            <DateField
              value={parseIso(claim.date_of_birth)}
              onChange={(d) => onChange({ date_of_birth: isoOrNull(d) })}
              fromYear={1900}
              toYear={new Date().getFullYear()}
            />
          </Field>
        </div>

        <div className="lg:col-span-4">
          <Field
            label="Age at injury"
            hint={
              manualAgeRef.current
                ? "Manually set — clear to auto-calculate from DOB and DOI."
                : "Auto-calculated from DOB and DOI. Type a value to override."
            }
          >
            <NumberField
              value={ageString}
              onChange={(raw) => {
                if (raw === "") {
                  manualAgeRef.current = false;
                  if (claim.age_at_doi !== null) {
                    onChange({ age_at_doi: null });
                  }
                  return;
                }
                manualAgeRef.current = true;
                const n = Number(raw);
                if (Number.isNaN(n)) return;
                onChange({ age_at_doi: Math.max(0, Math.min(120, n)) });
              }}
              placeholder="42"
              min={0}
              max={120}
              step={1}
              inputMode="numeric"
            />
          </Field>
        </div>

        <div className="lg:col-span-12">
          <WeeklyEarningsField
            value={claim.weekly_earnings}
            onChange={(v) => onChange({ weekly_earnings: v })}
          />
        </div>
      </div>

      <CaseInfoSection claim={claim} onChange={onChange} />
      <CompensationSection claim={claim} onChange={onChange} />
    </section>
  );
}

function CompensationSection({
  claim,
  onChange,
}: {
  claim: ClaimDraft;
  onChange: (patch: Partial<ClaimDraft>) => void;
}) {
  const hasContent =
    !!claim.p_s_date || !!claim.job_offer_date || claim.large_employer;
  const [open, setOpen] = React.useState(hasContent);

  // §4658(d) only applies for DOI 2005–2012. We surface this hint inline so
  // users with a more recent DOI know why the bump/cut won't apply.
  const doiYear = claim.date_of_injury
    ? Number(claim.date_of_injury.slice(0, 4))
    : null;
  const inWindow = doiYear != null && doiYear >= 2005 && doiYear <= 2012;
  const windowHint = inWindow
    ? "DOI is in the LC §4658(d) window — the 15% bump/cut may apply."
    : doiYear != null
      ? `DOI ${doiYear} is outside the LC §4658(d) window (2005–2012). These fields are saved but won't affect the weekly rate.`
      : "Pick a date of injury above to see whether LC §4658(d) applies.";

  return (
    <div className="mt-4 border-t border-border/60 pt-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold text-foreground">
          Compensation details
        </span>
        <span className="text-xs text-muted-foreground">
          (P&S, job offer, large employer — affects LC §4658(d))
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">{windowHint}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 sm:gap-5">
            <div className="lg:col-span-4">
              <Field
                label="P&S date"
                hint="Permanent & Stationary (when condition stabilized)."
              >
                <DateField
                  value={parseIso(claim.p_s_date)}
                  onChange={(d) => onChange({ p_s_date: isoOrNull(d) })}
                  fromYear={1980}
                  toYear={new Date().getFullYear() + 1}
                />
              </Field>
            </div>

            <div className="lg:col-span-4">
              <Field
                label="Job offer date"
                hint="Date the employer offered regular / modified / alternative work, if any."
              >
                <DateField
                  value={parseIso(claim.job_offer_date)}
                  onChange={(d) => onChange({ job_offer_date: isoOrNull(d) })}
                  fromYear={1980}
                  toYear={new Date().getFullYear() + 1}
                />
              </Field>
            </div>

            <div className="lg:col-span-4">
              <Field
                label="Large employer"
                hint="Employer had 50+ employees at DOI."
              >
                <div className="flex items-center gap-3 h-11 px-3 rounded-lg border border-border bg-background">
                  <Switch
                    checked={claim.large_employer}
                    onCheckedChange={(v) =>
                      onChange({ large_employer: Boolean(v) })
                    }
                    aria-label="Large employer (50 or more employees at DOI)"
                  />
                  <span className="text-sm text-muted-foreground">
                    {claim.large_employer ? "Yes (50+)" : "No / unknown"}
                  </span>
                </div>
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CaseInfoSection({
  claim,
  onChange,
}: {
  claim: ClaimDraft;
  onChange: (patch: Partial<ClaimDraft>) => void;
}) {
  const hasContent =
    !!claim.gender ||
    !!claim.case_number ||
    !!claim.evaluator_name ||
    !!claim.comments;
  // Open by default if any optional record-keeping field is already set so
  // saved cases reload with the section expanded; collapsed otherwise to
  // keep the form compact for the common case.
  const [open, setOpen] = React.useState(hasContent);

  return (
    <div className="mt-6 border-t border-border/60 pt-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold text-foreground">
          Case info
        </span>
        <span className="text-xs text-muted-foreground">
          (optional — gender, case number, evaluator, comments)
        </span>
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 sm:gap-5">
          <div className="lg:col-span-4">
            <Field label="Gender">
              <Select
                value={claim.gender ?? ""}
                onValueChange={(v) => onChange({ gender: v || null })}
              >
                <SelectTrigger className="h-11 text-base">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="lg:col-span-4">
            <Field label="Case number">
              <Input
                type="text"
                value={claim.case_number ?? ""}
                onChange={(e) =>
                  onChange({ case_number: e.target.value || null })
                }
                placeholder="ADJ1234567"
                className="h-11 text-base"
              />
            </Field>
          </div>

          <div className="lg:col-span-4">
            <Field label="Evaluator name">
              <Input
                type="text"
                value={claim.evaluator_name ?? ""}
                onChange={(e) =>
                  onChange({ evaluator_name: e.target.value || null })
                }
                placeholder="Dr. Smith, QME"
                className="h-11 text-base"
              />
            </Field>
          </div>

          <div className="lg:col-span-12">
            <Field
              label="Comments"
              hint="Free-form notes attached to the claim. Not used in the rating."
            >
              <Textarea
                value={claim.comments ?? ""}
                onChange={(e) =>
                  onChange({ comments: e.target.value || null })
                }
                placeholder="Add any context for this case…"
                rows={3}
                className="text-base"
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}
