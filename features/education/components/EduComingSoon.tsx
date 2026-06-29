// Server component. The single coming-soon placeholder for every Education Hub
// tool route that isn't built yet. Deliberately SMALL and utilitarian — it is
// NOT a marketing page. It exists to (a) reserve the route, (b) remind us +
// coding agents what to build, and (c) point at the source-of-truth vision
// section. Duplicated across tool routes by passing a different EduToolEntry.
import Link from "next/link";
import { ArrowLeft, Hammer, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "./sections/StatusPill";
import { AccessTierBadge } from "./sections/AccessTierBadge";
import { EDU_BASE } from "../constants";
import type { EduStatus, AccessTier } from "../types";

interface EduComingSoonProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  capabilities?: string[];
  /** e.g. "VISION-education-hub.md §3 — FastFire". Keeps the stub honest. */
  visionRef?: string;
  status?: EduStatus;
  accessTier?: AccessTier;
  className?: string;
}

export function EduComingSoon({
  icon: Icon = Hammer,
  title,
  description,
  capabilities,
  visionRef,
  status = "coming-soon",
  accessTier,
  className,
}: EduComingSoonProps) {
  return (
    <div
      className={cn(
        "min-h-full w-full flex items-center justify-center px-4 py-12",
        className,
      )}
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-2 mb-3">
          <StatusPill status={status} />
          {accessTier ? <AccessTierBadge tier={accessTier} /> : null}
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>

        {capabilities && capabilities.length > 0 ? (
          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
              Planned capabilities
            </p>
            <ul className="space-y-1.5">
              {capabilities.map((c) => (
                <li
                  key={c}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
          <Link
            href={EDU_BASE}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Education Hub
          </Link>
          {visionRef ? (
            <span className="text-[11px] font-mono text-muted-foreground/60 truncate">
              {visionRef}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
