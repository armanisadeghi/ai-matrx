"use client";

/**
 * PrinterCertificationNotice — the in-place, honest half of
 * `useFailedPrinterGate`: which printer am I printing on, what does this
 * organization already know about it on THIS label stock, and what happens
 * next.
 *
 * It never disables the host's print button (a dead-looking control is a lie):
 * under `block` the host refuses the click and this banner says why, naming
 * the setting in plain words and where an admin turns it.
 */

import Link from "next/link";
import { AlertTriangle, Ban, Info, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  UNCERTIFIED_PRINTER,
  failedChecks,
  printerLabel,
  type FailedPrinterGate,
} from "../useFailedPrinterGate";
import { formatCertificationStatus } from "../types";

const CONFIG_PATH = "settings/configuration";

function ConfigLink({ organizationId }: { organizationId: string | null }) {
  if (!organizationId) {
    return <span>Organization settings → Configuration</span>;
  }
  return (
    <Link
      href={`/organizations/${organizationId}/${CONFIG_PATH}`}
      className="font-medium underline underline-offset-2"
    >
      Organization settings → Configuration
    </Link>
  );
}

export function PrinterCertificationNotice({
  gate,
  organizationId,
  stockName,
  className,
}: {
  gate: FailedPrinterGate;
  organizationId: string | null;
  /** The label stock in hand, in the words on the rest of the screen. */
  stockName: string;
  /** Host chrome (this component carries none) — applied only when it renders. */
  className?: string;
}) {
  const hasRegister = gate.printers.length > 0;
  if (
    !hasRegister &&
    !gate.listError &&
    !gate.knobProblem &&
    gate.ready
  ) {
    return null;
  }

  const selected = gate.selected;
  const checks = selected ? failedChecks(selected) : [];

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      {hasRegister && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Printing on
          </p>
          <Select value={gate.selectedId} onValueChange={gate.select}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {gate.printers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {printerLabel(p)} — {formatCertificationStatus(p.status)} on{" "}
                  {stockName}
                </SelectItem>
              ))}
              <SelectItem value={UNCERTIFIED_PRINTER}>
                A printer we have not certified
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!gate.ready && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking this printer against {stockName}…
        </p>
      )}

      {gate.listError && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not check printer certifications</AlertTitle>
          <AlertDescription>
            {gate.listError}. Printing is still available — nothing is blocked
            — but this organization&apos;s record of which printers work with{" "}
            {stockName} could not be read. Reload the page to try again.
          </AlertDescription>
        </Alert>
      )}

      {selected && gate.selectedFailed && (
        <Alert variant={gate.blocked ? "destructive" : "warning"}>
          {gate.blocked ? (
            <Ban className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <AlertTitle>
            {printerLabel(selected)} failed certification on {stockName}
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-col gap-1.5">
              <p>
                Someone here printed the calibration page on{" "}
                {printerLabel(selected)} with {stockName} and answered No to{" "}
                {checks.length > 0
                  ? "these checks:"
                  : "at least one of the physical checks."}
              </p>
              {checks.length > 0 && (
                <ul className="list-disc pl-5">
                  {checks.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              )}
              {gate.blocked ? (
                <p>
                  Printing is refused because this organization set failed
                  printers to <strong>Block printing</strong>. An admin can
                  change that to &ldquo;Warn and print anyway&rdquo; in{" "}
                  <ConfigLink organizationId={organizationId} />, or re-certify
                  this printer at{" "}
                  <Link
                    href="/commerce/labels/printers"
                    className="font-medium underline underline-offset-2"
                  >
                    certified printers
                  </Link>
                  .
                </p>
              ) : (
                <p>
                  You can print anyway — labels from this printer will probably
                  be misaligned or scaled, and misprinted label stock is wasted.
                  Re-certify it at{" "}
                  <Link
                    href="/commerce/labels/printers"
                    className="font-medium underline underline-offset-2"
                  >
                    certified printers
                  </Link>{" "}
                  once the print settings are fixed.
                </p>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!gate.selectedFailed && gate.otherFailed.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Known to fail on {stockName}:{" "}
            {gate.otherFailed.map(printerLabel).join(", ")}. Pick the printer
            you are actually using above if it is one of these.
          </span>
        </p>
      )}

      {gate.knobProblem && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed-printer setting could not be read</AlertTitle>
          <AlertDescription>{gate.knobProblem}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
