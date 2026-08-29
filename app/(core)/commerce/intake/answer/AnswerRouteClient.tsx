"use client";

/**
 * Client pieces for /commerce/intake/answer — the injected shell header and
 * the answer-queue body.
 */

import { LayoutGrid } from "lucide-react";

import { TapTargetButton } from "@/components/icons/TapTargetButton";
import { ProductCaptureHeader } from "@/features/product-capture/components/ProductCaptureHeader";
import { IntakeAnswerQueue } from "@/features/commerce-intake/components/IntakeAnswerQueue";

export function AnswerHeader() {
  return (
    <ProductCaptureHeader
      backHref="/commerce/intake/assets"
      title="Quick answers"
      right={
        <TapTargetButton
          icon={<LayoutGrid className="h-4 w-4" />}
          label="Assets"
          href="/commerce/intake/assets"
          ariaLabel="Open the intake assets list"
        />
      }
    />
  );
}

export function AnswerBody() {
  return <IntakeAnswerQueue />;
}
