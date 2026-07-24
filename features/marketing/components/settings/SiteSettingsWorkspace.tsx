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
import type { Json } from "@/types/database.types";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { isJsonRecord } from "@/features/marketing/types";
import { updateSiteSettings } from "@/features/marketing/data/settings-service";
import { useDeleteSite } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { ClampedNumberInput } from "@/features/marketing/components/shared/ClampedNumberInput";
import { extractErrorMessage } from "@/utils/errors";
import { SiteStrategyCard } from "@/features/marketing/components/settings/SiteStrategyCard";

interface CrawlDefaults {
  respectRobots: boolean;
  seedFromSitemap: boolean;
  followSubdomains: boolean;
  captureScreenshots: boolean;
  maxPages: number;
  concurrency: number;
  renderMode: "http_only" | "http_first" | "browser_always";
}

function crawlDefaults(settings: Json): CrawlDefaults {
  const root = isJsonRecord(settings) ? settings : {};
  const raw = isJsonRecord(root.crawl_defaults) ? root.crawl_defaults : {};
  return {
    respectRobots: raw.respect_robots === true,
    seedFromSitemap: raw.seed_from_sitemap !== false,
    followSubdomains: raw.follow_subdomains === true,
    captureScreenshots: raw.capture_screenshots !== false,
    maxPages:
      typeof raw.max_pages === "number" && raw.max_pages > 0
        ? raw.max_pages
        : 500,
    concurrency:
      typeof raw.concurrency === "number" && raw.concurrency > 0
        ? raw.concurrency
        : 8,
    renderMode:
      raw.render_mode === "http_only" || raw.render_mode === "browser_always"
        ? raw.render_mode
        : "http_first",
  };
}

export function SiteSettingsWorkspace() {
  const { site } = useMarketingSite();
  const router = useRouter();
  const deleteMutation = useDeleteSite();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const queryClient = useQueryClient();
  const [name, setName] = useState(site.name);
  const [status, setStatus] = useState(site.status);
  const [visibility, setVisibility] = useState(site.visibility);
  const [crawl, setCrawl] = useState(() => crawlDefaults(site.settings));
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
    const existing = isJsonRecord(site.settings) ? site.settings : {};
    update.mutate({
      siteId: site.id,
      expectedVersion: site.version,
      name: name.trim(),
      status,
      visibility,
      settings: {
        ...existing,
        crawl_defaults: {
          respect_robots: crawl.respectRobots,
          seed_from_sitemap: crawl.seedFromSitemap,
          follow_subdomains: crawl.followSubdomains,
          capture_screenshots: crawl.captureScreenshots,
          max_pages: crawl.maxPages,
          concurrency: crawl.concurrency,
          render_mode: crawl.renderMode,
        },
      },
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
      crawl_defaults: crawl,
      stored_settings: site.settings,
    },
    lines: [
      ["Site", name],
      ["Root URL", site.root_url],
      ["Lifecycle", status],
      ["Visibility", visibility],
      ["Respect robots.txt", crawl.respectRobots ? "yes" : "no"],
      ["Seed from sitemap", crawl.seedFromSitemap ? "yes" : "no"],
      ["Follow subdomains", crawl.followSubdomains ? "yes" : "no"],
      ["Capture screenshots", crawl.captureScreenshots ? "yes" : "no"],
      ["Maximum pages", crawl.maxPages],
      ["Concurrency", crawl.concurrency],
      ["Render mode", crawl.renderMode],
    ],
    attributes: { site_id: site.id },
  });

  return (
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
              checked={crawl.respectRobots}
              onCheckedChange={(checked) =>
                setCrawl((current) => ({ ...current, respectRobots: checked }))
              }
            />
            <ToggleRow
              label="Seed from sitemap"
              detail="Use sitemap URLs as crawl evidence."
              checked={crawl.seedFromSitemap}
              onCheckedChange={(checked) =>
                setCrawl((current) => ({
                  ...current,
                  seedFromSitemap: checked,
                }))
              }
            />
            <ToggleRow
              label="Follow subdomains"
              detail="Include related hosts in this site's scope."
              checked={crawl.followSubdomains}
              onCheckedChange={(checked) =>
                setCrawl((current) => ({
                  ...current,
                  followSubdomains: checked,
                }))
              }
            />
            <ToggleRow
              label="Capture screenshots"
              detail="Persist visual evidence for vision batches."
              checked={crawl.captureScreenshots}
              onCheckedChange={(checked) =>
                setCrawl((current) => ({
                  ...current,
                  captureScreenshots: checked,
                }))
              }
            />
            <NumberSetting
              id="crawl-max-pages"
              label="Maximum pages"
              value={crawl.maxPages}
              min={1}
              max={50_000}
              onChange={(value) =>
                setCrawl((current) => ({ ...current, maxPages: value }))
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Render mode</Label>
              <Select
                value={crawl.renderMode}
                onValueChange={(value) =>
                  setCrawl((current) => ({
                    ...current,
                    renderMode: value as CrawlDefaults["renderMode"],
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
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <SiteStrategyCard siteId={site.id} />

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
