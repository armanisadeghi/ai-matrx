"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSiteContext } from "../SiteLayoutClient";
import {
  CmsSiteService,
  SiteNotEmptyError,
} from "@/features/cms/services/cmsService";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SurfaceRoleAgentButton } from "@ai-matrx/chat/surfaces/components/chrome/SurfaceRoleAgentButton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@ai-matrx/design-system";
import { Save, Loader2, Trash2, ExternalLink, Check } from "lucide-react";
import { toast } from "@/lib/toast";
import { normalizeDomainInput } from "@/features/cms/utils/pageUrls";
import { SiteAdvancedSettings } from "@/features/cms/components/settings/SiteAdvancedSettings";
import { SiteDomainSettings } from "@/features/cms/components/settings/SiteDomainSettings";
import {
  installStarterKit,
  StarterKitNotEmptyError,
  type StarterKitOutcome,
} from "@/features/cms/services/starterKitClient";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { useCmsSiteSurfaceScope } from "@/features/cms/hooks/useCmsSiteSurfaceScope";
import { CMS_SITE_CONTEXT_MENU_PROPS } from "@/features/cms/agent-context/cmsSiteContextMenuProps";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const SETTINGS_SECTIONS = [
  ["general", "General"],
  ["domain-connection", "Domain"],
  ["global-css", "CSS"],
  ["content-plan", "Content plan"],
  ["site-shell", "Site shell"],
  ["research-lineage", "Research"],
  ["theme-tokens", "Theme"],
  ["navigation", "Navigation"],
  ["footer", "Footer"],
  ["contact-info", "Contact"],
  ["social-links", "Social"],
  ["danger-zone", "Danger zone"],
] as const;

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
        toast.error(err instanceof Error ? err.message : "Starter kit failed");
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
      toast.success(`Moved site "${site.name}" to Trash`);
      router.push("/cms");
    } catch (err) {
      if (err instanceof SiteNotEmptyError) {
        setDeleteDialogOpen(false);
        setForceDeleteState({ pageCount: err.pageCount });
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to move site to Trash",
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
   * Agent write targets owned by THIS component — `site_global_css` and
   * `site_name`, because the Global CSS textarea's buffer and the Site Name
   * input's buffer both live here. The theme, navigation, and footer targets
   * are registered by the sections that own their own drafts
   * (`SiteAdvancedSettings`, via `useSurfaceWriteHandlers`);
   * `applySurfaceWrite` merges both sources.
   *
   * The value lands in the SAME `globalCss` state the user's typing drives, so
   * nothing persists until they click Save Changes — see the manifest's
   * `writeTargets` doc comment for why staging (not saving) is what keeps this
   * honest under `agent_write_policy`.
   */
  const buildWriteHandlers = (): SurfaceWriteHandlers => ({
    site_name: (value) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(
          "site_name expects a non-empty plain text string, NOT JSON and NOT JSON-encoded — send the name itself (e.g. Northwind Coffee), not a quoted, braced, or escaped version of it.",
        );
      }
      setName(value.trim());
    },
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h1
                className="text-2xl font-semibold tracking-tight text-foreground"
                title={`Site identity, styling, navigation and shell for ${site.name}`}
              >
                Settings
              </h1>
            </div>
            <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
              <div className="flex items-center gap-2">
                {saved && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" aria-hidden="true" /> Saved
                  </span>
                )}
                {error && (
                  <span className="text-xs text-destructive">{error} <ErrorAlchemyMenu error={error} /></span>
                )}
                <Button
                  icon={isSaving ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Save />
                  )}
                  variant="primary"
                  onClick={handleSave}
                  disabled={isSaving || !name || !slug}
                  aria-describedby="general-save-scope"
                  className="flex-1 sm:flex-none"
                >
                  Save Changes
                </Button>
              </div>
              <p
                id="general-save-scope"
                className="max-w-md text-xs text-muted-foreground sm:text-right"
              >
                Saves General and Global CSS only. Every other editor has its
                own Save.
              </p>
            </div>
          </div>

          <nav
            aria-label="Settings sections"
            className="-mx-4 overflow-x-auto px-4 pb-1 lg:hidden"
          >
            <div className="flex w-max gap-2">
              {SETTINGS_SECTIONS.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground"
                >
                  {label}
                </a>
              ))}
            </div>
          </nav>

          {/* General */}
          <section
            id="general"
            className="scroll-mt-24 rounded-lg border border-border bg-card p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-foreground">General</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Site Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Slug</label>
                <Input mono
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Domain
                </label>
                <Input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onBlur={(e) =>
                    setDomain(normalizeDomainInput(e.target.value))
                  }
                  placeholder="www.example.com"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Desired serving host (lowercase). Saving it does not redirect
                  traffic; use the connection check below after DNS is ready.
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
          </section>

          <section id="domain-connection" className="scroll-mt-24">
            <SiteDomainSettings site={site} onRefresh={refreshSite} />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Global CSS */}
            <section
              id="global-css"
              className="scroll-mt-24 rounded-lg border border-border bg-card p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Global CSS
                </h3>
                <SurfaceRoleAgentButton
                  surfaceName="matrx-user/cms-site"
                  roleName="site_editor"
                  label="Write with AI"
                  className="shrink-0"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                CSS applied to all pages. Use this for base styles, typography,
                and layout.
              </p>
              <Textarea mono minHeight={200}
                value={globalCss}
                onChange={(e) => setGlobalCss(e.target.value)}
                placeholder="/* Global styles for all pages */\n\nbody {\n  font-family: system-ui, sans-serif;\n}"
              />
            </section>

            <div className="space-y-6">
              {/* Plan pairing (WF-12): the web.site this CMS site realizes. */}
              <section
                id="content-plan"
                className="scroll-mt-24 rounded-lg border border-border bg-card p-5 space-y-3"
              >
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
                      icon={<ExternalLink />}
                      variant="outline"
                      onClick={() =>
                        window.open(
                          `/marketing/content-plan/${site.web_site_id}`,
                          "_blank",
                        )
                      }
                    >
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
              </section>

              {/* Starter kit (WF-7) */}
              <section
                id="site-shell"
                className="scroll-mt-24 rounded-lg border border-border bg-card p-5 space-y-3"
              >
                <h3 className="text-sm font-semibold text-foreground">
                  Site Shell
                </h3>
                <p className="text-xs text-muted-foreground">
                  The starter kit seeds a working shell: base CSS (reset,
                  layout, nav/header/footer rules), a header and footer
                  component, and navigation from your show-in-nav pages. Theme
                  tokens stay live data — edit them in Theme Tokens below any
                  time.
                </p>
                {kitPreview ? (
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1 text-xs text-foreground">
                    <p className="font-medium">
                      Dry run — nothing written yet:
                    </p>
                    <p>
                      {kitPreview.globalCssChars.toLocaleString()} chars of
                      shell CSS
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
                    icon={kitBusy ? (
                      <Loader2 className="animate-spin" />
                    ) : null}
                    variant="outline"
                    disabled={kitBusy}
                    onClick={() => runKit({ dryRun: true })}
                  >
                    Preview (dry run)
                  </Button>
                  <Button
                    icon={kitBusy ? (
                      <Loader2 className="animate-spin" />
                    ) : null}
                    variant="primary"
                    disabled={kitBusy}
                    onClick={() => runKit({})}
                  >
                    Install starter kit
                  </Button>
                </div>
              </section>

              {/* Danger zone */}
              <section
                id="danger-zone"
                className="scroll-mt-24 rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-3"
              >
                <h3 className="text-sm font-semibold text-destructive">
                  Danger Zone
                </h3>
                <p className="text-xs text-muted-foreground">
                  Moves this site and everything under it — pages, components,
                  assets, and redirects — to Trash. The site goes offline and
                  you can restore it, with its history, later.
                </p>
                <Button
                  icon={<Trash2 />}
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  Move Site to Trash
                </Button>
              </section>
            </div>
          </div>

          {/* Theme / navigation / footer / contact / social — each saves its own
            field through the ONE /api/cms/sites update path. */}
          <SiteAdvancedSettings site={site} onSaved={refreshSite} />
        </div>

        <TextInputDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => !isDeleting && setDeleteDialogOpen(open)}
          title={`Move "${site.name}" to Trash?`}
          description={`Type the site slug "${site.slug}" to confirm. The site and all its pages and components move to Trash and go offline; you can restore them later.`}
          /* font-mono data-identifier: the slug the person types to confirm */
          placeholder={site.slug}
          confirmLabel="Move to Trash"
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
          description={`This site has ${forceDeleteState?.pageCount ?? 0} page(s). Moving it to Trash takes every page and component with it; restoring the site brings them all back.`}
          confirmLabel="Move All to Trash"
          variant="destructive"
          busy={isDeleting}
          onConfirm={() => runDelete(true)}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}
