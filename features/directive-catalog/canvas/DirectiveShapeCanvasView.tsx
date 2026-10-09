"use client";

/**
 * The body of a `directive-shape` canvas tab: an example payload (minimum,
 * defaults or full) and the actual JSON Schema, each copyable. The pane header
 * is the chrome — the tab carries the directive's name.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildSchemaExample,
  isJsonSchema,
  type SchemaExampleKind,
} from "@/features/directive-catalog/schemaExamples";
import { readDirectiveShapeData } from "./directiveShapeKind";

export default function DirectiveShapeCanvasView({ data }: CanvasKindProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [exampleKind, setExampleKind] = useState<SchemaExampleKind>("minimum");
  const [copied, setCopied] = useState<"example" | "schema" | null>(null);
  const shape = readDirectiveShapeData(data);
  const schema = shape?.schema ?? null;
  const subtitle = shape?.subtitle ?? "";
  const validSchema = isJsonSchema(schema);
  const example = validSchema ? buildSchemaExample(schema, exampleKind) : {};

  async function copy(value: unknown, target: "example" | "schema") {
    if (!(await copyText(JSON.stringify(value, null, 2), target === "schema" ? "JSON Schema copied" : "Example copied"))) return;
    setCopied(target);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto p-4">
      {subtitle ? (
        <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
      {!validSchema ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          This item has no registered or prospective JSON Schema.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
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
              icon={copied === "example" ? (
                <Check />
              ) : (
                <Copy />
              )}
              type="button"
              variant="outline"
              onClick={() => void copy(example, "example")}
            >
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
              icon={copied === "schema" ? (
                <Check />
              ) : (
                <Copy />
              )}
              type="button"
              variant="quiet"
              onClick={() => void copy(schema, "schema")}
            >
              Copy schema
            </Button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs text-foreground">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
