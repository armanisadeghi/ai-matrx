"use client";

import { toast } from "@/lib/toast";
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
