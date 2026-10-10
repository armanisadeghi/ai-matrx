"use client";

/**
 * Private insights on the account page: the connected account's own analytics for the last 30 days,
 * from the shared insights reader (the KPI "Own channel" table reads the same one). The four headline
 * figures show once the network is connected; any other figure the provider sent joins them. Until it
 * is connected there are no tiles, just one row offering the connection.
 */

import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";

import { Button, RegionSkeleton } from "@ai-matrx/design-system/controls";

import { KpiTile } from "@/components/official/kpi/KpiTile";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";

import { INSIGHT_METRICS } from "../insights";
import { formatCompact } from "../outlier";
import { useOwnInsights } from "../useOwnInsights";
import { useConnectionStates } from "../useConnectionStates";
import { platformLabel } from "./PlatformMark";
import { useStartConnection } from "./ConnectAccountMenu";
import { TopOwnPosts } from "./TopOwnPosts";

const HEADLINE = new Set(["followers", "impressions", "reach", "engagements"]);

export function AccountInsights({ trackedAccountId, platform }: { trackedAccountId: string; platform: string }) {
  const brand = useMarketingBrand();
  const router = useRouter();
  const connections = useConnectionStates(brand.organizationId);
  const start = useStartConnection(brand.organizationId, brand.seg, () => router.push(`/marketing/${brand.seg}/socials/accounts`));
  const insights = useOwnInsights([trackedAccountId]);
  const summary = insights.summaries.get(trackedAccountId);
  const connection = connections.of(platform);
  if (connections.isLoading) return <RegionSkeleton shape="rows" count={1} aria-label="Checking the connection" />;
  if (connection && connection.state !== "connected") {
    return (
      <div className="flex min-h-9 flex-wrap items-center gap-2" data-testid="private-insights-connect">
        <span className="text-sm text-muted-foreground">Connect {platformLabel(platform)} to see private stats</span>
        {connection.canConnect ? (
          <Button variant="outline" icon={<Link2 />} onClick={() => void start(connection)}>
            {connection.state === "reconnect" ? "Reconnect" : "Connect"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Coming soon</span>
        )}
      </div>
    );
  }
  if (!summary) return null;
  const hasData = INSIGHT_METRICS.some((m) => summary.values[m.id] !== null);
  if (!insights.isLoading && !insights.isError && !hasData) {
    return (
      <div className="flex flex-col gap-4">
        <p className="min-h-9 text-sm text-muted-foreground" data-testid="private-insights-empty">
          No private stats yet — they appear after the first sync
        </p>
        <TopOwnPosts trackedAccountId={trackedAccountId} />
      </div>
    );
  }
  const shown = INSIGHT_METRICS.filter((m) => HEADLINE.has(m.id) || summary.values[m.id] !== null);
  return (
    <div className="flex flex-col gap-4">
    <section aria-label="Private insights" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-foreground">Private insights</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {shown.map((m) => {
          const v = summary.values[m.id];
          return (
            <KpiTile
              key={m.id}
              label={m.label}
              value={v === null ? null : formatCompact(v)}
              hint={insights.isError ? "Couldn't load" : v === null ? "—" : m.kind === "flow" ? "Last 30 days" : undefined}
              loading={insights.isLoading}
              title={summary.latestDate ? `Through ${summary.latestDate}` : undefined}
            />
          );
        })}
      </div>
    </section>
    <TopOwnPosts trackedAccountId={trackedAccountId} />
    </div>
  );
}
