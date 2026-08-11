"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Settings2, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { updateSiteSettings } from "@/features/marketing/data/settings-service";
import { useDeleteSite } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { ClampedNumberInput } from "@/features/marketing/components/shared/ClampedNumberInput";
import {
  cancelCrawl,
  type CrawlStartOptions,
} from "@/features/marketing/crawler/direct-client";
import {
  crawlOptionsFromSettings,
  invalidCrawlPatterns,
  parsePatternLines,
  settingsWithCrawlDefaults,
  type InvalidCrawlPattern,
} from "@/features/marketing/crawler/crawl-defaults";
import { extractErrorMessage } from "@/utils/errors";
import { SiteStrategyCard } from "@/features/marketing/components/settings/SiteStrategyCard";
import { CollectionStatusPanel } from "@/features/marketing/components/settings/CollectionStatusPanel";
import { SiteAnalyticsCard } from "@/features/marketing/components/settings/SiteAnalyticsCard";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingSiteSettingsScope } from "@/features/surfaces/manifests/marketing-site-settings.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  collectionStatusForSurface,
  useCollectionStatus,
} from "@/features/marketing/data/collection-status";
import { buildCrawlPolicyWriteHandlers } from "@/features/marketing/components/settings/crawl-policy-writes";

// crawl_defaults round-trips ONLY through features/marketing/crawler/crawl-defaults.ts.

export function SiteSettingsWorkspace() {
  const { site, sitePath, crawlActivity } = useMarketingSite();
  const router = useRouter();
  const deleteMutation = useDeleteSite();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const queryClient = useQueryClient();
  const [name, setName] = useState(site.name);
  const [status, setStatus] = useState(site.status);
  const [visibility, setVisibility] = useState(site.visibility);
  const [crawl, setCrawl] = useState<CrawlStartOptions>(() =>
    crawlOptionsFromSettings(site.settings),
  );
  const [includeText, setIncludeText] = useState<string>(() =>
    crawlOptionsFromSettings(site.settings).include_patterns.join("\n"),
  );
  const [excludeText, setExcludeText] = useState<string>(() =>
    crawlOptionsFromSettings(site.settings).exclude_patterns.join("\n"),
  );
  const pendingOptions: CrawlStartOptions = {
    ...crawl,
    include_patterns: parsePatternLines(includeText),
    exclude_patterns: parsePatternLines(excludeText),
  };
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  // Same React Query entry the panel below renders — the surface exposes the
  // rows to agents without a second request.
  const collectionStatus = useCollectionStatus(site, sitePath);
  // Agents edit this page through the SAME setters the user's typing uses.
  const writeHandlers = buildCrawlPolicyWriteHandlers({
    setCrawl,
    setIncludeText,
    setExcludeText,
    setStatus,
  });
  const patternProblems = invalidCrawlPatterns(pendingOptions);
  const update = useMutation({
    mutationFn: updateSiteSettings,
    onSuccess: (next) => {
      queryClient.setQueryData(["marketing", "site", site.id], next);
      void queryClient.invalidateQueries({ queryKey: ["marketing", "sites"] });
      toast.success("Site settings saved.");
    },
    onError: (error) => toast.error(error.message),
  });

  const save = () => {
    if (patternProblems.length) {
      toast.error("Fix the invalid URL patterns before saving", {
        description: patternProblems
          .map((problem) => `${problem.pattern}: ${problem.error}`)
          .join(" · "),
      });
      return;
    }
    update.mutate({
      siteId: site.id,
      expectedVersion: site.version,
      name: name.trim(),
      status,
      visibility,
      settings: settingsWithCrawlDefaults(site.settings, pendingOptions),
    });
  };

  const settingsCopy = webCopy({
    kind: "web-site-settings",
    label: "Site settings",
    description:
      "This managed site's settings: identity, lifecycle, visibility, and default crawl policy (current form state plus the stored settings JSON).",
    surface: `Site settings — ${site.domain}`,
    data: {
      site_id: site.id,
      name,
      status,
      visibility,
      root_url: site.root_url,
      crawl_defaults: pendingOptions,
      stored_settings: site.settings,
    },
    lines: [
      ["Site", name],
      ["Root URL", site.root_url],
      ["Lifecycle", status],
      ["Visibility", visibility],
      ["Respect robots.txt", pendingOptions.respect_robots ? "yes" : "no"],
      ["Seed from sitemap", pendingOptions.seed_from_sitemap ? "yes" : "no"],
      ["Follow subdomains", pendingOptions.follow_subdomains ? "yes" : "no"],
      [
        "Capture screenshots",
        pendingOptions.capture_screenshots ? "yes" : "no",
      ],
      ["Maximum pages", pendingOptions.max_pages],
      ["Maximum depth", pendingOptions.max_depth ?? "unlimited"],
      ["Concurrency", pendingOptions.concurrency],
      ["Render mode", pendingOptions.render_mode],
      ["Include patterns", pendingOptions.include_patterns.join(", ") || "—"],
      ["Exclude patterns", pendingOptions.exclude_patterns.join(", ") || "—"],
      ["Host rate limit", `${pendingOptions.host_rps} rps`],
    ],
    attributes: { site_id: site.id },
  });

  const dirty =
    name !== site.name ||
    status !== site.status ||
    visibility !== site.visibility ||
    JSON.stringify(pendingOptions) !==
      JSON.stringify(crawlOptionsFromSettings(site.settings));

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-site-settings"
      isEditable
      getScope={() =>
        createMarketingSiteSettingsScope({
          ...getBaseValues(),
          site_status: status,
          site_visibility: visibility,
          crawl_policy: { ...pendingOptions },
          crawl_policy_issues: patternProblems.map((problem) => ({
            field: problem.field,
            pattern: problem.pattern,
            error: problem.error,
          })),
          unsaved_changes: dirty,
          ...(collectionStatus.data
            ? {
                data_sources: collectionStatusForSurface(collectionStatus.data),
                data_sources_needing_attention: collectionStatus.data.filter(
                  (row) =>
                    row.health === "failing" || row.health === "not_connected",
                ).length,
              }
            : {}),
        })
      }
      getWriteHandlers={() => writeHandlers}
    >
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid gap-3 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-card">
          <div className="flex h-10 items-center gap-2 border-b border-border px-3">
            <Settings2 className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold">Site identity</h1>
            <span className="ml-auto">
              <CopyButtons size="icon" {...settingsCopy} />
            </span>
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="site-settings-name" className="text-xs">
                Display name
              </Label>
              <Input
                id="site-settings-name"
                className="h-8"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Canonical root URL</Label>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs">
                {site.root_url}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Domain changes require a deliberate page-registry migration and
                are not performed by this settings form.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lifecycle</Label>
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus(value as typeof site.status)
                }
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(value) =>
                  setVisibility(value as typeof site.visibility)
                }
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="internal">Organization</SelectItem>
                  <SelectItem value="link">Anyone with link</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex h-10 items-center justify-between border-b border-border px-3">
            <h2 className="text-sm font-semibold">Default crawl policy</h2>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Per-run overrides allowed
            </span>
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            <ToggleRow
              label="Respect robots.txt"
              detail="Off by default for sites managed by their owner."
              checked={crawl.respect_robots}
              onCheckedChange={(checked) =>
                setCrawl((current) => ({ ...current, respect_robots: checked }))
              }
            />
            <ToggleRow
              label="Seed from sitemap"
              detail="Use sitemap URLs as crawl evidence."
              checked={crawl.seed_from_sitemap}
              onCheckedChange={(checked) =>
                setCrawl((current) => ({
                  ...current,
                  seed_from_sitemap: checked,
                }))
              }
            />
            <ToggleRow
              label="Follow subdomains"
              detail="Include related hosts in this site's scope."
              checked={crawl.follow_subdomains}
              onCheckedChange={(checked) =>
                setCrawl((current) => ({
                  ...current,
                  follow_subdomains: checked,
                }))
              }
            />
            <ToggleRow
              label="Capture screenshots"
              detail="Persist visual evidence for vision batches."
              checked={crawl.capture_screenshots}
              onCheckedChange={(checked) =>
                setCrawl((current) => ({
                  ...current,
                  capture_screenshots: checked,
                }))
              }
            />
            <NumberSetting
              id="crawl-max-pages"
              label="Maximum pages"
              value={crawl.max_pages}
              min={1}
              max={50_000}
              onChange={(value) =>
                setCrawl((current) => ({ ...current, max_pages: value }))
              }
            />
            <NumberSetting
              id="crawl-concurrency"
              label="Concurrency"
              value={crawl.concurrency}
              min={1}
              max={32}
              onChange={(value) =>
                setCrawl((current) => ({ ...current, concurrency: value }))
              }
            />
            <NumberSetting
              id="crawl-max-depth"
              label="Maximum depth (0 = unlimited)"
              value={crawl.max_depth ?? 0}
              min={0}
              max={100}
              onChange={(value) =>
                setCrawl((current) => ({
                  ...current,
                  max_depth: value > 0 ? value : null,
                }))
              }
            />
            <NumberSetting
              id="crawl-host-rps"
              label="Host rate limit (requests/sec)"
              value={crawl.host_rps}
              min={1}
              max={50}
              onChange={(value) =>
                setCrawl((current) => ({ ...current, host_rps: value }))
              }
            />
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Render mode</Label>
              <Select
                value={crawl.render_mode}
                onValueChange={(value) =>
                  setCrawl((current) => ({
                    ...current,
                    render_mode: value as CrawlStartOptions["render_mode"],
                  }))
                }
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http_only">HTTP only</SelectItem>
                  <SelectItem value="http_first">
                    HTTP first, browser fallback
                  </SelectItem>
                  <SelectItem value="browser_always">Browser always</SelectItem>
                  <SelectItem value="browser_with_screenshot">
                    Browser + screenshots
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PatternSetting
              id="crawl-include-patterns"
              label="Include URL patterns"
              detail="Regex vs the URL path (e.g. ^/blog/), one per line. Empty = crawl everything in scope."
              value={includeText}
              onChange={setIncludeText}
              problems={patternProblems.filter(
                (problem) => problem.field === "include_patterns",
              )}
            />
            <PatternSetting
              id="crawl-exclude-patterns"
              label="Exclude URL patterns"
              detail="Regex vs the URL path, one per line. Matching URLs are never fetched."
              value={excludeText}
              onChange={setExcludeText}
              problems={patternProblems.filter(
                (problem) => problem.field === "exclude_patterns",
              )}
            />
          </div>
        </section>

        {/* A seven-column status table needs the full width — squeezing it
            into one half-column is what pushed the old panel into stacking
            badges and sentences on top of each other. */}
        <div className="xl:col-span-2">
          <CollectionStatusPanel site={site} sitePath={sitePath} />
        </div>

        <SiteAnalyticsCard
          siteId={site.id}
          organizationId={site.organization_id}
          ga4Enabled={parseSiteIntegrations(site.integrations).googleAnalytics4.enabled}
        />

        <SiteStrategyCard
          siteId={site.id}
          organizationId={site.organization_id}
        />

        <section className="overflow-hidden rounded-lg border border-destructive/40 bg-card">
          <div className="flex h-10 items-center gap-2 border-b border-destructive/30 px-3">
            <Trash2 className="h-4 w-4 text-destructive" />
            <h1 className="text-sm font-semibold text-foreground">
              Danger zone
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 p-3">
            <p className="min-w-64 flex-1 text-xs text-muted-foreground">
              Deleting this site moves it to trash and removes it from every
              list. Its brand, crawl history, and snapshots remain in the
              database.
            </p>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1.5"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete site
            </Button>
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${site.name}?`}
        description="The site moves to trash and disappears from every list. This does not delete the brand."
        variant="destructive"
        confirmLabel="Delete site"
        busy={deleteMutation.isPending}
        onConfirm={async () => {
          try {
            // Cancel-to-terminal before hiding the site — deleting with a
            // live crawl leaves the worker writing into an invisible session.
            if (crawlActivity.activeCrawl) {
              try {
                await cancelCrawl(crawlActivity.activeCrawl.id);
              } catch (cancelError) {
                toast.error(
                  "A crawl is running and could not be canceled — not deleting",
                  { description: extractErrorMessage(cancelError) },
                );
                return;
              }
            }
            await deleteMutation.mutateAsync(site.id);
            toast.success(`Deleted ${site.name}`);
            router.push(
              site.brand_id
                ? marketingRoutes.brand(site.brand_id)
                : marketingRoutes.brands(),
            );
          } catch (error) {
            toast.error("Could not delete site", {
              description: extractErrorMessage(error),
            });
          }
        }}
      />
      <div className="sticky bottom-0 mt-3 flex justify-end border-t border-border/80 bg-background/95 py-2 backdrop-blur">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!name.trim() || update.isPending}
          onClick={save}
        >
          <Save className="h-3.5 w-3.5" />
          Save settings
        </Button>
      </div>
    </main>
    </SurfaceRuntimeProvider>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  onCheckedChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-border p-2.5">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[10px] leading-4 text-muted-foreground">{detail}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PatternSetting({
  id,
  label,
  detail,
  value,
  onChange,
  problems,
}: {
  id: string;
  label: string;
  detail: string;
  value: string;
  onChange: (value: string) => void;
  problems: InvalidCrawlPattern[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Textarea
        id={id}
        rows={3}
        spellCheck={false}
        className="font-mono text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={problems.length > 0}
      />
      {problems.length ? (
        <p className="text-[11px] text-destructive">
          {problems
            .map((problem) => `${problem.pattern}: ${problem.error}`)
            .join(" · ")}
        </p>
      ) : (
        <p className="text-[10px] leading-4 text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

function NumberSetting({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <ClampedNumberInput
        id={id}
        value={value}
        min={min}
        max={max}
        onChange={onChange}
      />
    </div>
  );
}
