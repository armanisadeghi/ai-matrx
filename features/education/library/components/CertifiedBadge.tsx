import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "Certified" editorial trust mark. Admin-granted (education.content_
 * certification), rendered across the library + study surfaces. One component
 * everywhere so the signal reads identically. Reuse it wherever a certified
 * resource appears — never re-style a bespoke variant.
 */
export function CertifiedBadge({
  note,
  size = "sm",
  className,
}: {
  note?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      title={note ?? "Editorially verified by AI Matrx"}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      <BadgeCheck className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      Certified
    </span>
  );
}
