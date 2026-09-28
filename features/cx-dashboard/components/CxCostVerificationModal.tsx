"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { formatCost } from "../utils/format";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import type { CxCostVerification } from "../types/cxDashboardTypes";

type Props = {
  verification: CxCostVerification;
  children: React.ReactNode;
};

export function CxCostVerificationModal({ verification, children }: Props) {
  const { unit } = useCostDisplay();
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Info className="w-4 h-4" />
            Cost Verification
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <span className="text-muted-foreground">
              User Request total_cost
            </span>
            <span className="font-mono text-right">
              {formatCost(verification.user_request_total_cost, unit)}
            </span>

            <span className="text-muted-foreground">
              Sum of cx_request costs
            </span>
            <span className="font-mono text-right">
              {formatCost(verification.sum_of_request_costs, unit)}
            </span>

            <span className="text-muted-foreground">
              Sum of tool_call costs
            </span>
            <span className="font-mono text-right">
              {formatCost(verification.sum_of_tool_call_costs, unit)}
            </span>

            <span className="text-muted-foreground font-medium">
              Combined total
            </span>
            <span className="font-mono text-right font-medium">
              {formatCost(verification.combined_total, unit)}
            </span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded border">
            {verification.has_discrepancy ? (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-amber-500">
                    Discrepancy detected
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Difference: {formatCost(verification.discrepancy, unit)}
                  </p>
                </div>
                <Badge variant="secondary" className="ml-auto text-xs">
                  Mismatch
                </Badge>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <p className="text-xs text-emerald-500">
                  Costs verified — no discrepancy
                </p>
                <Badge variant="default" className="ml-auto text-xs">
                  OK
                </Badge>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
