"use client";

import { toast } from "sonner";
import { PricingLanding } from "@/features/pricing/components/PricingLanding";

export function LandingPageClient() {
  return (
    <PricingLanding
      onSelect={(plan) => {
        toast.success(`${plan.name ?? plan.id} selected`, {
          description: "Demo only — would route to checkout in production.",
        });
      }}
    />
  );
}
