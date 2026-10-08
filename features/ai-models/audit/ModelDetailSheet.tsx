"use client";

import React, { useEffect, useState } from "react";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { CanvasPagePanel, PAGE_PANEL_KIND, pagePanelItemId } from "@/features/canvas/host/pagePanel";

/** The ONE canvas tab every audit table opens a model into. */
export const MODEL_DETAIL_PANEL_KEY = "ai-model-detail";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUpRight } from "lucide-react";
import AiModelDetailPanel from "../components/AiModelDetailPanel";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ReadFailure } from "@ai-matrx/design-system";
import { aiModelService } from "../service";
import type { AiModel, AiProvider } from "../types";

interface ModelDetailSheetProps {
  modelId: string | null;
  allModels: AiModel[];
  onClose: () => void;
  onSaved: (model: AiModel) => void;
}

export default function ModelDetailSheet({
  modelId,
  allModels,
  onClose,
  onSaved,
}: ModelDetailSheetProps) {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  // A failed providers read is said above the panel — its provider picker
  // would otherwise read as "there are no providers".
  const [providersError, setProvidersError] = useState<unknown>(null);
  const [providersAttempt, setProvidersAttempt] = useState(0);

  // Load providers once on first open
  useEffect(() => {
    if (!modelId || providers.length > 0) return;
    setLoadingProviders(true);
    aiModelService
      .fetchProviders()
      .then((rows) => {
        setProviders(rows);
        setProvidersError(null);
      })
      .catch((err: unknown) => {
        console.error(err);
        setProvidersError(err ?? new Error("The providers read failed"));
      })
      .finally(() => setLoadingProviders(false));
  }, [modelId, providers.length, providersAttempt]);

  const model = allModels.find((m) => m.id === modelId) ?? null;

  // The model's full editor is a canvas tab beside the audit table: ONE tab
  // that follows the row picked (a new row brings it forward under its name).
  if (!modelId) return null;
  return (
    <CanvasPagePanel
      panelKey={MODEL_DETAIL_PANEL_KEY}
      title={model?.common_name || model?.name || "Model"}
      onClose={onClose}
    >
      {loadingProviders ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : model ? (
        <>
        {providersError ? (
          <ReadFailure
            error={providersError}
            what="AI providers"
            onRetry={() => setProvidersAttempt((n) => n + 1)}
          />
        ) : null}
        <AiModelDetailPanel
          model={model}
          isNew={false}
          providers={providers}
          allModels={allModels}
          onClose={onClose}
          onSaved={(saved) => {
            onSaved(saved);
          }}
          onDeleted={onClose}
          inCanvas
        />
        </>
      ) : modelId ? (
        // The id came from the audit tables but isn't in the loaded registry —
        // the gate resolves whether it was deleted, denied, or never existed.
        <AccessGate token="ai_model" id={modelId} />
      ) : null}
    </CanvasPagePanel>
  );
}

/** Small icon button used in every audit table row to open the detail sheet */
export function OpenDetailButton({ onClick }: { onClick: () => void }) {
  const canvas = useOptionalCanvas();
  return (
    <Button
      icon={<ArrowUpRight />} aria-label="Open full model editor"
      variant="quiet"
      className="shrink-0"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
        // The same row again while its tab sits behind another: bring it forward.
        if (canvas?.getState().items[pagePanelItemId(MODEL_DETAIL_PANEL_KEY)]) {
          canvas.open({ kind: PAGE_PANEL_KIND, key: MODEL_DETAIL_PANEL_KEY });
        }
      }}
      title="Open full model editor"
    />
  );
}
