"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSiteContext } from "../SiteLayoutClient";
import { CmsSiteService } from "@/features/cms/services/cmsService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, ArrowLeft } from "lucide-react";

export default function SiteSettingsPage() {
  const { siteId } = useParams() as { siteId: string };
  const router = useRouter();
  const { site, refreshSite } = useSiteContext();

  const [name, setName] = useState(site.name);
  const [slug, setSlug] = useState(site.slug);
  const [domain, setDomain] = useState(site.domain || "");
  const [globalCss, setGlobalCss] = useState(site.global_css || "");
  const [favicon, setFavicon] = useState(site.favicon || "");
  const [isActive, setIsActive] = useState(site.is_active);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await CmsSiteService.updateSite(siteId, {
        name,
        slug,
        domain: domain || null,
        globalCss: globalCss || null,
        favicon: favicon || null,
        isActive,
      });
      await refreshSite();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Site Settings</h2>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                ✓ Saved
              </span>
            )}
            {error && <span className="text-xs text-destructive">{error}</span>}
            <Button
              onClick={handleSave}
              disabled={isSaving || !name || !slug}
              className="gap-1.5 text-sm"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </div>

        {/* General */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">General</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Site Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Slug</label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="text-sm font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">Domain</label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="www.example.com"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Favicon URL
              </label>
              <Input
                value={favicon}
                onChange={(e) => setFavicon(e.target.value)}
                placeholder="https://..."
                className="text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={isActive}
                onCheckedChange={(v) => setIsActive(v === true)}
                className="shrink-0"
              />
              Site is active
            </label>
            <Badge
              variant={isActive ? "default" : "secondary"}
              className="text-[10px]"
            >
              {isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>

        {/* Global CSS */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Global CSS</h3>
          <p className="text-xs text-muted-foreground">
            CSS applied to all pages. Use this for base styles, typography, and
            layout.
          </p>
          <Textarea
            value={globalCss}
            onChange={(e) => setGlobalCss(e.target.value)}
            placeholder="/* Global styles for all pages */\n\nbody {\n  font-family: system-ui, sans-serif;\n}"
            className="font-mono text-sm min-h-[200px]"
          />
        </div>

        {/* Advanced */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Advanced</h3>
          <p className="text-xs text-muted-foreground">
            Theme configuration, navigation structure, and footer will be
            editable here in a future update.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-md border border-border/50 bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Theme Config
              </p>
              <pre className="text-[10px] text-muted-foreground mt-1 overflow-hidden">
                {JSON.stringify(site.theme_config, null, 2).slice(0, 100)}
              </pre>
            </div>
            <div className="rounded-md border border-border/50 bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Contact Info
              </p>
              <pre className="text-[10px] text-muted-foreground mt-1 overflow-hidden">
                {JSON.stringify(site.contact_info, null, 2).slice(0, 100)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
