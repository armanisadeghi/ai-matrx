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
import { Input, SegmentedControl } from "@ai-matrx/design-system/controls";
import { BRAND_KIND_COPY, BRAND_KINDS, brandKindOf, type BrandKind } from "@/features/marketing/lib/brand-kind";
import { HandleBrandCreator } from "./HandleBrandCreator";
import { Label } from "@/components/ui/label";
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
  mergeBrandProfile,
  parseBrandProfile,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import { RowAccessControl } from "@/components/row-access/RowAccessControl";
import { publishedToWebPatch, type ShownTo } from "@/lib/row-access";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ProTextarea } from "@/components/official/ProTextarea";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
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
  /** The brand's two row controls (access ladder words). */
  shownTo: ShownTo | null;
  publishedToWeb: boolean;
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
  /** Press expertise profile (web.brand.profile) — read by the source-request responder. */
  pressSpokespersonName: string;
  pressSpokespersonTitle: string;
  pressExpertiseAreas: string;
  pressCredentials: string;
  pressDoNotCommentOn: string;
  pressOutletsToSkip: string;
  pressContactBlock: string;
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
    shownTo: brand?.shown_to ?? null,
    publishedToWeb: brand?.published_to_web ?? false,
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
    pressSpokespersonName: profile.spokesperson_name ?? "",
    pressSpokespersonTitle: profile.spokesperson_title ?? "",
    pressExpertiseAreas: listToLines(profile.expertise_areas),
    pressCredentials: listToLines(profile.credentials),
    pressDoNotCommentOn: listToLines(profile.do_not_comment_on),
    pressOutletsToSkip: listToLines(profile.outlets_to_skip),
    pressContactBlock: profile.contact_block ?? "",
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
    spokesperson_name: draft.pressSpokespersonName.trim() || undefined,
    spokesperson_title: draft.pressSpokespersonTitle.trim() || undefined,
    expertise_areas: linesToList(draft.pressExpertiseAreas),
    credentials: linesToList(draft.pressCredentials),
    do_not_comment_on: linesToList(draft.pressDoNotCommentOn),
    outlets_to_skip: linesToList(draft.pressOutletsToSkip),
    contact_block: draft.pressContactBlock.trim() || undefined,
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
  const userId = useAppSelector(selectUserId);
  const [draft, setDraft] = useState<BrandDraft>(() => draftFrom(brand));
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  // Open the profile section by default when the brand already has one
  // authored (the component remounts per open, so this stays stable).
  const [hasPressProfile] = useState(() => {
    const profile = parseBrandProfile(brand?.profile);
    return Boolean(
      profile.spokesperson_name ||
        profile.expertise_areas?.length ||
        profile.credentials?.length ||
        profile.do_not_comment_on?.length ||
        profile.contact_block,
    );
  });
  const [hasProfile] = useState(
    () => Object.keys(parseBrandProfile(brand?.profile)).length > 0,
  );
  // A failure shows IN the dialog as well as in the toast: a toast can sit under
  // the floating chrome, and a swallowed submit reads as a dead button.
  const [failure, setFailure] = useState<string | null>(null);
  const busy = createMutation.isPending || updateMutation.isPending;
  const selectedOrgId = organizationId ?? orgs.activeOrgId ?? undefined;
  // Company or person; a new brand can start from a website (company) or a social handle (both).
  const [kind, setKind] = useState<BrandKind>(() => brandKindOf(brand));
  const [startFrom, setStartFrom] = useState<"website" | "handle">("website");
  const fromHandle = !brand && (kind === "person" || startFrom === "handle");

  const set =
    <K extends keyof BrandDraft>(key: K) =>
    (value: BrandDraft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setFailure(null);
    const name = draft.name.trim();
    if (!name) {
      setFailure("Brand name is required.");
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
            kind,
            // A company names no person; the database refuses a person link on one.
            ...(kind === "company" ? { person_party_id: null, person_user_id: null } : {}),
            shown_to: draft.shownTo,
            ...(draft.publishedToWeb !== brand.published_to_web
              ? publishedToWebPatch(draft.publishedToWeb, userId)
              : {}),
            // Merged, never replaced: keys this editor does not own survive.
            // The Messaging / Claims pages own the fundamentals; carry them through.
            profile: mergeBrandProfile(brand.profile, {
              ...parseBrandProfile(brand.profile),
              ...profileFromDraft(draft),
            }),
          },
        });
        toast.success("Brand saved");
      } else {
        if (!selectedOrgId) {
          setFailure("Choose an owning organization for this brand.");
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
          kind,
          ...(draft.shownTo !== null ? { shownTo: draft.shownTo } : {}),
          ...(draft.publishedToWeb ? { publishedToWeb: true } : {}),
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
      const message = extractErrorMessage(error);
      setFailure(
        `${brand ? "Could not save brand" : "Could not create brand"}: ${message}`,
      );
      toast.error(brand ? "Could not save brand" : "Could not create brand", {
        description: message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      {/* The card ends above what floats at the bottom (assists dock): it is
          centred, so twice the measured runway comes off its height. */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-h-[min(90dvh,calc(100dvh-2*var(--matrx-floating-clearance,0px)))] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{brand ? `Edit ${brand.name}` : "Add brand"}</DialogTitle>
          <DialogDescription>
            {brand ? "Every editable brand field, in one place." : BRAND_KIND_COPY[kind].createDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2" data-testid="brand-kind-choice">
          <SegmentedControl
            aria-label="Brand kind"
            value={kind}
            onValueChange={(next) => setKind(next as BrandKind)}
            data={BRAND_KINDS.map((k) => ({ value: k, label: BRAND_KIND_COPY[k].label }))}
          />
          <span className="text-[11px] text-muted-foreground">{BRAND_KIND_COPY[kind].hint}</span>
          {!brand && kind === "company" ? (
            <div className="ml-auto">
              <SegmentedControl
                aria-label="Start from"
                value={startFrom}
                onValueChange={(next) => setStartFrom(next as "website" | "handle")}
                data={[
                  { value: "website", label: "Website" },
                  { value: "handle", label: "Social handle" },
                ]}
              />
            </div>
          ) : null}
        </div>

        {fromHandle && !brand ? (
          <>
            {orgs.organizations.length > 1 ? (
              <div className="space-y-1">
                <Label className="text-xs">Owning organization</Label>
                <Select value={selectedOrgId ?? ""} onValueChange={setOrganizationId} disabled={orgs.loading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <HandleBrandCreator
              key={`${kind}:${selectedOrgId ?? ""}`}
              kind={kind}
              organizationId={selectedOrgId}
              onClose={() => onOpenChange(false)}
            />
          </>
        ) : (
        <>
        <div className="grid gap-3">
          {!brand ? (
            <div className="space-y-1">
              <Label className="text-xs">Owning organization</Label>
              <Select
                value={selectedOrgId ?? ""}
                onValueChange={setOrganizationId}
                disabled={orgs.loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
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
            <ProTextarea
              id="brand-description"
              data-edit-target="description"
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
                <SelectTrigger>
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
              <Label className="text-xs">Who sees it</Label>
              <div>
                <RowAccessControl
                  staged
                  size="default"
                  value={{
                    shownTo: draft.shownTo,
                    publishedToWeb: draft.publishedToWeb,
                  }}
                  save={async (patch) => {
                    setDraft((current) => ({
                      ...current,
                      ...(patch.shownTo !== undefined
                        ? { shownTo: patch.shownTo }
                        : {}),
                      ...(patch.publishedToWeb !== undefined
                        ? { publishedToWeb: patch.publishedToWeb }
                        : {}),
                    }));
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Applied when you save. Anyone links are made in Share.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="brand-notes" className="text-xs">
              Notes
            </Label>
            <ProTextarea
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
                <ProTextarea
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
                  <ProTextarea
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
                  <ProTextarea
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
                  <ProTextarea
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
                  <ProTextarea
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
                <ProTextarea
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
                <ProTextarea
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

          <Collapsible defaultOpen={hasPressProfile} className="rounded-md border border-border">
            <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-left">
              <span className="text-sm font-medium">Press expertise</span>
              <span className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Who speaks to reporters, on what, and what to decline
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-3 border-t border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="brand-press-spokesperson" className="text-xs">
                    Spokesperson
                  </Label>
                  <Input
                    id="brand-press-spokesperson"
                    value={draft.pressSpokespersonName}
                    onChange={(event) => set("pressSpokespersonName")(event.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brand-press-spokesperson-title" className="text-xs">
                    Spokesperson title
                  </Label>
                  <Input
                    id="brand-press-spokesperson-title"
                    value={draft.pressSpokespersonTitle}
                    onChange={(event) => set("pressSpokespersonTitle")(event.target.value)}
                    placeholder="Founder & CEO"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="brand-press-expertise" className="text-xs">
                    Speaks on (one per line)
                  </Label>
                  <ProTextarea
                    id="brand-press-expertise"
                    value={draft.pressExpertiseAreas}
                    onChange={(event) => set("pressExpertiseAreas")(event.target.value)}
                    minHeight={64}
                    maxHeight={140}
                    placeholder={"E-waste recycling law\nData destruction"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brand-press-credentials" className="text-xs">
                    Credentials (one per line)
                  </Label>
                  <ProTextarea
                    id="brand-press-credentials"
                    value={draft.pressCredentials}
                    onChange={(event) => set("pressCredentials")(event.target.value)}
                    minHeight={64}
                    maxHeight={140}
                    placeholder={"R2v3 certified since 2019\n20 years in ITAD"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brand-press-avoid" className="text-xs">
                    Never comments on (one per line)
                  </Label>
                  <ProTextarea
                    id="brand-press-avoid"
                    value={draft.pressDoNotCommentOn}
                    onChange={(event) => set("pressDoNotCommentOn")(event.target.value)}
                    minHeight={64}
                    maxHeight={140}
                    placeholder={"Politics\nCompetitors by name"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brand-press-skip-outlets" className="text-xs">
                    Outlets to skip (one per line)
                  </Label>
                  <ProTextarea
                    id="brand-press-skip-outlets"
                    value={draft.pressOutletsToSkip}
                    onChange={(event) => set("pressOutletsToSkip")(event.target.value)}
                    minHeight={64}
                    maxHeight={140}
                    placeholder={"tabloid.example"}
                  />
                </div>
              </div>
                <div className="space-y-1">
                  <Label htmlFor="brand-press-contact" className="text-xs">
                    Contact block (signed exactly as written)
                  </Label>
                  <ProTextarea
                    id="brand-press-contact"
                    value={draft.pressContactBlock}
                    onChange={(event) => set("pressContactBlock")(event.target.value)}
                    minHeight={56}
                    maxHeight={140}
                    placeholder={"Jane Doe, Founder\njane@example.com · 555-0100"}
                  />
                </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {failure ? (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button icon={busy ? <Loader2 className="animate-spin" /> : null} variant="primary" disabled={busy} onClick={() => void save()}>
            {brand ? "Save brand" : "Create brand"}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
