/**
 * RowActionsEditor — where a table's one-click ROW ACTIONS are authored
 * (Table settings → Actions). See `row-actions.ts` for the model.
 *
 * Saved per action, immediately, like colors and the row label: an action is a
 * table property, not a draft of the settings dialog. The list shows every
 * action as a sentence ("Sets Status to "AVAILABLE"; clears Total, Fable;
 * calculates Reset date."), and the open editor previews the action against a
 * real row of the table, so a formula that would fail on today's data says so
 * before the button exists.
 */
"use client";

import { useMemo, useState } from "react";
import { Loader2, MessageSquareText, Plus, Trash2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { CHOICE_COLORS } from "@/lib/field-formats/choices";
import { resolveFieldFormat, formatFieldValue } from "@ai-matrx/design-system/field-formats";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";
import { cn } from "@/lib/utils";
import { IconResolver } from "@ai-matrx/icons";
import { IconInputCompact } from "@/components/official/icons/IconInputWithValidation.dynamic";

import { isComputedColumn } from "@ai-matrx/design-system/formulas";
import {
  coerceForColumn,
  compileRowAction,
  describeRowAction,
  newRowActionId,
  readRowActions,
  stepsFromRow,
  validateRowActions,
  type RowAction,
  type RowActionField,
  type RowActionStep,
} from "../row-actions";
import { effectiveRowLabel, rowLabelText, type RowLabelField } from "../row-label";
import { setTableRowActions } from "../service";
import { STYLE_COLORS, STYLE_COLOR_LABELS, type StyleColor } from "@ai-matrx/design-system/data-table/table-style";
import { isServiceFailure } from "../types";
import { FormatAwareInput, formatHasOwnInput } from "./FormatAwareInput";
import { FormulaExpressionEditor } from "./FormulaExpressionEditor";
import { FORMULA_FUNCTIONS, parseFormula } from "@ai-matrx/design-system/formulas";
import {
  useSurfaceScopeContribution,
  useSurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import {
  createTableSettingsRowActionsScope,
  TABLE_SETTINGS_SURFACE_NAME,
} from "@/features/surfaces/manifests/table-settings.manifest";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type Field = RowActionField & RowLabelField & { metadata?: unknown };
type Row = { id: string; data: Record<string, unknown> };

type Props = {
  tableId: string;
  metadata: unknown;
  fields: readonly Field[];
  /** Rows on screen — the "start from a row" picker and the preview. */
  rows: readonly Row[];
  disabled?: boolean;
  onSaved: (next: RowAction[]) => void;
};

const NONE = "__none__";

/** The tinted button an action renders as — shared with the grid so the editor shows the real thing. */
export function rowActionButtonClass(color: StyleColor | null | undefined): string {
  return color ? CHOICE_COLORS[color] : CHOICE_COLORS.neutral;
}

export function RowActionsEditor({ tableId, metadata, fields, rows, disabled, onSaved }: Props) {
  const stored = useMemo(() => readRowActions(metadata), [metadata]);
  const [editing, setEditing] = useState<RowAction | null>(null);
  const [saving, setSaving] = useState(false);
  const settable = useMemo(() => fields.filter((f) => !isComputedColumn(f)), [fields]);
  const labelConfig = useMemo(() => effectiveRowLabel(metadata, fields), [metadata, fields]);
  const nameRow = (row: Row) => rowLabelText(row, fields, labelConfig).text || `row ${row.id.slice(0, 8)}`;

  const persist = async (next: RowAction[], done: string) => {
    setSaving(true);
    const result = await setTableRowActions({ tableId, rowActions: next });
    setSaving(false);
    if (isServiceFailure(result)) {
      toast({ title: "Could not save the action", description: result.error, variant: "destructive" });
      return false;
    }
    toast({ title: done });
    onSaved(next);
    return true;
  };

  const startNew = (kind: RowAction["kind"]) =>
    setEditing(
      kind === "agent"
        ? { id: newRowActionId(), name: "", kind, prompt: "", color: null, confirm: false }
        : { id: newRowActionId(), name: "", kind, steps: [], color: null, confirm: false },
    );

  const saveEditing = async () => {
    if (!editing) return;
    const problems = validateRowActions(
      [...stored.filter((a) => a.id !== editing.id), editing],
      fields,
    ).filter((p) => p.actionId === editing.id);
    if (problems.length) {
      toast({ title: "Not saved yet", description: problems[0].message, variant: "destructive" });
      return;
    }
    const exists = stored.some((a) => a.id === editing.id);
    const next = exists ? stored.map((a) => (a.id === editing.id ? editing : a)) : [...stored, editing];
    if (await persist(next, `Saved "${editing.name.trim()}"`)) setEditing(null);
  };

  // ── The Actions tab speaks for itself on the Table settings surface ──────
  // Its values and both row-action write targets live HERE because the action
  // being edited is this component's state (register ARE-010 / ARE-011). With
  // no Table settings window mounted around it, nothing is registered.
  useSurfaceScopeContribution(TABLE_SETTINGS_SURFACE_NAME, "RowActionsEditor", () =>
    createTableSettingsRowActionsScope({
      saved_row_actions: stored.map((action) => ({
        id: action.id,
        name: action.name,
        kind: action.kind,
        ...(action.kind === "agent" ? { prompt: action.prompt ?? "" } : { steps: action.steps ?? [] }),
        sentence: describeRowAction(action, fields),
      })),
      ...(editing
        ? {
            editing_row_action: { ...editing, sentence: describeRowAction(editing, fields) },
            editing_row_action_problems: validateRowActions([editing], fields).map((p) => p.message),
            ...(editing.kind === "update" ? { formula_language: formulaLanguageText() } : {}),
          }
        : {}),
    }),
  );

  useSurfaceWriteHandlers(TABLE_SETTINGS_SURFACE_NAME, {
    editing_row_action: (value) => {
      const next = rowActionFromAgent(value, editing?.id ?? newRowActionId(), fields);
      setEditing(next);
    },
    row_action_step_formula: (value) => {
      const { field, expression } = stepFormulaFromAgent(value, settable);
      if (editing && editing.kind === "agent") {
        refuseSurfaceWrite(
          `"${editing.name || "The open action"}" is an agent action; it has no Calculate steps. Write the whole action with editing_row_action instead.`,
        );
      }
      const base: RowAction =
        editing ?? { id: newRowActionId(), name: "", kind: "update", steps: [], color: null, confirm: false };
      const steps = base.steps ?? [];
      const step: RowActionStep = { field: field.field_name, set: "formula", expression };
      const at = steps.findIndex((s) => s.field === field.field_name);
      setEditing({
        ...base,
        steps: at === -1 ? [...steps, step] : steps.map((s, i) => (i === at ? step : s)),
      });
    },
  });

  const remove = async (action: RowAction) => {
    const ok = await confirmDialog({
      title: `Remove "${action.name}"?`,
      description: "The button disappears from every row. Nothing already changed by it is undone.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    await persist(stored.filter((a) => a.id !== action.id), `Removed "${action.name}"`);
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Zap className="h-4 w-4 text-muted-foreground" />
            Row actions
          </div>
          <p className="text-xs text-muted-foreground">
            Buttons on every row. One click sets, clears or recalculates the cells you choose, or hands the row
            to an agent. Cell history keeps the old values.
          </p>
        </div>
        {!editing && !disabled && (
          <div className="flex shrink-0 gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => startNew("update")}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Update action
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => startNew("agent")}>
              <MessageSquareText className="mr-1 h-3.5 w-3.5" />
              Agent action
            </Button>
          </div>
        )}
      </div>

      {stored.length === 0 && !editing && (
        <p className="text-xs text-muted-foreground">
          No actions yet. Example: a <span className="font-medium">New Week</span> button that sets Status to
          AVAILABLE, clears Total, and moves Reset date forward 7 days.
        </p>
      )}

      {stored.length > 0 && (
        <ul className="divide-y rounded-md border">
          {stored.map((action) => (
            <li key={action.id} className="flex items-center gap-3 px-3 py-2">
              <span
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium",
                  rowActionButtonClass(action.color),
                )}
              >
                <RowActionIcon action={action} className="h-3 w-3" />
                {action.name}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={describeRowAction(action, fields)}>
                {describeRowAction(action, fields)}
                {action.confirm ? " Asks first." : ""}
              </span>
              {!disabled && (
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing({ ...action, steps: action.steps ? [...action.steps] : undefined })}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    title={`Remove "${action.name}"`}
                    onClick={() => void remove(action)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ActionForm
          action={editing}
          fields={fields}
          settable={settable}
          rows={rows}
          nameRow={nameRow}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={() => void saveEditing()}
          saving={saving}
        />
      )}
    </div>
  );
}

// ─── agent writes (Table settings surface) ──────────────────────────────────

/** The formula language as an agent reads it — the same list the editor shows. */
function formulaLanguageText(): string {
  return (
    FORMULA_FUNCTIONS.map((fn) => `${fn.signature} — ${fn.description}`).join("\n") +
    "\nOperators: + - * / % for numbers, & joins text, = != < <= > >= compare. Text goes in double quotes." +
    "\nReference a column as {Display name}. An empty cell counts as 0 in arithmetic and is skipped by SUM / AVERAGE."
  );
}

function findColumn(name: string, columns: readonly Field[]): Field | undefined {
  const lower = name.trim().toLowerCase();
  return (
    columns.find((f) => f.field_name.toLowerCase() === lower) ??
    columns.find((f) => f.display_name.toLowerCase() === lower)
  );
}

/**
 * An agent's `row_action_step_formula` value, checked the way the editor
 * checks a person's typing: a settable column, a formula that parses, and only
 * references to real columns. Throws (refusal) with the reason otherwise.
 */
export function stepFormulaFromAgent(
  value: unknown,
  settable: readonly Field[],
): { field: Field; expression: string } {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  if (typeof record.field !== "string" || typeof record.expression !== "string") {
    refuseSurfaceWrite(
      'row_action_step_formula expects { "field": "<column machine name>", "expression": "<formula>" }.',
    );
  }
  const field = findColumn(record.field as string, settable);
  if (!field) {
    refuseSurfaceWrite(
      `No column "${record.field}" can take a calculated value here. Columns: ${settable.map((f) => `${f.field_name} ("${f.display_name}")`).join(", ")}.`,
    );
  }
  const expression = (record.expression as string).trim();
  const parsed = parseFormula(expression);
  if (!parsed.ok) {
    refuseSurfaceWrite(`The formula does not parse: ${parsed.error} (at character ${parsed.position + 1}).`);
  }
  return { field: field!, expression };
}

/**
 * An agent's whole `editing_row_action` value, normalised and checked exactly
 * as Save action checks it (`validateRowActions`). Throws with every problem.
 */
export function rowActionFromAgent(value: unknown, id: string, fields: readonly Field[]): RowAction {
  const record = (value && typeof value === "object" ? value : null) as Record<string, unknown> | null;
  if (!record || typeof record.name !== "string" || (record.kind !== "update" && record.kind !== "agent")) {
    refuseSurfaceWrite(
      'editing_row_action expects { "name": "<button label>", "kind": "update" | "agent", "steps": [...] or "prompt": "..." }.',
    );
  }
  const common = {
    id,
    name: (record!.name as string).trim(),
    color: (typeof record!.color === "string" ? record!.color : null) as StyleColor | null,
    ...(typeof record!.icon === "string" && record!.icon ? { icon: record!.icon } : {}),
    confirm: record!.confirm === true,
  };
  let action: RowAction;
  if (record!.kind === "agent") {
    action = { ...common, kind: "agent", prompt: typeof record!.prompt === "string" ? record!.prompt : "" };
  } else {
    if (!Array.isArray(record!.steps)) refuseSurfaceWrite('An update action needs "steps".');
    const steps = (record!.steps as unknown[]).map((raw): RowActionStep => {
      const step = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const column = typeof step.field === "string" ? findColumn(step.field, fields) : undefined;
      const field = column?.field_name ?? String(step.field ?? "");
      if (step.set === "clear") return { field, set: "clear" };
      if (step.set === "formula") return { field, set: "formula", expression: String(step.expression ?? "").trim() };
      if (step.set === "value") {
        return { field, set: "value", value: column ? coerceForColumn(step.value, column.data_type) : step.value };
      }
      refuseSurfaceWrite(`Step for "${field}" needs "set": "value", "clear" or "formula".`);
    });
    action = { ...common, kind: "update", steps };
  }
  const problems = validateRowActions([action], fields).map((p) => p.message);
  if (problems.length > 0) refuseSurfaceWrite(`Not staged: ${problems.join(" ")}`);
  return action;
}

/** The action's icon: its picked icon, else a speech bubble for agent actions and a bolt for updates. */
export function RowActionIcon({ action, className }: { action: RowAction; className?: string }) {
  if (action.icon) return <IconResolver iconName={action.icon} className={className} />;
  return action.kind === "agent" ? <MessageSquareText className={className} /> : <Zap className={className} />;
}

// ─── one action ──────────────────────────────────────────────────────────────

function ActionForm(props: {
  action: RowAction;
  fields: readonly Field[];
  settable: readonly Field[];
  rows: readonly Row[];
  nameRow: (row: Row) => string;
  onChange: (next: RowAction) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { action, fields, settable, rows, nameRow, onChange } = props;
  const [previewRowId, setPreviewRowId] = useState<string>(rows[0]?.id ?? "");
  const previewRow = rows.find((r) => r.id === previewRowId) ?? rows[0] ?? null;
  const steps = action.steps ?? [];
  const used = new Set(steps.map((s) => s.field));
  const problems = validateRowActions([action], fields);

  const setStep = (index: number, next: RowActionStep) =>
    onChange({ ...action, steps: steps.map((s, i) => (i === index ? next : s)) });
  const removeStep = (index: number) => onChange({ ...action, steps: steps.filter((_, i) => i !== index) });
  const addStep = () => {
    const free = settable.find((f) => !used.has(f.field_name));
    if (!free) return;
    onChange({ ...action, steps: [...steps, { field: free.field_name, set: "clear" }] });
  };

  const preview =
    action.kind === "update" && previewRow && steps.length > 0 ? compileRowAction(action, previewRow, fields) : null;

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="space-y-1">
          <Label htmlFor="row-action-name" className="text-xs">Button label</Label>
          <Input
            id="row-action-name"
            value={action.name}
            placeholder={action.kind === "agent" ? "Summarize" : "New Week"}
            maxLength={80}
            onChange={(e) => onChange({ ...action, name: e.target.value })}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Color</Label>
          <Select
            value={action.color ?? NONE}
            onValueChange={(v) => onChange({ ...action, color: v === NONE ? null : (v as StyleColor) })}
          >
            <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Neutral</SelectItem>
              {STYLE_COLORS.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="flex items-center gap-2">
                    <span className={cn("h-3 w-3 rounded-full border", CHOICE_COLORS[c])} />
                    {STYLE_COLOR_LABELS[c]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Icon</Label>
          <div className="w-[160px]">
            <IconInputCompact
              id="row-action-icon"
              value={action.icon ?? ""}
              placeholder="zap"
              onChange={(iconName) => onChange({ ...action, icon: iconName || undefined })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ask first</Label>
          <div className="flex h-9 items-center">
            <Switch checked={action.confirm === true} onCheckedChange={(v) => onChange({ ...action, confirm: v })} />
          </div>
        </div>
      </div>

      {action.kind === "agent" ? (
        <div className="space-y-1">
          <Label htmlFor="row-action-prompt" className="text-xs">What should the agent do with the row?</Label>
          <Textarea
            id="row-action-prompt"
            rows={3}
            value={action.prompt ?? ""}
            placeholder="Look this account up and write a one-line status in the Notes column."
            onChange={(e) => onChange({ ...action, prompt: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            The agent receives the whole row and this table's tools, so it can read more rows or change cells.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Changes</Label>
            <div className="flex gap-1.5">
              {rows.length > 0 && (
                <Select
                  value=""
                  onValueChange={(rowId) => {
                    const row = rows.find((r) => r.id === rowId);
                    if (row) onChange({ ...action, steps: stepsFromRow(row, fields) });
                  }}
                >
                  <SelectTrigger className="h-7 w-auto gap-1 text-xs">
                    <SelectValue placeholder="Start from a row…" />
                  </SelectTrigger>
                  <SelectContent>
                    {rows.slice(0, 50).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{nameRow(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addStep} disabled={used.size >= settable.length}>
                <Plus className="mr-1 h-3 w-3" />
                Add a change
              </Button>
            </div>
          </div>
          {steps.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add a change, or start from a row to copy its values as a template and then remove the columns to keep.
            </p>
          )}
          {steps.map((step, index) => (
            <StepRow
              key={`${step.field}-${index}`}
              step={step}
              fields={fields}
              options={settable.filter((f) => f.field_name === step.field || !used.has(f.field_name))}
              row={previewRow}
              onChange={(next) => setStep(index, next)}
              onRemove={() => removeStep(index)}
            />
          ))}
        </div>
      )}

      {action.kind === "update" && rows.length > 0 && steps.length > 0 && (
        <div className="rounded-md border bg-background p-2 text-xs">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
            <span>Preview on</span>
            <Select value={previewRow?.id ?? ""} onValueChange={setPreviewRowId}>
              <SelectTrigger className="h-6 w-auto gap-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {rows.slice(0, 50).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{nameRow(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preview?.ok ? (
            <ul className="space-y-0.5">
              {Object.entries(preview.patch).map(([fieldName, value]) => {
                const f = fields.find((x) => x.field_name === fieldName);
                const before = previewRow ? previewRow.data?.[fieldName] : undefined;
                const fmt = f ? resolveFieldFormat(f.data_type, f.metadata) : null;
                const show = (v: unknown) =>
                  f && fmt ? (formatFieldValue(v, fmt, f.data_type).empty ? "empty" : formatFieldValue(v, fmt, f.data_type).text) : String(v ?? "empty");
                return (
                  <li key={fieldName}>
                    <span className="font-medium">{f?.display_name ?? fieldName}</span>: {show(before)} → {show(value)}
                  </li>
                );
              })}
            </ul>
          ) : preview ? (
            <p className="text-destructive">{preview.error} <ErrorAlchemyMenu error={preview.error} /></p>
          ) : null}
        </div>
      )}

      {/* One reason, beside the button it disables (ARE-032). The preview
          above already names a formula error, so it is not repeated here. */}
      <div className="flex items-center justify-end gap-2">
        {problems.length > 0 && (
          <p className="mr-auto min-w-0 text-xs text-destructive">
            {!action.name.trim()
              ? "Name the button to save it."
              : preview && !preview.ok && problems[0].message.endsWith(preview.error.replace(/^"[^"]*": /, ""))
                ? "Fix the change marked above to save."
                : problems[0].message}
          </p>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={props.onCancel} disabled={props.saving}>Cancel</Button>
        <Button type="button" size="sm" onClick={props.onSave} disabled={props.saving || problems.length > 0}>
          {props.saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          Save action
        </Button>
      </div>
    </div>
  );
}

// ─── one step ────────────────────────────────────────────────────────────────

function StepRow(props: {
  step: RowActionStep;
  fields: readonly Field[];
  options: readonly Field[];
  row: Row | null;
  onChange: (next: RowActionStep) => void;
  onRemove: () => void;
}) {
  const { step, fields, options, row, onChange } = props;
  const field = fields.find((f) => f.field_name === step.field);
  const format = field ? resolveFieldFormat(field.data_type, field.metadata) : null;
  const formulaConfig: FieldFormatConfig = {
    id: "formula",
    options: { formula: { expression: step.set === "formula" ? step.expression : "", resultFormat: "text" } },
  } as FieldFormatConfig;

  return (
    <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,160px)_120px_minmax(0,1fr)_auto]">
      <Select value={step.field} onValueChange={(v) => onChange({ ...step, field: v } as RowActionStep)}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((f) => (
            <SelectItem key={f.field_name} value={f.field_name}>{f.display_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={step.set}
        onValueChange={(v) => {
          if (v === "clear") onChange({ field: step.field, set: "clear" });
          else if (v === "value") onChange({ field: step.field, set: "value", value: null });
          else onChange({ field: step.field, set: "formula", expression: "" });
        }}
      >
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="value">Set to</SelectItem>
          <SelectItem value="clear">Clear</SelectItem>
          <SelectItem value="formula">Calculate</SelectItem>
        </SelectContent>
      </Select>
      <div className="min-w-0">
        {step.set === "value" && field && (
          formatHasOwnInput(format) ? (
            <FormatAwareInput
              id={`row-action-value-${step.field}`}
              format={format}
              dataType={field.data_type}
              value={step.value}
              row={row?.data ?? null}
              onChange={(next) => onChange({ field: step.field, set: "value", value: next })}
            />
          ) : (
            // Plain formats (text, number, date, …) have no owned editor —
            // the same fallback the row form makes, typed by the storage type.
            <Input
              id={`row-action-value-${step.field}`}
              type={
                field.data_type === "number" || field.data_type === "integer"
                  ? "number"
                  : field.data_type === "date"
                    ? "date"
                    : field.data_type === "datetime"
                      ? "datetime-local"
                      : "text"
              }
              step={field.data_type === "integer" ? 1 : field.data_type === "number" ? "any" : undefined}
              value={
                step.value === null || step.value === undefined
                  ? ""
                  : typeof step.value === "object"
                    ? JSON.stringify(step.value)
                    : String(step.value)
              }
              placeholder={field.data_type === "boolean" ? "true or false" : `New ${field.display_name.toLowerCase()}`}
              onChange={(e) =>
                onChange({
                  field: step.field,
                  set: "value",
                  value: coerceForColumn(e.target.value, field.data_type),
                })
              }
            />
          )
        )}
        {step.set === "clear" && <div className="flex h-9 items-center text-xs text-muted-foreground">Leaves the cell empty.</div>}
        {step.set === "formula" && (
          <FormulaExpressionEditor
            value={formulaConfig}
            onChange={(next) =>
              onChange({
                field: step.field,
                set: "formula",
                expression: (next.options as { formula?: { expression?: string } } | undefined)?.formula?.expression ?? "",
              })
            }
            siblingFields={fields.map((f) => ({
              field_name: f.field_name,
              display_name: f.display_name,
              data_type: f.data_type,
              metadata: f.metadata,
            }))}
            purpose="row-action"
            targetColumnName={field?.display_name}
            targetColumnType={field?.data_type}
            sampleRow={row?.data ?? null}
          />
        )}
      </div>
      <Button type="button" size="icon" variant="ghost" className="h-9 w-9" title="Remove this change" onClick={props.onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
