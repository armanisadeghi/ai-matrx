"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSiteContext } from "../SiteLayoutClient";
import { CmsSiteService, SiteNotEmptyError } from "@/features/cms/services/cmsService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { Save, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

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

  // Danger zone — delete site
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [forceDeleteState, setForceDeleteState] = useState<{ pageCount: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const runDelete = async (force: boolean) => {
    setIsDeleting(true);
    try {
      await CmsSiteService.deleteSite(siteId, force);
      toast.success(`Deleted site "${site.name}"`);
      router.push("/cms");
    } catch (err) {
      if (err instanceof SiteNotEmptyError) {
        setDeleteDialogOpen(false);
        setForceDeleteState({ pageCount: err.pageCount });
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to delete site");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await CmsSiteService.updateSite(siteId, {
        name,
        slug,
        domain: domain || undefined,
        globalCss: globalCss || undefined,
        favicon: favicon || undefined,
        isActive,
      });
      await refreshSite();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
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

        {/* Danger zone */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
          <p className="text-xs text-muted-foreground">
            Permanently deletes this site and everything under it — pages, components, versions,
            and activity history. This cannot be undone.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            className="gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Site
          </Button>
        </div>
      </div>

      <TextInputDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => !isDeleting && setDeleteDialogOpen(open)}
        title={`Delete "${site.name}"?`}
        description={`Type the site slug "${site.slug}" to confirm. This permanently deletes the site and all its pages, components, and history.`}
        placeholder={site.slug}
        confirmLabel="Delete Site"
        busy={isDeleting}
        validate={(value) => (value !== site.slug ? "Slug does not match" : null)}
        onConfirm={() => runDelete(false)}
      />

      <ConfirmDialog
        open={!!forceDeleteState}
        onOpenChange={(open) => !isDeleting && !open && setForceDeleteState(null)}
        title={`Site "${site.name}" is not empty`}
        description={`This site has ${forceDeleteState?.pageCount ?? 0} page(s). Force-deleting removes the site and every page, component, and version under it. This cannot be undone.`}
        confirmLabel="Force Delete"
        variant="destructive"
        busy={isDeleting}
        onConfirm={() => runDelete(true)}
      />
    </div>
  );
}
