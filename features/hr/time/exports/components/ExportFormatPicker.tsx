"use client";

/**
 * features/hr/time/exports/components/ExportFormatPicker.tsx — SPEC-CONTRACTS §4.3 / SPEC-TIME §7.2.
 *
 * 🚨 THE FORMAT LIST COMES FROM `GET /hr/exports/formats` AND IS NEVER HARD-CODED. A client-side
 * list goes stale the moment a mapper ships or a QuickBooks column spec is finally derived, and the
 * staleness is invisible until somebody generates a file that will not import.
 *
 * 🚨 A FORMAT WE CANNOT HONOUR RENDERS AS **VISIBLY UNAVAILABLE WITH THE REASON**, never as a
 * choice that fails at generation and never silently hidden. An org that asked for QuickBooks needs
 * to see that we know it is missing and why — a format absent from the list is indistinguishable
 * from one we never supported.
 *
 * 🚨 THE DEFAULT IS `generic_csv`, NOT QUICKBOOKS (R-L3 U-11). The QBO column list is not published
 * by Intuit and is an open item; defaulting to it would default every org to a file that cannot be
 * built. `generic_csv` is the always-available floor and every other format is a projection of it.
 *
 * `requires_mapping` is shown BEFORE the preview, because `POST /hr/exports/payroll` answers
 * `400 hr_validation_error` with `details.unmapped[]` rather than emitting a file with blanks in the
 * identifier column — **a payroll file with a missing employee id is worse than no file**: it fails
 * silently downstream, in someone else's system, after money moved.
 */

import { Ban, Check, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ExportFormat, ExportFormatKey } from "@/features/hr/exports/types";
import { partitionFormats } from "../exportPresentation";

export interface ExportFormatPickerProps {
  formats: ExportFormat[];
  selectedKey: ExportFormatKey | null;
  onSelect: (key: ExportFormatKey) => void;
  disabled?: boolean;
}

export function ExportFormatPicker({
  formats,
  selectedKey,
  onSelect,
  disabled,
}: ExportFormatPickerProps) {
  const { available, unavailable } = partitionFormats(formats);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Payroll file format
        </p>
        {available.length === 0 ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-foreground">
            No format is available for this organization yet. Nothing can be generated until one is
            — which is the honest state, not an error.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5" role="radiogroup" aria-label="Payroll file format">
            {available.map((format) => {
              const selected = format.key === selectedKey;
              return (
                <li key={format.key}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => onSelect(format.key)}
                    className={cn(
                      "flex w-full min-h-[44px] items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-accent",
                      disabled && "opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {selected ? <Check className="h-3 w-3" aria-hidden /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-foreground">
                        {format.label}
                      </span>
                      {format.notes ? (
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                          {format.notes}
                        </span>
                      ) : null}
                      {format.requires_mapping.length > 0 ? (
                        <span className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          <span>
                            Needs {format.requires_mapping.join(", ")} mapped for every person
                            included. Anyone missing one blocks the file before it is built.
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {unavailable.length > 0 ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Not available yet
          </p>
          <ul className="mt-2 space-y-1.5">
            {unavailable.map(({ format, reason }) => (
              <li
                key={format.key}
                // Visibly unavailable, with the reason. Never a choice that fails at generation.
                className="flex items-start gap-2.5 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2"
              >
                <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-muted-foreground">
                    {format.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {reason}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
