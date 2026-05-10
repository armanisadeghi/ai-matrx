"use client";

import * as React from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Field, NumberField } from "../FormField";
import { DateField } from "./DateField";
import { OccupationCombobox } from "./OccupationCombobox";
import { WeeklyEarningsField } from "./WeeklyEarningsField";
import type { ClaimDraft } from "../../state/types";

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

export function ClaimHeader({ claim, onChange, className }: ClaimHeaderProps) {
  const ageString = claim.age_at_doi == null ? "" : String(claim.age_at_doi);

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm",
        className,
      )}
    >
      <header className="flex items-start gap-3 mb-6">
        <div className="rounded-lg bg-primary/10 p-2 ring-1 ring-primary/15">
          <User className="h-5 w-5 text-primary" />
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
            hint="Optional — overrides the age computed from DOB and DOI."
          >
            <NumberField
              value={ageString}
              onChange={(raw) => {
                if (raw === "") {
                  onChange({ age_at_doi: null });
                  return;
                }
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
    </section>
  );
}
