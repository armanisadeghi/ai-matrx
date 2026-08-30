"use client";

/**
 * Client pieces for /commerce/intake/assets/[id] — the injected shell
 * header and the asset detail body.
 */

import { Camera } from "lucide-react";

import { TapTargetButtonSolid } from "@ai-matrx/tap-target";
import { ProductCaptureHeader } from "@/features/product-capture/components/ProductCaptureHeader";
import { AssetDetail } from "@/features/commerce-intake/components/AssetDetail";

export function AssetDetailHeader({ assetId }: { assetId: string }) {
  return (
    <ProductCaptureHeader
      backHref="/commerce/intake/assets"
      title="Intake asset"
      right={
        <TapTargetButtonSolid
          icon={<Camera className="h-4 w-4" />}
          label="Capture"
          mobileIconOnly
          href={`/commerce/intake?asset=${assetId}`}
          ariaLabel="Capture more on this item"
        />
      }
    />
  );
}

export function AssetDetailBody({ assetId }: { assetId: string }) {
  return <AssetDetail assetId={assetId} />;
}
