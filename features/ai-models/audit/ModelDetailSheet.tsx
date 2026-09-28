"use client";

import React, { useEffect, useState } from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUpRight } from "lucide-react";
import AiModelDetailPanel from "../components/AiModelDetailPanel";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ReadFailure } from "@/components/read-state/ReadFailure";
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

  return (
    <MatrxDynamicPanelHost
      open={!!modelId}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={model?.common_name || model?.name || "Model"}
      position="right"
      defaultSize={42}
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
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
        />
        </>
      ) : modelId ? (
        // The id came from the audit tables but isn't in the loaded registry —
        // the gate resolves whether it was deleted, denied, or never existed.
        <AccessGate token="ai_model" id={modelId} />
      ) : null}
    </MatrxDynamicPanelHost>
  );
}

/** Small icon button used in every audit table row to open the detail sheet */
export function OpenDetailButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Open full model editor"
    >
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Button>
  );
}
