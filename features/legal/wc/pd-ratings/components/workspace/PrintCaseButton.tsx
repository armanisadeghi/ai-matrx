"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  StatelessRatingResponse,
  WcImpairmentDefinitionRead,
} from "../../api/types";
import type { RatingDraft } from "../../state/types";

interface PrintCaseButtonProps {
  draft: RatingDraft;
  result: StatelessRatingResponse | null;
  impairmentCatalog: Record<string, WcImpairmentDefinitionRead> | null;
  occupationLabel: string | null;
  disabled?: boolean;
}

/**
 * Print entry point. Renders a slim header button; the actual printer code
 * (HTML template assembly, styles, occupation lookups) and the print options
 * dialog only ship after the user clicks Print. Uses `next/dynamic` with
 * `ssr: false` so the heavy print module never lands in the initial bundle.
 */
const PrintCaseDialog = dynamic(() => import("../../print/PrintCaseDialog"), {
  ssr: false,
});

export function PrintCaseButton({
  draft,
  result,
  impairmentCatalog,
  occupationLabel,
  disabled,
}: PrintCaseButtonProps) {
  const [open, setOpen] = React.useState(false);

  const printData = React.useMemo(
    () => ({ draft, result, impairmentCatalog, occupationLabel }),
    [draft, result, impairmentCatalog, occupationLabel],
  );

  const button = (
    <Button
      icon={<Printer />}
      type="button"
      variant="quiet"
      onClick={() => setOpen(true)}
      disabled={disabled}
      aria-label="Print PD report"
    >
      <span className="hidden sm:inline">Print</span>
    </Button>
  );

  return (
    <>
      {disabled ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={-1}>{button}</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Finish the claim and add an injury to enable printing.
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="bottom">Print or save as PDF</TooltipContent>
        </Tooltip>
      )}

      {open && (
        <PrintCaseDialog open={open} onOpenChange={setOpen} data={printData} />
      )}
    </>
  );
}
