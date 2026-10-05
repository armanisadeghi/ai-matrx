"use client";

// features/entitlements/coupons/RedeemCodeField.tsx
//
// "Redeem code" for an existing account — Settings → Plan & usage and /redeem.
// With `autoCode` (a /redeem?code= deep link, or a sign-up coupon link that came
// back as the destination) it redeems that code once on mount; `redeemCoupon`
// guarantees one request per code per page. A success refreshes the usage
// gate's answer so the plan and free_period update everywhere.

import { useEffect, useState } from "react";
import { CheckCircle2, Gift, XCircle } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { refreshUsageInBackground } from "../usage-gate/usageGate";
import { redeemCoupon } from "./redeemCoupon";
import { redeemSuccessLine, type RedeemOutcome } from "./couponCopy";
import { catalogPlanName } from "./planName";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";

export function RedeemCodeField({ autoCode }: { autoCode?: string | null }) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(Boolean(autoCode));
  const [outcome, setOutcome] = useState<RedeemOutcome | null>(null);

  const run = async (value: string) => {
    setPending(true);
    setOutcome(null);
    const result = await redeemCoupon(value);
    const shown = result.ok
      ? { ...result, line: redeemSuccessLine(result.body, await catalogPlanName(result.planKey)) }
      : result;
    setOutcome(shown);
    setPending(false);
    if (result.ok) {
      setCode("");
      // A spent code leaves the address bar, so a reload never reads "already redeemed".
      if (autoCode) {
        const url = new URL(window.location.href);
        url.searchParams.delete("code");
        replaceAddressWithoutNavigating(url.pathname + url.search);
      }
      void refreshUsageInBackground(dispatch, store.getState);
    }
  };

  useEffect(() => {
    if (autoCode) void run(autoCode);
    // Runs for the deep-linked code only; redeemCoupon dedupes repeats.
  }, [autoCode]);

  return (
    <div className="space-y-2" data-testid="redeem-code">
      {!autoCode && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void run(code);
          }}
        >
          <Gift className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="MX-XXXX-XXXX"
            aria-label="Coupon code"
            autoComplete="off"
            className="h-8 max-w-56 text-base sm:text-sm"
          />
          <Button type="submit" size="sm" disabled={pending || !code.trim()}>
            {pending ? "Redeeming…" : "Redeem"}
          </Button>
        </form>
      )}
      {autoCode && pending && (
        <p className="text-sm text-muted-foreground">Redeeming your code…</p>
      )}
      {outcome && (
        <p
          className={
            outcome.ok
              ? "flex items-center gap-1.5 text-sm text-foreground"
              : "flex items-center gap-1.5 text-sm text-destructive"
          }
          role="status"
          data-testid={outcome.ok ? "redeem-success" : "redeem-error"}
        >
          {outcome.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {outcome.line}
        </p>
      )}
    </div>
  );
}
