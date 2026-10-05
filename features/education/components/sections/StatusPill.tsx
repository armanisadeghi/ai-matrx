// Server component. Small status pill: Live / Beta / Coming soon / Planned.
// Mirrors the LegalLanding "Live | Coming soon" treatment so the whole app
// reads consistently.
import { Zap } from "lucide-react";
import type { EduStatus } from "../../types";
import { Chip } from "@ai-matrx/design-system/controls";

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
    <Chip
      tone={isLive ? "primary" : "neutral"}
      icon={isLive ? <Zap /> : undefined}
      label={LABEL[status]}
      className={className}
    />
  );
}
