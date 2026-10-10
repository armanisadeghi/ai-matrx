"use client";

/**
 * Operations > Connections: the social data provider. Status and platform
 * coverage come from `GET /social/capabilities`. Spend this month comes from
 * `GET /social/credits` (cost ledger: the organization's, plus the platform total
 * for admins) and reads in points through the one cost formatter.
 *
 * Vendor names and the vendor's own credit balance are our business, not the
 * member's (Arman, 2026-10-09): only a system admin seat sees them.
 * Every number is the server's; a failed call says so, never a zero.
 */

import { useQuery } from "@tanstack/react-query";
import { Coins, Database, Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

import { useCostDisplay, useSeesDollars } from "@/components/cost/useCostDisplay";

import { getCapabilities, getCredits } from "../server";
import { SOCIAL_PLATFORMS, type SocialSpend, type SocialSpendFigure } from "../types";
import { providerName } from "./ProviderFallbackNotice";
import { platformLabel } from "./PlatformMark";

/** Platforms a provider can serve at least one capability on. */
export function coverageOf(
  platforms: Record<string, Record<string, string[] | string>>,
  provider: string,
): string[] {
  return Object.entries(platforms)
    .filter(([, byProvider]) => Array.isArray(byProvider[provider]) && (byProvider[provider] as string[]).length > 0)
    .map(([platform]) => platform)
    .sort();
}

/** Platforms the app knows that no provider serves yet, per `GET /social/capabilities`. */
export function unsupportedPlatforms(
  platforms: Record<string, Record<string, string[] | string>>,
  providers: string[],
): string[] {
  const served = new Set(providers.flatMap((provider) => coverageOf(platforms, provider)));
  return SOCIAL_PLATFORMS.filter((platform) => !served.has(platform));
}

function formatCredits(n: number | null | undefined): string {
  return typeof n === "number" ? Math.round(n).toLocaleString() : "Not reported";
}

export function formatSpend(
  spend: SocialSpend | null | undefined,
  error: string | null | undefined,
  formatCost: (usd: number) => string,
): string {
  if (!spend) return error ? "Spend unavailable" : "Not reported";
  const one = (f: SocialSpendFigure) => `${formatCost(f.usd)} · ${f.calls.toLocaleString()} calls`;
  return spend.platform
    ? `${one(spend.organization)} (organization) · ${one(spend.platform)} (platform)`
    : one(spend.organization);
}

export function SocialProviderCard() {
  const organizationId = useAppSelector(selectOrganizationId) ?? "";
  const enabled = Boolean(organizationId);
  const seesVendor = useSeesDollars();
  const { format } = useCostDisplay();
  const caps = useQuery({
    queryKey: ["marketing", "social", "capabilities", organizationId],
    queryFn: ({ signal }) => getCapabilities({ organizationId, signal }),
    enabled,
    staleTime: 60_000,
  });
  const credits = useQuery({
    queryKey: ["marketing", "social", "credits", organizationId],
    queryFn: ({ signal }) => getCredits({ organizationId, signal }),
    enabled,
    staleTime: 60_000,
  });

  const providers = Object.entries(caps.data?.providers ?? {});
  const ready = providers.filter(([, status]) => status === "ready");
  const badge = caps.isPending
    ? { variant: "secondary" as const, text: "Checking…" }
    : caps.isError
      ? { variant: "warning" as const, text: "Status unavailable" }
      : ready.length
        ? { variant: "success" as const, text: `${ready.length} ready` }
        : { variant: "secondary" as const, text: "Not configured" };

  const balances = Object.entries(credits.data?.balances ?? {});
  const primary = ready[0]?.[0] ?? "scrapecreators";
  const covered = caps.data ? coverageOf(caps.data.platforms, primary) : [];
  const unsupported = caps.data
    ? unsupportedPlatforms(caps.data.platforms, Object.keys(caps.data.providers))
    : [];

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Social data provider">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background">
          <Database className="h-6 w-6 text-primary" />
        </span>
        <Badge variant={badge.variant}>{badge.text}</Badge>
      </div>
      <div className="mt-3">
        <h2 className="text-base font-semibold">Social data</h2>
        <p className="text-xs text-muted-foreground">Posts, profiles and ad libraries.</p>
      </div>
      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {providers.length === 0 ? (
          <Row icon={Database} label="Status" detail={caps.isError ? "Status unavailable" : "Loading…"} />
        ) : seesVendor ? (
          providers.map(([name, status]) => (
            <Row key={name} icon={Database} label={providerName(name)} detail={status === "ready" ? "Ready" : "Not configured"} title={status === "ready" ? undefined : status} />
          ))
        ) : (
          <Row icon={Database} label="Status" detail={ready.length ? "Ready" : "Not configured"} />
        )}
        {seesVendor ? (
          <Row
            icon={Coins}
            label="Credits remaining"
            detail={
              credits.isPending
                ? "Loading…"
                : credits.isError
                  ? "Balance unavailable"
                  : balances.length === 0
                    ? "No provider reports a balance"
                    : balances.map(([name, n]) => `${providerName(name)} ${formatCredits(n)}`).join(" · ")
            }
          />
        ) : null}
        <Row
          icon={Receipt}
          label="Spend this month"
          detail={
            credits.isPending
              ? "Loading…"
              : credits.isError
                ? "Spend unavailable"
                : formatSpend(credits.data?.spend ? { ...credits.data.spend, platform: null } : credits.data?.spend, credits.data?.spend_error, (usd) => format(usd))
          }
        />
        {credits.data?.spend?.platform ? (
          <Row
            icon={Receipt}
            label="Platform spend this month"
            detail={formatSpend({ ...credits.data.spend, platform: null, organization: credits.data.spend.platform }, null, (usd) => format(usd))}
          />
        ) : null}
      </div>
      {covered.length ? (
        <p className="mt-3 text-xs text-muted-foreground">{covered.map(platformLabel).join(" · ")}</p>
      ) : null}
      {unsupported.length ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Not supported yet: {unsupported.map(platformLabel).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

function Row({ icon: Icon, label, detail, title }: { icon: typeof Database; label: string; detail: string; title?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground" title={title ?? detail}>
          {detail}
        </p>
      </div>
    </div>
  );
}
