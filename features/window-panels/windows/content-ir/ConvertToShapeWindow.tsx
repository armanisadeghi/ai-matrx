"use client";

import { useEffect, useState } from "react";
import {
  Braces,
  CheckCircle2,
  CircleAlert,
  Database,
  FileJson2,
  Loader2,
  PanelsTopLeft,
  ScanSearch,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { JsonBlock } from "@/components/mardown-display/blocks/json/JsonBlock";
import { useMandate } from "@/features/agents/mandates/useMandate";
import { KIND_CREATOR_MANDATE_KEY } from "@/features/content-ir/studio/constants";
import {
  analyzeShapeSample,
  buildConvertToShapeSeed,
  buildShapeReadiness,
  type ShapeReadiness,
} from "@/features/content-ir/studio/convert-to-shape";
import { loadShapeReadiness } from "@/features/content-ir/studio/shape-readiness-service";
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
  const [readiness, setReadiness] = useState<ShapeReadiness>(() =>
    buildShapeReadiness({ rootKind: analysis.rootKind }),
  );
  const [readinessLoading, setReadinessLoading] = useState(
    Boolean(analysis.rootKind),
  );
  const [readinessError, setReadinessError] = useState<string | null>(null);
  if (sampleForName !== initialJsonContent) {
    setSampleForName(initialJsonContent);
    setShapeName(analysis.suggestedName);
  }

  useEffect(() => {
    const rootKind = analysis.rootKind;
    if (!rootKind) {
      setReadiness(buildShapeReadiness({ rootKind: null }));
      setReadinessLoading(false);
      setReadinessError(null);
      return;
    }

    let cancelled = false;
    setReadinessLoading(true);
    setReadinessError(null);
    void loadShapeReadiness(rootKind)
      .then((next) => {
        if (!cancelled) setReadiness(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(
          `[ConvertToShapeWindow] failed to inspect Shape "${rootKind}":`,
          error,
        );
        setReadinessError(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (!cancelled) setReadinessLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [analysis.rootKind]);

  const openRun = useOpenAgentRunWindow();
  const {
    mandate,
    loading: mandateLoading,
    error: mandateError,
  } = useMandate(KIND_CREATOR_MANDATE_KEY);
  const agentId = mandate?.agentId ?? null;
  const trimmedName = shapeName.trim();
  const canContinue =
    analysis.isValidJson &&
    Boolean(trimmedName) &&
    Boolean(agentId) &&
    !readinessLoading &&
    !readinessError;

  const continueWithCreator = () => {
    if (!canContinue || !agentId) return;

    const seed = buildConvertToShapeSeed({
      requestedName: trimmedName,
      sampleContent: initialJsonContent,
      readiness,
    });
    openRun({
      initialAgentId: agentId,
      initialDraftText: seed.draftText,
      initialVariableValues: seed.variables,
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
        <ShapeReadinessSummary
          readiness={readiness}
          loading={readinessLoading}
        />

        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Name the Shape
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The creator receives the exact JSON plus every existing registry,
            schema, and component detail found above. You can review the short
            name prompt before sending it.
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

        {!analysis.isValidJson && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            This sample is not valid JSON: {analysis.errorMessage}
          </div>
        )}

        {readinessError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Shape readiness could not be checked: {readinessError}
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

interface ReadinessMetricProps {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  pending?: boolean;
}

function ReadinessMetric({
  icon: Icon,
  label,
  value,
  detail,
  pending = false,
}: ReadinessMetricProps) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        )}
        {label}
      </div>
      <p
        className="mt-1 truncate text-xs font-semibold text-foreground"
        title={value}
      >
        {pending ? "Checking…" : value}
      </p>
      <p
        className="mt-0.5 truncate text-[10px] text-muted-foreground"
        title={detail}
      >
        {pending ? "Reading the live Shape system" : detail}
      </p>
    </div>
  );
}

const FOCUS_COPY: Record<ShapeReadiness["focus"], string> = {
  create_shape: "Create the complete Shape and infer its __kind.",
  register_shape: "Register this __kind and build the complete Shape.",
  repair_schema: "Keep this registration and repair its structural schema.",
  activate_shape: "Repair the existing registration and activate it.",
  build_component: "Keep the Shape and build or activate its output view.",
  add_loading_component: "Keep the output view and add its streaming loader.",
  review_shape:
    "The core render assets exist; review only what needs improvement.",
};

function componentMetric(readiness: ShapeReadiness): {
  value: string;
  detail: string;
} {
  const { component } = readiness;
  switch (component.state) {
    case "custom":
      return {
        value: "Custom",
        detail: component.componentKey ?? "Purpose-built view",
      };
    case "bundled":
      return {
        value: "Bundled",
        detail: component.componentKey ?? "Compiled view",
      };
    case "inactive":
      return {
        value: "Inactive",
        detail: component.componentKey ?? "Component is held",
      };
    case "generic":
      return { value: "Generic only", detail: "Universal viewer fallback" };
    case "missing":
      return { value: "Missing", detail: "Needs a purpose-built output view" };
  }
}

function ShapeReadinessSummary({
  readiness,
  loading,
}: {
  readiness: ShapeReadiness;
  loading: boolean;
}) {
  const component = componentMetric(readiness);
  const registrationValue = readiness.definition
    ? readiness.definition.isActive
      ? "Registered"
      : "Inactive"
    : "Not registered";
  const registrationDetail = readiness.definition
    ? `v${readiness.definition.version} · ${readiness.definition.visibility}`
    : readiness.rootKind
      ? "No live kind_definition"
      : "Waiting for an inferred __kind";
  const loadingValue =
    readiness.loading.state === "custom"
      ? "Custom"
      : readiness.loading.state === "unknown"
        ? "Unknown slug"
        : "Generic";
  const loadingDetail = readiness.loading.slug ?? "Default streaming skeleton";

  return (
    <section
      className="rounded-lg border border-border bg-muted/20 p-3"
      aria-label="Shape readiness"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Shape readiness
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Live status for the exact root payload before the creator opens.
          </p>
        </div>
        {!loading && readiness.focus === "review_shape" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <ScanSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ReadinessMetric
          icon={Braces}
          label="Kind key"
          value={readiness.rootKind ?? "Missing"}
          detail={
            readiness.rootKind
              ? "Root __kind detected"
              : "Creator will infer it"
          }
        />
        <ReadinessMetric
          icon={Database}
          label="Registration"
          value={registrationValue}
          detail={registrationDetail}
          pending={loading}
        />
        <ReadinessMetric
          icon={FileJson2}
          label="Schema"
          value={
            readiness.schema.state === "stored"
              ? "Stored"
              : readiness.schema.state === "compiled"
                ? "Bundled"
                : "Missing"
          }
          detail={
            readiness.schema.state === "stored"
              ? "Emitted JSON schema found"
              : readiness.schema.state === "compiled"
                ? "Available from code"
                : "Needs structural definition"
          }
          pending={loading}
        />
        <ReadinessMetric
          icon={PanelsTopLeft}
          label="Output view"
          value={component.value}
          detail={component.detail}
          pending={loading}
        />
        <ReadinessMetric
          icon={Loader2}
          label="Loading view"
          value={loadingValue}
          detail={loadingDetail}
          pending={loading}
        />
      </div>

      <div className="mt-2 flex items-start gap-2 rounded-md border border-border bg-background/70 px-3 py-2">
        {readiness.focus === "review_shape" ? (
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <p className="text-xs text-foreground">
          <span className="font-medium">Creator focus:</span>{" "}
          {loading
            ? "Inspecting the current assets…"
            : FOCUS_COPY[readiness.focus]}
        </p>
      </div>
    </section>
  );
}
