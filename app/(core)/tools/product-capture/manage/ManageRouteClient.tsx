"use client";

/**
 * Client pieces for /tools/product-capture/manage — the injected shell
 * header (back to the list, Q&A + Capture actions) and the workspace body.
 */

import { Camera, MessageCircleQuestion } from "lucide-react";

import {
  TapTargetButton,
  TapTargetButtonSolid,
} from "@/components/icons/TapTargetButton";
import { ProductCaptureHeader } from "@/features/product-capture/components/ProductCaptureHeader";
import { PipelineWorkspace } from "@/features/product-capture/components/pipeline/PipelineWorkspace";

export function ManageHeader() {
  return (
    <ProductCaptureHeader
      backHref="/tools/product-capture/all"
      title="Pipeline"
      right={
        <>
          <TapTargetButton
            icon={<MessageCircleQuestion className="h-4 w-4" />}
            label="Q&A"
            href="/tools/product-capture/answer"
            ariaLabel="Open the quick-answer queue"
          />
          <TapTargetButtonSolid
            icon={<Camera className="h-4 w-4" />}
            label="Capture"
            href="/tools/product-capture"
            ariaLabel="Open the capture screen"
          />
        </>
      }
    />
  );
}

export function ManageBody({ initialItemId }: { initialItemId: string | null }) {
  return <PipelineWorkspace initialItemId={initialItemId} />;
}
