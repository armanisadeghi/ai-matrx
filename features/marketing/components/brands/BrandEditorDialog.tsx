"use client";

import { useState } from "react";
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
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import {
  useCreateBrand,
  useUpdateBrand,
} from "@/features/marketing/data/hooks";
import type { MarketingBrand } from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

// web.* holds scraped PUBLIC data — every brand/site is public, enforced by a
// DB trigger that coerces any other value (Arman ruling 2026-07-21). Offering
// Private here would be a lie the database silently corrects.
const VISIBILITY_OPTIONS: Array<{
  value: MarketingBrand["visibility"];
  label: string;
}> = [{ value: "public", label: "Public (all marketing data is public)" }];

interface BrandDraft {
  name: string;
  industry: string;
  description: string;
  websiteUrl: string;
  logoUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  notes: string;
  status: string;
  visibility: MarketingBrand["visibility"];
}

function draftFrom(brand: MarketingBrand | null): BrandDraft {
  return {
    name: brand?.name ?? "",
    industry: brand?.industry ?? "",
    description: brand?.description ?? "",
    websiteUrl: brand?.website_url ?? "",
    logoUrl: brand?.logo_url ?? "",
    faviconUrl: brand?.favicon_url ?? "",
    ogImageUrl: brand?.og_image_url ?? "",
    notes: brand?.notes ?? "",
    status: brand?.status ?? "active",
    visibility: "public",
  };
}

/**
 * The ONE brand editor — create and edit expose EVERY user-editable brand
 * field. Hiding a stored, user-editable value from this dialog is a defect.
 */
export function BrandEditorDialog({
  open,
  onOpenChange,
  brand,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode */
  brand: MarketingBrand | null;
}) {
  return (
    <BrandEditorDialogBody
      // Remount per open + brand identity so the draft always starts fresh —
      // no state-reset effects.
      key={`${open}:${brand?.id ?? "new"}:${brand?.version ?? 0}`}
      open={open}
      onOpenChange={onOpenChange}
      brand={brand}
    />
  );
}

function BrandEditorDialogBody({
  open,
  onOpenChange,
  brand,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: MarketingBrand | null;
}) {
  const orgs = useActiveOrganizationPicker();
  const createMutation = useCreateBrand();
  const updateMutation = useUpdateBrand();
  const [draft, setDraft] = useState<BrandDraft>(() => draftFrom(brand));
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const busy = createMutation.isPending || updateMutation.isPending;
  const selectedOrgId = organizationId ?? orgs.activeOrgId ?? undefined;

  const set =
    <K extends keyof BrandDraft>(key: K) =>
    (value: BrandDraft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Brand name is required.");
      return;
    }
    try {
      if (brand) {
        await updateMutation.mutateAsync({
          brandId: brand.id,
          expectedVersion: brand.version,
          patch: {
            name,
            industry: draft.industry.trim() || null,
            description: draft.description.trim() || null,
            website_url: draft.websiteUrl.trim() || null,
            logo_url: draft.logoUrl.trim() || null,
            favicon_url: draft.faviconUrl.trim() || null,
            og_image_url: draft.ogImageUrl.trim() || null,
            notes: draft.notes.trim() || null,
            status: draft.status,
            visibility: draft.visibility,
          },
        });
        toast.success("Brand saved");
      } else {
        if (!selectedOrgId) {
          toast.error("Choose an owning organization for this brand.");
          return;
        }
        await createMutation.mutateAsync({
          organizationId: selectedOrgId,
          name,
          industry: draft.industry.trim() || null,
          description: draft.description.trim() || null,
          websiteUrl: draft.websiteUrl.trim() || null,
          logoUrl: draft.logoUrl.trim() || null,
          faviconUrl: draft.faviconUrl.trim() || null,
          ogImageUrl: draft.ogImageUrl.trim() || null,
          notes: draft.notes.trim() || null,
          status: draft.status,
          visibility: draft.visibility,
        });
        toast.success("Brand created");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(brand ? "Could not save brand" : "Could not create brand", {
        description: extractErrorMessage(error),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{brand ? `Edit ${brand.name}` : "Add brand"}</DialogTitle>
          <DialogDescription>
            {brand
              ? "Every editable brand field, in one place."
              : "A brand is the company — websites and social accounts attach to it as properties."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {!brand ? (
            <div className="space-y-1">
              <Label className="text-xs">Owning organization</Label>
              <Select
                value={selectedOrgId ?? ""}
                onValueChange={setOrganizationId}
                disabled={orgs.loading}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choose an organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                      {org.is_personal ? " (Personal)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="brand-name" className="text-xs">
                Name
              </Label>
              <Input
                id="brand-name"
                value={draft.name}
                onChange={(event) => set("name")(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="brand-industry" className="text-xs">
                Industry
              </Label>
              <Input
                id="brand-industry"
                value={draft.industry}
                onChange={(event) => set("industry")(event.target.value)}
                placeholder="Electronics recycling, coaching, …"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="brand-description" className="text-xs">
              Description
            </Label>
            <Textarea
              id="brand-description"
              value={draft.description}
              onChange={(event) => set("description")(event.target.value)}
              minHeight={64}
              maxHeight={140}
              placeholder="What this company does"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="brand-website" className="text-xs">
                Primary website URL
              </Label>
              <Input
                id="brand-website"
                value={draft.websiteUrl}
                onChange={(event) => set("websiteUrl")(event.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="brand-logo" className="text-xs">
                Logo URL
              </Label>
              <Input
                id="brand-logo"
                value={draft.logoUrl}
                onChange={(event) => set("logoUrl")(event.target.value)}
                placeholder="https://…/logo.png"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="brand-favicon" className="text-xs">
                Favicon URL
              </Label>
              <Input
                id="brand-favicon"
                value={draft.faviconUrl}
                onChange={(event) => set("faviconUrl")(event.target.value)}
                placeholder="https://…/favicon.ico"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="brand-og" className="text-xs">
                Social image URL
              </Label>
              <Input
                id="brand-og"
                value={draft.ogImageUrl}
                onChange={(event) => set("ogImageUrl")(event.target.value)}
                placeholder="https://…/social-card.jpg"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={draft.status} onValueChange={set("status")}>
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
                  set("visibility")(value as MarketingBrand["visibility"])
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

          <div className="space-y-1">
            <Label htmlFor="brand-notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="brand-notes"
              value={draft.notes}
              onChange={(event) => set("notes")(event.target.value)}
              minHeight={56}
              maxHeight={140}
              placeholder="Internal notes for your team"
            />
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
            {brand ? "Save brand" : "Create brand"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
