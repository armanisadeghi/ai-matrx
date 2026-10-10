import type { ReactNode } from "react";

import { BrandIdentitySurface } from "@/features/marketing/components/brand/BrandIdentitySurface";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

/** Every Identity room reads and writes through the brand's one agent surface. */
export default async function BrandIdentityLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const brand = await resolveBrandParam(brandId);
  // A missing brand is answered by each page's own address-unavailable state.
  if (!brand) return <>{children}</>;
  return <BrandIdentitySurface brandId={brand.id}>{children}</BrandIdentitySurface>;
}
