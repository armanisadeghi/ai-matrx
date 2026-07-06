"use client";

import dynamic from "next/dynamic";
import { ExternalLink } from "lucide-react";
import type { ContextObjectType } from "@/features/agents/types/agent-api-types";
import {
  KnownContextDetail,
  KnownTextContextDetail,
  getKnownContextDefinition,
  getKnownTextContextDefinition,
  isKnownContextKey,
  isKnownTextContextKey,
  parseContextRecord,
} from "./knownContextValues";
import {
  classifyContextValue,
  unwrapRichContextValue,
} from "./contextValueUtils";
import { cn } from "@/lib/utils";

const MarkdownStream = dynamic(() => import("@/components/MarkdownStream"), {
  ssr: false,
});

const JsonInspector = dynamic(
  () =>
    import("@/components/official-candidate/json-inspector/JsonInspector").then(
      (m) => ({ default: m.JsonInspector }),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Loading inspector…
      </div>
    ),
  },
);

interface ContextValueBodyProps {
  type: ContextObjectType;
  contextKey: string;
  value: unknown;
}

export function ContextValueBody({
  type,
  contextKey,
  value,
}: ContextValueBodyProps) {
  if (value === undefined || value === null) {
    return (
      <p className="text-[11px] italic text-muted-foreground/70">
        No value set for this conversation.
      </p>
    );
  }

  const unwrapped = unwrapRichContextValue(value);

  if (
    isKnownContextKey(contextKey) &&
    parseContextRecord(unwrapped) &&
    getKnownContextDefinition(contextKey)
  ) {
    return <KnownContextDetail contextKey={contextKey} value={unwrapped} />;
  }

  if (isKnownTextContextKey(contextKey)) {
    const textDef = getKnownTextContextDefinition(contextKey);
    if (textDef?.Detail) {
      return <KnownTextContextDetail contextKey={contextKey} value={value} />;
    }
  }

  const classified = classifyContextValue(value, type);

  if (type === "file_url" && typeof classified.text === "string") {
    return (
      <a
        href={classified.text}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex select-text items-center gap-1.5 break-all text-xs text-primary hover:underline"
      >
        <ExternalLink className="h-3 w-3 shrink-0" />
        <span className="break-all">{classified.text}</span>
      </a>
    );
  }

  if (classified.kind === "json") {
    return (
      <div className="h-[min(50dvh,22rem)] min-h-[12rem] overflow-hidden rounded border border-border">
        <JsonInspector data={classified.data ?? {}} className="h-full" />
      </div>
    );
  }

  if (classified.kind === "markdown-text" && classified.text) {
    return (
      <div className="select-text text-xs">
        <MarkdownStream content={classified.text} hideCopyButton />
      </div>
    );
  }

  if (classified.kind === "scalar" && classified.text) {
    return (
      <p className="select-text break-words font-mono text-xs text-foreground">
        {classified.text}
      </p>
    );
  }

  if (classified.text) {
    return <SelectableMonospaceBlock text={classified.text} />;
  }

  return (
    <p className="text-[11px] italic text-muted-foreground/70">
      No displayable value.
    </p>
  );
}

function SelectableMonospaceBlock({ text }: { text: string }) {
  return (
    <pre
      className={cn(
        "max-h-[min(50dvh,22rem)] cursor-text select-text overflow-auto",
        "whitespace-pre-wrap break-words rounded border border-border",
        "bg-muted/40 p-2 font-mono text-[11px] text-foreground",
      )}
    >
      {text}
    </pre>
  );
}
