// Server component. Small status pill: Live / Beta / Coming soon / Planned.
// Mirrors the LegalLanding "Live | Coming soon" treatment so the whole app
// reads consistently.
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EduStatus } from "../../types";

const LABEL: Record<EduStatus, string> = {
  live: "Live",
  beta: "Beta",
  "coming-soon": "Coming soon",
  planned: "Planned",
};

export function StatusPill({
  status,
  className,
}: {
  status: EduStatus;
  className?: string;
}) {
  const isLive = status === "live";
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        isLive
          ? "bg-primary/10 text-primary border border-primary/20"
          : "bg-muted text-muted-foreground border border-border",
        className,
      )}
    >
      {isLive ? <Zap className="h-3 w-3" /> : null}
      {LABEL[status]}
    </span>
  );
}
