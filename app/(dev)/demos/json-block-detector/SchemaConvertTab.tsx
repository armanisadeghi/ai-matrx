"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { ProJsonTextarea } from "@/components/official/ProJsonTextarea";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  BLOCK_SCHEMAS_CATEGORY_ID,
  createFlexibleData,
  FlexibleDataError,
  type BlockSchemaEntry,
} from "./flexible-data-service";
import type { KindSchema } from "./kind-schemas";
import {
  fieldsToDbPayload,
  runSchemaConversion,
  validateBlockSchemaSavePlan,
  type ConversionProblem,
  type DroppedMetadata,
  type FieldComparison,
  type SavePlanEntry,
  type SchemaConversionResult,
} from "./schema-converter";

type PanelId = "input" | "blockSchemas" | "agentSchema";

function ProblemRow({ problem }: { problem: ConversionProblem }) {
  const tone =
    problem.severity === "error"
      ? "text-destructive"
      : problem.severity === "warning"
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <li className={cn("font-mono text-[10px]", tone)}>
      <span className="font-semibold uppercase">{problem.severity}</span>
      {problem.path ? ` · ${problem.path}` : ""} — {problem.message}
    </li>
  );
}

function ComparisonRow({ row }: { row: FieldComparison }) {
  const statusCls = {
    match: "text-success",
    ai_only: "text-info",
    block_only: "text-warning",
    type_mismatch: "text-destructive",
    ai_richer: "text-info",
    block_richer: "text-warning",
  }[row.status];

  return (
    <tr className="border-b border-border/60">
      <td className="py-1 pr-2 font-mono text-[10px]">{row.field}</td>
      <td className="py-1 pr-2 font-mono text-[10px] text-muted-foreground">
        {row.aiSummary ?? "—"}
      </td>
      <td className="py-1 pr-2 font-mono text-[10px] text-muted-foreground">
        {row.blockSummary ?? "—"}
      </td>
      <td className={cn("py-1 font-mono text-[10px] uppercase", statusCls)}>
        {row.status.replace("_", " ")}
      </td>
    </tr>
  );
}

function DroppedRow({ entry }: { entry: DroppedMetadata }) {
  return (
    <li className="font-mono text-[10px] text-muted-foreground">
      <span className="font-semibold text-foreground">
        {entry.path || "root"}
      </span>
      {": "}
      {Object.entries(entry.dropped)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(", ")}
    </li>
  );
}

function SavePlanRow({ entry }: { entry: SavePlanEntry }) {
  return (
    <li className="flex items-center gap-2 font-mono text-[10px]">
      <span className="font-semibold text-foreground">{entry.draft.slug}</span>
      <span
        className={cn(
          "rounded px-1 py-px uppercase",
          entry.willSave
            ? "bg-success/15 text-success"
            : "bg-muted text-muted-foreground",
        )}
      >
        {entry.willSave ? "new" : "in db"}
      </span>
    </li>
  );
}

function CollapsiblePanel({
  title,
  open,
  onOpenChange,
  children,
  className,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        "flex min-h-0 flex-col rounded border border-border bg-card",
        open && "min-h-[120px] flex-1",
        className,
      )}
    >
      <CollapsibleTrigger className="flex w-full shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40">
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "min-h-0 overflow-hidden data-[state=closed]:hidden",
          open && "flex flex-1 flex-col",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col p-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SchemaConvertTab({
  existingSchemas,
  blockSchemaEntries,
  onSaved,
}: {
  existingSchemas: Record<string, KindSchema>;
  blockSchemaEntries: BlockSchemaEntry[];
  onSaved: () => void;
}) {
  const organizationId = useAppSelector(selectOrganizationId);
  const [inputText, setInputText] = useState("{}");
  const [conversion, setConversion] = useState<
    (SchemaConversionResult & { parseErrors: string[] }) | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [openPanel, setOpenPanel] = useState<PanelId>("input");
  const [droppedOpen, setDroppedOpen] = useState(false);

  const setPanelOpen = (panel: PanelId, open: boolean) => {
    if (open) {
      setOpenPanel(panel);
    }
  };

  const handleConvert = () => {
    const trimmed = inputText.trim();
    if (!trimmed) {
      toast.error("Paste an AI output schema JSON object first.");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      toast.error("Invalid JSON — fix syntax errors before converting.");
      return;
    }

    setConversion(runSchemaConversion(parsed, existingSchemas));
    setOpenPanel("blockSchemas");
  };

  const hasConversionErrors =
    conversion?.problems.some((p) => p.severity === "error") ?? false;

  const savePlan = useMemo(() => {
    if (!conversion) {
      return {
        canSave: false,
        entries: [] as SavePlanEntry[],
        errors: [] as string[],
        newCount: 0,
      };
    }
    return validateBlockSchemaSavePlan(
      conversion.blockSchemas,
      blockSchemaEntries.map((e) => e.slug),
      hasConversionErrors || conversion.parseErrors.length > 0,
    );
  }, [conversion, blockSchemaEntries, hasConversionErrors]);

  const canSave = !!organizationId && savePlan.canSave;

  const handleSave = async () => {
    if (!organizationId) {
      toast.error("Active organization is required.");
      return;
    }
    if (!savePlan.canSave) {
      toast.error(savePlan.errors[0] ?? "Cannot save block schemas.");
      return;
    }

    setSaving(true);
    try {
      const toSave = savePlan.entries.filter((e) => e.willSave);
      for (const entry of toSave) {
        await createFlexibleData({
          categoryId: BLOCK_SCHEMAS_CATEGORY_ID,
          organizationId,
          label: entry.draft.label,
          slug: entry.draft.slug.trim(),
          data: fieldsToDbPayload(entry.draft.fields),
        });
      }

      toast.success(
        `Saved ${toSave.length} block schema${toSave.length === 1 ? "" : "s"}.`,
      );
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof FlexibleDataError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to save schema.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <CollapsiblePanel
          title="AI output schema"
          open={openPanel === "input"}
          onOpenChange={(open) => setPanelOpen("input", open)}
        >
          <ProJsonTextarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rootType="object"
            showFormatButton
            autoGrow
            minHeight={120}
            maxHeight={360}
            wrapperClassName="flex min-h-0 flex-1"
            className="text-xs"
            placeholder="Paste AI output_schema JSON…"
          />
        </CollapsiblePanel>

        <Button size="sm" className="w-full shrink-0" onClick={handleConvert}>
          <Wand2 className="mr-1.5 size-3.5" />
          Convert schema
        </Button>

        {conversion && conversion.parseErrors.length > 0 && (
          <ul className="shrink-0 space-y-0.5">
            {conversion.parseErrors.map((message) => (
              <li key={message} className="text-[10px] text-destructive">
                {message}
              </li>
            ))}
          </ul>
        )}

        {conversion && conversion.problems.length > 0 && (
          <ul className="max-h-20 shrink-0 space-y-0.5 overflow-auto">
            {conversion.problems.map((problem, index) => (
              <ProblemRow key={`${problem.path}-${index}`} problem={problem} />
            ))}
          </ul>
        )}

        {conversion && conversion.comparisons.length > 0 && (
          <div className="max-h-20 shrink-0 overflow-auto rounded border border-border">
            <table className="w-full px-2 text-left">
              <thead>
                <tr className="border-b border-border text-[9px] uppercase text-muted-foreground">
                  <th className="py-1 pr-2">Field</th>
                  <th className="py-1 pr-2">AI</th>
                  <th className="py-1 pr-2">Block</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {conversion.comparisons.map((row) => (
                  <ComparisonRow key={row.field} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {conversion && (
          <CollapsiblePanel
            title={`Block schemas (${conversion.blockSchemas.length})`}
            open={openPanel === "blockSchemas"}
            onOpenChange={(open) => setPanelOpen("blockSchemas", open)}
          >
            <JsonInspector
              data={conversion.blockSchemas}
              label="Block schemas"
              defaultView="json"
              editorReadOnly
              className="min-h-0 flex-1"
            />
          </CollapsiblePanel>
        )}

        {conversion?.agentSchemaWithKinds != null && (
          <CollapsiblePanel
            title="Agent schema with __kind"
            open={openPanel === "agentSchema"}
            onOpenChange={(open) => setPanelOpen("agentSchema", open)}
          >
            <JsonInspector
              data={conversion.agentSchemaWithKinds}
              label="Agent schema with __kind"
              defaultView="json"
              editorReadOnly
              className="min-h-0 flex-1"
            />
          </CollapsiblePanel>
        )}

        {conversion && conversion.droppedMetadata.length > 0 && (
          <Collapsible
            open={droppedOpen}
            onOpenChange={setDroppedOpen}
            className="shrink-0 rounded border border-border/80 bg-muted/20"
          >
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[9px] font-semibold uppercase text-muted-foreground hover:bg-muted/40">
              <ChevronDown
                className={cn(
                  "size-3 shrink-0 transition-transform",
                  droppedOpen ? "rotate-0" : "-rotate-90",
                )}
              />
              Dropped metadata ({conversion.droppedMetadata.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="max-h-24 overflow-auto px-2 pb-2 data-[state=closed]:hidden">
              <ul className="space-y-0.5">
                {conversion.droppedMetadata.map((entry, index) => (
                  <DroppedRow key={`${entry.path}-${index}`} entry={entry} />
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border pt-2">
        {savePlan.entries.length > 0 && (
          <ul className="space-y-0.5">
            {savePlan.entries.map((entry) => (
              <SavePlanRow key={entry.draft.slug} entry={entry} />
            ))}
          </ul>
        )}
        {savePlan.errors.length > 0 && (
          <ul className="space-y-0.5">
            {savePlan.errors.map((message) => (
              <li key={message} className="text-[10px] text-destructive">
                {message}
              </li>
            ))}
          </ul>
        )}
        {!organizationId && (
          <p className="text-[10px] text-destructive">
            No active organization — select an org before saving.
          </p>
        )}
        <Button
          size="sm"
          className="w-full"
          disabled={!canSave || saving}
          onClick={() => void handleSave()}
        >
          {saving ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 size-3.5" />
          )}
          Save {savePlan.newCount > 0 ? `${savePlan.newCount} ` : ""}to DB
        </Button>
      </div>
    </div>
  );
}
