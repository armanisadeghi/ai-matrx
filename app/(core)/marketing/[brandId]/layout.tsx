// The CLIENT workspace shell — everything under /marketing/[brandId].
//
// The segment is an ADDRESS (brand key or UUID), never an identifier: this
// layout resolves it ONCE per request (React-cached, so every page below hits
// the cache), publishes the real row through MarketingBrandProvider, and lets
// <CanonicalBrandSegment> rewrite a UUID address to the key address in place —
// a server layout cannot see the full pathname, so the swap happens client-side
// with the deep path and query string preserved.
//
// No body wrapper and no padding here: every page under this tree owns its own
// header offset (some mount a RouteHeader, some ride the breadcrumb below).

import { notFound } from "next/navigation";

import { CanonicalBrandSegment } from "@/features/marketing/components/brand/CanonicalSegment";
import { MarketingBrandCrumb } from "@/features/marketing/components/brand/MarketingBrandCrumb";
import { MarketingBrandProvider } from "@/features/marketing/lib/brand-context";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

export default async function MarketingBrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  if (!brand) notFound();

  const seg = marketingSeg(brand);

  return (
    <>
      <CanonicalBrandSegment param={brandId} expected={seg} />
      <MarketingBrandProvider
        value={{
          id: brand.id,
          slug: brand.slug,
          name: brand.name,
          organizationId: brand.organization_id,
          seg,
        }}
      >
        <MarketingBrandCrumb />
        {children}
      </MarketingBrandProvider>
    </>
  );
}
