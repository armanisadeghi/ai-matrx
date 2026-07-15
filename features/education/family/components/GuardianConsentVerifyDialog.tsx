// features/education/family/components/GuardianConsentVerifyDialog.tsx
//
// The GUARDIAN's verifiable-parental-consent surface (COPPA §312.5). Shown to a
// parent for a linked under-13 child whose consent is not yet VERIFIED. The parent
// picks a verification method:
//   (a) Card  — a $0.50 authorization we void immediately (self-serve, live).
//   (b) Signed form — an e-signed consent form (admin-reviewed) — scaffolded.
//   (c) Government ID / knowledge-based (vendor) — stub pending Arman's vendor pick.
// Verification is ALWAYS confirmed server-side (the Stripe webhook / admin review),
// never by this dialog — the child can never self-verify.

"use client";

import { useState } from "react";
import { CreditCard, FileSignature, BadgeCheck, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { consentVerificationService } from "@/features/education/compliance/consent/consentVerificationService";

export function GuardianConsentVerifyDialog({
  open,
  onOpenChange,
  studentUserId,
  studentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentUserId: string;
  studentName: string;
}) {
  const [busy, setBusy] = useState(false);

  const startCard = async () => {
    setBusy(true);
    const res = await consentVerificationService.startCardVerification(studentUserId);
    if (res.error || !res.url) {
      setBusy(false);
      toast.error(res.error ?? "Could not start verification");
      return;
    }
    // Hand off to Stripe's hosted card page. The webhook confirms verification.
    window.location.assign(res.url);
  };

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <DialogTitle>Verify parental consent</DialogTitle>
          </div>
          <DialogDescription className="text-left">
            Because <strong>{studentName}</strong> is under 13, children&apos;s
            privacy law (COPPA) requires you to <strong>verify</strong> you are the
            parent or guardian before their account can use AI features. Choose a
            method below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2.5 pt-1">
          <MethodCard
            icon={CreditCard}
            title="Verify with a card"
            recommended
            description="A $0.50 authorization that we void immediately — you are not charged. The classic, fastest way to confirm you're an adult cardholder."
            action={busy ? "Redirecting…" : "Verify with card"}
            busy={busy}
            onClick={startCard}
          />
          <MethodCard
            icon={FileSignature}
            title="Signed consent form"
            description="Download, sign, and upload a parental-consent form. Our team reviews and approves it (usually within a business day)."
            action="Request the form"
            onClick={() =>
              toast.info(
                "Signed-form verification is being finalized. For now, the card method above is instant. We'll email you the form option shortly.",
              )
            }
          />
          <MethodCard
            icon={BadgeCheck}
            title="Government ID / identity check"
            description="Verify through a trusted identity provider. Coming soon."
            disabled
          />
        </div>

        <p className="pt-1 text-xs text-muted-foreground">
          Verification is confirmed securely on our servers — not from this page.
          You can revoke consent anytime, which immediately re-blocks the account.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function MethodCard({
  icon: Icon,
  title,
  description,
  action,
  recommended,
  disabled,
  busy,
  onClick,
}: {
  icon: typeof CreditCard;
  title: string;
  description: string;
  action?: string;
  recommended?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-muted/40 opacity-70"
          : "border-border bg-background hover:border-primary/50 hover:bg-accent/40",
        recommended && "border-primary/40 ring-1 ring-primary/20",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          recommended ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {recommended && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              Recommended
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        {action && !disabled && (
          <span className="mt-1.5 block text-xs font-medium text-primary">{action} →</span>
        )}
      </span>
    </button>
  );
}
