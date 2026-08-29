"use client";

/**
 * Client pieces for /commerce/intake/assets — the injected shell header
 * (hub page: no back chevron) and the list body.
 */

import { Camera, MessageCircleQuestion } from "lucide-react";

import {
  TapTargetButton,
  TapTargetButtonSolid,
} from "@ai-matrx/tap-target";
import { ProductCaptureHeader } from "@/features/product-capture/components/ProductCaptureHeader";
import { AssetsList } from "@/features/commerce-intake/components/AssetsList";

export function AssetsHeader() {
  return (
    <ProductCaptureHeader
      title="Intake Capture"
      right={
        <>
          <TapTargetButton
            icon={<MessageCircleQuestion className="h-4 w-4" />}
            label="Answers"
            href="/commerce/intake/answer"
            ariaLabel="Open the answer queue"
          />
          <TapTargetButtonSolid
            icon={<Camera className="h-4 w-4" />}
            label="Capture"
            href="/commerce/intake"
            ariaLabel="Open the capture screen"
          />
        </>
      }
    />
  );
}

export function AssetsBody() {
  return <AssetsList />;
}
