"use client";

import * as React from "react";
import { TrendingUp, DollarSign, Percent, CalendarRange } from "lucide-react";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { createLegalCaWcScope } from "@/features/surfaces/manifests/legal-ca-wc.manifest";
import { legalCaWcManifest } from "@/features/surfaces/manifests/legal-ca-wc.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import type { SourceFeature } from "@/types/python-generated/source-attribution";
import { CalculatorShell } from "./CalculatorShell";
import { ResultDisplay } from "./ResultDisplay";
import { EmptyResult } from "./EmptyResult";
import {
  Field,
  normalizeNativeNumberInputValue,
  NumberField,
} from "./FormField";
import { formatCurrency, formatNumber, presentValue } from "../lib/formulas";

const LEGAL_SOURCE_FEATURE: SourceFeature = "legal";
const LABELS = surfaceValueLabels(legalCaWcManifest);

export function PresentValueCalculator() {
  const [weeklyPayment, setWeeklyPayment] = React.useState<string>("500");
  const [numWeeks, setNumWeeks] = React.useState<string>("100");
  const [interestRate, setInterestRate] = React.useState<string>("2");

  const pmt = Number(weeklyPayment) || 0;
  const n = Number(numWeeks) || 0;
  const r = Number(interestRate) || 0;
  const hasInputs = pmt > 0 && n > 0;

  const pv = hasInputs ? presentValue(pmt, n, r) : 0;
  const undiscounted = pmt * n;
  const discount = undiscounted - pv;

  const getSurfaceScope = () =>
    createLegalCaWcScope({
      calculator_id: "present-value",
      selection: window.getSelection()?.toString() ?? "",
      weekly_payment: pmt,
      number_of_weeks: n,
      annual_interest_rate: r,
      present_value: hasInputs ? pv : undefined,
      total_payments: hasInputs ? undiscounted : undefined,
      discount_amount: hasInputs ? discount : undefined,
      discount_percent:
        hasInputs && undiscounted > 0
          ? (discount / undiscounted) * 100
          : undefined,
      utility_calculation_ready: hasInputs,
    });

  const editableNumberField = (
    value: string,
    onChange: (next: string) => void,
    props: Omit<React.ComponentProps<typeof NumberField>, "value" | "onChange">,
  ) => (
    <EditableContextMenu
      sourceFeature={LEGAL_SOURCE_FEATURE}
      surfaceName="matrx-user/legal-ca-wc"
      menuVersion={2}
      getApplicationScope={getSurfaceScope}
      onTextReplace={(next) => onChange(normalizeNativeNumberInputValue(next))}
    >
      <NumberField {...props} value={value} onChange={onChange} />
    </EditableContextMenu>
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/legal-ca-wc"
      getScope={getSurfaceScope}
    >
      <CalculatorShell
        icon={TrendingUp}
        title="Present Value"
        description="The lump-sum value today of a stream of future weekly payments, discounted at a given annual rate."
        inputs={
          <div className="space-y-5">
            <div data-surface-value="weekly_payment">
              <Field label={LABELS.weekly_payment}>
                {editableNumberField(weeklyPayment, setWeeklyPayment, {
                  prefix: <DollarSign className="h-4 w-4" />,
                  placeholder: "500.00",
                  min: 0,
                  step: 0.01,
                })}
              </Field>
            </div>

            <div data-surface-value="number_of_weeks">
              <Field label={LABELS.number_of_weeks}>
                {editableNumberField(numWeeks, setNumWeeks, {
                  prefix: <CalendarRange className="h-4 w-4" />,
                  placeholder: "100",
                  min: 0,
                  step: 1,
                  inputMode: "numeric",
                })}
              </Field>
            </div>

            <div data-surface-value="annual_interest_rate">
              <Field
                label={LABELS.annual_interest_rate}
                hint="Used to discount future payments to today's value."
              >
                {editableNumberField(interestRate, setInterestRate, {
                  suffix: <Percent className="h-4 w-4" />,
                  placeholder: "2",
                  min: 0,
                  max: 50,
                  step: 0.1,
                })}
              </Field>
            </div>
          </div>
        }
        result={
          <NonEditableContextMenu
            sourceFeature={LEGAL_SOURCE_FEATURE}
            surfaceName="matrx-user/legal-ca-wc"
            menuVersion={2}
            getApplicationScope={getSurfaceScope}
          >
            <div data-surface-value="present_value">
              {hasInputs ? (
                <ResultDisplay
                  label={LABELS.present_value}
                  value={formatCurrency(pv)}
                  caption={`Discounted at ${formatNumber(r, 2)}% annual interest`}
                  stats={[
                    {
                      label: LABELS.total_payments,
                      value: formatCurrency(undiscounted),
                    },
                    {
                      label: LABELS.discount_amount,
                      value: formatCurrency(discount),
                    },
                    {
                      label: LABELS.discount_percent,
                      value:
                        undiscounted > 0
                          ? `${formatNumber((discount / undiscounted) * 100, 2)}%`
                          : "—",
                    },
                  ]}
                />
              ) : (
                <EmptyResult />
              )}
            </div>
          </NonEditableContextMenu>
        }
      />
    </SurfaceRuntimeProvider>
  );
}
