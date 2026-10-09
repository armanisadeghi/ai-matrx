"use client";

/**
 * BRAND OFFERINGS without a website: what the brand sells and what it charges.
 * Offerings and prices belong to the brand, so this works with no site at all.
 * Site availability, worth and keyword placement appear once a website exists
 * (the site view of this same page).
 */

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  listBrandCatalogForBrand,
  listBrandOfferingPrices,
  retireBrandOfferingForBrand,
  saveBrandOfferingForBrand,
  setBrandOfferingPrice,
  NO_OFFERING_PRICE,
  type CatalogOffering,
} from "./data";
import { buildCatalogTree, forbiddenParents } from "./catalog-tree";
import { OfferingEditDialog, type OfferingEditDraft } from "./OfferingEditDialog";
import { formatOfferingPrice, offeringKindLabel } from "./vocabulary";

const KEY = ["marketing", "brand-offerings"] as const;

const NEW_DRAFT: OfferingEditDraft = {
  offeringId: null,
  name: "",
  kind: "service",
  description: "",
  parentId: null,
  priceAmount: "",
  priceCurrency: "USD",
  priceUnit: "",
  priceNote: "",
};

export function BrandOfferingsEditor() {
  const brand = useMarketingBrand();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OfferingEditDraft | null>(null);
  const catalog = useQuery({
    queryKey: [...KEY, "catalog", brand.id],
    queryFn: ({ signal }) => listBrandCatalogForBrand(brand.id, signal),
  });
  const prices = useQuery({
    queryKey: [...KEY, "prices", brand.id],
    queryFn: ({ signal }) => listBrandOfferingPrices(brand.id, signal),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const failed = (action: string) => (error: unknown) =>
    toast.error(`Could not ${action}`, { description: extractErrorMessage(error) });

  const save = useMutation({
    mutationFn: async (values: OfferingEditDraft) => {
      const id = await saveBrandOfferingForBrand({
        organizationId: brand.organizationId,
        brandId: brand.id,
        offeringId: values.offeringId,
        name: values.name,
        kind: values.kind,
        description: values.description,
        parentId: values.parentId,
      });
      const amount = values.priceAmount === "" ? null : Number(values.priceAmount);
      const stored = prices.data?.[id] ?? NO_OFFERING_PRICE;
      const next = {
        amount,
        currency: values.priceCurrency || null,
        unit: values.priceUnit || null,
        note: values.priceNote || null,
      };
      const changed =
        amount !== stored.amount ||
        (amount !== null && next.currency !== stored.currency) ||
        next.unit !== stored.unit ||
        next.note !== stored.note;
      if (changed) await setBrandOfferingPrice(id, next);
      return id;
    },
    onSuccess: (_id, values) => {
      setDraft(null);
      void refresh();
      toast.success(values.offeringId ? "Offering saved" : `“${values.name}” added`);
    },
    onError: failed("save that offering"),
  });

  const remove = useMutation({
    mutationFn: (offering: CatalogOffering) =>
      retireBrandOfferingForBrand({
        brandId: brand.id,
        offeringId: offering.id,
        parentId: offering.parentId,
      }),
    onSuccess: () => {
      void refresh();
      toast.success("Offering removed");
    },
    onError: failed("remove that offering"),
  });

  if (catalog.isPending) return <LoadingSurface label="Loading offerings…" />;
  if (catalog.isError) {
    return <QueryError error={catalog.error} onRetry={() => void catalog.refetch()} />;
  }

  const offerings = catalog.data;
  const tree = buildCatalogTree(offerings, new Map());
  const nameOf = (id: string | null) => offerings.find((o) => o.id === id)?.name;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain pt-[var(--shell-header-h)]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Package className="h-4 w-4 text-muted-foreground" />
            Offerings
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What {brand.name} sells and what it charges.{" "}
            <Link
              href={marketingRoutes.newSite(brand.id)}
              className="underline underline-offset-2"
            >
              Add a website
            </Link>{" "}
            to see where each one earns search traffic.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setDraft(NEW_DRAFT)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add offering
        </Button>
      </header>

      <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-4">
        {offerings.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No offerings yet. Add the first thing {brand.name} sells.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {offerings.map((offering) => {
              const price = formatOfferingPrice(prices.data?.[offering.id]);
              const parent = nameOf(offering.parentId);
              return (
                <li key={offering.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {offering.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {offeringKindLabel(offering.kind)}
                      {parent ? ` · part of ${parent}` : ""}
                      {offering.description ? ` · ${offering.description}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs tabular-nums text-foreground">
                    {price ?? <span className="text-muted-foreground">No price</span>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${offering.name}`}
                    onClick={() => {
                      const p = prices.data?.[offering.id];
                      setDraft({
                        offeringId: offering.id,
                        name: offering.name,
                        kind: offering.kind,
                        description: offering.description ?? "",
                        parentId: offering.parentId,
                        priceAmount: p?.amount == null ? "" : String(p.amount),
                        priceCurrency: p?.currency ?? "USD",
                        priceUnit: p?.unit ?? "",
                        priceNote: p?.note ?? "",
                      });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${offering.name}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(offering)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {draft ? (
        <OfferingEditDialog
          draft={draft}
          catalog={offerings}
          forbiddenParentIds={
            draft.offeringId ? forbiddenParents(tree, draft.offeringId) : new Set<string>()
          }
          busy={save.isPending}
          brandOnly
          onCancel={() => setDraft(null)}
          onSave={(values) => save.mutate(values)}
        />
      ) : null}
    </div>
  );
}
