"use client";

import * as React from "react";
import { DollarSign, Calculator, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Field, NumberField } from "../FormField";
import { WEEKLY_EARNINGS_MAX } from "../../api/types";
import { formatCurrency } from "../../lib/formulas";

interface WeeklyEarningsFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function WeeklyEarningsField({ value, onChange }: WeeklyEarningsFieldProps) {
  const stringValue = value == null ? "" : String(value);
  const isClamped = value != null && value >= WEEKLY_EARNINGS_MAX;

  return (
    <Field
      required
      label={
        <span className="flex items-center gap-1.5">
          Weekly earnings
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground">
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">
                California's PD rating engine caps weekly earnings at{" "}
                {formatCurrency(WEEKLY_EARNINGS_MAX)} for ratings under the legacy
                schedule. Higher values are accepted but clamped server-side.
              </p>
            </TooltipContent>
          </Tooltip>
        </span>
      }
      hint={
        isClamped
          ? `Clamped to ${formatCurrency(WEEKLY_EARNINGS_MAX)} for the rating calculation.`
          : "Average weekly compensation for the rating engine."
      }
      trailing={<AwcHelper onApply={(awc) => onChange(awc)} />}
    >
      <NumberField
        value={stringValue}
        onChange={(raw) => {
          if (raw === "") {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          if (Number.isNaN(parsed)) return;
          onChange(parsed);
        }}
        prefix={<DollarSign className="h-4 w-4" />}
        placeholder="290.00"
        min={0}
        step={0.01}
      />
    </Field>
  );
}

function AwcHelper({ onApply }: { onApply: (weeklyEarnings: number) => void }) {
  const [open, setOpen] = React.useState(false);
  const [weeks, setWeeks] = React.useState("52");
  const [earned, setEarned] = React.useState("");

  const weeksNum = Number(weeks) || 0;
  const earnedNum = Number(earned) || 0;
  const valid = weeksNum > 0 && earnedNum > 0;
  const awc = valid ? earnedNum / weeksNum : 0;
  const rate = awc * (2 / 3);

  const apply = () => {
    if (!valid) return;
    onApply(Number(awc.toFixed(2)));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Calculator className="h-3 w-3" />
          Calculate from gross
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-4"
        align="end"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Average Weekly Compensation
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Compute weekly earnings from gross pay over a period.
            </p>
          </div>

          <Field label="Weeks worked">
            <NumberField
              value={weeks}
              onChange={setWeeks}
              placeholder="52"
              min={1}
              max={104}
              step={1}
              inputMode="numeric"
            />
          </Field>

          <Field label="Total amount earned">
            <NumberField
              value={earned}
              onChange={setEarned}
              prefix={<DollarSign className="h-4 w-4" />}
              placeholder="60,000.00"
              min={0}
              step={0.01}
            />
          </Field>

          <div
            className={cn(
              "rounded-lg border border-border bg-muted/30 p-3 grid grid-cols-2 gap-3",
              !valid && "opacity-60",
            )}
          >
            <Stat label="AWC" value={valid ? formatCurrency(awc) : "—"} />
            <Stat
              label="2/3 rate"
              value={valid ? formatCurrency(rate) : "—"}
              emphasized
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={apply}
              disabled={!valid}
            >
              Apply AWC
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Stat({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono tabular-nums font-semibold",
          emphasized ? "text-base text-primary" : "text-sm text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
