"use client";

/**
 * Client pieces for /tools/product-capture/all: the injected shell header
 * (back to capture, Capture action) and the table body.
 */

import { Camera, TableProperties } from "lucide-react";

import {
  TapTargetButton,
  TapTargetButtonSolid,
} from "@/components/icons/TapTargetButton";
import { ProductCaptureHeader } from "@/features/product-capture/components/ProductCaptureHeader";
import { AllItemsTable } from "@/features/product-capture/components/AllItemsTable";

export function AllItemsHeader() {
  return (
    <ProductCaptureHeader
      title="Product Capture"
      right={
        <>
          <TapTargetButton
            icon={<TableProperties className="h-4 w-4" />}
            label="Pipeline"
            mobileIconOnly
            href="/tools/product-capture/manage"
            ariaLabel="Open the pipeline manager"
          />
          <TapTargetButtonSolid
            icon={<Camera className="h-4 w-4" />}
            label="Capture"
            mobileIconOnly
            href="/tools/product-capture"
            ariaLabel="Open the capture screen"
          />
        </>
      }
    />
  );
}

export function AllItemsBody() {
  return <AllItemsTable />;
}
