"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { JsonBlock } from "@/components/mardown-display/blocks/json/JsonBlock";
import { useMandate } from "@/features/agents/mandates/useMandate";
import { KIND_CREATOR_MANDATE_KEY } from "@/features/content-ir/studio/constants";
import {
  analyzeShapeSample,
  buildConvertToShapeIntent,
} from "@/features/content-ir/studio/convert-to-shape";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

export interface ConvertToShapeWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialJsonContent: string;
}

export default function ConvertToShapeWindow({
  isOpen,
  onClose,
  initialJsonContent,
}: ConvertToShapeWindowProps) {
  if (!isOpen) return null;

  return (
    <ConvertToShapeWindowContent
      onClose={onClose}
      initialJsonContent={initialJsonContent}
    />
  );
}

function ConvertToShapeWindowContent({
  onClose,
  initialJsonContent,
}: Omit<ConvertToShapeWindowProps, "isOpen">) {
  const analysis = analyzeShapeSample(initialJsonContent);
  const [sampleForName, setSampleForName] = useState(initialJsonContent);
  const [shapeName, setShapeName] = useState(analysis.suggestedName);
  if (sampleForName !== initialJsonContent) {
    setSampleForName(initialJsonContent);
    setShapeName(analysis.suggestedName);
  }

  const openRun = useOpenAgentRunWindow();
  const {
    mandate,
    loading: mandateLoading,
    error: mandateError,
  } = useMandate(KIND_CREATOR_MANDATE_KEY);
  const agentId = mandate?.agentId ?? null;
  const trimmedName = shapeName.trim();
  const canContinue =
    analysis.isValidJson && Boolean(trimmedName) && Boolean(agentId);

  const continueWithCreator = () => {
    if (!canContinue || !agentId) return;

    openRun({
      initialAgentId: agentId,
      initialDraftText: buildConvertToShapeIntent(
        trimmedName,
        analysis.rootKind,
      ),
      initialVariableValues: { user_data_sample: initialJsonContent },
    });
    onClose();
  };

  return (
    <WindowPanel
      id="convert-to-shape-window"
      overlayId="convertToShapeWindow"
      title="Convert JSON to Shape"
      onClose={onClose}
      width={780}
      height={720}
      minWidth={520}
      minHeight={460}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footerRight={
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={continueWithCreator}
            disabled={!canContinue || mandateLoading}
          >
            {mandateLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Shapes className="h-4 w-4" />
            )}
            Continue with Shape Creator
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Name the Shape
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The Shape Creator will use this name and the exact JSON sample
            below. You can review and edit its prepared instruction before
            sending it.
          </p>
        </div>

        <label className="block text-xs font-medium text-foreground">
          What do you want to call this Shape?
          <ProInput
            value={shapeName}
            onChange={(event) => setShapeName(event.target.value)}
            onSubmit={continueWithCreator}
            submitDisabled={!canContinue || mandateLoading}
            submitLabel="Continue with Shape Creator"
            submitOnEnter
            enableVoice={false}
            showCopyButton={false}
            placeholder="e.g. Sales summary"
            wrapperClassName="mt-1 w-full"
            autoFocus
          />
        </label>

        <div
          className={
            analysis.rootKind
              ? "flex items-start gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3"
              : "flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 p-3"
          }
        >
          {analysis.rootKind ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div>
            <p className="text-xs font-medium text-foreground">
              {analysis.rootKind
                ? `Existing kind: ${analysis.rootKind}`
                : "No root __kind found"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {analysis.rootKind
                ? "The creator will inspect and improve this Shape instead of blindly creating a duplicate."
                : "The creator will infer the correct __kind and schema from the sample."}
            </p>
          </div>
        </div>

        {!analysis.isValidJson && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            This sample is not valid JSON: {analysis.errorMessage}
          </div>
        )}

        {!mandateLoading && !agentId && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            The Shape Creator mandate could not resolve
            {mandateError ? `: ${mandateError}` : "."}
          </div>
        )}

        <section className="min-h-[220px]">
          <h2 className="mb-2 text-xs font-medium text-foreground">
            JSON sample
          </h2>
          <JsonBlock
            content={initialJsonContent}
            allowEdit={false}
            allowConvertToShape={false}
            className="my-0"
          />
        </section>
      </div>
    </WindowPanel>
  );
}
