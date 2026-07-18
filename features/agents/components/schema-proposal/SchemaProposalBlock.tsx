"use client";

/**
 * SchemaProposalBlock — renders a `schema_proposal` JSON block (what the "JSON
 * Schema Generator" agent emits: `{ name, schema, strict? }`) as a compact card
 * with a collapsed JSON preview and two apply targets:
 *   - "Apply to an agent" — writes the schema to a chosen agent's
 *     `agent.definition.output_schema` (ApplySchemaDialog);
 *   - "Create a Shape" — registers the schema as a content_ir kind with a
 *     validated canonical example (CreateShapeDialog, lazy — heavy ajv +
 *     converter chunk fetched only on click).
 *
 * Fail-safe: invalid/partial JSON renders the raw body in a muted <pre> (never
 * throws). The JSON preview reuses the shared JsonBlock viewer (lazy-loaded).
 * The picker + write live in ApplySchemaDialog.
 */

import React, { lazy, Suspense, useMemo, useState } from "react";
import nextDynamic from "next/dynamic";
import { ChevronDown, ChevronRight, FileJson, Shapes, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { OutputSchema } from "@/features/agents/types/json-schema";
import { ApplySchemaDialog } from "./ApplySchemaDialog";

const JsonBlock = lazy(() =>
  import("@/components/mardown-display/blocks/json/JsonBlock").then((m) => ({
    default: m.JsonBlock,
  })),
);

// Heavy on purpose (ajv + the content-ir converter/planner) — fetched only
// after the user clicks "Create a Shape" (the conditional render below is the
// deferral; ssr:false keeps it off the server render).
const CreateShapeDialog = nextDynamic(() => import("./CreateShapeDialog"), {
  ssr: false,
  loading: () => null,
});

interface SchemaProposalBlockProps {
  content: string;
  /**
   * Pre-derived proposal (content-ir kind bridge / server). Preferred over
   * parsing `content` — the `schema_proposal` kind's bridge hands over the
   * envelope-derived object with the injected `__kind` discriminator already
   * stripped, which a raw `content` parse would leak into the applied
   * `agent.definition.output_schema`. Same serverData-over-content precedent as
   * `useFlashcardsSet`.
   */
  serverData?: Record<string, unknown>;
}

interface ParseResult {
  schema: OutputSchema | null;
  pretty: string;
}

/** Shape guard: `{ name: string, schema: object }` (strict? optional). */
function isProposalShape(value: unknown): value is OutputSchema {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { name?: unknown }).name === "string" &&
    (value as { schema?: unknown }).schema !== null &&
    typeof (value as { schema?: unknown }).schema === "object" &&
    !Array.isArray((value as { schema?: unknown }).schema),
  );
}

/** Parse fail-safe → a typed OutputSchema when the shape holds, else null. */
function parseProposal(content: string): ParseResult {
  try {
    const parsed: unknown = JSON.parse(content);
    if (isProposalShape(parsed)) {
      return {
        schema: parsed,
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
  serverData,
}) => {
  const { schema, pretty } = useMemo(() => {
    if (isProposalShape(serverData)) {
      return {
        schema: serverData,
        pretty: JSON.stringify(serverData, null, 2),
      };
    }
    return parseProposal(content);
  }, [content, serverData]);
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Mounted (and its chunk fetched) only while open — mount-per-open is also
  // what resets the dialog's form state between proposals.
  const [shapeDialogOpen, setShapeDialogOpen] = useState(false);

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
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShapeDialogOpen(true)}
          >
            <Shapes className="mr-1.5 h-3.5 w-3.5" />
            Create a Shape
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            Apply to an agent
          </Button>
        </div>
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

      {shapeDialogOpen && (
        <CreateShapeDialog
          open={shapeDialogOpen}
          onOpenChange={setShapeDialogOpen}
          schema={schema}
        />
      )}
    </div>
  );
};

export default SchemaProposalBlock;
