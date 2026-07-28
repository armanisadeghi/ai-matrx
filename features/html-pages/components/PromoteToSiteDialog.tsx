"use client";

/**
 * PromoteToSiteDialog — the W2-A "Promote to site" flow.
 *
 * Copies an html_pages quick page onto a chosen client site as a NEW draft
 * page (content in the `_draft` twins, never auto-published; provenance both
 * directions) via `CmsPageService.promoteFromHtmlPage`, then offers the two
 * next steps: open the draft in the CMS page editor, or open the public
 * `?preview=true` URL. The /p/{id} original stays live.
 *
 * Rendered by both the html-pages list (row menu) and the editor (toolbar);
 * each surface owns its instance via the `htmlPage` / `onOpenChange` props.
 */

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  PencilRuler,
  TriangleAlert,
} from "lucide-react";
import { CmsSiteService, CmsPageService } from "@/features/cms/services/cmsService";
import type { ClientSiteSummary, PromoteFromHtmlPageResult } from "@/features/cms/types";
import { clientPageUrl } from "@/features/cms/utils/pageUrls";
import { slugifyTitle, SLUG_RE } from "@/features/html-pages/utils/promoteConvert";

export interface PromoteTargetPage {
  id: string;
  meta_title: string | null;
}

interface PromoteToSiteDialogProps {
  /** The html_page to promote; null keeps the dialog closed. */
  htmlPage: PromoteTargetPage | null;
  onOpenChange: (open: boolean) => void;
}

export function PromoteToSiteDialog({
  htmlPage,
  onOpenChange,
}: PromoteToSiteDialogProps) {
  const router = useRouter();
  // SUMMARY rows — only id/name/slug/domain are read here.
  const [sites, setSites] = React.useState<ClientSiteSummary[] | null>(null);
  const [sitesError, setSitesError] = React.useState<string | null>(null);
  const [siteId, setSiteId] = React.useState<string>("");
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<PromoteFromHtmlPageResult | null>(null);

  const open = htmlPage !== null;

  // Load the user's sites when the dialog opens; reset per-target state.
  React.useEffect(() => {
    if (!open) return;
    setResult(null);
    setBusy(false);
    setTitle(htmlPage?.meta_title ?? "");
    setSlug("");
    let cancelled = false;
    CmsSiteService.listSites()
      .then((rows) => {
        if (cancelled) return;
        setSites(rows);
        setSitesError(null);
        if (rows.length === 1) setSiteId(rows[0].id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSitesError(err instanceof Error ? err.message : "Failed to load sites");
      });
    return () => {
      cancelled = true;
    };
  }, [open, htmlPage?.id, htmlPage?.meta_title]);

  const selectedSite = sites?.find((s) => s.id === siteId) ?? null;
  const trimmedSlug = slug.trim();
  const slugInvalid = trimmedSlug !== "" && !SLUG_RE.test(trimmedSlug);
  const derivedSlug = slugifyTitle(title.trim() || htmlPage?.meta_title || "page");

  const handlePromote = async () => {
    if (!htmlPage || !siteId) return;
    setBusy(true);
    try {
      const res = await CmsPageService.promoteFromHtmlPage({
        htmlPageId: htmlPage.id,
        siteId,
        slug: trimmedSlug || undefined,
        title: title.trim() || undefined,
      });
      setResult(res);
      if (res.reused) {
        toast.info("Already promoted to this site — showing the existing page.");
      } else {
        toast.success("Draft created on the site.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setBusy(false);
    }
  };

  const resultPreviewUrl =
    result && selectedSite
      ? clientPageUrl({
          siteSlug: selectedSite.slug,
          slug: result.page.slug,
          route: result.page.route,
          category: result.page.category,
          preview: true,
        })
      : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Promote to site</DialogTitle>
          <DialogDescription>
            Copies this page onto a client site as a draft. Nothing is published
            until you publish the draft; the original /p/ page stays live.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm">
              {result.reused
                ? "This page was already promoted to the selected site."
                : "Draft created."}{" "}
              <span className="font-mono text-xs text-muted-foreground">
                {result.page.slug}
              </span>
            </p>
            {result.conversionWarnings.length > 0 && (
              <div className="rounded-md border border-border bg-muted/50 p-2 space-y-1">
                {result.conversionWarnings.map((w) => (
                  <p
                    key={w}
                    className="text-xs text-muted-foreground flex items-start gap-1.5"
                  >
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                    {w}
                  </p>
                ))}
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              {resultPreviewUrl && (
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(resultPreviewUrl, "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Preview draft
                </Button>
              )}
              <Button
                onClick={() => {
                  onOpenChange(false);
                  router.push(`/cms/${result.page.client_id}/pages/${result.page.id}`);
                }}
              >
                <PencilRuler className="h-4 w-4 mr-1.5" />
                Open in editor
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="promote-site">Site</Label>
              {sitesError ? (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {sitesError}
                </p>
              ) : sites === null ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground h-9">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading sites…
                </div>
              ) : sites.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  You have no client sites yet. Create one under /cms first.
                </p>
              ) : (
                <Select value={siteId} onValueChange={setSiteId}>
                  <SelectTrigger id="promote-site">
                    <SelectValue placeholder="Choose a site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{" "}
                        <span className="text-muted-foreground">({s.slug})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="promote-title">Page title</Label>
              <Input
                id="promote-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={htmlPage?.meta_title ?? "Untitled Page"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="promote-slug">Slug</Label>
              <Input
                id="promote-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={derivedSlug}
                aria-invalid={slugInvalid}
              />
              {slugInvalid ? (
                <p className="text-xs text-destructive">
                  Lowercase letters, digits and hyphens only.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Leave empty to use “{derivedSlug}”.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={!siteId || slugInvalid || busy || !sites?.length}
                onClick={() => void handlePromote()}
              >
                {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Promote
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
