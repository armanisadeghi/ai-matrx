"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useBrandOptions,
  useMoveSiteBrand,
  useUpdateSiteIdentity,
} from "@/features/marketing/data/hooks";
import type { MarketingSite } from "@/features/marketing/types";
import type { SiteDraftPatch } from "@/features/marketing/lib/site-write-targets";
import { extractErrorMessage } from "@/utils/errors";

const STATUS_OPTIONS: Array<{ value: MarketingSite["status"]; label: string }> =
  [
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "error", label: "Error" },
  ];

const VISIBILITY_OPTIONS: Array<{
  value: MarketingSite["visibility"];
  label: string;
}> = [
  { value: "personal", label: "Personal" },
  { value: "internal", label: "Organization" },
  { value: "link", label: "Anyone with link" },
  { value: "public", label: "Public" },
];

interface SiteDraft {
  name: string;
  description: string;
  logoUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  status: MarketingSite["status"];
  visibility: MarketingSite["visibility"];
}

function draftFrom(site: MarketingSite): SiteDraft {
  return {
    name: site.name,
    description: site.description ?? "",
    logoUrl: site.logo_url ?? "",
    faviconUrl: site.favicon_url ?? "",
    ogImageUrl: site.og_image_url ?? "",
    status: site.status,
    visibility: site.visibility,
  };
}

/**
 * The live handle this dialog publishes while it is open, so the component
 * that owns the surface runtime (`SitesPortfolio`) can both READ what is
 * currently staged (the `site_editor` surface value) and STAGE into it (the
 * `site_editor_draft` write target) without a parallel write path — `stage`
 * is the same `setDraft` the user's own typing fires.
 */
export interface SiteEditorHandle {
  siteId: string;
  domain: string;
  /** Mid-save: a write must be refused rather than raced against the mutation. */
  busy: boolean;
  /** What is in the editor right now, including unsaved edits. */
  draft: { name: string; description: string };
  stage: (patch: SiteDraftPatch) => void;
}

/** A ref so readers always see the CURRENT render's draft, never mount state. */
export type SiteEditorHandleRef = { readonly current: SiteEditorHandle | null };

/**
 * The ONE site editor — exposes EVERY user-editable site field. Hiding a
 * stored, user-editable value from this dialog is a defect. `root_url` /
 * `domain` are shown read-only: changing them is a deliberate page-registry
 * migration, not an edit. Creation lives at /marketing/sites/new
 * (`web.create_site` creates-or-reuses the brand).
 */
export function SiteEditorDialog({
  open,
  onOpenChange,
  site,
  onRegister,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: MarketingSite | null;
  /** Publish/retract the live handle above. Omit outside the sites portfolio. */
  onRegister?: (handle: SiteEditorHandleRef | null) => void;
}) {
  if (!site) return null;
  return (
    <SiteEditorDialogBody
      // Remount per open + site identity so the draft always starts fresh.
      key={`${open}:${site.id}:${site.version}`}
      open={open}
      onOpenChange={onOpenChange}
      site={site}
      onRegister={onRegister}
    />
  );
}

function SiteEditorDialogBody({
  open,
  onOpenChange,
  site,
  onRegister,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: MarketingSite;
  onRegister?: (handle: SiteEditorHandleRef | null) => void;
}) {
  const updateMutation = useUpdateSiteIdentity();
  const moveMutation = useMoveSiteBrand();
  const brandOptions = useBrandOptions(site.organization_id);
  const [draft, setDraft] = useState<SiteDraft>(() => draftFrom(site));
  const [brandId, setBrandId] = useState<string | null>(site.brand_id);
  const busy = updateMutation.isPending || moveMutation.isPending;

  const set =
    <K extends keyof SiteDraft>(key: K) =>
    (value: SiteDraft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }));

  // An agent write goes through the SAME draft setter as a keystroke, so the
  // Save button, the version guard, and the trim-on-save rules all still apply.
  const stage = useCallback((patch: SiteDraftPatch) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  // Refreshed after EVERY render: `applySurfaceWrite` resolves handlers before
  // the confirm dialog is answered, so anything read off a render closure
  // (busy, the live draft) would be stale by the time Apply is pressed.
  const handleRef = useRef<SiteEditorHandle | null>(null);
  useEffect(() => {
    handleRef.current = {
      siteId: site.id,
      domain: site.domain,
      busy,
      draft: { name: draft.name, description: draft.description },
      stage,
    };
  });
  useEffect(() => {
    onRegister?.(handleRef);
    return () => onRegister?.(null);
  }, [onRegister]);

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Site name is required.");
      return;
    }
    try {
      // Identity first (version-checked against the row as opened), then the
      // brand move — move_site_brand bumps the version, so this order keeps
      // the optimistic-concurrency check honest.
      await updateMutation.mutateAsync({
        siteId: site.id,
        expectedVersion: site.version,
        patch: {
          name,
          description: draft.description.trim() || null,
          logo_url: draft.logoUrl.trim() || null,
          favicon_url: draft.faviconUrl.trim() || null,
          og_image_url: draft.ogImageUrl.trim() || null,
          status: draft.status,
          visibility: draft.visibility,
        },
      });
      if (brandId && brandId !== site.brand_id) {
        await moveMutation.mutateAsync({ siteId: site.id, brandId });
      }
      toast.success("Site saved");
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not save site", {
        description: extractErrorMessage(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        // A surface-write confirm renders OUTSIDE this dialog, so answering it
        // would otherwise count as an outside interaction and close the editor
        // — discarding the copy just staged. Cancel, Escape and the X still
        // close it, and unsaved edits now survive a stray click either way.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit {site.name}</DialogTitle>
          <DialogDescription>
            Every editable site field, in one place.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="site-name" className="text-xs">
              Name
            </Label>
            <Input
              id="site-name"
              value={draft.name}
              onChange={(event) => set("name")(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Canonical root URL</Label>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs">
              {site.root_url}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Domain changes require a deliberate page-registry migration and
              are not performed by this editor.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Brand</Label>
            <Select
              value={brandId ?? ""}
              onValueChange={setBrandId}
              disabled={brandOptions.isLoading}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose the owning brand" />
              </SelectTrigger>
              <SelectContent>
                {(brandOptions.data ?? []).map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Changing this moves the site (and its website property) to
              another brand in the same organization.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="site-description" className="text-xs">
              Description
            </Label>
            <Textarea
              id="site-description"
              value={draft.description}
              onChange={(event) => set("description")(event.target.value)}
              minHeight={64}
              maxHeight={140}
              placeholder="What this website is for"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="site-logo" className="text-xs">
                Logo URL
              </Label>
              <Input
                id="site-logo"
                value={draft.logoUrl}
                onChange={(event) => set("logoUrl")(event.target.value)}
                placeholder="https://…/logo.png"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="site-favicon" className="text-xs">
                Favicon URL
              </Label>
              <Input
                id="site-favicon"
                value={draft.faviconUrl}
                onChange={(event) => set("faviconUrl")(event.target.value)}
                placeholder="https://…/favicon.ico"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="site-og" className="text-xs">
                Social image URL
              </Label>
              <Input
                id="site-og"
                value={draft.ogImageUrl}
                onChange={(event) => set("ogImageUrl")(event.target.value)}
                placeholder="https://…/social-card.jpg"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Lifecycle</Label>
              <Select
                value={draft.status}
                onValueChange={(value) =>
                  set("status")(value as MarketingSite["status"])
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Visibility</Label>
              <Select
                value={draft.visibility}
                onValueChange={(value) =>
                  set("visibility")(value as MarketingSite["visibility"])
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save site
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
