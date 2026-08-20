// Server component. Funnel marker — Free / Free trial / Pro.
// DISPLAY ONLY. Entitlement is not enforced here; see the billing requirements
// doc. Lucide icons only (no emoji — enterprise UI rule).
import { cn } from "@/lib/utils";
import { ACCESS_TIER_META } from "../../constants";
import type { AccessTier } from "../../types";

const TONE: Record<"free" | "trial" | "premium", string> = {
  free: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  trial: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  premium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
};

export function AccessTierBadge({
  tier,
  className,
}: {
  tier: AccessTier;
  className?: string;
}) {
  const meta = ACCESS_TIER_META[tier];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONE[meta.tone],
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}
