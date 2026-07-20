"use client";

import { toast } from "@/lib/toast";
import { IndustryUpgrade } from "@/features/pricing/components/industry/IndustryUpgrade";
import type { IndustryId } from "@/features/pricing/components/industry/industries";

export function IndustryPageClient({ industry }: { industry: IndustryId }) {
  return (
    <IndustryUpgrade
      industry={industry}
      onSelect={(plan) => {
        toast.success(`${plan.name ?? plan.id} selected`, {
          description: "Demo only — would route to checkout in production.",
        });
      }}
    />
  );
}
