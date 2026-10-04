// app/(core)/redeem/page.tsx — redeem a free-time coupon (rule 18).
//
// `/redeem?code=<code or link token>` is THE address a coupon resolves to: an
// existing account's deep link, and the destination a new-account sign-up link
// (`/sign-up?coupon=`) carries through email confirmation and OAuth
// (utils/auth/coupon-links.ts). A guest is bounced to login by the proxy with
// this address kept as the destination. With no code it is the entry field.

import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import Link from "next/link";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { REDEEM_CODE_PARAM } from "@/utils/auth/coupon-links";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { RedeemCodeField } from "@/features/entitlements/coupons/RedeemCodeField";

interface RedeemPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RedeemPage({ searchParams }: RedeemPageProps) {
  const params = await searchParams;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    redirect(await currentRequestLoginHref("/redeem"));
  }
  const raw = params[REDEEM_CODE_PARAM];
  const code = (Array.isArray(raw) ? raw[0] : raw)?.trim() || null;

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Gift className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-medium">Redeem code</span>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-lg space-y-4 p-4 pt-[var(--shell-header-h)] sm:p-6 sm:pt-[var(--shell-header-h)]">
          <h1 className="text-lg font-semibold">Redeem a free-time code</h1>
          <div className="rounded-lg border border-border bg-card p-4">
            <RedeemCodeField autoCode={code} />
          </div>
          <div className="flex gap-3 text-sm">
            <Link className="text-primary hover:underline" href="/settings?tab=plan">
              Plan & usage
            </Link>
            <Link className="text-primary hover:underline" href="/dashboard">
              Continue
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
