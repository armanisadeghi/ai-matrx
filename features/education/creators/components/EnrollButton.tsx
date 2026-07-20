"use client";

// Enroll / join CTA for a featured class on a public creator page.
//   • anonymous visitor  -> /sign-up?redirectTo=/c/<handle> (the acquisition loop)
//   • signed-in + open    -> edu_class_join (immediate)
//   • signed-in + closed  -> edu_class_join (request → owner approves)
//   • signed-in + paid    -> Stripe Checkout (Connect destination charge); the
//                            webhook confers enrolment. This island NEVER grants
//                            paid access (webhook-only paid gate).
// `price` arrives in DOLLARS, resolved LIVE from the class scope settings by
// creator_public_page (single source — matches what the owner set in the class form).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, CreditCard, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { startClassCheckout } from "@/features/education/classes/service";
import type { ClassAccessMode } from "../types";

interface EnrollButtonProps {
  classId: string;
  title: string;
  accessMode: ClassAccessMode;
  price?: number | null;
  /** Handle of the page — used for the signed-out redirect + checkout return target. */
  handle: string;
}

function priceLabel(price?: number | null): string {
  if (typeof price !== "number") return "Enroll";
  const whole = Number.isInteger(price);
  return `Enroll — ${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
  }).format(price)}`;
}

export function EnrollButton({ classId, title, accessMode, price, handle }: EnrollButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const paid = accessMode === "paid";
  const label = paid
    ? priceLabel(price)
    : accessMode === "closed"
      ? "Request to join"
      : "Join class — free";

  async function onClick() {
    setBusy(true);
    try {
      const sb = createClient();
      const { data: userRes } = await sb.auth.getUser();
      if (!userRes.user) {
        // Acquisition loop: send the visitor to sign up, return here after.
        startTransition(() =>
          router.push(`/sign-up?redirectTo=${encodeURIComponent(`/c/${handle}`)}`),
        );
        return;
      }

      // Paid → Stripe Checkout (the webhook confers access on payment).
      if (paid) {
        const r = await startClassCheckout(classId, `/c/${handle}`);
        if (r.alreadyEnrolled) {
          toast.success(`You already have access to "${title}"`);
          return;
        }
        if (r.url) {
          window.location.assign(r.url);
          return;
        }
        toast.error(r.creatorNotReady ? "Enrollment isn't open yet" : "Could not start checkout", {
          description: r.error,
        });
        return;
      }

      // Open / closed → the class-join contract.
      const { data, error } = await sb.rpc("edu_class_join", { p_class: classId });
      if (error) throw error;
      const outcome = (data as { status?: string } | null)?.status;
      if (outcome === "needs_request" || outcome === "pending") {
        toast.success("Request sent", { description: "The teacher will approve your request." });
      } else if (outcome === "already_member") {
        toast.success(`You're already in "${title}"`);
      } else {
        toast.success(`You're enrolled in "${title}"`);
      }
    } catch (e) {
      toast.error("Could not enroll", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={busy || pending} className="w-full sm:w-auto">
      {busy || pending ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : paid ? (
        <CreditCard className="mr-1.5 h-4 w-4" />
      ) : (
        <GraduationCap className="mr-1.5 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
