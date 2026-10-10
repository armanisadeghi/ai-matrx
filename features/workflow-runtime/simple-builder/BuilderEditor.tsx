"use client";

// features/workflow-runtime/simple-builder/BuilderEditor.tsx
//
// THE RIGHT HALF OF THE BUILDER: the trigger card, the condition, the stack of actions
// (Airtable's shape). Everything a person picks is a name, never an id:
//   - the condition and "becomes" are the store's ONE condition builder (`ConditionGroup`);
//   - tables, records and columns are records-ui's pickers (`TablePicker`, `TableScope`,
//     `RecordPicker`) and the design system's `CreatablePicker` the column rows use;
//   - an agent is THE agent picker (`AgentParamPicker` → `AgentListDropdown`);
//   - values carry placeholders through the platform's `VariableSelector` (`ValueText`).

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useFields } from "@ai-matrx/records/react";
import type { Field, RecordsDataSource } from "@ai-matrx/records";
import { createRecordsClient } from "@ai-matrx/records/core";
import {
  ConditionGroup,
  personActor,
  fieldName,
  type ConditionField,
} from "@ai-matrx/records-ui";
import {
  RecordPicker,
  TablePicker,
  TableScope,
  type TablesAnywhere,
} from "@ai-matrx/records-ui/pickers";
import { BasicInput, Checkbox, CreatablePicker, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { AgentParamPicker } from "@/features/source-library/components/AgentParamPicker";
import { VariableSelector } from "@/features/agents/components/variables-management/VariableSelector";
import { cn } from "@/lib/utils";
import {
  ACTION_LABEL,
  ACTION_ORDER,
  TRIGGER_LABEL,
  freshAction,
  placeholder,
  type ActionType,
  type BuilderAction,
  type BuilderSpec,
  type RuleExpr,
  type TriggerEvent,
  type ValueChoice,
} from "./builderSpec";
import { ValueText } from "./ValueText";
import { workflowSummary } from "./workflowSummary";

interface Seat {
  dataSource: RecordsDataSource;
  userId: string | null;
  tables: TablesAnywhere;
}

export function BuilderEditor({
  spec,
  onChange,
  tableName,
  readOnly,
  seat,
  issues,
}: {
  spec: BuilderSpec;
  onChange: (next: BuilderSpec) => void;
  tableName: string;
  readOnly: boolean;
  seat: Seat;
  issues: { field: string; says: string }[];
}) {
  return (
    <TableScope
      dataSource={seat.dataSource}
      userId={seat.userId}
      tableId={spec.trigger.table_id}
      tables={seat.tables}
      fallback={
        <p className="text-sm text-muted-foreground">
          Opening the table&hellip;
        </p>
      }
    >
      <EditorBody
        spec={spec}
        onChange={onChange}
        tableName={tableName}
        readOnly={readOnly}
        seat={seat}
        issues={issues}
      />
    </TableScope>
  );
}

function asConditionFields(
  fields: Field[] | null | undefined,
): ConditionField[] {
  return (fields ?? []).map((f) => ({
    id: String(f.id),
    key: f.key,
    label: fieldName(f),
    field: f,
  }));
}

function issueFor(
  issues: { field: string; says: string }[],
  prefix: string,
): string | null {
  return (
    issues.find((i) => i.field === prefix || i.field.startsWith(`${prefix}.`))
      ?.says ?? null
  );
}

function IssueLine({ says }: { says: string | null }) {
  return says ? <p className="text-xs text-destructive">{says}</p> : null;
}

function Card({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {aside}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function EditorBody({
  spec,
  onChange,
  tableName,
  readOnly,
  seat,
  issues,
}: {
  spec: BuilderSpec;
  onChange: (next: BuilderSpec) => void;
  tableName: string;
  readOnly: boolean;
  seat: Seat;
  issues: { field: string; says: string }[];
}) {
  const fields = useFields(spec.trigger.table_id);
  const all = fields.data ?? [];
  const conditionFields = asConditionFields(fields.data);

  /** Values every step may use: this record now, before the change, and earlier steps. */
  const recordChoices: ValueChoice[] = [
    ...all.map((f) => ({
      token: placeholder(`trigger.record.${f.key}`),
      label: fieldName(f),
    })),
    ...all.map((f) => ({
      token: placeholder(`trigger.before.${f.key}`),
      label: `${fieldName(f)} (before)`,
    })),
  ];
  const choicesForStep = (index: number): ValueChoice[] => {
    const earlier: ValueChoice[] = [];
    spec.actions.slice(0, index).forEach((a, i) => {
      if (
        a.type === "create_record" ||
        a.type === "update_other_record" ||
        a.type === "update_record"
      ) {
        earlier.push({
          token: placeholder(`steps.${i + 1}.output.record_id`),
          label: `Step ${i + 1}: record`,
        });
      }
    });
    return [...recordChoices, ...earlier];
  };

  const setTrigger = (patch: Partial<BuilderSpec["trigger"]>) =>
    onChange({ ...spec, trigger: { ...spec.trigger, ...patch } });
  const setAction = (index: number, next: BuilderAction) =>
    onChange({
      ...spec,
      actions: spec.actions.map((a, i) => (i === index ? next : a)),
    });
  const moveAction = (index: number, by: -1 | 1) => {
    const next = [...spec.actions];
    const [it] = next.splice(index, 1);
    next.splice(index + by, 0, it!);
    onChange({ ...spec, actions: next });
  };
  const removeAction = (index: number) =>
    onChange({ ...spec, actions: spec.actions.filter((_, i) => i !== index) });
  const addAction = (type: ActionType) =>
    onChange({
      ...spec,
      actions: [...spec.actions, freshAction(type, spec.trigger.table_id)],
    });

  return (
    <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-3">
      {/* What it will do, in one line, composed from the cards below. */}
      <p className="text-sm text-muted-foreground" data-workflow-summary="">
        {workflowSummary(spec, {
          tableName,
          fieldName: (ref) => {
            const f = all.find((x) => String(x.id) === ref || x.key === ref);
            return f ? fieldName(f) : null;
          },
          otherTableName: (id) =>
            seat.tables.rows.find((t) => t.table_id === id)?.table_name ?? null,
        })}
      </p>
      {/* ── The trigger ── */}
      <Card title="When">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="truncate font-medium">{tableName}</span>
          <span className="text-muted-foreground">record</span>
          <Select
            value={spec.trigger.event}
            onValueChange={(v) =>
              setTrigger({
                event: v as TriggerEvent,
                to: v === "record.matches" ? (spec.trigger.to ?? null) : null,
              })
            }
            disabled={readOnly}
          >
            <SelectTrigger
              className="h-8 w-auto min-w-[8rem]"
              aria-label="Event"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TRIGGER_LABEL) as TriggerEvent[]).map((e) => (
                <SelectItem key={e} value={e}>
                  {TRIGGER_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {spec.trigger.event === "record.matches" ? (
          <ConditionGroup
            lead="Becomes"
            emptyLabel="choose"
            expr={spec.trigger.to ?? null}
            fields={conditionFields}
            onChange={(next) =>
              setTrigger({ to: (next as RuleExpr | null) ?? null })
            }
            allowNesting={false}
          />
        ) : null}
        {spec.trigger.event === "record.updated" ? (
          <FieldsChooser
            fields={all}
            value={spec.trigger.field_ids ?? []}
            onChange={(ids) => setTrigger({ field_ids: ids })}
            disabled={readOnly}
          />
        ) : null}
        <IssueLine says={issueFor(issues, "trigger")} />
      </Card>

      {/* ── The condition ── */}
      <Card title="Condition">
        <ConditionGroup
          lead="Only if"
          expr={spec.condition ?? null}
          fields={conditionFields}
          emptyLabel="always"
          onChange={(next) =>
            onChange({ ...spec, condition: (next as RuleExpr | null) ?? null })
          }
        />
        <IssueLine says={issueFor(issues, "condition")} />
      </Card>

      {/* ── The actions ── */}
      {spec.actions.map((action, index) => (
        <Card
          key={index}
          title={`${index + 1}. ${ACTION_LABEL[action.type]}`}
          aside={
            readOnly ? null : (
              <div className="flex items-center">
                <Button
                  icon={<ArrowUp />}
                  type="button"
                  variant="quiet"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => moveAction(index, -1)}
                />
                <Button
                  icon={<ArrowDown />}
                  type="button"
                  variant="quiet"
                  aria-label="Move down"
                  disabled={index === spec.actions.length - 1}
                  onClick={() => moveAction(index, 1)}
                />
                <Button
                  icon={<Trash2 />}
                  type="button"
                  variant="quiet"
                  aria-label="Remove step"
                  onClick={() => removeAction(index)}
                />
              </div>
            )
          }
        >
          <ActionFields
            action={action}
            onChange={(next) => setAction(index, next)}
            triggerFields={all}
            triggerTableId={spec.trigger.table_id}
            choices={choicesForStep(index)}
            readOnly={readOnly}
            seat={seat}
          />
          <IssueLine says={issueFor(issues, `actions.${index}`)} />
        </Card>
      ))}
      <IssueLine says={issueFor(issues, "actions")} />

      {readOnly ? null : <AddStep onAdd={addAction} />}
    </fieldset>
  );
}

function AddStep({ onAdd }: { onAdd: (type: ActionType) => void }) {
  return (
    <CreatablePicker
      value={null}
      options={ACTION_ORDER.map((t) => ({ value: t, label: ACTION_LABEL[t] }))}
      onSelect={(v) => onAdd(v as ActionType)}
      placeholder="Add a step"
      searchPlaceholder="Search steps"
      noun="step"
      ariaLabel="Add a step"
      triggerClassName="w-full justify-start"
    />
  );
}

function FieldsChooser({
  fields,
  value,
  onChange,
  disabled,
}: {
  fields: Field[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const chosen = fields.filter((f) => value.includes(String(f.id)));
  const label =
    chosen.length === 0 ? "Any column" : chosen.map(fieldName).join(", ");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="max-w-full justify-start"
          disabled={disabled}
        >
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        sizing="content"
        align="start"
        className="max-h-80 overflow-y-auto p-1"
      >
        {fields.map((f) => {
          const id = String(f.id);
          const on = value.includes(id);
          return (
            <label
              key={id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={on}
                onCheckedChange={(c) =>
                  onChange(c ? [...value, id] : value.filter((v) => v !== id))
                }
              />
              <span className="truncate">{fieldName(f)}</span>
            </label>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** Column = value rows for one table. Must sit inside that table's `TableScope`. */
function ColumnValueRows({
  tableId,
  value,
  onChange,
  choices,
  readOnly,
}: {
  tableId: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  choices: ValueChoice[];
  readOnly: boolean;
}) {
  const fields = useFields(tableId);
  const all = fields.data ?? [];
  const keys = Object.keys(value);
  const optionsFor = (current: string | null) =>
    all
      .filter((f) => f.key === current || !(f.key in value))
      .map((f) => ({ value: f.key, label: fieldName(f) }));
  const rename = (from: string, to: string) => {
    const next: Record<string, unknown> = {};
    for (const k of keys) next[k === from ? to : k] = value[k];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {keys.map((key) => (
        <div
          key={key}
          className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-start"
        >
          <CreatablePicker
            value={key}
            options={optionsFor(key)}
            onSelect={(to) => rename(key, to)}
            placeholder="Choose a column"
            searchPlaceholder="Search columns"
            noun="column"
            disabled={readOnly}
            loading={fields.loading}
          />
          <ValueText
            value={
              typeof value[key] === "string"
                ? (value[key] as string)
                : value[key] == null
                  ? ""
                  : String(value[key])
            }
            onChange={(v) => onChange({ ...value, [key]: v })}
            choices={choices}
            disabled={readOnly}
            ariaLabel={`Value for ${all.find((f) => f.key === key) ? fieldName(all.find((f) => f.key === key)!) : key}`}
          />
          {readOnly ? null : (
            <Button
              icon={<Trash2 />}
              type="button"
              variant="quiet"
              className="justify-self-end"
              aria-label="Remove value"
              onClick={() => {
                const { [key]: _gone, ...rest } = value;
                void _gone;
                onChange(rest);
              }}
            />
          )}
        </div>
      ))}
      {readOnly || (!fields.loading && keys.length >= all.length) ? null : (
        <CreatablePicker
          value={null}
          options={optionsFor(null)}
          onSelect={(k) => onChange({ ...value, [k]: "" })}
          placeholder="Add a value"
          searchPlaceholder="Search columns"
          noun="column"
          loading={fields.loading}
          triggerClassName="w-full justify-start sm:w-auto"
        />
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const ME = "me";

/** Who a message goes to: a column of this record, me, or (text, email) a typed address. */
function RecipientPicker({
  action,
  onChange,
  fields,
  fieldKey,
  typedLabel,
  allowMe,
  userId,
  disabled,
}: {
  action: BuilderAction;
  onChange: (next: BuilderAction) => void;
  fields: Field[];
  fieldKey: "person_field" | "phone_field" | "email_field";
  typedLabel?: string;
  allowMe: boolean;
  userId: string | null;
  disabled: boolean;
}) {
  const field =
    typeof action[fieldKey] === "string" ? (action[fieldKey] as string) : null;
  const typed = typeof action.to === "string" ? action.to : null;
  const me =
    allowMe && typeof action.user_id === "string" && action.user_id === userId;
  const options = [
    ...(allowMe ? [{ value: ME, label: "Me", group: "Person" }] : []),
    ...fields.map((f) => ({
      value: `field:${f.key}`,
      label: fieldName(f),
      group: "From this record",
    })),
  ];
  const value = me
    ? ME
    : field
      ? `field:${field}`
      : typed
        ? `to:${typed}`
        : null;
  const clear = (a: BuilderAction): BuilderAction => {
    const { [fieldKey]: _f, to: _t, user_id: _u, ...rest } = a;
    void _f;
    void _t;
    void _u;
    return rest as BuilderAction;
  };
  return (
    <CreatablePicker
      value={value}
      options={
        typed ? [{ value: `to:${typed}`, label: typed }, ...options] : options
      }
      onSelect={(v) => {
        const base = clear(action);
        if (v === ME) onChange({ ...base, user_id: userId });
        else if (v.startsWith("field:"))
          onChange({ ...base, [fieldKey]: v.slice(6) });
        else if (v.startsWith("to:")) onChange({ ...base, to: v.slice(3) });
      }}
      {...(typedLabel
        ? {
            onCreate: async (t: string) => {
              onChange({ ...clear(action), to: t.trim() });
              return `to:${t.trim()}`;
            },
          }
        : {})}
      placeholder="Choose who"
      searchPlaceholder={typedLabel ?? "Search columns"}
      noun="recipient"
      disabled={disabled}
    />
  );
}

function ActionFields({
  action,
  onChange,
  triggerFields,
  triggerTableId,
  choices,
  readOnly,
  seat,
}: {
  action: BuilderAction;
  onChange: (next: BuilderAction) => void;
  triggerFields: Field[];
  triggerTableId: string;
  choices: ValueChoice[];
  readOnly: boolean;
  seat: Seat;
}) {
  const text = (key: string) =>
    typeof action[key] === "string" ? (action[key] as string) : "";
  const set = (key: string, v: unknown) => onChange({ ...action, [key]: v });
  const values = (
    action.values && typeof action.values === "object" ? action.values : {}
  ) as Record<string, unknown>;

  switch (action.type) {
    case "update_record":
      return (
        <ColumnValueRows
          tableId={triggerTableId}
          value={values}
          onChange={(v) => set("values", v)}
          choices={choices}
          readOnly={readOnly}
        />
      );
    case "create_record":
    case "update_other_record": {
      const tableId = text("table_id") || null;
      return (
        <>
          <Labeled label="Table">
            <TablePicker
              dataSource={seat.dataSource}
              value={tableId}
              tables={seat.tables}
              disabled={readOnly}
              onChange={(t) =>
                onChange({
                  ...action,
                  table_id: t,
                  values: {},
                  ...(action.type === "update_other_record"
                    ? { record_id: "" }
                    : {}),
                })
              }
            />
          </Labeled>
          {tableId ? (
            <TableScope
              dataSource={seat.dataSource}
              userId={seat.userId}
              tableId={tableId}
              tables={seat.tables}
            >
              {action.type === "update_other_record" ? (
                <Labeled label="Record">
                  <RecordOrValue
                    tableId={tableId}
                    value={text("record_id")}
                    onChange={(v) => set("record_id", v)}
                    choices={choices}
                    disabled={readOnly}
                  />
                </Labeled>
              ) : null}
              <Labeled label="Values">
                <ColumnValueRows
                  tableId={tableId}
                  value={values}
                  onChange={(v) => set("values", v)}
                  choices={choices}
                  readOnly={readOnly}
                />
              </Labeled>
            </TableScope>
          ) : null}
        </>
      );
    }
    case "run_agent":
      return (
        <>
          <AgentParamPicker
            label="Agent"
            value={text("agent_id") || null}
            onChange={(v) => set("agent_id", v ?? "")}
          />
          <Labeled label="Message">
            <ValueText
              value={text("user_input")}
              onChange={(v) => set("user_input", v)}
              choices={choices}
              multiline
              disabled={readOnly}
              ariaLabel="Message to the agent"
            />
          </Labeled>
        </>
      );
    case "call_webhook":
      return (
        <Labeled label="Address">
          <BasicInput
            value={text("url")}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://example.com/hooks/referrals"
            aria-label="Webhook address"
            className="text-base sm:text-sm"
            disabled={readOnly}
          />
        </Labeled>
      );
    case "notify_person":
      return (
        <>
          <Labeled label="To">
            <RecipientPicker
              action={action}
              onChange={onChange}
              fields={triggerFields}
              fieldKey="person_field"
              allowMe
              userId={seat.userId}
              disabled={readOnly}
            />
          </Labeled>
          <Labeled label="Title">
            <ValueText
              value={text("title")}
              onChange={(v) => set("title", v)}
              choices={choices}
              disabled={readOnly}
              ariaLabel="Title"
            />
          </Labeled>
          <Labeled label="Message">
            <ValueText
              value={text("message")}
              onChange={(v) => set("message", v)}
              choices={choices}
              multiline
              disabled={readOnly}
              ariaLabel="Message"
            />
          </Labeled>
        </>
      );
    case "send_text":
      return (
        <>
          <Labeled label="To">
            <RecipientPicker
              action={action}
              onChange={onChange}
              fields={triggerFields}
              fieldKey="phone_field"
              typedLabel="Search or type a number"
              allowMe={false}
              userId={seat.userId}
              disabled={readOnly}
            />
          </Labeled>
          <Labeled label="Message">
            <ValueText
              value={text("message")}
              onChange={(v) => set("message", v)}
              choices={choices}
              multiline
              disabled={readOnly}
              ariaLabel="Text message"
            />
          </Labeled>
        </>
      );
    case "send_email":
      return (
        <>
          <Labeled label="To">
            <RecipientPicker
              action={action}
              onChange={onChange}
              fields={triggerFields}
              fieldKey="email_field"
              typedLabel="Search or type an address"
              allowMe={false}
              userId={seat.userId}
              disabled={readOnly}
            />
          </Labeled>
          <Labeled label="Subject">
            <ValueText
              value={text("subject")}
              onChange={(v) => set("subject", v)}
              choices={choices}
              disabled={readOnly}
              ariaLabel="Subject"
            />
          </Labeled>
          <Labeled label="Body">
            <ValueText
              value={text("body")}
              onChange={(v) => set("body", v)}
              choices={choices}
              multiline
              disabled={readOnly}
              ariaLabel="Body"
            />
          </Labeled>
        </>
      );
    case "fill_with_ai":
      // The column's OWN enrichment (its instruction and inputs) runs for this record — a
      // column a model fills is set up once, on the column; this step just says "now".
      return (
        <AiColumnPicker
          seat={seat}
          tableId={triggerTableId}
          value={text("field_id")}
          onChange={(v) => set("field_id", v)}
          disabled={readOnly}
        />
      );
    case "wait":
      return (
        <WaitFields
          seconds={typeof action.seconds === "number" ? action.seconds : 3600}
          onChange={(s) => set("seconds", s)}
          disabled={readOnly}
        />
      );
  }
}

/**
 * The table's AI-filled columns, as the store answers them (`custom.enrichments`) — not every
 * column an agent happened to create (those all say `source: "agent"`).
 */
function AiColumnPicker({
  seat,
  tableId,
  value,
  onChange,
  disabled,
}: {
  seat: Seat;
  tableId: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [columns, setColumns] = useState<{ id: string; label: string }[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const organizationId =
    (seat.tables.rows.find((t) => t.table_id === tableId) as { organization_id?: string } | undefined)
      ?.organization_id ?? null;
  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    const client = createRecordsClient({
      dataSource: seat.dataSource,
      actor: personActor(seat.userId),
      organizationId,
    });
    void client.enrichments({ table_id: tableId }).then((answer) => {
      if (!live) return;
      if (!answer.ok) {
        setWhy(answer.error.message);
        setColumns([]);
        return;
      }
      setColumns(answer.data.map((e) => ({ id: String(e.field_id), label: e.label || e.field_key })));
    });
    return () => {
      live = false;
    };
  }, [seat.dataSource, seat.userId, organizationId, tableId]);

  if (why) return <p className="text-xs text-destructive">{why}</p>;
  if (columns === null) return <p className="text-xs text-muted-foreground">Finding the AI columns…</p>;
  if (columns.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No column on this table is filled by AI yet. Set one up from the column&apos;s menu first.
      </p>
    );
  }
  return (
    <Labeled label="Column">
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 w-auto min-w-[10rem]" aria-label="Column">
          <SelectValue placeholder="Choose a column" />
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Labeled>
  );
}

const UNITS = [
  { value: "60", label: "minutes" },
  { value: "3600", label: "hours" },
  { value: "86400", label: "days" },
];

function WaitFields({
  seconds,
  onChange,
  disabled,
}: {
  seconds: number;
  onChange: (s: number) => void;
  disabled: boolean;
}) {
  const unit =
    [...UNITS].reverse().find((u) => seconds % Number(u.value) === 0) ??
    UNITS[0]!;
  const amount = seconds / Number(unit.value);
  return (
    <div className="flex items-center gap-2">
      <BasicInput
        type="number"
        min={1}
        value={String(amount)}
        onChange={(e) =>
          onChange(
            Math.max(1, Number(e.target.value) || 1) * Number(unit.value),
          )
        }
        aria-label="How long"
        className="w-24 text-base sm:text-sm"
        disabled={disabled}
      />
      <Select
        value={unit.value}
        onValueChange={(u) => onChange(amount * Number(u))}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 w-32" aria-label="Unit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNITS.map((u) => (
            <SelectItem key={u.value} value={u.value}>
              {u.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A record picked by its name — or a value from this Workflow (a link column, an earlier step). */
function RecordOrValue({
  tableId,
  value,
  onChange,
  choices,
  disabled,
}: {
  tableId: string;
  value: string;
  onChange: (v: string) => void;
  choices: ValueChoice[];
  disabled: boolean;
}) {
  const isValue = value.includes("{{");
  return (
    <div className={cn("flex min-w-0 items-start gap-1")}>
      <div className="min-w-0 flex-1">
        {isValue ? (
          <ValueText
            value={value}
            onChange={onChange}
            choices={choices}
            disabled={disabled}
            ariaLabel="Record"
          />
        ) : (
          <RecordPicker
            tableId={tableId}
            value={value || null}
            onChange={onChange}
            disabled={disabled}
          />
        )}
      </div>
      {disabled || isValue ? null : (
        <VariableSelector
          variables={choices.map((c) => c.token)}
          labelFor={(t) => choices.find((c) => c.token === t)?.label ?? t}
          onVariableSelected={onChange}
          ariaLabel="Use a value"
        />
      )}
    </div>
  );
}
