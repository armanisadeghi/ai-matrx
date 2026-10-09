"use client";

/**
 * Operations > Connections: the social data provider (ScrapeCreators and its
 * fallbacks). Status and platform coverage come from `GET /social/capabilities`,
 * credits remaining from `GET /social/credits` (the vendor's free balance call).
 * Every number is the server's; a failed call says so, never a zero.
 *
 * Spend this month: the same call returns month-to-date spend and call counts
 * from the cost ledger (the organization's, plus the platform total for admins).
 */

import { useQuery } from "@tanstack/react-query";
import { Coins, Database, Receipt } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

import { getCapabilities, getCredits } from "../server";
import type { SocialSpend, SocialSpendFigure } from "../types";
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

function formatCredits(n: number | null | undefined): string {
  return typeof n === "number" ? Math.round(n).toLocaleString() : "Not reported";
}

export function formatSpend(spend: SocialSpend | null | undefined, error?: string | null): string {
  if (!spend) return error ? "Spend unavailable" : "Not reported";
  const one = (f: SocialSpendFigure) => `$${f.usd.toFixed(2)} · ${f.calls.toLocaleString()} calls`;
  return spend.platform
    ? `${one(spend.organization)} (organization) · ${one(spend.platform)} (platform)`
    : one(spend.organization);
}

export function SocialProviderCard() {
  const organizationId = useAppSelector(selectOrganizationId) ?? "";
  const enabled = Boolean(organizationId);
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
          <Row icon={Database} label="Providers" detail={caps.isError ? "Provider status unavailable" : "Loading…"} />
        ) : (
          providers.map(([name, status]) => (
            <Row key={name} icon={Database} label={providerName(name)} detail={status === "ready" ? "Ready" : status} />
          ))
        )}
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
        <Row
          icon={Receipt}
          label="Spend this month"
          detail={
            credits.isPending
              ? "Loading…"
              : credits.isError
                ? "Spend unavailable"
                : formatSpend(credits.data?.spend, credits.data?.spend_error)
          }
        />
      </div>
      {covered.length ? (
        <p className="mt-3 text-[11px] text-muted-foreground">{covered.map(platformLabel).join(" · ")}</p>
      ) : null}
    </section>
  );
}

function Row({ icon: Icon, label, detail }: { icon: typeof Database; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="truncate text-[10px] text-muted-foreground" title={detail}>
          {detail}
        </p>
      </div>
    </div>
  );
}
