// features/entitlements/coupons/CouponOfferBanner.tsx
//
// Sign-up's one-line offer for a new-account coupon link: what it grants, or —
// for an unusable link — one line saying so while sign-up carries on normally.
// Server component; the data comes from `lookupCouponPreview`.

import { Gift } from "lucide-react";
import { invalidLinkLine, planLabel, type CouponPreview } from "./couponCopy";

export function CouponOfferBanner({ preview }: { preview: CouponPreview | null }) {
  if (!preview) return null;
  if (!preview.valid) {
    return (
      <p
        className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
        data-testid="coupon-offer-invalid"
      >
        {invalidLinkLine(preview.reason)}
      </p>
    );
  }
  const months = preview.months ?? 0;
  return (
    <div
      className="mb-4 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
      data-testid="coupon-offer"
    >
      <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {months} month{months === 1 ? "" : "s"} of {planLabel(preview.planName, preview.planKey)} free
        </p>
        {preview.recipientPhone && !preview.recipientEmail && (
          <p className="truncate text-xs text-muted-foreground">
            Sent to {preview.recipientPhone}
          </p>
        )}
      </div>
    </div>
  );
}
