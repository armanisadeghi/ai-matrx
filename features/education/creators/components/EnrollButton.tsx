"use client";

// Enroll / join CTA for a featured class. CONSUMES the documented class-model
// contract (CONVERGENCE_C_CREATORS.md §Fleet contracts):
//   edu_class_join(class, access_mode) -> immediate | pending | needs_purchase
// The class-model build owns that RPC (features/education/classes) and, per its
// FEATURE.md, the join family is NOT landed yet (roster/join = Convergence C).
// So this is wired against the contract SHAPE and degrades gracefully:
//   • anonymous visitor  -> /sign-up?redirectTo=/c/<handle> (the acquisition loop)
//   • signed-in + RPC live -> call it, route by outcome
//   • signed-in + RPC absent -> honest "opens soon" toast (no fake success)
// When edu_class_join lands, this island already calls it — no rewire needed.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import type { ClassAccessMode } from "../types";

interface EnrollButtonProps {
  classId: string;
  title: string;
  accessMode: ClassAccessMode;
  price?: number | null;
  /** Handle of the page — used for the signed-out redirect target. */
  handle: string;
}

/** True when the RPC simply isn't deployed yet (contract not landed). */
function isMissingRpc(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("could not find") ||
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("function public.edu_class_join")
  );
}

export function EnrollButton({ classId, title, accessMode, price, handle }: EnrollButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const paid = accessMode === "paid";
  const label = paid
    ? typeof price === "number"
      ? `Enroll — $${price}`
      : "Enroll"
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

      // Signed-in: call the documented contract.
      const { data, error } = await sb.rpc("edu_class_join", {
        p_class_id: classId,
        p_access_mode: accessMode,
      } as never);

      if (error) {
        if (isMissingRpc(error.message)) {
          toast.info("Enrollment opens soon", {
            description: `"${title}" isn't accepting enrollments just yet. We'll email you when it's live.`,
          });
          return;
        }
        throw error;
      }

      const outcome = (data as { outcome?: string } | null)?.outcome;
      if (outcome === "needs_purchase") {
        toast.info("Payment required", { description: "Checkout opens soon for this class." });
      } else if (outcome === "pending") {
        toast.success("Request sent", { description: "The teacher will approve your request." });
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
        <Lock className="mr-1.5 h-4 w-4" />
      ) : (
        <GraduationCap className="mr-1.5 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
