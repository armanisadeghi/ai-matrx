"use client";

import * as React from "react";
import { HeartPulse } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalculatorShell } from "./CalculatorShell";
import { ResultDisplay } from "./ResultDisplay";
import { EmptyResult } from "./EmptyResult";
import { Field } from "./FormField";
import {
  birthYearOptions,
  currentAge,
  totalLifeExpectancy,
  yearsRemaining,
} from "../lib/life-expectancy";
import { formatNumber } from "../lib/formulas";

const YEAR_OPTIONS = birthYearOptions();

export function LifeExpectancyCalculator() {
  const [birthYear, setBirthYear] = React.useState<string>("");

  const yearNum = Number(birthYear);
  const hasInput = birthYear !== "" && !Number.isNaN(yearNum);

  const remaining = hasInput ? yearsRemaining(yearNum) : 0;
  const total = hasInput ? totalLifeExpectancy(yearNum) : 0;
  const age = hasInput ? currentAge(yearNum) : 0;

  return (
    <CalculatorShell
      icon={HeartPulse}
      title="Life Expectancy"
      description="Estimated remaining years based on year of birth, drawn from standard mortality tables."
      inputs={
        <div className="space-y-5">
          <Field
            label="Year of birth"
            hint="Estimates use a standard period life table for illustration."
          >
            <Select value={birthYear} onValueChange={setBirthYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select year…" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {YEAR_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-base"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="rounded-lg bg-muted/40 border border-border/60 p-3.5">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Note:</span> Life
              expectancy is used in PD calculations to project the duration of
              future benefit streams. This calculator uses an illustrative
              table — your jurisdiction may require a specific source.
            </p>
          </div>
        </div>
      }
      result={
        hasInput ? (
          <ResultDisplay
            label="Years remaining"
            value={`${formatNumber(remaining, 1)} yrs`}
            caption={`Born ${birthYear} · Currently ${age} years old`}
            stats={[
              {
                label: "Total life expectancy",
                value: `${formatNumber(total, 1)} yrs`,
              },
              {
                label: "Current age",
                value: `${age}`,
              },
              {
                label: "Weeks remaining",
                value: formatNumber(remaining * 52, 0),
              },
            ]}
          />
        ) : (
          <EmptyResult message="Select a year of birth" />
        )
      }
    />
  );
}
