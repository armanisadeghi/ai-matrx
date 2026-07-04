"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Play, Loader2, RotateCcw, Check, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { ProJsonTextarea } from "@/components/official/ProJsonTextarea";
import { cn } from "@/lib/utils";
import type { KindSchema } from "./kind-schemas";
import type { KindStreamEvent } from "./kind-stream-parser";
import { runKindJsonStreamTest } from "./dev-test-harness";
import {
  buildFakeKindRegistry,
  buildSuppressedPathPrefixes,
  collectLiveBlockMounts,
  DemoRegisteredBlockPanel,
  flashcardServerDataFromEvents,
  flashcardSetAdditionalDetailsFromEvents,
  flashcardSetCardKinds,
  isParserEventSuppressed,
} from "./demo-block-components";
import {
  buildValidationReport,
  eventPathKey,
  pathLabel,
  type ValidationReport,
} from "./validation-report";
import {
  BLOCK_SCHEMAS_CATEGORY_ID,
  FlexibleDataError,
  listBlockSamples,
  listBlockSchemas,
  SAMPLE_BLOCK_DATA_CATEGORY_ID,
  type BlockSample,
  type BlockSchemaEntry,
} from "./flexible-data-service";
import { SchemaConvertTab } from "./SchemaConvertTab";

const FlashcardsBlock = dynamic(
  () =>
    import("@/components/mardown-display/blocks/flashcards/FlashcardsBlock"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-muted/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

const DEFAULT_STREAM_SETTINGS = {
  delayMs: 6,
  minChunkSize: 1,
  maxChunkSize: 12,
};

/** Nesting depth = how many array items deep (root = 0, cards[0] = 1, …). */
function kindDepth(path: Array<string | number>): number {
  return path.filter((segment) => typeof segment === "number").length;
}

function isKindWaitActiveAt(
  events: KindStreamEvent[],
  pendingIndex: number,
): boolean {
  const pending = events[pendingIndex];
  if (pending?.type !== "pending_kind") return false;

  const key = eventPathKey(pending.path);
  for (let i = pendingIndex + 1; i < events.length; i++) {
    const event = events[i];
    if (event.type === "kind_wait_end" && eventPathKey(event.path) === key) {
      return false;
    }
  }
  return true;
}

const DEPTH_PALETTE = [
  {
    border: "border-l-primary",
    badge: "bg-primary/15 text-primary",
    enter: "text-primary",
    bg: "bg-primary/5",
  },
  {
    border: "border-l-secondary",
    badge: "bg-secondary/15 text-secondary",
    enter: "text-secondary",
    bg: "bg-secondary/5",
  },
  {
    border: "border-l-accent-2",
    badge: "bg-accent-2/15 text-accent-2",
    enter: "text-accent-2",
    bg: "bg-accent-2/5",
  },
  {
    border: "border-l-warning",
    badge: "bg-warning/15 text-warning",
    enter: "text-warning",
    bg: "bg-warning/5",
  },
  {
    border: "border-l-info",
    badge: "bg-info/15 text-info",
    enter: "text-info",
    bg: "bg-info/5",
  },
] as const;

function depthStyle(depth: number) {
  return DEPTH_PALETTE[depth % DEPTH_PALETTE.length];
}

function fieldPreview(key: string, value: unknown): string | null {
  if (key === "__kind") return null;
  if (value === null) return `${key}: null`;
  if (typeof value === "string") {
    const trimmed = value.length > 72 ? `${value.slice(0, 72)}…` : value;
    return `${key}: ${trimmed}`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `${key}: ${String(value)}`;
  }
  if (Array.isArray(value)) {
    return `${key}: [${value.length} items]`;
  }
  return null;
}

function ValidationSummaryBanner({ report }: { report: ValidationReport }) {
  if (report.status === "idle") return null;

  const statusStyles = {
    valid: "border-success/40 bg-success/10 text-success",
    partial: "border-warning/50 bg-warning/10 text-warning",
    failed: "border-destructive/50 bg-destructive/10 text-destructive",
    idle: "",
  } as const;

  const statusLabel = {
    valid: "All objects validated against schema",
    partial: `${report.rawFallbacks.length} object${report.rawFallbacks.length === 1 ? "" : "s"} failed validation — kept as raw JSON`,
    failed: report.streamError ?? "Stream failed",
    idle: "",
  } as const;

  return (
    <div
      className={cn(
        "shrink-0 rounded-lg border px-3 py-2 text-xs",
        statusStyles[report.status],
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{statusLabel[report.status]}</span>
        {report.status !== "failed" && (
          <span className="text-muted-foreground">
            {report.validatedObjects.length} validated
            {report.rawFallbacks.length > 0
              ? ` · ${report.rawFallbacks.length} raw fallback`
              : ""}
            {report.optionalMissing.length > 0
              ? ` · ${report.optionalMissing.length} optional missing`
              : ""}
            {report.extraFields.length > 0
              ? ` · ${report.extraFields.length} extra field`
              : ""}
          </span>
        )}
      </div>
      {report.rawFallbacks.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 font-mono text-[11px]">
          {report.rawFallbacks.map((fallback, index) => (
            <li key={`${fallback.pathLabel}-${index}`} className="truncate">
              <span className="font-semibold">{fallback.pathLabel}</span>
              {" — "}
              {fallback.reason}
            </li>
          ))}
        </ul>
      )}
      {(report.optionalMissing.length > 0 || report.extraFields.length > 0) && (
        <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-muted-foreground">
          {report.optionalMissing.map((notice, index) => (
            <li
              key={`opt-${notice.pathLabel}-${notice.field}-${index}`}
              className="truncate"
            >
              <span className="font-semibold">{notice.pathLabel}</span>
              {" — optional "}
              <span className="text-info">{notice.field}</span>
              {" not provided"}
            </li>
          ))}
          {report.extraFields.map((notice, index) => (
            <li
              key={`extra-${notice.pathLabel}-${notice.field}-${index}`}
              className="truncate"
            >
              <span className="font-semibold">{notice.pathLabel}</span>
              {" — extra field "}
              <span className="text-muted-foreground">{notice.field}</span>
              {" ignored"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KindEventRow({
  event,
  events,
  index,
}: {
  event: KindStreamEvent;
  events: KindStreamEvent[];
  index: number;
}) {
  const path = "path" in event ? (event.path ?? []) : [];
  const depth = kindDepth(path);
  const palette = depthStyle(depth);
  const indent = depth * 12;
  const meta = `@ ${pathLabel(path)} · ${event.at}`;

  const rowCls = (extra?: string) =>
    cn(
      "flex min-h-6 items-center gap-2 rounded border border-border/60 border-l-4 py-0.5 pl-2 pr-2",
      palette.border,
      palette.bg,
      extra,
    );

  const badgeCls = cn(
    "shrink-0 rounded px-1 py-px text-[10px] font-semibold uppercase leading-none",
    palette.badge,
  );

  switch (event.type) {
    case "kind_identified":
      return (
        <div className={rowCls()} style={{ marginLeft: indent }}>
          <span className={badgeCls}>
            {path.length === 0 ? "root" : "kind"}
          </span>
          <span className={cn("shrink-0 font-semibold", palette.enter)}>
            identified
          </span>
          <span className="min-w-0 truncate font-semibold text-foreground">
            {event.kind}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {meta}
          </span>
        </div>
      );

    case "array_start":
      return (
        <div
          className="flex min-h-5 items-center gap-2 py-px text-[11px] text-muted-foreground"
          style={{ paddingLeft: indent }}
        >
          <span className="shrink-0">──</span>
          <span className="truncate">
            {event.field}[] opened · {pathLabel(event.path)}
          </span>
          <span className="ml-auto shrink-0 text-[10px]">{event.at}</span>
        </div>
      );

    case "object_start": {
      const itemIndex = path[path.length - 1];
      const isListItem = typeof itemIndex === "number";
      return (
        <div className={rowCls()} style={{ marginLeft: indent }}>
          <span className={badgeCls}>
            {isListItem ? `#${(itemIndex as number) + 1}` : "open"}
          </span>
          <span className={cn("shrink-0 font-semibold", palette.enter)}>
            opening
          </span>
          <span className="min-w-0 truncate text-muted-foreground">
            {pathLabel(event.path)}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {event.at}
          </span>
        </div>
      );
    }

    case "pending_kind": {
      const stillWaiting = isKindWaitActiveAt(events, index);
      return (
        <div
          className={rowCls(stillWaiting ? "" : "opacity-70")}
          style={{ marginLeft: indent }}
        >
          {stillWaiting ? (
            <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Check className="size-3 shrink-0 text-primary" />
          )}
          <span className={badgeCls}>{stillWaiting ? "wait" : "waited"}</span>
          <span className="min-w-0 truncate text-muted-foreground">
            {stillWaiting
              ? `awaiting ${pathLabel(event.path)}.__kind`
              : `wait ended · ${pathLabel(event.path)}`}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {event.at}
          </span>
        </div>
      );
    }

    case "kind_wait_end":
      return (
        <div className={rowCls()} style={{ marginLeft: indent }}>
          {event.outcome === "identified" ? (
            <Check className="size-3 shrink-0 text-primary" />
          ) : (
            <CircleAlert className="size-3 shrink-0 text-warning" />
          )}
          <span className={badgeCls}>
            {event.outcome === "identified" ? "resolved" : "fallback"}
          </span>
          <span className="min-w-0 truncate text-foreground">
            {event.outcome === "identified"
              ? `__kind → ${event.kind}`
              : (event.reason ?? "kept as raw JSON")}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {meta}
          </span>
        </div>
      );

    case "optional_field_missing":
      return (
        <div
          className="flex min-h-5 items-center gap-2 rounded border border-info/40 bg-info/5 px-2 py-px text-[11px]"
          style={{ marginLeft: indent }}
        >
          <span className="shrink-0 rounded bg-info/15 px-1 py-px text-[9px] font-semibold uppercase text-info">
            optional
          </span>
          <span className="min-w-0 truncate text-muted-foreground">
            {pathLabel(event.path)} — {event.field} not provided
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {event.at}
          </span>
        </div>
      );

    case "extra_field":
      return (
        <div
          className="flex min-h-5 items-center gap-2 rounded border border-border/80 bg-muted/20 px-2 py-px text-[11px]"
          style={{ marginLeft: indent }}
        >
          <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase text-muted-foreground">
            extra
          </span>
          <span className="min-w-0 truncate text-muted-foreground">
            {pathLabel(event.path)} — {event.field} (not in schema)
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {event.at}
          </span>
        </div>
      );

    case "raw_object":
      return (
        <div
          className="flex min-h-6 flex-col gap-0.5 rounded border border-warning/60 bg-warning/10 px-2 py-1"
          style={{ marginLeft: indent }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <CircleAlert className="size-3 shrink-0 text-warning" />
            <span className="shrink-0 rounded bg-warning/15 px-1 py-px text-[10px] font-semibold uppercase text-warning">
              unvalidated
            </span>
            <span className="min-w-0 truncate text-[11px] font-medium text-foreground">
              {pathLabel(event.path)}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {event.at}
            </span>
          </div>
          <span className="text-[10px] text-warning">{event.reason}</span>
        </div>
      );

    case "block_snapshot":
      return (
        <div
          className={rowCls(event.complete ? "border-success/30" : "")}
          style={{ marginLeft: indent }}
        >
          <span
            className={cn(
              badgeCls,
              event.complete && "bg-success/15 text-success",
            )}
          >
            {event.complete ? "snapshot" : "partial"}
          </span>
          <span className="min-w-0 truncate font-semibold text-foreground">
            {event.kind}
          </span>
          <span className="min-w-0 truncate text-muted-foreground">
            {Object.keys(event.value).filter((k) => k !== "__kind").length}{" "}
            fields
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {meta}
          </span>
        </div>
      );

    case "object_complete":
      return (
        <div
          className={rowCls("border-success/40")}
          style={{ marginLeft: indent }}
        >
          <Check className="size-3 shrink-0 text-success" />
          <span className="shrink-0 rounded bg-success/15 px-1 py-px text-[10px] font-semibold uppercase text-success">
            validated
          </span>
          <span className="min-w-0 truncate font-semibold text-foreground">
            {event.kind}
          </span>
          <span className="min-w-0 truncate text-muted-foreground">
            {pathLabel(event.path)}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {event.at}
          </span>
        </div>
      );

    case "field": {
      const preview = fieldPreview(event.key, event.value);
      if (!preview) return null;
      return (
        <div
          className="flex min-h-5 items-center gap-2 truncate py-px text-[11px] text-foreground/80"
          style={{ paddingLeft: indent + 8 }}
        >
          <span className="shrink-0 rounded bg-success/10 px-1 py-px text-[9px] font-semibold uppercase text-success">
            schema
          </span>
          <span className="min-w-0 truncate">{preview}</span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {event.at}
          </span>
        </div>
      );
    }

    case "complete": {
      const hasFallbacks = events.some((e) => e.type === "raw_object");
      return (
        <div
          className={cn(
            "flex min-h-6 items-center gap-2 rounded border px-2 py-0.5",
            hasFallbacks
              ? "border-warning/40 bg-warning/10"
              : "border-primary/40 bg-primary/10",
          )}
        >
          <span
            className={cn(
              "shrink-0 rounded px-1 py-px text-[10px] font-semibold uppercase",
              hasFallbacks
                ? "bg-warning/15 text-warning"
                : "bg-primary/15 text-primary",
            )}
          >
            complete
          </span>
          <span className="min-w-0 truncate font-semibold text-foreground">
            {event.kind}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {event.at}
          </span>
        </div>
      );
    }

    case "error":
      return (
        <div className="flex min-h-6 items-center gap-2 rounded border border-destructive/50 bg-destructive/10 px-2 py-0.5">
          <span className="shrink-0 rounded bg-destructive/15 px-1 py-px text-[10px] font-semibold uppercase text-destructive">
            error
          </span>
          <span className="min-w-0 truncate text-destructive">
            {event.reason}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {event.at}
          </span>
        </div>
      );

    default:
      return null;
  }
}

function ParserStreamView({
  events,
  isRunning,
  schemas,
}: {
  events: KindStreamEvent[];
  isRunning: boolean;
  schemas: Record<string, KindSchema>;
}) {
  const registry = useMemo(() => buildFakeKindRegistry(schemas), [schemas]);
  const cardKinds = useMemo(() => flashcardSetCardKinds(schemas), [schemas]);

  const liveMounts = useMemo(
    () => collectLiveBlockMounts(events, registry, cardKinds),
    [events, registry, cardKinds],
  );

  const suppressedPrefixes = useMemo(
    () => buildSuppressedPathPrefixes(events, registry, cardKinds),
    [events, registry, cardKinds],
  );

  const unownedEvents = useMemo(
    () =>
      events
        .map((event, index) => ({ event, index }))
        .filter(
          ({ event }) => !isParserEventSuppressed(event, suppressedPrefixes),
        ),
    [events, suppressedPrefixes],
  );

  return (
    <div className="space-y-4">
      {liveMounts.length > 0 && (
        <div className="space-y-4 font-sans">
          {liveMounts.map((mount) => (
            <DemoRegisteredBlockPanel
              key={mount.pathKey}
              kind={mount.kind}
              path={mount.path}
              events={events}
              isRunning={isRunning}
              schemas={schemas}
              registry={registry}
              cardKinds={cardKinds}
              flashcardsBlock={
                <Suspense
                  fallback={
                    <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-muted/30">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <FlashcardsBlock
                    serverData={flashcardServerDataFromEvents(
                      events,
                      mount.path,
                      isRunning,
                      cardKinds,
                    )}
                    additionalDetails={flashcardSetAdditionalDetailsFromEvents(
                      events,
                      mount.path,
                    )}
                  />
                </Suspense>
              }
            />
          ))}
        </div>
      )}

      {unownedEvents.length > 0 && (
        <div className="space-y-0.5 border-t border-border pt-3 font-mono text-xs">
          {unownedEvents.map(({ event, index }) => (
            <KindEventRow
              key={index}
              event={event}
              events={events}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SettingField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );
}

export default function JsonBlockDetectorPage() {
  const [samples, setSamples] = useState<BlockSample[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(true);
  const [samplesError, setSamplesError] = useState<string | null>(null);
  const [selectedSampleId, setSelectedSampleId] = useState("");
  const [blockSchemaEntries, setBlockSchemaEntries] = useState<
    BlockSchemaEntry[]
  >([]);
  const [selectedSchemaId, setSelectedSchemaId] = useState("");
  const [inputText, setInputText] = useState("");
  const [streamSettings, setStreamSettings] = useState(DEFAULT_STREAM_SETTINGS);
  const [events, setEvents] = useState<KindStreamEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [schemas, setSchemas] = useState<Record<string, KindSchema> | null>(
    null,
  );
  const [schemasLoading, setSchemasLoading] = useState(true);
  const [schemasError, setSchemasError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const reloadBlockSchemas = async () => {
    const registry = await listBlockSchemas(BLOCK_SCHEMAS_CATEGORY_ID);
    setSchemas(registry.schemas);
    setBlockSchemaEntries(registry.entries);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadDemoData() {
      setSchemasLoading(true);
      setSamplesLoading(true);
      setSchemasError(null);
      setSamplesError(null);

      const [schemaResult, sampleResult] = await Promise.allSettled([
        listBlockSchemas(BLOCK_SCHEMAS_CATEGORY_ID),
        listBlockSamples(SAMPLE_BLOCK_DATA_CATEGORY_ID),
      ]);

      if (cancelled) return;

      if (schemaResult.status === "fulfilled") {
        setSchemas(schemaResult.value.schemas);
        setBlockSchemaEntries(schemaResult.value.entries);
        const firstSchema = schemaResult.value.entries[0];
        if (firstSchema) {
          setSelectedSchemaId(firstSchema.id);
        }
      } else {
        const error = schemaResult.reason;
        setSchemas(null);
        setBlockSchemaEntries([]);
        setSchemasError(
          error instanceof FlexibleDataError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to load block schemas.",
        );
      }

      if (sampleResult.status === "fulfilled") {
        const loadedSamples = sampleResult.value;
        setSamples(loadedSamples);
        const first = loadedSamples[0];
        if (first) {
          setSelectedSampleId(first.id);
          setInputText(first.content);
        }
      } else {
        const error = sampleResult.reason;
        setSamples([]);
        setSamplesError(
          error instanceof FlexibleDataError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to load sample block data.",
        );
      }

      setSchemasLoading(false);
      setSamplesLoading(false);
    }

    void loadDemoData();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedBlockSchema = useMemo(() => {
    const entry = blockSchemaEntries.find(
      (item) => item.id === selectedSchemaId,
    );
    if (!entry) return null;
    return {
      slug: entry.slug,
      label: entry.label,
      fields: entry.fields,
    };
  }, [blockSchemaEntries, selectedSchemaId]);

  const reset = () => {
    cancelRef.current = true;
    setEvents([]);
    setIsRunning(false);
  };

  const handleSampleChange = (id: string) => {
    setSelectedSampleId(id);
    const sample = samples.find((s) => s.id === id);
    if (sample) setInputText(sample.content);
    setEvents([]);
  };

  const runStream = async () => {
    if (!schemas) return;

    cancelRef.current = false;
    setEvents([]);
    setIsRunning(true);

    try {
      await runKindJsonStreamTest(inputText, {
        parser: { schemas },
        stream: {
          delayMs: streamSettings.delayMs,
          minChunkSize: streamSettings.minChunkSize,
          maxChunkSize: streamSettings.maxChunkSize,
        },
        isCancelled: () => cancelRef.current,
        onEvent(event) {
          setEvents((prev) => [...prev, event]);
        },
      });
    } finally {
      setIsRunning(false);
    }
  };

  const validationReport = useMemo(
    () => buildValidationReport(events),
    [events],
  );

  const inspectorData = useMemo(() => {
    if (events.length === 0) return null;

    return {
      validation: validationReport,
      events,
    };
  }, [events, validationReport]);

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(320px,42%)] gap-4">
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              onClick={runStream}
              disabled={
                isRunning ||
                !inputText.trim() ||
                schemasLoading ||
                samplesLoading ||
                !schemas ||
                !!schemasError ||
                samples.length === 0 ||
                !!samplesError
              }
            >
              {isRunning ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 size-3.5" />
              )}
              Run
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={reset}
              disabled={!isRunning && events.length === 0}
            >
              <RotateCcw className="mr-1.5 size-3.5" />
              Reset
            </Button>
            {isRunning && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            )}
            <div className="ml-auto flex items-center gap-3">
              <SettingField
                label="delayMs"
                type="number"
                value={streamSettings.delayMs}
                onChange={(v) =>
                  setStreamSettings((s) => ({
                    ...s,
                    delayMs: Number(v) || 0,
                  }))
                }
              />
              <SettingField
                label="minChunk"
                type="number"
                value={streamSettings.minChunkSize}
                onChange={(v) =>
                  setStreamSettings((s) => ({
                    ...s,
                    minChunkSize: Math.max(1, Number(v) || 1),
                  }))
                }
              />
              <SettingField
                label="maxChunk"
                type="number"
                value={streamSettings.maxChunkSize}
                onChange={(v) =>
                  setStreamSettings((s) => ({
                    ...s,
                    maxChunkSize: Math.max(1, Number(v) || 1),
                  }))
                }
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/30 p-3">
            {events.length > 0 && (
              <ParserStreamView
                events={events}
                isRunning={isRunning}
                schemas={schemas ?? {}}
              />
            )}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col border-l border-border pl-4">
          <Tabs
            defaultValue="samples"
            className="flex min-h-0 flex-1 flex-col gap-2"
          >
            <TabsList className="grid h-auto w-full shrink-0 grid-cols-4 gap-0.5">
              <TabsTrigger value="samples" className="px-1 text-[10px]">
                Samples
              </TabsTrigger>
              <TabsTrigger value="schemas" className="px-1 text-[10px]">
                Schemas
              </TabsTrigger>
              <TabsTrigger value="validation" className="px-1 text-[10px]">
                Validate
              </TabsTrigger>
              <TabsTrigger value="convert" className="px-1 text-[10px]">
                Convert
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="samples"
              className="mt-0 flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden"
            >
              <Select
                value={selectedSampleId}
                onValueChange={handleSampleChange}
                disabled={
                  samplesLoading || samples.length === 0 || !!samplesError
                }
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue
                    placeholder={
                      samplesLoading
                        ? "Loading…"
                        : samplesError
                          ? "Failed to load"
                          : "No samples"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {samples.map((sample) => (
                    <SelectItem key={sample.id} value={sample.id}>
                      {sample.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {samplesError && (
                <p className="text-xs text-destructive">{samplesError}</p>
              )}

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ProJsonTextarea
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    setEvents([]);
                  }}
                  rootType="any"
                  showFormatButton
                  autoGrow
                  minHeight={160}
                  maxHeight={480}
                  wrapperClassName="flex min-h-0 flex-1"
                  className="text-xs"
                  placeholder="Paste or edit sample JSON…"
                />
              </div>
            </TabsContent>

            <TabsContent
              value="schemas"
              className="mt-0 flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden"
            >
              <Select
                value={selectedSchemaId}
                onValueChange={setSelectedSchemaId}
                disabled={
                  schemasLoading ||
                  blockSchemaEntries.length === 0 ||
                  !!schemasError
                }
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue
                    placeholder={
                      schemasLoading
                        ? "Loading…"
                        : schemasError
                          ? "Failed to load"
                          : "No schemas"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {blockSchemaEntries.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {schemasError && (
                <p className="text-xs text-destructive">{schemasError}</p>
              )}

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <JsonInspector
                  data={selectedBlockSchema}
                  label="Block Schema"
                  defaultView="json"
                  editorReadOnly
                  className="min-h-0 flex-1"
                />
              </div>
            </TabsContent>

            <TabsContent
              value="validation"
              className="mt-0 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden data-[state=inactive]:hidden"
            >
              {validationReport.status !== "idle" && (
                <ValidationSummaryBanner report={validationReport} />
              )}
              {inspectorData && (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <JsonInspector
                    data={inspectorData}
                    label="Validation report"
                    editorReadOnly
                    className="min-h-0 flex-1"
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent
              value="convert"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <SchemaConvertTab
                existingSchemas={schemas ?? {}}
                blockSchemaEntries={blockSchemaEntries}
                onSaved={() => void reloadBlockSchemas()}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
