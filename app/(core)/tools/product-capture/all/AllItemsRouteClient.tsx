"use client";

/**
 * Client pieces for /tools/product-capture/all: the injected shell header
 * (back to capture, Capture action) and the table body.
 */

import { Camera } from "lucide-react";

import { TapTargetButtonSolid } from "@/components/icons/TapTargetButton";
import { ProductCaptureHeader } from "@/features/product-capture/components/ProductCaptureHeader";
import { AllItemsTable } from "@/features/product-capture/components/AllItemsTable";

export function AllItemsHeader() {
  return (
    <ProductCaptureHeader
      backHref="/tools/product-capture"
      title="Product Capture"
      right={
        <TapTargetButtonSolid
          icon={<Camera className="h-4 w-4" />}
          label="Capture"
          href="/tools/product-capture"
          ariaLabel="Open the capture screen"
        />
      }
    />
  );
}

export function AllItemsBody() {
  return <AllItemsTable />;
}
