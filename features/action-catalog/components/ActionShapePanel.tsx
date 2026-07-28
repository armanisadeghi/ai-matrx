"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import {
  buildSchemaExample,
  isJsonSchema,
  type SchemaExampleKind,
} from "@/features/action-catalog/schemaExamples";
import type {
  ActionVerb,
  FunctionEntry,
  NounActions,
} from "@/features/action-catalog/types";

export type ActionShapeSelection =
  | { kind: "action"; noun: NounActions; verb: ActionVerb }
  | { kind: "function"; fn: FunctionEntry };

function selectedSchema(selection: ActionShapeSelection): unknown {
  if (selection.kind === "function") return selection.fn.item_schema;
  return selection.noun.schemas?.[selection.verb];
}

export function ActionShapePanel({
  selection,
  onClose,
}: {
  selection: ActionShapeSelection;
  onClose: () => void;
}) {
  const [exampleKind, setExampleKind] =
    useState<SchemaExampleKind>("minimum");
  const [copied, setCopied] = useState<"example" | "schema" | null>(null);
  const schema = selectedSchema(selection);
  const validSchema = isJsonSchema(schema);
  const example = useMemo(
    () => (validSchema ? buildSchemaExample(schema, exampleKind) : {}),
    [schema, validSchema, exampleKind],
  );
  const title =
    selection.kind === "function"
      ? `Function: ${selection.fn.name}`
      : `${selection.verb}:${selection.noun.noun}`;
  const subtitle =
    selection.kind === "function"
      ? selection.fn.doc
      : `${selection.noun.label || selection.noun.noun} · ${selection.noun.table}`;

  async function copy(value: unknown, target: "example" | "schema") {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(target);
      toast.success(target === "schema" ? "JSON Schema copied" : "Example copied");
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <SidePanelSurface
      title={title}
      description={subtitle}
      onClose={onClose}
      defaultWidth={640}
      maxWidth={900}
    >
      <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
        <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>
        {!validSchema ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            This item has no registered or prospective JSON Schema.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Tabs
                value={exampleKind}
                onValueChange={(value) =>
                  setExampleKind(value as SchemaExampleKind)
                }
              >
                <TabsList>
                  <TabsTrigger value="minimum">Minimum</TabsTrigger>
                  <TabsTrigger value="defaults">Defaults</TabsTrigger>
                  <TabsTrigger value="full">Full</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copy(example, "example")}
              >
                {copied === "example" ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                Copy example
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {exampleKind === "minimum"
                ? "Only required fields."
                : exampleKind === "defaults"
                  ? "Only fields with server/database defaults."
                  : "Every accepted field, ready to edit and paste."}
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs text-foreground">
              {JSON.stringify(example, null, 2)}
            </pre>

            <div className="mt-6 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Actual JSON Schema</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copy(schema, "schema")}
              >
                {copied === "schema" ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                Copy schema
              </Button>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs text-foreground">
              {JSON.stringify(schema, null, 2)}
            </pre>
          </>
        )}
      </div>
    </SidePanelSurface>
  );
}
