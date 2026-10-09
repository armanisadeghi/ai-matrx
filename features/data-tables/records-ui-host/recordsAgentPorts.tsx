"use client";

/**
 * THE AI PIECES THE OLD SHEET HAD, ON THE STORE GRID (Sheet retirement).
 *
 * `@ai-matrx/records-ui` knows nothing about agents; it hands this app two ports and this module
 * binds them:
 *
 *  - `formulaHelp` — the formula box's help. The same panel "Help with this…" opened in the older
 *    Sheet's formula box: it runs the `data.formula_writing` job (Provision `data.formula_box`) with
 *    the formula, the columns, the language and the store's reading of the mistake as that job's
 *    NAMED values — never inside the person's message — and the formula the job writes goes back
 *    into the box, unsaved, through `onFormula`.
 *  - `settingsAgent` — the table's settings panel as the `matrx-user/table-settings` surface, a
 *    LAYER over the table page's `matrx-user/data-tables` while it is open. The package hands a
 *    `TableSettingsAgent` (what the panel shows, three staging calls); nothing staged is saved
 *    until the person presses Save.
 */

import { useState, type ReactNode } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { type FormulaHelpAsk, type RecordsUiHost, type TableSettingsAgent } from "@ai-matrx/records-ui";
import { FORMULA_FUNCTIONS } from "@ai-matrx/kit/formula";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import {
  SurfaceLayerBoundary,
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { SURFACE_LAYER_ATTRIBUTE } from "@ai-matrx/chat/surfaces/runtime/window-forms";
import { sourceFeatureFromSurfaceName } from "@ai-matrx/chat/agents/utils/source-feature-from-surface";

import { ProTextareaAgentPanel } from "@/components/official/ProTextareaAgentPanel";
import type { SessionContextItem } from "@/features/transcript-studio/types";
import {
  createTableSettingsRowActionsScope,
  createTableSettingsScope,
  TABLE_SETTINGS_SURFACE_NAME,
} from "@/features/surfaces/manifests/table-settings.manifest";

const DATA_TABLES_SURFACE = "matrx-user/data-tables";
const SOURCE_FEATURE = sourceFeatureFromSurfaceName(DATA_TABLES_SURFACE) ?? "udt";

/**
 * The formula-writing job's offered values (Provision `data.formula_box`), by their declared keys.
 * A formula column's box: its purpose is a calculated column; the result's kind is the column's.
 */
export function formulaHelpValues(ask: Pick<FormulaHelpAsk, "text" | "columns" | "mistake" | "functions">): SessionContextItem[] {
  const named = (f: FormulaHelpAsk["columns"][number]) => f.label?.trim() || f.key;
  return [
    {
      id: "formula-purpose",
      key: "formula_purpose",
      label: "What this formula is for",
      value: "A calculated column; every row shows the result.",
    },
    {
      id: "formula-columns",
      key: "formula_columns",
      label: "Columns you can reference as {Name}",
      value: ask.columns.map((f) => `{${named(f)}}`).join(", "),
    },
    {
      id: "formula-columns-detail",
      key: "formula_columns_detail",
      label: "The columns in full",
      value: JSON.stringify(ask.columns.map((f) => ({ display_name: named(f), field_name: f.key, data_type: f.type }))),
    },
    {
      id: "formula-language",
      key: "formula_language",
      label: "Formula language",
      value:
        `Functions: ${ask.functions.join(", ")}.` +
        "\nOperators: + - * / % for numbers, & joins text, = != < <= > >= compare. Text in double quotes. Columns as {Display name}.",
    },
    // Blank is missing, never "(empty)": an empty box offers nothing.
    { id: "formula-current", key: "formula_current", label: "The formula as it stands", value: ask.text },
    { id: "formula-parse-error", key: "formula_parse_error", label: "What is wrong with the formula", value: ask.mistake ?? "" },
  ];
}

function FormulaHelp({ ask }: { ask: FormulaHelpAsk }) {
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setAgentId(null);
  };
  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px]" data-formula-help-open="">
          <MessageCircleQuestion className="h-3.5 w-3.5" />
          Help with this…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        {open ? (
          <ProTextareaAgentPanel
            actionId="help"
            agentId={agentId}
            mandateKey={MANDATE_KEYS.data__formula_writing}
            contextItems={formulaHelpValues(ask)}
            agentLabel={null}
            onAgentIdChange={setAgentId}
            onAgentClear={() => setAgentId(null)}
            sourceText={ask.text}
            onApplySourceText={(text) => {
              ask.onFormula(text.trim());
              close();
            }}
            onBack={close}
            onCancel={close}
            sourceFeature={SOURCE_FEATURE}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** The surface's write handlers over the package's agent: every call is the panel's own staging. */
export function tableSettingsWriteHandlers(agent: TableSettingsAgent): SurfaceWriteHandlers {
  return {
    editing_row_action: (value: unknown) => agent.stageRowAction(value),
    row_action_step_formula: (value: unknown) => agent.stageStepFormula(value),
    table_details: (value: unknown) => agent.stageTableDetails(value),
  };
}

/** The surface's scope: the window's own values, then the row actions' contribution. */
export function tableSettingsScope(agent: TableSettingsAgent, functions: readonly string[]) {
  const seen = agent.read();
  return {
    ...createTableSettingsScope({
      has_unsaved_changes: seen.has_unsaved_changes,
      table_details_draft: seen.table_details_draft,
    }),
    ...createTableSettingsRowActionsScope({
      ...(seen.saved_row_actions ? { saved_row_actions: seen.saved_row_actions } : {}),
      ...(seen.editing_row_action ? { editing_row_action: seen.editing_row_action } : {}),
      ...(seen.editing_row_action_problems ? { editing_row_action_problems: seen.editing_row_action_problems } : {}),
      ...(seen.editing_row_action?.["kind"] === "update"
        ? {
            formula_language:
              `Functions: ${functions.join(", ")}.` +
              "\nOperators: + - * / % for numbers, & joins text, = != < <= > >= compare. Text in double quotes. Columns as {Display name}.",
          }
        : {}),
    }),
  };
}

function TableSettingsLayer({ agent, children }: { agent: TableSettingsAgent; children: ReactNode }) {
  return (
    <SurfaceLayerBoundary>
      <SurfaceRuntimeProvider
        surfaceName={TABLE_SETTINGS_SURFACE_NAME}
        getScope={() => tableSettingsScope(agent, FORMULA_FUNCTIONS.map((fn) => fn.name))}
        isEditable
        getWriteHandlers={() => tableSettingsWriteHandlers(agent)}
      >
        <div {...{ [SURFACE_LAYER_ATTRIBUTE]: TABLE_SETTINGS_SURFACE_NAME }}>{children}</div>
      </SurfaceRuntimeProvider>
    </SurfaceLayerBoundary>
  );
}

/** Both ports, spread into every records-ui host (`recordsUiHostFor`). */
export const RECORDS_AGENT_PORTS: Pick<RecordsUiHost, "formulaHelp" | "settingsAgent"> = {
  formulaHelp: (ask) => <FormulaHelp ask={ask} />,
  settingsAgent: ({ agent, children }) => <TableSettingsLayer agent={agent}>{children}</TableSettingsLayer>,
};
