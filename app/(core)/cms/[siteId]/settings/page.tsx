"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSiteContext } from "../SiteLayoutClient";
import {
  CmsSiteService,
  SiteNotEmptyError,
} from "@/features/cms/services/cmsService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { Save, Loader2, Trash2, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { normalizeDomainInput } from "@/features/cms/utils/pageUrls";
import { SiteAdvancedSettings } from "@/features/cms/components/settings/SiteAdvancedSettings";
import {
  installStarterKit,
  StarterKitNotEmptyError,
  type StarterKitOutcome,
} from "@/features/cms/services/starterKitClient";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useCmsSiteSurfaceScope } from "@/features/cms/hooks/useCmsSiteSurfaceScope";
import { CMS_SITE_CONTEXT_MENU_PROPS } from "@/features/cms/agent-context/cmsSiteContextMenuProps";

export default function SiteSettingsPage() {
  const { siteId } = useParams() as { siteId: string };
  const router = useRouter();
  const { site, refreshSite, pages, components, allSites, currentMode } =
    useSiteContext();

  const [name, setName] = useState(site.name);
  const [slug, setSlug] = useState(site.slug);
  const [domain, setDomain] = useState(site.domain || "");
  const [globalCss, setGlobalCss] = useState(site.global_css || "");
  const [favicon, setFavicon] = useState(site.favicon || "");
  const [isActive, setIsActive] = useState(site.is_active);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Starter kit (WF-7) — dry-run preview, then apply; force behind a
  // destructive confirm when the site already has a shell.
  const dispatch = useAppDispatch();
  const [kitPreview, setKitPreview] = useState<StarterKitOutcome | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [kitForceState, setKitForceState] = useState<{
    message: string;
  } | null>(null);

  const runKit = async (options: { force?: boolean; dryRun?: boolean }) => {
    setKitBusy(true);
    try {
      const outcome = await installStarterKit(dispatch, siteId, options);
      if (options.dryRun) {
        setKitPreview(outcome);
      } else {
        setKitPreview(null);
        setKitForceState(null);
        toast.success(
          `Starter kit installed — ${outcome.componentCount} component(s), ` +
            `${outcome.navigationSeeded ? "navigation seeded" : "navigation untouched"}.`,
        );
        await refreshSite();
      }
    } catch (err) {
      if (err instanceof StarterKitNotEmptyError && !options.force) {
        setKitForceState({ message: err.message });
      } else {
        toast.error(
          err instanceof Error ? err.message : "Starter kit failed",
        );
      }
    } finally {
      setKitBusy(false);
    }
  };

  // Danger zone — delete site
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [forceDeleteState, setForceDeleteState] = useState<{
    pageCount: number;
  } | null>(null);
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
        toast.error(
          err instanceof Error ? err.message : "Failed to delete site",
        );
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    // The DB CHECK (client_sites_domain_normalized, CMS migration 0014) rejects
    // a non-normalized host, and the my-matrx renderer only ever matches the
    // normalized form — so normalize before save and reflect it back in the UI.
    const cleanDomain = normalizeDomainInput(domain);
    if (cleanDomain !== domain) setDomain(cleanDomain);
    try {
      await CmsSiteService.updateSite(siteId, {
        name,
        slug,
        domain: cleanDomain || undefined,
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

  // Nested `matrx-user/cms-site` runtime: the unsaved form values live only
  // here, so this tab re-emits the full site scope plus `settings_draft`.
  // Deepest provider wins, so it shadows the layout's while mounted.
  const buildSurfaceScope = useCmsSiteSurfaceScope({
    site,
    pages,
    components,
    allSites,
    currentMode,
    settingsDraft: {
      name,
      slug,
      domain,
      favicon,
      global_css: globalCss,
      is_active: isActive,
    },
  });

  /**
   * Agent write targets owned by THIS component — `site_global_css` only,
   * because the Global CSS textarea's buffer lives here. The theme,
   * navigation, and footer targets are registered by the sections that own
   * their own drafts (`SiteAdvancedSettings`, via `useSurfaceWriteHandlers`);
   * `applySurfaceWrite` merges both sources.
   *
   * The value lands in the SAME `globalCss` state the user's typing drives, so
   * nothing persists until they click Save Changes — see the manifest's
   * `writeTargets` doc comment for why staging (not saving) is what keeps this
   * honest under `agent_write_policy`.
   */
  const buildWriteHandlers = (): SurfaceWriteHandlers => ({
    site_global_css: (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(
          "site_global_css expects an object: { css: string, mode?: 'replace' | 'append' }.",
        );
      }
      const patch = value as { css?: unknown; mode?: unknown };
      if (typeof patch.css !== "string") {
        throw new Error(
          "site_global_css.css must be a string of plain CSS rules.",
        );
      }
      if (/<\/?style[\s>]/i.test(patch.css)) {
        throw new Error(
          "site_global_css.css must be plain CSS rules with no <style> tag — the renderer wraps it itself.",
        );
      }
      const mode = patch.mode ?? "replace";
      if (mode !== "replace" && mode !== "append") {
        throw new Error(
          `site_global_css.mode must be "replace" or "append" (got ${JSON.stringify(patch.mode)}).`,
        );
      }
      const css = patch.css;
      setGlobalCss((prev) =>
        mode === "append" && prev.trim()
          ? `${prev.replace(/\s+$/, "")}\n\n${css}`
          : css,
      );
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={CMS_SITE_CONTEXT_MENU_PROPS.surfaceName}
      getScope={buildSurfaceScope}
      getWriteHandlers={buildWriteHandlers}
    >
    <div className="h-full overflow-auto">
      <div className="px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-end">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">Domain</label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onBlur={(e) => setDomain(normalizeDomainInput(e.target.value))}
                placeholder="www.example.com"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Canonical serving host (lowercase). The site then serves at this
                domain with no /c/ prefix. Attach this domain (and its www/apex
                counterpart) to the my-matrx Vercel project + DNS to go live.
              </p>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Global CSS */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Global CSS
            </h3>
            <p className="text-xs text-muted-foreground">
              CSS applied to all pages. Use this for base styles, typography,
              and layout.
            </p>
            <Textarea
              value={globalCss}
              onChange={(e) => setGlobalCss(e.target.value)}
              placeholder="/* Global styles for all pages */\n\nbody {\n  font-family: system-ui, sans-serif;\n}"
              className="font-mono text-sm min-h-[200px]"
            />
          </div>

          <div className="space-y-6">
            {/* Plan pairing (WF-12): the web.site this CMS site realizes. */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Content Plan
              </h3>
              {site.web_site_id ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    This site is paired with a content plan — pages realized
                    from the plan carry their node link, and publishing flows
                    back into plan statuses.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() =>
                      window.open(
                        `/marketing/content-plan/${site.web_site_id}`,
                        "_blank",
                      )
                    }
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open content plan
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Not paired with a content plan. Pair from the plan
                  workspace&apos;s Setup view (Make it real → create/link CMS
                  site) — the first reconcile records the pairing.
                </p>
              )}
            </div>

            {/* Starter kit (WF-7) */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Site Shell
              </h3>
              <p className="text-xs text-muted-foreground">
                The starter kit seeds a working shell: base CSS (reset, layout,
                nav/header/footer rules), a header and footer component, and
                navigation from your show-in-nav pages. Theme tokens stay live
                data — edit them in Theme Tokens below any time.
              </p>
              {kitPreview ? (
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1 text-xs text-foreground">
                  <p className="font-medium">Dry run — nothing written yet:</p>
                  <p>
                    {kitPreview.globalCssChars.toLocaleString()} chars of shell
                    CSS
                    {kitPreview.globalCssReplacedChars > 0
                      ? ` (replacing ${kitPreview.globalCssReplacedChars.toLocaleString()} existing)`
                      : ""}
                    , header + footer components,{" "}
                    {kitPreview.navigationSeeded
                      ? "navigation seeded from pages"
                      : "navigation left as is"}
                    .
                  </p>
                  {kitPreview.notes.map((note, i) => (
                    <p key={i} className="text-muted-foreground">
                      {note}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={kitBusy}
                  onClick={() => runKit({ dryRun: true })}
                >
                  {kitBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Preview (dry run)
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={kitBusy}
                  onClick={() => runKit({})}
                >
                  {kitBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Install starter kit
                </Button>
              </div>
            </div>

            {/* Danger zone */}
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-destructive">
                Danger Zone
              </h3>
              <p className="text-xs text-muted-foreground">
                Permanently deletes this site and everything under it — pages,
                components, versions, and activity history. This cannot be
                undone.
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
        </div>

        {/* Theme / navigation / footer / contact / social — each saves its own
            field through the ONE /api/cms/sites update path. */}
        <SiteAdvancedSettings site={site} onSaved={refreshSite} />
      </div>

      <TextInputDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => !isDeleting && setDeleteDialogOpen(open)}
        title={`Delete "${site.name}"?`}
        description={`Type the site slug "${site.slug}" to confirm. This permanently deletes the site and all its pages, components, and history.`}
        placeholder={site.slug}
        confirmLabel="Delete Site"
        busy={isDeleting}
        validate={(value) =>
          value !== site.slug ? "Slug does not match" : null
        }
        onConfirm={() => runDelete(false)}
      />

      <ConfirmDialog
        open={!!kitForceState}
        onOpenChange={(open) => !kitBusy && !open && setKitForceState(null)}
        title="Replace this site's existing shell?"
        description={`${kitForceState?.message ?? ""} Re-running the kit replaces the global CSS and the header/footer components (all versioned — restorable from History).`}
        confirmLabel="Replace shell"
        variant="destructive"
        busy={kitBusy}
        onConfirm={() => runKit({ force: true })}
      />

      <ConfirmDialog
        open={!!forceDeleteState}
        onOpenChange={(open) =>
          !isDeleting && !open && setForceDeleteState(null)
        }
        title={`Site "${site.name}" is not empty`}
        description={`This site has ${forceDeleteState?.pageCount ?? 0} page(s). Force-deleting removes the site and every page, component, and version under it. This cannot be undone.`}
        confirmLabel="Force Delete"
        variant="destructive"
        busy={isDeleting}
        onConfirm={() => runDelete(true)}
      />
    </div>
    </SurfaceRuntimeProvider>
  );
}
