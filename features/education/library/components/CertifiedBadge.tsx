import { BadgeCheck } from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { Chip } from "@ai-matrx/design-system/controls";

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
  className,
}: {
  /** A human expert has signed off. Defaults to false — the honest default. */
  humanVerified?: boolean;
  note?: string | null;
  className?: string;
}) {
  const Icon = humanVerified ? BadgeCheck : AGENT_ICON;
  const label = humanVerified ? "Certified" : "AI-built starter";
  const title =
    note ??
    (humanVerified
      ? "Reviewed and verified by a human expert at AI Matrx."
      : "Built by AI and curated by AI Matrx. A human expert has not verified it yet.");

  return (
    <Chip
      tone={humanVerified ? "success" : "neutral"}
      icon={<Icon />}
      label={label}
      title={title}
      className={className}
    />
  );
}
