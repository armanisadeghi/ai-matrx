import "server-only";

// features/entitlements/coupons/couponPreview.ts
//
// What a new-account link token grants, for the sign-up page's offer banner and
// prefill — `billing.coupon_preview`, the anonymous-safe door (only a 192-bit
// link token opens it, never a human code). Never fatal: sign-up works with no
// banner.

import { createClient } from "@/utils/supabase/server";
import { parseCouponPreview, type CouponPreview } from "./couponCopy";

export async function lookupCouponPreview(
  token: string | null,
): Promise<CouponPreview | null> {
  if (!token) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema("billing")
      .rpc("coupon_preview", { p_token: token });
    if (error) {
      console.warn("[coupons] coupon_preview failed; sign-up renders without the offer:", error.message);
      return null;
    }
    return parseCouponPreview(data);
  } catch (e) {
    console.warn("[coupons] coupon_preview threw; sign-up renders without the offer:", e instanceof Error ? e.message : e);
    return null;
  }
}
