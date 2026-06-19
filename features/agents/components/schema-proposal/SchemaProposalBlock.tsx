"use client";

/**
 * SchemaProposalBlock — renders a `schema_proposal` JSON block (what the "JSON
 * Schema Generator" agent emits: `{ name, schema, strict? }`) as a compact card
 * with a collapsed JSON preview and an "Apply to an agent" action that writes
 * the schema to a chosen agent's `agx_agent.output_schema`.
 *
 * Fail-safe: invalid/partial JSON renders the raw body in a muted <pre> (never
 * throws). The JSON preview reuses the shared JsonBlock viewer (lazy-loaded).
 * The picker + write live in ApplySchemaDialog.
 */

import React, { lazy, Suspense, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileJson, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { OutputSchema } from "@/features/agents/types/json-schema";
import { ApplySchemaDialog } from "./ApplySchemaDialog";

const JsonBlock = lazy(() =>
  import("@/components/mardown-display/blocks/json/JsonBlock").then((m) => ({
    default: m.JsonBlock,
  })),
);

interface SchemaProposalBlockProps {
  content: string;
}

interface ParseResult {
  schema: OutputSchema | null;
  pretty: string;
}

/** Parse fail-safe → a typed OutputSchema when the shape holds, else null. */
function parseProposal(content: string): ParseResult {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { name?: unknown }).name === "string" &&
      (parsed as { schema?: unknown }).schema !== null &&
      typeof (parsed as { schema?: unknown }).schema === "object" &&
      !Array.isArray((parsed as { schema?: unknown }).schema)
    ) {
      return {
        schema: parsed as OutputSchema,
        pretty: JSON.stringify(parsed, null, 2),
      };
    }
  } catch {
    // fall through
  }
  return { schema: null, pretty: content };
}

const SchemaProposalBlock: React.FC<SchemaProposalBlockProps> = ({
  content,
}) => {
  const { schema, pretty } = useMemo(() => parseProposal(content), [content]);
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fail-safe: not a valid proposal → show the raw body, never throw.
  if (!schema) {
    return (
      <pre className="my-3 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        {pretty}
      </pre>
    );
  }

  return (
    <div className="my-3 w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 p-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileJson className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            Proposed output schema
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {schema.name}
            {schema.strict ? " · strict" : ""}
          </div>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Wand2 className="mr-1.5 h-3.5 w-3.5" />
          Apply to an agent
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 border-t border-border px-3.5 py-2",
          "text-xs text-muted-foreground hover:bg-accent",
        )}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        {expanded ? "Hide schema" : "Show schema"}
      </button>

      {expanded && (
        <div className="border-t border-border">
          <Suspense
            fallback={
              <pre className="overflow-x-auto bg-muted px-3 py-2 text-xs text-muted-foreground">
                {pretty}
              </pre>
            }
          >
            <JsonBlock content={pretty} allowEdit={false} className="m-0" />
          </Suspense>
        </div>
      )}

      <ApplySchemaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schema={schema}
      />
    </div>
  );
};

export default SchemaProposalBlock;
