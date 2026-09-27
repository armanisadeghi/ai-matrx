/**
 * SkillOriginBadges — the ONE place a skill's origin and runnability are shown.
 *
 * Used by the library list (`SkillsBrowser`), the agent skill picker
 * (`SkillConfigPicker`) and the detail pane (`SkillDetailView`), so an imported
 * outside skill never reads as "System" (written by AI Matrx) anywhere, and a
 * skill whose instructions depend on tooling we do not have says so before
 * anyone assigns it. Derivation lives in `../skill-provenance.ts`.
 */

import { AlertTriangle, PackageOpen, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SkillRow } from "../types";
import {
  attributionLine,
  formatAuthors,
  getSkillProvenance,
  notRunnableSummary,
} from "../skill-provenance";

type BadgeSize = "sm" | "md";

const SIZE: Record<BadgeSize, { badge: string; icon: string }> = {
  sm: { badge: "h-4 gap-1 px-1.5 text-[10px] font-normal", icon: "h-2.5 w-2.5" },
  md: { badge: "h-5 gap-1 px-1.5 text-[10px] font-normal", icon: "h-3 w-3" },
};

/**
 * Origin badge (Imported vs System) plus the not-runnable warning. Renders
 * nothing for an ordinary non-system skill without warnings — callers keep
 * their own Public/Personal chips.
 */
export function SkillOriginBadges({
  skill,
  size = "md",
}: {
  skill: Pick<SkillRow, "config" | "isSystem">;
  size?: BadgeSize;
}) {
  const p = getSkillProvenance(skill);
  const s = SIZE[size];
  const warning = notRunnableSummary(p);
  const importedTitle = p.imported
    ? [
        "Imported outside skill — written by outside experts, not by AI Matrx.",
        p.authors.length ? `Authors: ${formatAuthors(p.authors)}.` : null,
        p.sourceRepo ? `Source: ${p.sourceRepo}${p.commit ? ` @ ${p.commit}` : ""}.` : null,
        p.license ? `License: ${p.license}.` : null,
      ]
        .filter(Boolean)
        .join(" ")
    : undefined;

  return (
    <>
      {p.imported ? (
        <Badge
          variant="outline"
          title={importedTitle}
          className={cn(s.badge, "border-sky-500/40 text-sky-700 dark:text-sky-300")}
        >
          <PackageOpen className={s.icon} />
          Imported
        </Badge>
      ) : skill.isSystem ? (
        <Badge variant="outline" className={cn(s.badge, "text-muted-foreground")}>
          <ShieldCheck className={s.icon} />
          System
        </Badge>
      ) : null}
      {warning && (
        <Badge
          variant="outline"
          title={warning}
          aria-label={warning}
          className={cn(s.badge, "border-amber-500/50 text-amber-700 dark:text-amber-300")}
        >
          <AlertTriangle className={s.icon} />
          Needs tooling not in AI Matrx yet
        </Badge>
      )}
    </>
  );
}

/** "By X and Y · imported from github.com/o/r" — plain text, safe inside a button. */
export function SkillAttributionLine({
  skill,
  className,
}: {
  skill: Pick<SkillRow, "config">;
  className?: string;
}) {
  const line = attributionLine(getSkillProvenance(skill));
  if (!line) return null;
  return <div className={cn("text-[10px] text-muted-foreground/90 truncate", className)}>{line}</div>;
}
