"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import type { BrandProfile, MarketingBrand } from "@/features/marketing/types";
import {
  brandProfileToJson,
  parseBrandProfile,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

// Visibility is a read/manage grant, not a sharing-link state. Canonical share
// links are separate token records and never change the brand's visibility.
const VISIBILITY_OPTIONS: Array<{
  value: MarketingBrand["visibility"];
  label: string;
  description: string;
}> = [
  {
    value: "internal",
    label: "Internal (default)",
    description: "Everyone in your organization can view and manage this brand.",
  },
  {
    value: "personal",
    label: "Private",
    description: "Only you can access this brand unless you share it explicitly.",
  },
  {
    value: "public",
    label: "Public",
    description: "Anyone can view this brand; only your organization can manage it.",
  },
];

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
  /** Editorial brand profile fields (web.brand.profile). Lists are one-per-line text. */
  profileAudience: string;
  profileVoiceTone: string;
  profilePositioning: string;
  profileValueProps: string;
  profileOfferings: string;
  profileServiceArea: string;
  profileCompetitors: string;
  profileTargetKeywords: string;
  profileContentGuidelines: string;
  profileNotes: string;
}

/** Multi-line draft → string[]: split on newlines, trim, drop empties. */
function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(value: string[] | undefined): string {
  return value?.join("\n") ?? "";
}

function draftFrom(brand: MarketingBrand | null): BrandDraft {
  const profile = parseBrandProfile(brand?.profile);
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
    visibility: "internal",
    profileAudience: profile.audience ?? "",
    profileVoiceTone: profile.voice_tone ?? "",
    profilePositioning: profile.positioning ?? "",
    profileValueProps: listToLines(profile.value_props),
    profileOfferings: listToLines(profile.offerings),
    profileServiceArea: profile.service_area ?? "",
    profileCompetitors: listToLines(profile.competitors),
    profileTargetKeywords: listToLines(profile.target_keywords),
    profileContentGuidelines: profile.content_guidelines ?? "",
    profileNotes: profile.notes ?? "",
  };
}

function profileFromDraft(draft: BrandDraft): BrandProfile {
  return {
    audience: draft.profileAudience.trim() || undefined,
    voice_tone: draft.profileVoiceTone.trim() || undefined,
    positioning: draft.profilePositioning.trim() || undefined,
    value_props: linesToList(draft.profileValueProps),
    offerings: linesToList(draft.profileOfferings),
    service_area: draft.profileServiceArea.trim() || undefined,
    competitors: linesToList(draft.profileCompetitors),
    target_keywords: linesToList(draft.profileTargetKeywords),
    content_guidelines: draft.profileContentGuidelines.trim() || undefined,
    notes: draft.profileNotes.trim() || undefined,
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
  // Open the profile section by default when the brand already has one
  // authored (the component remounts per open, so this stays stable).
  const [hasProfile] = useState(
    () => Object.keys(parseBrandProfile(brand?.profile)).length > 0,
  );
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
            profile: brandProfileToJson(profileFromDraft(draft)),
          },
        });
        toast.success("Brand saved");
      } else {
        if (!selectedOrgId) {
          toast.error("Choose an owning organization for this brand.");
          return;
        }
        const createdBrand = await createMutation.mutateAsync({
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
          profile: brandProfileToJson(profileFromDraft(draft)),
        });
        // `createBrand` returns the MarketingBrand; the mutation result was
        // being thrown away, so a new brand had no way in from the toast.
        toast.success("Brand created", {
          action: toastDoor("web_brand", createdBrand.id),
        });
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
                  <SelectValue>
                    {
                      VISIBILITY_OPTIONS.find(
                        (option) => option.value === draft.visibility,
                      )?.label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  align="end"
                  className="max-w-[calc(100vw-2rem)] sm:w-[28rem]"
                >
                  {VISIBILITY_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      textValue={option.label}
                      className="items-start py-2"
                    >
                      <span className="block pr-2">
                        <span className="block font-medium">{option.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Share links are managed separately and do not change visibility.
              </p>
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

          <Collapsible defaultOpen={hasProfile} className="rounded-md border border-border">
            <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-left">
              <span className="text-sm font-medium">Brand profile</span>
              <span className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Voice, audience, positioning — the editorial ground truth agents rely on
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-3 border-t border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="brand-profile-audience" className="text-xs">
                    Audience
                  </Label>
                  <Input
                    id="brand-profile-audience"
                    value={draft.profileAudience}
                    onChange={(event) => set("profileAudience")(event.target.value)}
                    placeholder="Who this brand speaks to"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brand-profile-voice" className="text-xs">
                    Voice &amp; tone
                  </Label>
                  <Input
                    id="brand-profile-voice"
                    value={draft.profileVoiceTone}
                    onChange={(event) => set("profileVoiceTone")(event.target.value)}
                    placeholder="Direct, warm, technical, …"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="brand-profile-positioning" className="text-xs">
                  Positioning
                </Label>
                <Textarea
                  id="brand-profile-positioning"
                  value={draft.profilePositioning}
                  onChange={(event) => set("profilePositioning")(event.target.value)}
                  minHeight={48}
                  maxHeight={120}
                  placeholder="How this brand wins against the market"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="brand-profile-value-props" className="text-xs">
                    Value props (one per line)
                  </Label>
                  <Textarea
                    id="brand-profile-value-props"
                    value={draft.profileValueProps}
                    onChange={(event) => set("profileValueProps")(event.target.value)}
                    minHeight={64}
                    maxHeight={140}
                    placeholder={"Certified destruction\nSame-week pickup"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brand-profile-offerings" className="text-xs">
                    Offerings (one per line)
                  </Label>
                  <Textarea
                    id="brand-profile-offerings"
                    value={draft.profileOfferings}
                    onChange={(event) => set("profileOfferings")(event.target.value)}
                    minHeight={64}
                    maxHeight={140}
                    placeholder={"Service one\nService two"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brand-profile-competitors" className="text-xs">
                    Competitors (one per line)
                  </Label>
                  <Textarea
                    id="brand-profile-competitors"
                    value={draft.profileCompetitors}
                    onChange={(event) => set("profileCompetitors")(event.target.value)}
                    minHeight={64}
                    maxHeight={140}
                    placeholder={"Competitor A\nCompetitor B"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brand-profile-keywords" className="text-xs">
                    Target keywords (one per line)
                  </Label>
                  <Textarea
                    id="brand-profile-keywords"
                    value={draft.profileTargetKeywords}
                    onChange={(event) => set("profileTargetKeywords")(event.target.value)}
                    minHeight={64}
                    maxHeight={140}
                    placeholder={"main keyword\nsecondary keyword"}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="brand-profile-service-area" className="text-xs">
                  Service area
                </Label>
                <Input
                  id="brand-profile-service-area"
                  value={draft.profileServiceArea}
                  onChange={(event) => set("profileServiceArea")(event.target.value)}
                  placeholder="Southern California, nationwide, …"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="brand-profile-guidelines" className="text-xs">
                  Content guidelines
                </Label>
                <Textarea
                  id="brand-profile-guidelines"
                  value={draft.profileContentGuidelines}
                  onChange={(event) =>
                    set("profileContentGuidelines")(event.target.value)
                  }
                  minHeight={56}
                  maxHeight={140}
                  placeholder="Do's and don'ts for anyone writing as this brand"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="brand-profile-notes" className="text-xs">
                  Profile notes
                </Label>
                <Textarea
                  id="brand-profile-notes"
                  value={draft.profileNotes}
                  onChange={(event) => set("profileNotes")(event.target.value)}
                  minHeight={56}
                  maxHeight={140}
                  placeholder="Anything else the writing team should know"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
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
