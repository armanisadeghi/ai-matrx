"use client";

/**
 * Generic drawer body — the graceful default for types that don't yet have a
 * custom UI (agent / project / transcript / workbook / table / list, plus any
 * unregistered type). Shows a readable summary of the references plus a
 * collapsible raw payload, NEVER a bare JSON dump as the primary view.
 *
 * Adding a custom UI for one of these = register a `ContextItemTypeDef` with a
 * dedicated Body in `registry.tsx`. This file should shrink over time.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContextItemBodyProps } from "../types";

function RefList({ label, ids }: { label: string; ids?: string[] }) {
  if (!ids || ids.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <ul className="space-y-0.5">
        {ids.map((id) => (
          <li
            key={id}
            className="truncate font-mono text-[11px] text-foreground/80"
          >
            {id}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GenericBody({ item }: ContextItemBodyProps) {
  const [rawOpen, setRawOpen] = useState(false);
  const { refs } = item;

  const hasRefs = Boolean(
    refs.projectIds?.length ||
    refs.agentIds?.length ||
    refs.transcriptIds?.length ||
    refs.workbookIds?.length ||
    refs.documentIds?.length ||
    refs.text,
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <item.icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">
          {item.title}
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
          {item.typeLabel}
        </span>
      </div>

      {refs.text && (
        <p className="whitespace-pre-wrap break-words text-xs text-foreground">
          {refs.text}
        </p>
      )}

      {hasRefs && (
        <div className="flex flex-col gap-3">
          <RefList label="Projects" ids={refs.projectIds} />
          <RefList label="Agents" ids={refs.agentIds} />
          <RefList label="Transcripts" ids={refs.transcriptIds} />
          <RefList label="Workbooks" ids={refs.workbookIds} />
          <RefList label="Documents" ids={refs.documentIds} />
        </div>
      )}

      {!hasRefs && (
        <p className="text-xs text-muted-foreground italic">
          A dedicated preview for this type hasn&apos;t been built yet. The full
          payload is below.
        </p>
      )}

      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={() => setRawOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {rawOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Raw payload
        </button>
        {rawOpen && (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all border-t border-border p-2.5 font-mono text-[11px] text-foreground/80">
            {JSON.stringify(item.raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
