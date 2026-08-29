"use client";

/**
 * Client pieces for /tools/product-capture/answer — the injected shell
 * header and the quick-answer queue body.
 */

import { TableProperties } from "lucide-react";

import { TapTargetButton } from "@/components/icons/TapTargetButton";
import { ProductCaptureHeader } from "@/features/product-capture/components/ProductCaptureHeader";
import { AnswerQueue } from "@/features/product-capture/components/pipeline/AnswerQueue";

export function AnswerHeader() {
  return (
    <ProductCaptureHeader
      backHref="/tools/product-capture/manage"
      title="Quick answers"
      right={
        <TapTargetButton
          icon={<TableProperties className="h-4 w-4" />}
          label="Pipeline"
          mobileIconOnly
          href="/tools/product-capture/manage"
          ariaLabel="Open the pipeline manager"
        />
      }
    />
  );
}

export function AnswerBody() {
  return <AnswerQueue />;
}
