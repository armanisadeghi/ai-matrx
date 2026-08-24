"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  Check,
  Copy,
  MapPin,
  Plus,
  Star,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
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
import { Textarea } from "@/components/ui/textarea";
import {
  InlineQueryError,
  LoadingSurface,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  useBrandSites,
  useBusinessLocations,
  useSiteRootStructuredData,
  useCreateBusinessLocation,
  useListingPublishers,
  useLocationListings,
  useUpdateBusinessLocation,
  useUpsertLocationListing,
  useVisibleBrandOptions,
} from "@/features/marketing/data/hooks";
import { buildListingMatrix } from "@/features/marketing/data/service";
import {
  auditListingNap,
  computeCitationCoverage,
  findProfileGaps,
} from "@/features/marketing/lib/local-listings-audit";
import {
  asJsonLdBlocks,
  buildLocalBusinessJsonLd,
  findLocalBusinessJsonLd,
  localBusinessJsonLdScript,
} from "@/features/marketing/lib/local-business-jsonld";
import { parseSnapshotStructuredData } from "@/features/marketing/lib/snapshot-content";
import {
  LISTING_STATUSES,
  LISTING_STATUS_LABELS,
  LOCATION_STATUSES,
  LOCATION_STATUS_LABELS,
  PUBLISHER_API_ACCESS_LABELS,
  PUBLISHER_TIER_LABELS,
  isListingStatus,
  type BusinessLocation,
  type ListingMatrixRow,
  type ListingStatus,
  type LocationListing,
  type PublisherTier,
} from "@/features/marketing/types";
import { useQueryClient } from "@tanstack/react-query";
import {
  marketingKeys,
  useBusinessFacts,
} from "@/features/marketing/data/hooks";
import {
  AUTOFILL_SOURCE_LABELS,
  buildProfileSuggestions,
  observedFromListings,
  type ProfileSuggestion,
} from "@/features/marketing/local/profile-autofill";
import { checkGoogleListing } from "@/features/marketing/local/data";
import { EndowmentAnalysisCard } from "@/features/marketing/local/EndowmentAnalysisCard";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { marketingRoutes } from "@/features/marketing/lib/routes";

const TIER_BADGE_CLASS: Record<PublisherTier, string> = {
  critical: "bg-primary/15 text-primary",
  aggregator: "bg-accent text-accent-foreground",
  high_value: "bg-muted text-foreground",
  vertical: "bg-muted text-muted-foreground",
  long_tail: "bg-muted text-muted-foreground",
};

function scoreTone(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

/** Path-backed brand + location selection: shareable, reload-safe, and canonical. */
function useRouteSelection(fixedBrandId?: string, fixedLocationId?: string) {
  const router = useRouter();
  const brandId = fixedBrandId ?? "";
  const locationId = fixedLocationId ?? "";
  return {
    brandId,
    locationId,
    selectBrand: (nextBrandId: string) =>
      router.push(marketingRoutes.brandLocal(nextBrandId)),
    selectLocation: (nextLocationId: string) => {
      if (brandId)
        router.push(marketingRoutes.brandLocation(brandId, nextLocationId));
    },
  };
}

export default function LocalListingsWorkspace({
  brandId: fixedBrandId,
  locationId: fixedLocationId,
}: {
  brandId?: string;
  locationId?: string;
} = {}) {
  const { brandId, locationId, selectBrand, selectLocation } =
    useRouteSelection(fixedBrandId, fixedLocationId);
  const brandsQuery = useVisibleBrandOptions();

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="flex w-full flex-col gap-3 p-3 pt-[calc(var(--shell-header-h)+0.75rem)] sm:p-4 sm:pt-[calc(var(--shell-header-h)+1rem)]">
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" aria-hidden />
          <Label
            htmlFor="local-brand-picker"
            className="text-xs text-muted-foreground"
          >
            Brand
          </Label>
          <Select value={brandId} onValueChange={selectBrand}>
            <SelectTrigger id="local-brand-picker" className="h-8 w-64">
              <SelectValue placeholder="Pick a brand" />
            </SelectTrigger>
            <SelectContent>
              {(brandsQuery.data ?? []).map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {brandId ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
            >
              <Link href={`/marketing/brands/${brandId}`}>
                Open brand
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
        {brandsQuery.isError ? (
          <InlineQueryError
            what="brands"
            error={brandsQuery.error}
            onRetry={() => void brandsQuery.refetch()}
          />
        ) : null}
        {brandId ? (
          <BrandLocations
            organizationId={
              (brandsQuery.data ?? []).find((brand) => brand.id === brandId)
                ?.organization_id ?? ""
            }
            brandId={brandId}
            locationId={locationId}
            onSelectLocation={selectLocation}
          />
        ) : brandsQuery.isSuccess && (brandsQuery.data ?? []).length === 0 ? (
          <SectionCard title="No brands yet">
            <p className="text-sm text-muted-foreground">
              Locations belong to a brand. Create one under{" "}
              <Link
                className="text-primary underline-offset-2 "
                href="/marketing/brands"
              >
                Brands &amp; Websites
              </Link>{" "}
              first, then manage its locations and listings here.
            </p>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

function BrandLocations({
  organizationId,
  brandId,
  locationId,
  onSelectLocation,
}: {
  organizationId: string;
  brandId: string;
  locationId: string;
  onSelectLocation: (id: string) => void;
}) {
  const router = useRouter();
  const locationsQuery = useBusinessLocations(brandId);
  const createLocation = useCreateBusinessLocation();
  const [newName, setNewName] = useState("");

  const locations = locationsQuery.data ?? [];
  const selected = locationId
    ? (locations.find((location) => location.id === locationId) ?? null)
    : (locations[0] ?? null);
  const selectedId = selected?.id;

  useEffect(() => {
    if (!locationId && selectedId) {
      router.replace(marketingRoutes.brandLocation(brandId, selectedId));
    }
  }, [brandId, locationId, router, selectedId]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await createLocation.mutateAsync({
        organizationId,
        brandId,
        name,
      });
      setNewName("");
      onSelectLocation(created.id);
      toast.success(`Location "${created.name}" created`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create the location.",
      );
    }
  };

  if (locationsQuery.isPending)
    return <LoadingSurface label="Loading locations…" />;
  if (locationsQuery.isError) {
    return (
      <InlineQueryError
        what="locations"
        error={locationsQuery.error}
        onRetry={() => void locationsQuery.refetch()}
      />
    );
  }

  if (locationId && !selected) {
    return (
      <SectionCard title="Location unavailable" className="min-w-0 flex-1">
        <div className="p-3">
          <p className="text-sm text-muted-foreground">
            This location is not part of the brand named in the URL, or you no
            longer have access to it.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={marketingRoutes.brandLocal(brandId)}>
              Open this brand&apos;s locations
            </Link>
          </Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="flex w-full shrink-0 flex-col gap-2 lg:w-56 xl:w-64">
        <div className="flex items-center gap-1.5">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCreate();
            }}
            placeholder="New location name"
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            className="h-8 shrink-0 gap-1 px-2"
            onClick={() => void handleCreate()}
            disabled={createLocation.isPending || newName.trim() === ""}
          >
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        </div>
        <nav aria-label="Locations" className="flex flex-col gap-1">
          {locations.map((location) => (
            <button
              key={location.id}
              type="button"
              onClick={() => onSelectLocation(location.id)}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors ${
                selected?.id === location.id
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <MapPin
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{location.name}</span>
              {location.is_primary ? (
                <Star
                  className="size-3 shrink-0 text-amber-500"
                  aria-label="Primary location"
                />
              ) : null}
            </button>
          ))}
          {locations.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-2 py-3 text-xs text-muted-foreground">
              No locations yet. Add the first physical or service location above
              — it becomes the canonical profile every directory listing is
              checked against.
            </p>
          ) : null}
        </nav>
      </div>
      {selected ? (
        <LocationWorkspace key={selected.id} location={selected} />
      ) : null}
    </div>
  );
}

function LocationWorkspace({ location }: { location: BusinessLocation }) {
  const publishersQuery = useListingPublishers();
  const listingsQuery = useLocationListings(location.id);
  // access-errors: ok — confirmed-facts enrichment for profile suggestions; suggestions simply have less evidence without it
  const factsQuery = useBusinessFacts(location.brand_id);
  // access-errors: ok — homepage-evidence lookup; OnSiteSchemaCard states plainly when no site evidence exists
  const sitesQuery = useBrandSites(location.brand_id);
  const site = (sitesQuery.data ?? [])[0] ?? null;
  const evidenceQuery = useSiteRootStructuredData(site?.id ?? "");

  const suggestions = useMemo(() => {
    const parsed = evidenceQuery.data
      ? parseSnapshotStructuredData(evidenceQuery.data.structuredData)
      : null;
    const siteObserved = parsed
      ? (findLocalBusinessJsonLd(
          asJsonLdBlocks([
            ...parsed.jsonLd,
            ...parsed.blocks.map((b) => b.data),
          ]),
        )?.observed ?? null)
      : null;
    return buildProfileSuggestions(location, {
      googleObserved: observedFromListings(listingsQuery.data ?? []),
      siteObserved,
      facts: factsQuery.data ?? [],
    });
  }, [location, listingsQuery.data, factsQuery.data, evidenceQuery.data]);

  const matrix = useMemo(
    () =>
      buildListingMatrix(publishersQuery.data ?? [], listingsQuery.data ?? []),
    [publishersQuery.data, listingsQuery.data],
  );
  const coverage = useMemo(() => computeCitationCoverage(matrix), [matrix]);
  const gaps = useMemo(() => findProfileGaps(location), [location]);

  const napScores = useMemo(() => {
    const scores: number[] = [];
    for (const row of matrix) {
      if (!row.listing) continue;
      const audit = auditListingNap(location, row.listing.observed);
      if (audit.score !== null) scores.push(audit.score);
    }
    return scores;
  }, [matrix, location]);
  const napAverage =
    napScores.length === 0
      ? null
      : Math.round(
          napScores.reduce((sum, score) => sum + score, 0) / napScores.length,
        );

  // The listing matrix and its KPI tiles are the point of this workspace — a
  // failed read rendering "0% coverage" would assert a gap nobody verified.
  if (publishersQuery.isError || listingsQuery.isError) {
    const failed = publishersQuery.isError ? publishersQuery : listingsQuery;
    return (
      <div className="flex min-w-0 flex-1 flex-col">
        <InlineQueryError
          what="directory listings"
          error={failed.error}
          onRetry={() => {
            void publishersQuery.refetch();
            void listingsQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiTile
          label="Citation coverage"
          value={`${coverage.score}%`}
          tone={scoreTone(coverage.score)}
          detail={`${coverage.presentCount} of ${coverage.totalPublishers} publishers`}
        />
        <KpiTile
          label="Profile completeness"
          value={`${Math.max(0, 11 - gaps.length)}/11`}
          tone={scoreTone(Math.round(((11 - gaps.length) / 11) * 100))}
          detail={
            gaps.length === 0
              ? "Submission-ready"
              : `${gaps.length} field${gaps.length === 1 ? "" : "s"} missing`
          }
        />
        <KpiTile
          label="NAP consistency"
          value={napAverage === null ? "—" : `${napAverage}%`}
          tone={
            napAverage === null
              ? "text-muted-foreground"
              : scoreTone(napAverage)
          }
          detail={
            napAverage === null
              ? "No observed listing data yet"
              : `${napScores.length} listing${napScores.length === 1 ? "" : "s"} audited`
          }
        />
        <KpiTile
          label="Needs attention"
          value={String(coverage.attention.length)}
          tone={
            coverage.attention.length === 0
              ? "text-muted-foreground"
              : "text-amber-600 dark:text-amber-400"
          }
          detail="Updates, duplicates, rejections"
        />
      </div>

      <ProfileEditor
        location={location}
        gaps={gaps}
        suggestions={suggestions}
      />
      <OnSiteSchemaCard location={location} />
      <ListingsMatrix
        organizationId={location.organization_id}
        location={location}
        matrix={matrix}
      />
      <JsonLdCard location={location} />
      <EndowmentAnalysisCard
        brandId={location.brand_id}
        organizationId={location.organization_id}
        defaultCompany={location.name}
        defaultIndustry={location.business_type ?? ""}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string;
  tone: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

type ProfileDraft = {
  name: string;
  status: string;
  street_address: string;
  address_line2: string;
  locality: string;
  region: string;
  postal_code: string;
  country_code: string;
  phone: string;
  email: string;
  website_url: string;
  business_type: string;
  description: string;
};

function draftFrom(location: BusinessLocation): ProfileDraft {
  return {
    name: location.name,
    status: location.status,
    street_address: location.street_address ?? "",
    address_line2: location.address_line2 ?? "",
    locality: location.locality ?? "",
    region: location.region ?? "",
    postal_code: location.postal_code ?? "",
    country_code: location.country_code ?? "",
    phone: location.phone ?? "",
    email: location.email ?? "",
    website_url: location.website_url ?? "",
    business_type: location.business_type ?? "",
    description: location.description ?? "",
  };
}

function ProfileEditor({
  location,
  gaps,
  suggestions,
}: {
  location: BusinessLocation;
  gaps: ReturnType<typeof findProfileGaps>;
  suggestions: ProfileSuggestion[];
}) {
  const updateLocation = useUpdateBusinessLocation();
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(location));
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(draftFrom(location)),
    [draft, location],
  );

  // Suggestions apply against fields the user hasn't touched in THIS draft either.
  const applicable = suggestions.filter(
    (s) => (draft[s.field as keyof ProfileDraft] ?? "").trim() === "",
  );
  const applySuggestions = (items: ProfileSuggestion[]) => {
    setDraft((current) => {
      const next = { ...current };
      for (const item of items) {
        if ((next[item.field as keyof ProfileDraft] ?? "").trim() === "") {
          next[item.field as keyof ProfileDraft] = item.value;
        }
      }
      return next;
    });
  };

  const field = (key: keyof ProfileDraft) => ({
    value: draft[key],
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft((current) => ({ ...current, [key]: event.target.value })),
  });

  const handleSave = async () => {
    const toNullable = (value: string) =>
      value.trim() === "" ? null : value.trim();
    try {
      await updateLocation.mutateAsync({
        locationId: location.id,
        expectedVersion: location.version,
        patch: {
          name: draft.name.trim() || location.name,
          status: draft.status,
          street_address: toNullable(draft.street_address),
          address_line2: toNullable(draft.address_line2),
          locality: toNullable(draft.locality),
          region: toNullable(draft.region),
          postal_code: toNullable(draft.postal_code),
          country_code: toNullable(draft.country_code),
          phone: toNullable(draft.phone),
          email: toNullable(draft.email),
          website_url: toNullable(draft.website_url),
          business_type: toNullable(draft.business_type),
          description: toNullable(draft.description),
        },
      });
      toast.success("Location profile saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the profile.",
      );
    }
  };

  return (
    <SectionCard
      title="Canonical profile"
      anchor="local-profile"
      headerExtra={
        <Button
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={() => void handleSave()}
          disabled={!dirty || updateLocation.isPending}
        >
          {updateLocation.isPending ? "Saving…" : "Save"}
        </Button>
      }
    >
      <div className="p-3">
        {applicable.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 p-2">
            <p className="mr-1 text-xs font-medium text-foreground">
              Found data for {applicable.length} empty field
              {applicable.length === 1 ? "" : "s"}:
            </p>
            {applicable.map((s) => (
              <button
                key={s.field}
                type="button"
                onClick={() => applySuggestions([s])}
                className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground hover:bg-muted"
                title={`From ${AUTOFILL_SOURCE_LABELS[s.source]}`}
              >
                {s.field.replace(/_/g, " ")}:{" "}
                {s.value.length > 28 ? `${s.value.slice(0, 28)}…` : s.value}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => applySuggestions(applicable)}
            >
              Apply all
            </Button>
            <p className="w-full text-[10px] text-muted-foreground">
              Sources: live Google listing, your site&apos;s structured data,
              confirmed brand facts. Nothing saves until you review and hit
              Save.
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <LabeledInput label="Location name" required {...field("name")} />
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={draft.status}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, status: value }))
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATION_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {LOCATION_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <LabeledInput
            label="Business type (schema.org)"
            placeholder="e.g. MedicalClinic, Restaurant"
            {...field("business_type")}
          />
          <LabeledInput label="Street address" {...field("street_address")} />
          <LabeledInput label="Suite / line 2" {...field("address_line2")} />
          <LabeledInput label="City" {...field("locality")} />
          <LabeledInput label="State / region" {...field("region")} />
          <LabeledInput label="Postal code" {...field("postal_code")} />
          <LabeledInput
            label="Country code"
            placeholder="US"
            {...field("country_code")}
          />
          <LabeledInput
            label="Phone"
            placeholder="+1 555 555 5555"
            {...field("phone")}
          />
          <LabeledInput label="Email" {...field("email")} />
          <LabeledInput label="Website URL" {...field("website_url")} />
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">
            Description (used for submissions)
          </Label>
          <Textarea rows={2} className="text-sm" {...field("description")} />
        </div>
        {gaps.length > 0 ? (
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
            <p className="text-xs font-medium text-foreground">
              Before submitting anywhere, complete {gaps.length} field
              {gaps.length === 1 ? "" : "s"}:
            </p>
            <ul className="mt-1 space-y-0.5">
              {gaps.map((gap) => (
                <li key={gap.field} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {gap.label}
                  </span>{" "}
                  — {gap.why}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" aria-hidden />
            Profile is submission-ready — every field publishers require is
            filled.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function LabeledInput({
  label,
  required,
  ...inputProps
}: { label: string; required?: boolean } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input className="h-8 text-sm" {...inputProps} />
    </div>
  );
}

const GOOGLE_PUBLISHER_SLUG = "google-business-profile";

/** The saved status of one matrix row — "unknown" when nothing is recorded. */
function rowStatus(row: ListingMatrixRow): ListingStatus {
  return row.listing && isListingStatus(row.listing.status)
    ? row.listing.status
    : "unknown";
}

function ListingsMatrix({
  organizationId,
  location,
  matrix,
}: {
  organizationId: string;
  location: BusinessLocation;
  matrix: ListingMatrixRow[];
}) {
  const upsertListing = useUpsertLocationListing();
  const [savingPublisherId, setSavingPublisherId] = useState<string | null>(
    null,
  );
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [checkingGoogle, setCheckingGoogle] = useState(false);

  const handleGoogleCheck = async () => {
    setCheckingGoogle(true);
    try {
      const result = await checkGoogleListing(location.id, dispatch);
      if (result.snapshot.found) {
        toast.success(
          `Google listing found: ${result.snapshot.name ?? "unnamed"} — live data saved, NAP audit updated.`,
        );
      } else {
        toast.info(
          `No Google listing found for "${result.snapshot.keyword}". Recorded as not listed; try a different search phrase from the location profile if the business exists under another name.`,
        );
      }
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "location"],
      });
      void queryClient.invalidateQueries({
        queryKey: [...marketingKeys.root, "brand"],
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Google listing check failed.",
      );
    } finally {
      setCheckingGoogle(false);
    }
  };

  const handleStatus = async (publisherId: string, status: ListingStatus) => {
    setSavingPublisherId(publisherId);
    try {
      await upsertListing.mutateAsync({
        organizationId,
        locationId: location.id,
        publisherId,
        status,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save the listing status.",
      );
    } finally {
      setSavingPublisherId(null);
    }
  };

  const handleUrl = async (
    publisherId: string,
    currentStatus: ListingStatus,
    listingUrl: string,
  ) => {
    setSavingPublisherId(publisherId);
    try {
      await upsertListing.mutateAsync({
        organizationId,
        locationId: location.id,
        publisherId,
        status:
          currentStatus === "unknown" || currentStatus === "not_listed"
            ? "listed"
            : currentStatus,
        listingUrl: listingUrl.trim() === "" ? null : listingUrl.trim(),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save the listing URL.",
      );
    } finally {
      setSavingPublisherId(null);
    }
  };

  /**
   * P26 — ONE table. The publisher matrix picks which columns show; the
   * canonical table owns whether they sort and filter, so "which tier-1
   * publishers am I still missing" is a click instead of a read-through.
   * Status and Listing URL stay live WRITE cells — sorting a column does not
   * make its control decorative.
   */
  const columns: MatrxColumnDef<ListingMatrixRow>[] = [
    {
      id: "publisher",
      accessorFn: (row) => row.publisher.name,
      header: "Publisher",
      filter: "text",
      cell: ({ publisher, listing }) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="truncate font-medium text-foreground"
              title={publisher.api_notes ?? undefined}
            >
              {publisher.name}
            </span>
            {publisher.slug === GOOGLE_PUBLISHER_SLUG ? (
              <Button
                variant="outline"
                size="sm"
                className="h-6 shrink-0 px-2 text-[11px]"
                onClick={() => void handleGoogleCheck()}
                disabled={checkingGoogle}
              >
                {checkingGoogle ? "Checking live…" : "Fetch live data"}
              </Button>
            ) : null}
            {publisher.manage_url ? (
              <a
                href={publisher.manage_url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-primary"
                aria-label={`Open ${publisher.name} listing manager`}
              >
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
          {listing &&
          listing.observed &&
          Object.keys(listing.observed as object).length > 0 ? (
            <ObservedVerdictLine location={location} listing={listing} />
          ) : publisher.api_notes ? (
            <p
              className="mt-0.5 line-clamp-1 max-w-96 text-[11px] text-muted-foreground"
              title={publisher.api_notes}
            >
              {publisher.api_notes}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "tier",
      accessorFn: (row) =>
        PUBLISHER_TIER_LABELS[row.publisher.tier as PublisherTier] ??
        row.publisher.tier,
      header: "Tier",
      filter: "select",
      width: 170,
      cell: ({ publisher }) => {
        const tier = publisher.tier as PublisherTier;
        return (
          <Badge
            variant="outline"
            className={`border-transparent text-[11px] ${TIER_BADGE_CLASS[tier] ?? "bg-muted"}`}
          >
            {PUBLISHER_TIER_LABELS[tier] ?? publisher.tier}
            {publisher.is_aggregator ? " · feeds others" : ""}
          </Badge>
        );
      },
    },
    {
      id: "api_access",
      accessorFn: (row) =>
        PUBLISHER_API_ACCESS_LABELS[row.publisher.api_access] ??
        row.publisher.api_access,
      header: "API access",
      filter: "select",
      width: 160,
      cell: ({ publisher }) => (
        <span className="text-xs text-muted-foreground">
          {PUBLISHER_API_ACCESS_LABELS[publisher.api_access] ??
            publisher.api_access}
        </span>
      ),
    },
    {
      id: "impact",
      accessorFn: (row) => row.publisher.citation_weight,
      header: "Impact",
      filter: "number",
      align: "right",
      width: 100,
      cell: ({ publisher }) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {publisher.citation_weight}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => LISTING_STATUS_LABELS[rowStatus(row)],
      header: "Status",
      filter: "select",
      width: 170,
      cell: (row) => (
        <Select
          value={rowStatus(row)}
          onValueChange={(value) => {
            if (isListingStatus(value))
              void handleStatus(row.publisher.id, value);
          }}
          disabled={savingPublisherId === row.publisher.id}
        >
          <SelectTrigger className="h-7 w-32 text-xs xl:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LISTING_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {LISTING_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: "listing_url",
      accessorFn: (row) => row.listing?.listing_url ?? "",
      header: "Listing URL",
      filter: "text",
      cell: (row) => (
        <div className="flex items-center gap-1">
          <Input
            /* Keyed on the saved value so a write (or a sort that moves this
               row) re-seeds the uncontrolled input instead of showing the
               previous publisher's URL. */
            key={row.listing?.listing_url ?? ""}
            defaultValue={row.listing?.listing_url ?? ""}
            placeholder="https://…"
            className="h-7 w-full min-w-40 max-w-72 text-xs"
            onBlur={(event) => {
              const next = event.target.value;
              if ((row.listing?.listing_url ?? "") !== next.trim()) {
                void handleUrl(row.publisher.id, rowStatus(row), next);
              }
            }}
          />
          {row.listing?.listing_url ? (
            <a
              href={row.listing.listing_url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-primary"
              aria-label={`Open the live listing on ${row.publisher.name}`}
            >
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <SectionCard title="Listings by publisher" anchor="local-listings-matrix">
      <div className="p-3">
        <MatrxDataTable<ListingMatrixRow>
          data={matrix}
          columns={columns}
          getRowId={(row) => row.publisher.id}
          /* Paged, not all 814 at once: the old hand-table mounted a Select and
             an Input for every publisher in the registry on first paint. Sort,
             filter and search are what make a page enough. */
          zebra
          copy={{
            label: "Publisher listing",
            listLabel: "Listings by publisher",
            location: `/marketing/local/${location.id}#local-listings-matrix`,
            rowKind: "location_listing_row",
            listKind: "location_listing_matrix",
            humanRow: (row) =>
              `${row.publisher.name} — ${LISTING_STATUS_LABELS[rowStatus(row)]}${row.listing?.listing_url ? ` (${row.listing.listing_url})` : ""}`,
          }}
        />
      </div>
      <p className="px-3 pb-3 text-xs text-muted-foreground">
        Impact is each publisher&apos;s relative citation weight (0–100).
        Aggregators feed dozens of secondary directories, so covering them
        closes long-tail gaps automatically.
      </p>
    </SectionCard>
  );
}

/**
 * Does the brand's own website already declare this business as LocalBusiness
 * JSON-LD? Reads the latest crawler snapshot of the site homepage — real
 * extracted evidence, never an assertion — and audits the declared NAP against
 * the canonical profile.
 */
function OnSiteSchemaCard({ location }: { location: BusinessLocation }) {
  // access-errors: ok — resolves which site to read evidence from; the evidence read below surfaces its own InlineQueryError
  const sitesQuery = useBrandSites(location.brand_id);
  const site = (sitesQuery.data ?? [])[0] ?? null;
  const evidenceQuery = useSiteRootStructuredData(site?.id ?? "");

  const verdict = useMemo(() => {
    if (!evidenceQuery.data) return null;
    const parsed = parseSnapshotStructuredData(
      evidenceQuery.data.structuredData,
    );
    const declared = findLocalBusinessJsonLd(
      asJsonLdBlocks([
        ...parsed.jsonLd,
        ...parsed.blocks.map((block) => block.data),
      ]),
    );
    if (!declared)
      return {
        declared: null,
        audit: null,
        capturedAt: evidenceQuery.data.capturedAt,
      };
    return {
      declared,
      audit: auditListingNap(location, declared.observed),
      capturedAt: evidenceQuery.data.capturedAt,
    };
  }, [evidenceQuery.data, location]);

  return (
    <SectionCard
      title="On-site structured data (crawled evidence)"
      anchor="local-onsite-schema"
    >
      {!site ? (
        <p className="text-sm text-muted-foreground">
          This brand has no website in the platform yet, so there is nothing to
          check. Add one under{" "}
          <Link
            className="text-primary underline-offset-2 "
            href="/marketing/sites"
          >
            Websites
          </Link>
          .
        </p>
      ) : evidenceQuery.isPending ? (
        <p className="text-sm text-muted-foreground">
          Reading the latest homepage crawl…
        </p>
      ) : evidenceQuery.isError ? (
        <InlineQueryError
          what="homepage evidence"
          error={evidenceQuery.error}
          onRetry={() => void evidenceQuery.refetch()}
        />
      ) : !evidenceQuery.data ? (
        <p className="text-sm text-muted-foreground">
          {site.root_url ?? site.name} has never had its homepage crawled, so
          there is no evidence to check yet. Run a crawl from{" "}
          <Link
            className="text-primary underline-offset-2 "
            href={`/marketing/sites/${site.id}`}
          >
            the site workspace
          </Link>
          .
        </p>
      ) : !verdict?.declared ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-sm">
          <p className="font-medium text-foreground">
            The homepage of {site.root_url ?? site.name} declares NO
            LocalBusiness structured data.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Google cannot connect the site to this location without it. Fix:
            copy the generated LocalBusiness JSON-LD below onto the site.
            Evidence: latest crawl
            {verdict?.capturedAt
              ? ` (${new Date(verdict.capturedAt).toLocaleDateString()})`
              : ""}
            .
          </p>
        </div>
      ) : (
        <div className="text-sm">
          <p className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" aria-hidden />
            Declared as {verdict.declared.types.join(", ")}
          </p>
          {verdict.audit && verdict.audit.score !== null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Declared NAP matches the canonical profile {verdict.audit.score}%
              (
              {verdict.audit.mismatches.length === 0
                ? "no mismatches"
                : verdict.audit.mismatches
                    .map(
                      (m) =>
                        `${m.field}: site says "${m.observed}", profile says "${m.canonical}"`,
                    )
                    .join("; ")}
              ).
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              The declared block carries no comparable NAP fields — enrich it
              with the generated JSON-LD below.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/** One-line verdict over a listing's extracted data: match score + the exact disagreements. */
function ObservedVerdictLine({
  location,
  listing,
}: {
  location: BusinessLocation;
  listing: LocationListing;
}) {
  const audit = auditListingNap(location, listing.observed);
  const checked = listing.last_checked_at
    ? new Date(listing.last_checked_at).toLocaleDateString()
    : null;
  if (audit.score === null) {
    return (
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Live data captured{checked ? ` ${checked}` : ""} ({listing.source}) — no
        comparable NAP fields yet.
      </p>
    );
  }
  return (
    <p className="mt-0.5 max-w-96 text-[11px]">
      <span
        className={
          audit.mismatches.length === 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-amber-600 dark:text-amber-400"
        }
      >
        Live NAP match {audit.score}%
      </span>
      <span className="text-muted-foreground">
        {" "}
        ({listing.source}
        {checked ? `, ${checked}` : ""})
        {audit.mismatches.length > 0
          ? ` — ${audit.mismatches
              .map(
                (m) =>
                  `${m.field}: listing says "${m.observed}", profile says "${m.canonical}"`,
              )
              .join("; ")}`
          : " — every comparable field agrees"}
      </span>
    </p>
  );
}

function JsonLdCard({ location }: { location: BusinessLocation }) {
  const [copied, setCopied] = useState(false);
  const script = useMemo(
    () => localBusinessJsonLdScript(buildLocalBusinessJsonLd(location)),
    [location],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select the code and copy manually.");
    }
  };

  return (
    <SectionCard
      title="LocalBusiness structured data"
      anchor="local-jsonld"
      headerExtra={
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">
        Paste this on the location&apos;s page. It is generated from the
        canonical profile above, so it can never drift from the record — update
        the profile and re-copy.
      </p>
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/50 p-2 text-xs leading-relaxed">
        {script}
      </pre>
    </SectionCard>
  );
}
