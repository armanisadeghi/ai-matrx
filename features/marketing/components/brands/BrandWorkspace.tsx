"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AtSign,
  ExternalLink,
  Globe2,
  Images,
  Inbox,
  ListTree,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BrandEditorDialog } from "@/features/marketing/components/brands/BrandEditorDialog";
import { BrandAssetEditorDialog } from "@/features/marketing/components/brands/BrandAssetEditorDialog";
import { BusinessFactEditorDialog } from "@/features/marketing/components/brands/BusinessFactEditorDialog";
import { PropertyEditorDialog } from "@/features/marketing/components/brands/PropertyEditorDialog";
import { SiteEditorDialog } from "@/features/marketing/components/sites/SiteEditorDialog";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingBrandScope } from "@/features/surfaces/manifests/marketing-brand.manifest";
import { buildBrandContextXml } from "@/features/marketing/lib/surface-context";
import {
  useBrand,
  useBrandAssets,
  useBrandProperties,
  useBrandSites,
  useBusinessFacts,
  useDeleteBrand,
  useDeleteBrandAsset,
  useDeleteBusinessFact,
  useDeleteProperty,
  useDeleteSite,
  usePendingDiscoveredCount,
} from "@/features/marketing/data/hooks";
import {
  LoadingSurface,
  QueryError,
  SectionCard,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  SiteConnectionChips,
  SiteIdentityMark,
} from "@/features/marketing/components/shared/SiteConnectionChips";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { isJsonRecord, parseBrandProfile } from "@/features/marketing/types";
import type {
  BrandAsset,
  BrandProperty,
  BusinessFact,
  MarketingSite,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

/** Compact icon-button used by every cockpit row's edit/delete actions. */
function RowActionButton({
  title,
  destructive,
  onClick,
  children,
}: {
  title: string;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={
        destructive
          ? "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

function factValueText(fact: BusinessFact): string {
  if (isJsonRecord(fact.value)) {
    const candidate = fact.value.url ?? fact.value.text ?? fact.value.value;
    if (typeof candidate === "string" && candidate) return candidate;
    return JSON.stringify(fact.value);
  }
  return String(fact.value ?? "");
}

function assetPreviewUrl(asset: BrandAsset): string | null {
  return asset.source_url &&
    /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(asset.source_url)
    ? asset.source_url
    : null;
}

export function BrandWorkspace({ brandId }: { brandId: string }) {
  const router = useRouter();
  const brand = useBrand(brandId);
  const deleteMutation = useDeleteBrand();
  const deleteSiteMutation = useDeleteSite();
  const deletePropertyMutation = useDeleteProperty();
  const deleteAssetMutation = useDeleteBrandAsset();
  const deleteFactMutation = useDeleteBusinessFact();
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingSite, setEditingSite] = useState<MarketingSite | null>(null);
  const [deletingSite, setDeletingSite] = useState<MarketingSite | null>(null);
  const [propertyEditor, setPropertyEditor] = useState<{
    open: boolean;
    property: BrandProperty | null;
  }>({ open: false, property: null });
  const [deletingProperty, setDeletingProperty] =
    useState<BrandProperty | null>(null);
  const [assetEditor, setAssetEditor] = useState<{
    open: boolean;
    asset: BrandAsset | null;
  }>({ open: false, asset: null });
  const [deletingAsset, setDeletingAsset] = useState<BrandAsset | null>(null);
  const [factEditor, setFactEditor] = useState<{
    open: boolean;
    fact: BusinessFact | null;
  }>({ open: false, fact: null });
  const [deletingFact, setDeletingFact] = useState<BusinessFact | null>(null);
  const sites = useBrandSites(brandId);
  const properties = useBrandProperties(brandId);
  const assets = useBrandAssets(brandId);
  const facts = useBusinessFacts(brandId);
  const pending = usePendingDiscoveredCount(brandId);

  if (brand.isLoading) {
    return (
      <>
        <RouteHeader
          left={
            <ChevronLeftTapButton
              href={marketingRoutes.brands()}
              ariaLabel="All brands"
            />
          }
        />
        <LoadingSurface label="Loading brand…" />
      </>
    );
  }
  if (brand.isError || !brand.data) {
    return (
      <>
        <RouteHeader
          left={
            <ChevronLeftTapButton
              href={marketingRoutes.brands()}
              ariaLabel="All brands"
            />
          }
        />
        <QueryError
          error={brand.error ?? new Error("Brand not found")}
          onRetry={() => void brand.refetch()}
        />
      </>
    );
  }

  const current = brand.data;
  const websiteSites = sites.data ?? [];
  const socialProperties = (properties.data ?? []).filter(
    (property) => property.kind !== "website",
  );
  const primarySiteDiscovery = websiteSites[0]
    ? marketingRoutes.site(brandId, websiteSites[0].id, "/discovery")
    : null;
  const factRows = facts.data ?? [];
  const assetRows = assets.data ?? [];

  // Surface scope — assembled at trigger time from what the cockpit already
  // loaded. No fetching; keys are omitted when their data is not loaded yet.
  const getBrandScope = () => {
    const profile = parseBrandProfile(current.profile);
    return createMarketingBrandScope({
      brand_id: brandId,
      brand_name: current.name,
      brand_context: buildBrandContextXml({
        brand: current,
        properties: properties.data ?? [],
        facts: factRows,
        assets: assetRows,
        sites: websiteSites,
      }),
      ...(Object.keys(profile).length > 0
        ? { brand_profile: profile as Record<string, unknown> }
        : {}),
      ...(typeof pending.data === "number"
        ? { pending_review_count: pending.data }
        : {}),
      ...(websiteSites.length > 0
        ? {
            sites_summary: websiteSites.map((site) => ({
              id: site.id,
              name: site.name,
              root_url: site.root_url,
              status: site.status,
            })),
          }
        : {}),
      ...(socialProperties.length > 0
        ? {
            properties_summary: socialProperties.map((property) => ({
              kind: property.kind,
              url: property.url,
              handle: property.handle,
              status: property.status,
            })),
          }
        : {}),
    });
  };

  const brandCopy = webCopy({
    kind: "web-brand",
    label: `Brand ${current.name}`,
    description:
      "The full brand cockpit: identity plus its websites, social properties, confirmed business facts, and brand assets.",
    surface: `Brand cockpit — ${current.name}`,
    data: {
      brand: current,
      sites: websiteSites,
      properties: properties.data ?? [],
      assets: assetRows,
      facts: factRows,
      pendingDiscovered: pending.data ?? 0,
    },
    lines: [
      ["Brand", current.name],
      ["Website", current.website_url],
      ["Industry", current.industry],
      ["Status", current.status],
      ["Description", current.description],
      ["Websites", websiteSites.map((site) => site.domain).join(", ") || "none"],
      ["Social properties", socialProperties.length],
      ["Business facts", factRows.length],
      ["Brand assets", assetRows.length],
      ["Pending review", pending.data ?? 0],
    ],
    attributes: { brand_id: current.id, status: current.status },
  });

  const websitesCopy = webCopy({
    kind: "web-brand-websites",
    label: "Brand websites",
    description: "The website properties (managed sites) owned by this brand.",
    surface: `Websites — ${current.name}`,
    data: websiteSites,
    lines: [
      ["Brand", current.name],
      ["Websites", websiteSites.length],
      ...websiteSites.map(
        (site): [string, string] => [site.name, `${site.domain} · ${site.status}`],
      ),
    ],
    attributes: { brand_id: current.id, count: websiteSites.length },
  });

  const socialsCopy = webCopy({
    kind: "web-brand-properties",
    label: "Social profiles & other properties",
    description:
      "The brand's non-website properties (social profiles and other presences).",
    surface: `Social profiles — ${current.name}`,
    data: socialProperties,
    lines: [
      ["Brand", current.name],
      ["Properties", socialProperties.length],
      ...socialProperties.map(
        (property): [string, string] => [
          property.kind.replace(/_/g, " "),
          property.url || property.handle || property.display_name || "—",
        ],
      ),
    ],
    attributes: { brand_id: current.id, count: socialProperties.length },
  });

  const factsCopy = webCopy({
    kind: "web-business-facts",
    label: "Business facts",
    description:
      "Human-confirmed business facts for this brand (phones, addresses, taglines, identity).",
    surface: `Business facts — ${current.name}`,
    data: factRows,
    lines: [
      ["Brand", current.name],
      ["Facts", factRows.length],
      ...factRows.map(
        (fact): [string, string] => [
          fact.label || fact.kind.replace(/_/g, " "),
          factValueText(fact),
        ],
      ),
    ],
    attributes: { brand_id: current.id, count: factRows.length },
  });

  const assetsCopy = webCopy({
    kind: "web-brand-assets",
    label: "Brand assets",
    description:
      "Human-confirmed brand assets (logos, favicons, imagery) with their source URLs.",
    surface: `Brand assets — ${current.name}`,
    data: assetRows,
    lines: [
      ["Brand", current.name],
      ["Assets", assetRows.length],
      ...assetRows.map(
        (asset): [string, string] => [
          `${asset.kind.replace(/_/g, " ")}${asset.title ? ` · ${asset.title}` : ""}`,
          asset.source_url ?? "no source URL",
        ],
      ),
    ],
    attributes: { brand_id: current.id, count: assetRows.length },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-brand"
      getScope={getBrandScope}
    >
      <RouteHeader
        left={
          <div className="flex items-center gap-2">
            <ChevronLeftTapButton
              href={marketingRoutes.brands()}
              ariaLabel="All brands"
            />
            <h1 className="truncate text-sm font-medium text-foreground">
              {current.name}
            </h1>
          </div>
        }
      />
      <main className="h-full overflow-y-auto bg-textured p-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:p-4 sm:pt-[calc(var(--shell-header-h)+0.75rem)]">
        <div className="grid w-full gap-3">
          <section className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-card p-4">
            <SiteIdentityMark site={current} size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {current.name}
              </h2>
              {current.website_url ? (
                <a
                  href={current.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
                >
                  <span className="truncate">{current.website_url}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </a>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge value={current.status} />
                {current.industry ? (
                  <Badge variant="outline">{current.industry}</Badge>
                ) : null}
              </div>
              {current.description ? (
                <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
                  {current.description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <CopyButtons size="icon" {...brandCopy} />
              {pending.data ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                >
                  <Link href={primarySiteDiscovery ?? marketingRoutes.brands()}>
                    <Inbox className="h-3.5 w-3.5" />
                    {pending.data.toLocaleString()} to review
                  </Link>
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => setEditorOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit brand
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </section>

          <SectionCard
            title="Websites"
            copy={websitesCopy}
            action={{ label: "Add site", href: marketingRoutes.newSite(brandId) }}
          >
            {websiteSites.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">
                No website property yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {websiteSites.map((site) => (
                  <li
                    key={site.id}
                    className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/30"
                    onClick={() =>
                      router.push(marketingRoutes.site(brandId, site.id))
                    }
                  >
                    <SiteIdentityMark site={site} size={28} />
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate text-sm font-medium text-foreground">
                        {site.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {site.domain}
                      </p>
                    </div>
                    <SiteConnectionChips site={site} />
                    <div className="flex shrink-0 items-center gap-0.5">
                      <RowActionButton
                        title="Content plan — every URL this site should have"
                        onClick={() =>
                          router.push(marketingRoutes.contentPlanSite(site.id))
                        }
                      >
                        <ListTree className="h-3.5 w-3.5" />
                      </RowActionButton>
                      <RowActionButton
                        title="Edit site"
                        onClick={() => setEditingSite(site)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </RowActionButton>
                      <RowActionButton
                        title="Delete site"
                        destructive
                        onClick={() => setDeletingSite(site)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </RowActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="grid gap-3 lg:grid-cols-2">
            <SectionCard
              title="Social profiles & other properties"
              copy={socialsCopy}
              action={{
                label: "Add property",
                onClick: () =>
                  setPropertyEditor({ open: true, property: null }),
              }}
            >
              {socialProperties.length === 0 ? (
                <div className="flex flex-col items-start gap-2 p-4">
                  <p className="text-xs text-muted-foreground">
                    No social properties yet. Add one directly, or initialize a
                    site — discovered profile links register here once
                    confirmed.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {socialProperties.map((property) => (
                    <li
                      key={property.id}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <AtSign className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium capitalize text-foreground">
                          {property.kind.replace(/_/g, " ")}
                          {property.display_name
                            ? ` · ${property.display_name}`
                            : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {property.url || property.handle || "—"}
                        </p>
                      </div>
                      {property.url ? (
                        <a
                          href={property.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      <div className="flex shrink-0 items-center gap-0.5">
                        <RowActionButton
                          title="Edit property"
                          onClick={() =>
                            setPropertyEditor({ open: true, property })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </RowActionButton>
                        <RowActionButton
                          title="Delete property"
                          destructive
                          onClick={() => setDeletingProperty(property)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </RowActionButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="Business facts"
              copy={factsCopy}
              action={{
                label: "Add fact",
                onClick: () => setFactEditor({ open: true, fact: null }),
              }}
            >
              {(facts.data ?? []).length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  No confirmed facts yet. Add one directly, or review the
                  discovery inbox to confirm phones, emails, addresses, and
                  taglines.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {(facts.data ?? []).map((fact) => (
                    <li
                      key={fact.id}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {fact.label || fact.kind.replace(/_/g, " ")}
                        </p>
                        <p className="truncate text-sm text-foreground">
                          {factValueText(fact)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <RowActionButton
                          title="Edit fact"
                          onClick={() => setFactEditor({ open: true, fact })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </RowActionButton>
                        <RowActionButton
                          title="Delete fact"
                          destructive
                          onClick={() => setDeletingFact(fact)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </RowActionButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Brand assets"
            copy={assetsCopy}
            action={{
              label: "Add asset",
              onClick: () => setAssetEditor({ open: true, asset: null }),
            }}
          >
            {(assets.data ?? []).length === 0 ? (
              <div className="flex min-h-28 flex-col items-center justify-center gap-2 p-4 text-center">
                <Images className="h-6 w-6 text-muted-foreground" />
                <p className="max-w-md text-xs text-muted-foreground">
                  No confirmed assets yet. Add one directly, or initialize a
                  site and confirm logos, favicons, and imagery from its
                  discovery inbox — they become the brand's asset library here.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4 lg:grid-cols-6">
                {(assets.data ?? []).map((asset) => {
                  const preview = assetPreviewUrl(asset);
                  return (
                    <li
                      key={asset.id}
                      className="group overflow-hidden rounded-md border border-border bg-muted/20"
                    >
                      <div className="relative flex aspect-square items-center justify-center bg-card p-2">
                        {preview ? (
                          // Confirmed assets reference the brand's own public URLs.
                          <img
                            src={preview}
                            alt={asset.title ?? asset.kind}
                            className="max-h-full max-w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Globe2 className="h-6 w-6 text-muted-foreground/50" />
                        )}
                        <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded-md bg-card/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                          <RowActionButton
                            title="Edit asset"
                            onClick={() => setAssetEditor({ open: true, asset })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </RowActionButton>
                          <RowActionButton
                            title="Delete asset"
                            destructive
                            onClick={() => setDeletingAsset(asset)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </RowActionButton>
                        </div>
                      </div>
                      <p className="truncate border-t border-border px-2 py-1 text-[10px] font-medium capitalize text-muted-foreground">
                        {asset.kind.replace(/_/g, " ")}
                        {asset.title ? ` · ${asset.title}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      </main>

      <BrandEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        brand={current}
      />
      <SiteEditorDialog
        open={Boolean(editingSite)}
        onOpenChange={(open) => !open && setEditingSite(null)}
        site={editingSite}
      />
      <ConfirmDialog
        open={Boolean(deletingSite)}
        onOpenChange={(open) => !open && setDeletingSite(null)}
        title={deletingSite ? `Delete ${deletingSite.name}?` : "Delete site?"}
        description="The site moves to trash and disappears from every list. This does not delete the brand."
        variant="destructive"
        confirmLabel="Delete site"
        busy={deleteSiteMutation.isPending}
        onConfirm={async () => {
          if (!deletingSite) return;
          try {
            await deleteSiteMutation.mutateAsync(deletingSite.id);
            toast.success(`Deleted ${deletingSite.name}`);
            setDeletingSite(null);
          } catch (error) {
            toast.error("Could not delete site", {
              description: extractErrorMessage(error),
            });
          }
        }}
      />
      <PropertyEditorDialog
        open={propertyEditor.open}
        onOpenChange={(open) =>
          setPropertyEditor((state) => ({ ...state, open }))
        }
        brandId={current.id}
        organizationId={current.organization_id}
        property={propertyEditor.property}
      />
      <ConfirmDialog
        open={Boolean(deletingProperty)}
        onOpenChange={(open) => !open && setDeletingProperty(null)}
        title="Delete property?"
        description="The property moves to trash and disappears from this brand."
        variant="destructive"
        confirmLabel="Delete property"
        busy={deletePropertyMutation.isPending}
        onConfirm={async () => {
          if (!deletingProperty) return;
          try {
            await deletePropertyMutation.mutateAsync(deletingProperty.id);
            toast.success("Property deleted");
            setDeletingProperty(null);
          } catch (error) {
            toast.error("Could not delete property", {
              description: extractErrorMessage(error),
            });
          }
        }}
      />
      <BrandAssetEditorDialog
        open={assetEditor.open}
        onOpenChange={(open) => setAssetEditor((state) => ({ ...state, open }))}
        brandId={current.id}
        organizationId={current.organization_id}
        asset={assetEditor.asset}
      />
      <ConfirmDialog
        open={Boolean(deletingAsset)}
        onOpenChange={(open) => !open && setDeletingAsset(null)}
        title="Delete asset?"
        description="The asset moves to trash and leaves the brand library."
        variant="destructive"
        confirmLabel="Delete asset"
        busy={deleteAssetMutation.isPending}
        onConfirm={async () => {
          if (!deletingAsset) return;
          try {
            await deleteAssetMutation.mutateAsync(deletingAsset.id);
            toast.success("Asset deleted");
            setDeletingAsset(null);
          } catch (error) {
            toast.error("Could not delete asset", {
              description: extractErrorMessage(error),
            });
          }
        }}
      />
      <BusinessFactEditorDialog
        open={factEditor.open}
        onOpenChange={(open) => setFactEditor((state) => ({ ...state, open }))}
        brandId={current.id}
        organizationId={current.organization_id}
        fact={factEditor.fact}
      />
      <ConfirmDialog
        open={Boolean(deletingFact)}
        onOpenChange={(open) => !open && setDeletingFact(null)}
        title="Delete fact?"
        description="The fact moves to trash and disappears from this brand."
        variant="destructive"
        confirmLabel="Delete fact"
        busy={deleteFactMutation.isPending}
        onConfirm={async () => {
          if (!deletingFact) return;
          try {
            await deleteFactMutation.mutateAsync(deletingFact.id);
            toast.success("Fact deleted");
            setDeletingFact(null);
          } catch (error) {
            toast.error("Could not delete fact", {
              description: extractErrorMessage(error),
            });
          }
        }}
      />
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${current.name}?`}
        description="The brand moves to trash. Brands that still own sites can’t be deleted — delete or move their sites first."
        variant="destructive"
        confirmLabel="Delete brand"
        busy={deleteMutation.isPending}
        onConfirm={async () => {
          try {
            await deleteMutation.mutateAsync(current.id);
            toast.success(`Deleted ${current.name}`);
            router.push(marketingRoutes.brands());
          } catch (error) {
            toast.error("Could not delete brand", {
              description: extractErrorMessage(error),
            });
          }
        }}
      />
    </SurfaceRuntimeProvider>
  );
}
