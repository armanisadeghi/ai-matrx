"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Gauge,
  KeyRound,
  LockKeyhole,
  SearchCheck,
  UserRound,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";

export function MarketingConnectionsWorkspace() {
  const sites = useSiteOptions();
  const organizations = useActiveOrganizationPicker();
  const [siteId, setSiteId] = useState("");
  const selectedSite = sites.data?.find((site) => site.id === siteId);
  const organizationHref = organizations.activeOrgId
    ? `/organizations/${organizations.activeOrgId}/settings#vault`
    : "/organizations";

  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Data Connections
          </h1>
        }
        center={<MarketingWorkspaceNav />}
      />
      <main className="h-full overflow-y-auto bg-textured px-3 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <div className="space-y-3">
          <section className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div>
              <h2 className="text-sm font-semibold">
                Connect once, use across sites
              </h2>
              <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
                Keep credentials at the user or organization level, then bind
                the relevant provider property to each managed site.
              </p>
            </div>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <LockKeyhole className="h-3 w-3" /> Secrets stay server-side
            </Badge>
          </section>

          <div className="grid gap-3 xl:grid-cols-3">
            <ProviderCard
              icon={SearchCheck}
              title="Google Search Console"
              status="Vault credentials supported"
              description="Seed canonical URLs, search queries, indexing evidence, clicks, and impressions."
            />
            <ProviderCard
              icon={BarChart3}
              title="Google Analytics 4"
              status="Connection authority pending"
              description="Add traffic, landing-page, engagement, channel, and conversion context."
            />
            <ProviderCard
              icon={Gauge}
              title="PageSpeed Insights"
              status="Site binding available"
              description="Collect Lighthouse and field-performance evidence for canonical pages."
            />
          </div>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold">
                1. Choose where credentials belong
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Personal credentials follow you. Organization credentials are
                reusable by authorized team members.
              </p>
            </div>
            <div className="grid gap-2 p-3 md:grid-cols-2">
              <ConnectionScope
                icon={UserRound}
                title="Personal connection"
                description="Store your Google service-account JSON or OAuth client/refresh credentials in your personal encrypted vault."
                href="/settings/secrets"
                action="Open personal vault"
              />
              <ConnectionScope
                icon={Building2}
                title={
                  organizations.activeOrgName
                    ? `${organizations.activeOrgName} connection`
                    : "Organization connection"
                }
                description="Store shared credentials in the active organization's vault so the team can use them without revealing their values."
                href={organizationHref}
                action={
                  organizations.activeOrgId
                    ? "Open organization vault"
                    : "Choose an organization"
                }
              />
            </div>
            <div className="border-t border-border bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
              Search Console accepts <code>FIREBASE_SERVICE_ACCOUNT</code> or{" "}
              <code>GOOGLE_SERVICE_ACCOUNT</code> JSON, or Google OAuth client
              credentials plus <code>GSC_REFRESH_TOKEN</code>. Do not paste
              credentials into site settings.
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold">
                2. Bind the provider to a site
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Select the Search Console or Analytics property that represents
                the real website.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 p-3">
              <Select value={siteId || undefined} onValueChange={setSiteId}>
                <SelectTrigger className="w-full sm:w-80" size="sm">
                  <SelectValue
                    placeholder={
                      sites.isLoading
                        ? "Loading sites…"
                        : "Select a managed site"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(sites.data ?? []).map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name} · {site.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSite ? (
                <Button asChild size="sm" className="h-8 gap-1.5">
                  <Link
                    href={`/marketing/sites/${selectedSite.id}/integrations`}
                  >
                    Configure {selectedSite.name}{" "}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link href="/marketing/sites/new">Add a site first</Link>
                </Button>
              )}
            </div>
          </section>

          <Alert className="border-amber-500/40 bg-amber-500/5 py-2.5">
            <KeyRound className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-xs">
              One-click Google OAuth is not available yet
            </AlertTitle>
            <AlertDescription className="text-[11px] leading-4 text-muted-foreground">
              The shared OAuth authority still needs to return durable, opaque
              user/org connection IDs. Until it exists, this workspace uses the
              encrypted vault path above and will not send you to the legacy
              page that stores a Google access token in browser storage.
            </AlertDescription>
          </Alert>
        </div>
      </main>
    </>
  );
}

function ProviderCard({
  icon: Icon,
  title,
  status,
  description,
}: {
  icon: typeof SearchCheck;
  title: string;
  status: string;
  description: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {status}
        </Badge>
      </div>
      <h3 className="mt-2 text-xs font-semibold">{title}</h3>
      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
        {description}
      </p>
    </section>
  );
}

function ConnectionScope({
  icon: Icon,
  title,
  description,
  href,
  action,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold">{title}</h3>
        <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
          {description}
        </p>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="mt-2 h-7 gap-1 text-xs"
        >
          <Link href={href}>
            {action} <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
