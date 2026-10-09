"use client";

/**
 * Lightweight hover preview for a DataRef (db_record / db_query / db_field).
 * Pure presentation — DataRefs are tiny descriptors of what to fetch on the
 * server, not loaded entities, so the preview just shows the descriptor in a
 * readable form. No fetch, no Redux read.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Check, Copy, Database, Filter, Hash, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import type { DataRef } from "@ai-matrx/agents/message-parts";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { tryGetEntityInfoByUniqueTableName } from "@/features/scopes/registry/entityRegistry";

function describeRefType(dataRef: DataRef): string {
  switch (dataRef.ref_type) {
    case "db_record":
      return "Single record";
    case "db_query":
      return "Filtered query";
    case "db_field":
      return "Single field";
  }
}

function MetaRow({
  Icon,
  label,
  value,
  mono,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="inline-flex items-center gap-1 type-meta uppercase tracking-wider text-muted-foreground w-20 shrink-0">
        <Icon className="w-2.5 h-2.5" />
        {label}
      </span>
      <span
        className={cn(
          "type-secondary text-foreground break-all min-w-0",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface DataRefPreviewContentProps {
  dataRef: DataRef;
}

export function DataRefPreviewContent({ dataRef }: DataRefPreviewContentProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [copied, setCopied] = useState(false);
  const entityInfo = tryGetEntityInfoByUniqueTableName(dataRef.table);
  const recordId = "id" in dataRef ? dataRef.id : null;
  const recordName = dataRef.label?.trim() || dataRef.table;

  const handleCopyJson = async () => {
    if (!(await copyText(JSON.stringify(dataRef, null, 2), "Reference copied as JSON"))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <Database className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          {entityInfo && recordId ? (
            <EntityRef
              token={entityInfo.token}
              id={recordId}
              name={recordName}
              openInNewTab
              alwaysShowActions
              fill
              className="w-full type-title text-foreground"
            />
          ) : (
            <div className="type-title text-foreground">
              {recordName}
            </div>
          )}
          <div className="type-meta text-muted-foreground">
            {describeRefType(dataRef)} · {dataRef.table}
          </div>
        </div>
      </div>

      <div className="rounded-md bg-muted/40 p-2">
        {dataRef.ref_type === "db_record" && (
          <>
            <MetaRow Icon={Hash} label="ID" value={dataRef.id} mono />
            {dataRef.fields && dataRef.fields.length > 0 && (
              <MetaRow
                Icon={Tag}
                label="Fields"
                value={dataRef.fields.join(", ")}
                mono
              />
            )}
          </>
        )}
        {dataRef.ref_type === "db_field" && (
          <>
            <MetaRow Icon={Hash} label="ID" value={dataRef.id} mono />
            <MetaRow Icon={Tag} label="Field" value={dataRef.field_name} mono />
          </>
        )}
        {dataRef.ref_type === "db_query" && (
          <>
            {dataRef.filter && Object.keys(dataRef.filter).length > 0 ? (
              <MetaRow
                Icon={Filter}
                label="Filter"
                value={
                  <pre className="font-mono type-meta whitespace-pre-wrap break-all">
                    {JSON.stringify(dataRef.filter, null, 2)}
                  </pre>
                }
              />
            ) : (
              <MetaRow Icon={Filter} label="Filter" value="—" />
            )}
            {dataRef.fields && dataRef.fields.length > 0 && (
              <MetaRow
                Icon={Tag}
                label="Fields"
                value={dataRef.fields.join(", ")}
                mono
              />
            )}
            {typeof dataRef.limit === "number" && (
              <MetaRow
                Icon={Hash}
                label="Limit"
                value={String(dataRef.limit)}
              />
            )}
          </>
        )}
      </div>

      {dataRef.optional_context && (
        <div className="type-meta text-muted-foreground italic">
          Optional context — fetch failures are dropped silently
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-1 border-t border-border">
        <Button
          icon={copied ? <Check className="text-success" /> : <Copy />}
          variant="quiet"
          className="ml-auto"
          onClick={handleCopyJson}
        >
          {copied ? "Copied" : "Copy JSON"}
        </Button>
      </div>
    </div>
  );
}

interface DataRefHoverPreviewProps {
  /** The DataRef descriptor to preview. */
  dataRef: DataRef;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  openDelay?: number;
  closeDelay?: number;
  className?: string;
}

export function DataRefHoverPreview({
  dataRef,
  children,
  side = "top",
  align = "start",
  openDelay = 250,
  closeDelay = 140,
  className,
}: DataRefHoverPreviewProps) {
  return (
    <HoverCard openDelay={openDelay} closeDelay={closeDelay}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={8}
        className={cn(
          "w-80 p-3 bg-card border border-border shadow-lg",
          className,
        )}
      >
        <DataRefPreviewContent dataRef={dataRef} />
      </HoverCardContent>
    </HoverCard>
  );
}
