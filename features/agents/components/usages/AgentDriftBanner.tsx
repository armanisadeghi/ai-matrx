/**
 * AgentDriftBanner — the dismissible "drift detected on your agents" callout on
 * the agents page. Reads the caller's open drift alerts (written by the weekly
 * scan), shows once per detection run, stamps viewed_at on first render, and
 * dismisses server-side (survives reload / other devices). Renders nothing when
 * there are no active alerts.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalloutBanner } from "@/components/official/CalloutBanner";
import { useDriftAlerts } from "@/features/agents/hooks/useDriftAlerts";
import { useOpenAgentFindUsagesWindow } from "@/features/overlays/openers/agentFindUsagesWindow";

export function AgentDriftBanner() {
  const { alerts, dismiss, markViewed } = useDriftAlerts();
  const openFindUsages = useOpenAgentFindUsagesWindow();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Stamp viewed_at on first render of each unseen alert.
  useEffect(() => {
    for (const a of alerts) {
      if (!a.viewedAt) markViewed(a.id);
    }
  }, [alerts, markViewed]);

  if (alerts.length === 0) return null;

  const breaking = alerts.reduce((n, a) => n + a.breakingCount, 0);
  const silent = alerts.reduce((n, a) => n + a.silentCount, 0);
  const tone = breaking > 0 ? "destructive" : silent > 0 ? "warning" : "warning";

  const single = alerts.length === 1 ? alerts[0] : null;

  const title = single
    ? `Drift detected on "${single.agentName}"`
    : `Drift detected on ${alerts.length} of your agents`;

  const descBits: string[] = [];
  if (breaking > 0) descBits.push(`${breaking} breaking`);
  if (silent > 0) descBits.push(`${silent} silent`);
  const description =
    descBits.length > 0
      ? `${descBits.join(" · ")} — review and update the affected usages.`
      : "Review and update the affected usages.";

  const review = () => {
    if (single) {
      openFindUsages({ agentId: single.agentId });
    } else {
      startTransition(() => router.push("/reports/agent-drift"));
    }
  };

  const dismissAll = () => {
    for (const a of alerts) dismiss(a);
  };

  return (
    <CalloutBanner
      tone={tone}
      icon={GitCompareArrows}
      title={title}
      description={description}
      onDismiss={dismissAll}
      className="mb-3"
      actions={
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={review} disabled={pending}>
          {single ? "Review usages" : "Open drift report"}
        </Button>
      }
    />
  );
}
