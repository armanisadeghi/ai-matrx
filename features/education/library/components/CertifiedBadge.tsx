import { BadgeCheck, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The content trust mark. ONE component everywhere so the signal reads
 * identically — reuse it wherever certified content appears, never re-style a
 * bespoke variant.
 *
 * It renders TWO DISTINCT MARKS, and which one you get is not cosmetic:
 *
 *   humanVerified=true  -> "Certified"       a person put their name on this
 *   humanVerified=false -> "AI-built starter" AI-curated, no human has checked it
 *
 * Until 2026-08-17 there was one mark. All nine certified decks were AI-generated
 * starters whose own database notes said "pending human expert verification", and
 * this badge rendered them "Certified" with a check mark and the tooltip
 * "Editorially verified by AI Matrx". That is the exact claim our market position
 * rests on not making: in a category defined by incumbent trust collapse, an
 * unverified editorial trust mark is the most self-defeating thing we can ship.
 *
 * The state is structural (`education.content_certification.human_verified_at`,
 * set only by `edu_verify_content`), so the mark stays true as content scales —
 * never re-derive "certified" from anything else, and never default
 * `humanVerified` to true.
 */
export function CertifiedBadge({
  humanVerified = false,
  note,
  size = "sm",
  className,
}: {
  /** A human expert has signed off. Defaults to false — the honest default. */
  humanVerified?: boolean;
  note?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = humanVerified ? BadgeCheck : BrainCircuit;
  const label = humanVerified ? "Certified" : "AI-built starter";
  const title =
    note ??
    (humanVerified
      ? "Reviewed and verified by a human expert at AI Matrx."
      : "Built by AI and curated by AI Matrx. A human expert has not verified it yet.");

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        humanVerified
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-border bg-muted text-muted-foreground",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {label}
    </span>
  );
}
