"use client";

import { useState } from "react";
import {
  BadgeDollarSign,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { MarketingComingSoon } from "@/features/marketing/components/MarketingComingSoon";
import { assertGoogleAdsCampaignActive } from "@/features/marketing/google/ads-campaign";
import {
  useConnectGoogle,
  useGoogleAdsCustomers,
  useGoogleAdsReport,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import type { GoogleAdsCustomer } from "@/features/marketing/google/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { GOOGLE_ADS_REPORTING_SCOPES, GOOGLE_SCOPE } from "@/lib/googleScopes";
import { toast } from "@/lib/toast";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";

function isoDate(daysAgo: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - daysAgo);
  return value.toISOString().slice(0, 10);
}

function customerKey(customer: GoogleAdsCustomer): string {
  return `${customer.login_customer_id}:${customer.customer_id}`;
}

function formatCustomerId(value: string): string {
  return value.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");
}

function number(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(
    value,
  );
}

function currency(
  valueMicros: number,
  currencyCode: string | null | undefined,
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode || "USD",
    maximumFractionDigits: 2,
  }).format(valueMicros / 1_000_000);
}

/**
 * Google Ads returns its status as a raw API enum (ENABLED / PAUSED /
 * REMOVED). Printing it put SHOUTING API casing on every campaign row; the
 * codebase already maps enums to labels this way elsewhere
 * (LISTING_STATUS_LABELS, PUBLISHER_TIER_LABELS).
 */
const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  ENABLED: "Running",
  PAUSED: "Paused",
  REMOVED: "Removed",
  UNKNOWN: "Unknown",
  UNSPECIFIED: "Unknown",
};

function campaignStatusLabel(status: string | null | undefined): string {
  if (!status) return "Status unavailable";
  const key = status.trim().toUpperCase();
  return (
    CAMPAIGN_STATUS_LABELS[key] ??
    key.charAt(0) + key.slice(1).toLowerCase().replaceAll("_", " ")
  );
}

export function GoogleAdsWorkspace() {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const google = useGoogleAPI();
  const inventory = useGoogleConnectionInventory();
  const connect = useConnectGoogle();
  const customers = useGoogleAdsCustomers();
  const report = useGoogleAdsReport();
  const [connectionId, setConnectionId] = useState("");
  const [customerSelection, setCustomerSelection] = useState("");
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [startDate, setStartDate] = useState(isoDate(6));
  const [endDate, setEndDate] = useState(isoDate(0));

  const adsConnections = (inventory.data?.connections ?? []).filter(
    (connection) =>
      connection.health === "connected" &&
      connection.scopes.includes(GOOGLE_SCOPE.googleAds),
  );
  const selectedConnection = adsConnections.find(
    (connection) => connection.id === connectionId,
  );
  const adsCustomers = customers.data?.customers ?? [];
  const selectedCustomer = adsCustomers.find(
    (customer) => customerKey(customer) === customerSelection,
  );
  const hasAdsScope = Boolean(
    selectedConnection?.scopes.includes(GOOGLE_SCOPE.googleAds),
  );

  if (!isSuperAdmin) {
    return <MarketingComingSoon comingSoonId="marketing.ads" />;
  }

  const authorize = async () => {
    try {
      assertGoogleAdsCampaignActive(isSuperAdmin);
      if (!disclosureAccepted) {
        throw new Error("Confirm the read-only Google Ads disclosure first.");
      }
      const code = await google.requestAuthorizationCode(
        [...GOOGLE_ADS_REPORTING_SCOPES],
        undefined,
        { forceConsent: true },
      );
      const result = await connect.mutateAsync({
        code,
        owner: { type: "user" },
        connectionPurpose: "google_ads_isolated",
      });
      setConnectionId(result.connectionId);
      setCustomerSelection("");
      setDisclosureAccepted(false);
      await inventory.refetch();
      toast.success("Google Ads authorization saved", {
        description: "Now discover the accounts this identity can report on.",
      });
    } catch (error) {
      toast.error("Google Ads was not authorized", {
        description:
          error instanceof Error
            ? error.message
            : "Google authorization did not finish.",
      });
    }
  };

  const discoverCustomers = async () => {
    if (!connectionId) return;
    try {
      const result = await customers.mutateAsync({ connectionId });
      setCustomerSelection("");
      toast.success("Google Ads accounts discovered", {
        description: `${result.customers.length} accessible account${result.customers.length === 1 ? "" : "s"} found.`,
      });
    } catch (error) {
      toast.error("Google Ads accounts could not be loaded", {
        description:
          error instanceof Error
            ? error.message
            : "Account discovery did not finish.",
      });
    }
  };

  const loadReport = async () => {
    if (!connectionId || !selectedCustomer) return;
    try {
      await report.mutateAsync({
        connectionId,
        customerId: selectedCustomer.customer_id,
        loginCustomerId: selectedCustomer.login_customer_id,
        startDate,
        endDate,
      });
      toast.success("Google Ads report loaded");
    } catch (error) {
      toast.error("Google Ads report could not be loaded", {
        description:
          error instanceof Error
            ? error.message
            : "The reporting request did not finish.",
      });
    }
  };

  const totals = (report.data?.campaigns ?? []).reduce(
    (sum, campaign) => ({
      impressions: sum.impressions + campaign.impressions,
      clicks: sum.clicks + campaign.clicks,
      costMicros: sum.costMicros + campaign.cost_micros,
      conversions: sum.conversions + campaign.conversions,
      conversionValue: sum.conversionValue + campaign.conversion_value,
    }),
    {
      impressions: 0,
      clicks: 0,
      costMicros: 0,
      conversions: 0,
      conversionValue: 0,
    },
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-10 pt-[var(--shell-header-h)] sm:px-6">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Internal approval lane
          </div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BadgeDollarSign className="h-5 w-5" />
            Read-only Google Ads reporting
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Connect an account you control, choose one accessible Ads customer,
            and view a bounded performance report. AI Matrx does not create or
            change campaigns, ads, billing, users, or account settings.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="google-ads-connection">
              Ads-authorized Google identity
            </Label>
            <select
              id="google-ads-connection"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
              value={connectionId}
              onChange={(event) => {
                setConnectionId(event.target.value);
                setCustomerSelection("");
                customers.reset();
                report.reset();
              }}
            >
              <option value="">Choose an Ads-authorized identity</option>
              {adsConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.account_email ||
                    connection.account_name ||
                    connection.id}
                </option>
              ))}
            </select>
          </div>

          {!hasAdsScope ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <Checkbox
                  checked={disclosureAccepted}
                  onCheckedChange={(value) =>
                    setDisclosureAccepted(value === true)
                  }
                  aria-label="Confirm read-only Google Ads access"
                />
                <span>
                  I understand that AI Matrx will read accessible account and
                  campaign performance data only. I will choose a dedicated
                  Google identity that is not already connected to AI Matrx for
                  Workspace, Analytics, Search Console, or YouTube.
                </span>
              </label>
              <Button
                className="min-h-11"
                onClick={authorize}
                disabled={
                  !disclosureAccepted ||
                  connect.isPending ||
                  !google.isGoogleLoaded
                }
              >
                {connect.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Authorize a dedicated Ads identity
              </Button>
            </div>
          ) : (
            <Button
              className="min-h-11"
              onClick={discoverCustomers}
              disabled={customers.isPending}
            >
              {customers.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Discover accessible Ads accounts
            </Button>
          )}
        </CardContent>
      </Card>

      {adsCustomers.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Choose an Ads account and date range
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="google-ads-customer">Ads customer</Label>
              <select
                id="google-ads-customer"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                value={customerSelection}
                onChange={(event) => {
                  setCustomerSelection(event.target.value);
                  report.reset();
                }}
              >
                <option value="">Choose one account</option>
                {adsCustomers.map((customer) => (
                  <option
                    key={customerKey(customer)}
                    value={customerKey(customer)}
                  >
                    {customer.descriptive_name} ·{" "}
                    {formatCustomerId(customer.customer_id)}
                    {customer.manager ? " · Manager" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="google-ads-start">Start</Label>
              <Input
                id="google-ads-start"
                className="h-11"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="google-ads-end">End</Label>
              <Input
                id="google-ads-end"
                className="h-11"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <Button
              className="min-h-11"
              onClick={loadReport}
              disabled={!selectedCustomer || report.isPending}
            >
              {report.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Load report
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {report.data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Impressions", number(totals.impressions)],
              ["Clicks", number(totals.clicks)],
              [
                "Cost",
                currency(totals.costMicros, report.data.customer.currency_code),
              ],
              ["Conversions", number(totals.conversions, 2)],
              ["Conversion value", number(totals.conversionValue, 2)],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  Campaign performance
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {report.data.customer.descriptive_name} ·{" "}
                  {report.data.start_date} to {report.data.end_date}
                </p>
              </div>
              <Button
                asChild
                className="min-h-11 sm:min-h-8"
                variant="outline"
                size="sm"
              >
                <a
                  href="https://ads.google.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Google Ads <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3">
              {report.data.campaigns.length ? (
                report.data.campaigns.map((campaign) => (
                  <div
                    key={campaign.campaign_id}
                    className="grid gap-3 rounded-lg border border-border p-4 lg:grid-cols-[minmax(0,1fr)_repeat(5,minmax(90px,auto))] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {campaign.campaign_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {campaignStatusLabel(campaign.status)}
                      </p>
                    </div>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Impr.</span>{" "}
                      {number(campaign.impressions)}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Clicks</span>{" "}
                      {number(campaign.clicks)}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Cost</span>{" "}
                      {currency(
                        campaign.cost_micros,
                        report.data.customer.currency_code,
                      )}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Conv.</span>{" "}
                      {number(campaign.conversions, 2)}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Value</span>{" "}
                      {number(campaign.conversion_value, 2)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                  No campaigns returned data for this bounded date range.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
