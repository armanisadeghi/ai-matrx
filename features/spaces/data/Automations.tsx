"use client";

/**
 * N9 — Notion's database Automations, on the store's automation door (`@ai-matrx/records` 0.77.1
 * `automation.ts`; records FEATURE.md § "Automations on a table"). A trigger (page added, property edited
 * [to a value], form answered; a schedule is refused by the store, so it is shown unavailable), an optional
 * condition, actions (set, add page, edit pages, notify, webhook, agent), an on/off switch, archive and
 * restore, and each automation's runs with every step's status and words. Properties are named by Field id.
 * Nothing here decides access: every call runs as the person and the store refuses in its own words.
 */
import { useEffect, useState } from "react";
import { History, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button, Input, Switch } from "@ai-matrx/design-system/controls";
import type { AutomationAction, AutomationItem, AutomationRun, AutomationSpec, AutomationValue } from "@ai-matrx/records";
import { useRecordsClient, type Field } from "@ai-matrx/records/react";

import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";

/** How many runs the history shows: the `spaces.automation_runs_shown` knob (admin → org → person). */
const RUNS_KNOB = { feature: "spaces", key: "automation_runs_shown" } as const;

type TriggerOn = "row_added" | "property_edited" | "form_answered";
type ValueKind = "text" | "now" | "me" | "clear" | "from";
/** One action as the panel edits it; `toAction` turns it into the store's spec. */
type Draft =
  | { kind: "set"; field: string; value: ValueKind; text: string; from: string }
  | { kind: "add"; title: string }
  | { kind: "edit"; whereField: string; whereIs: string; field: string; value: ValueKind; text: string; from: string }
  | { kind: "notify"; to: "author" | string; text: string }
  | { kind: "webhook"; url: string }
  | { kind: "agent"; prompt: string };

function valueOf(kind: ValueKind, text: string, from: string): AutomationValue {
  if (kind === "now") return { now: true };
  if (kind === "me") return { me: true };
  if (kind === "clear") return { clear: true };
  if (kind === "from") return { from };
  return text;
}

function toAction(d: Draft, tableId: string, titleField: string): AutomationAction {
  switch (d.kind) {
    case "set":
      return { do: "set", values: { [d.field]: valueOf(d.value, d.text, d.from) } };
    case "add":
      return { do: "add_row", table_id: tableId, values: { [titleField]: d.title } };
    case "edit":
      return { do: "edit_rows", table_id: tableId, where: { op: "eq", args: [{ field: d.whereField }, { const: d.whereIs }] }, values: { [d.field]: valueOf(d.value, d.text, d.from) } };
    case "notify":
      return { do: "notify", to: d.to === "author" ? { author: true } : { field: d.to }, text: d.text };
    case "webhook":
      return { do: "webhook", url: d.url };
    case "agent":
      return { do: "agent", prompt: d.prompt };
  }
}

/** Back from the store's spec to the panel's drafts (editing an automation that exists). */
function toDraft(a: AutomationAction, firstField: string): Draft {
  const one = (values: Record<string, AutomationValue>) => {
    const [field, v] = Object.entries(values)[0] ?? [firstField, ""];
    const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    const value: ValueKind = o?.now ? "now" : o?.me ? "me" : o?.clear ? "clear" : o && "from" in o ? "from" : "text";
    return { field, value, text: o ? "" : String(v ?? ""), from: o && "from" in o ? String(o.from) : firstField };
  };
  switch (a.do) {
    case "set":
      return { kind: "set", ...one(a.values) };
    case "add_row":
      return { kind: "add", title: String(Object.values(a.values)[0] ?? "") };
    case "edit_rows": {
      const args = (a.where as { args?: Array<{ field?: string; const?: unknown }> }).args ?? [];
      return { kind: "edit", whereField: args[0]?.field ?? firstField, whereIs: String(args[1]?.const ?? ""), ...one(a.values) };
    }
    case "notify":
      return { kind: "notify", to: "author" in a.to ? "author" : "field" in a.to ? a.to.field : "author", text: a.text };
    case "webhook":
      return { kind: "webhook", url: a.url };
    case "agent":
      return { kind: "agent", prompt: a.prompt };
  }
}

const nameOf = (fields: Field[], id: string | undefined) => fields.find((f) => f.id === id)?.label ?? "a property";

export function describeSpec(spec: AutomationSpec, fields: Field[]): string {
  const t = spec.trigger;
  const when =
    t.on === "row_added" ? "Page added" : t.on === "form_answered" ? "Form answered" : `${nameOf(fields, t.field)} edited${t.to !== undefined && t.to !== null && t.to !== "" ? ` to ${String(t.to)}` : ""}`;
  const does = spec.actions.map((a) => (a.do === "set" ? `set ${Object.keys(a.values).map((id) => nameOf(fields, id)).join(", ")}` : a.do === "add_row" ? "add page" : a.do === "edit_rows" ? "edit pages" : a.do === "notify" ? "notify" : a.do));
  return `${when} → ${does.join(", ")}`;
}

function Pill({ on, children, onClick, disabledReason }: { on: boolean; children: React.ReactNode; onClick?: () => void; disabledReason?: string }) {
  return (
    <Button variant={on ? "outline" : "quiet"} data-active={on ? "true" : undefined} disabled={Boolean(disabledReason)} title={disabledReason} onClick={onClick}>
      {children}
    </Button>
  );
}

function FieldPills({ fields, value, onPick }: { fields: Field[]; value: string; onPick: (id: string) => void }) {
  return (
    <>
      {fields.map((f) => (
        <Pill key={f.id} on={value === f.id} onClick={() => onPick(f.id)}>
          {f.label || f.key}
        </Pill>
      ))}
    </>
  );
}

function ValueEditor({ fields, d, put }: { fields: Field[]; d: { value: ValueKind; text: string; from: string }; put: (p: Partial<{ value: ValueKind; text: string; from: string }>) => void }) {
  const kinds: Array<[ValueKind, string]> = [["text", "Value"], ["now", "Now"], ["me", "Me"], ["clear", "Empty"], ["from", "Copy from"]];
  return (
    <>
      {kinds.map(([k, label]) => (
        <Pill key={k} on={d.value === k} onClick={() => put({ value: k })}>
          {label}
        </Pill>
      ))}
      {d.value === "text" ? <Input aria-label="Value" placeholder="Value" value={d.text} onChange={(e) => put({ text: e.target.value })} /> : null}
      {d.value === "from" ? <FieldPills fields={fields} value={d.from} onPick={(from) => put({ from })} /> : null}
    </>
  );
}

function RunHistory({ automationId, limit }: { automationId: string; limit: number }) {
  const client = useRecordsClient();
  const [runs, setRuns] = useState<AutomationRun[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void client.automationRuns({ automation_id: automationId as never, limit }).then((got) => {
      if (!live) return;
      if (got.ok) setRuns(got.data.runs);
      else setProblem(got.error.message || "The runs could not be read.");
    });
    return () => {
      live = false;
    };
  }, [client, automationId, limit]);
  if (problem) return <p className="type-secondary text-destructive">{problem}</p>;
  if (!runs) return <div aria-busy="true" className="h-6" />;
  if (runs.length === 0) return <p className="type-secondary text-muted-foreground">No runs yet</p>;
  return (
    <ol className="flex flex-col gap-1" data-testid="spaces-automation-runs">
      {runs.map((r) => (
        <li key={r.run_id} className="flex flex-col" data-run-status={r.status}>
          <span className="type-secondary">
            <strong className="capitalize">{r.status}</strong> · {new Date(r.at).toLocaleString()}
            {r.says ? ` · ${r.says}` : ""}
          </span>
          {r.steps.map((s) => (
            <span key={s.n} className="type-secondary text-muted-foreground" data-step-status={s.status}>
              {s.n}. {s.do} — {s.status}: {s.says}
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}

/** The Automations popover body: the list (on/off, runs, archive / restore), then the editor. */
export function AutomationsPanel({ tableId, organizationId, fields }: { tableId: string; organizationId: string | null; fields: Field[] }) {
  const client = useRecordsClient();
  const runsShown = Number(useEffectiveKnob(organizationId, null, RUNS_KNOB) ?? 20) || 20;
  const [list, setList] = useState<AutomationItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [runsOf, setRunsOf] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [name, setName] = useState("");
  const [on, setOn] = useState<TriggerOn>("row_added");
  const [trigField, setTrigField] = useState("");
  const [trigTo, setTrigTo] = useState("");
  const [condField, setCondField] = useState<string | null>(null);
  const [condIs, setCondIs] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const firstField = fields[0]?.id ?? "";
  const [epoch, setEpoch] = useState(0);
  const reread = () => setEpoch((n) => n + 1);

  useEffect(() => {
    let live = true;
    void client.automations({ table_id: tableId as never, include_archived: showArchived }).then((got) => {
      if (!live) return;
      if (got.ok) {
        setList(got.data.automations);
        setProblem(null);
      } else setProblem(got.error.message || "The automations could not be read.");
    });
    return () => {
      live = false;
    };
  }, [client, tableId, showArchived, epoch]);

  const put = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((x, j) => (j === i ? ({ ...x, ...patch } as Draft) : x)));
  const startNew = () => {
    setEditing({ id: null });
    setName("");
    setOn("row_added");
    setTrigField(firstField);
    setTrigTo("");
    setCondField(null);
    setCondIs("");
    setDrafts([]);
    setSaid(null);
  };
  const startEdit = (a: AutomationItem) => {
    const t = a.spec.trigger;
    setEditing({ id: a.id });
    setName(a.spec.name);
    setOn(t.on);
    setTrigField(t.on === "property_edited" ? t.field : firstField);
    setTrigTo(t.on === "property_edited" && t.to !== undefined && t.to !== null ? String(t.to) : "");
    const c = a.spec.condition as { args?: Array<{ field?: string; const?: unknown }> } | null | undefined;
    setCondField(c?.args?.[0]?.field ?? null);
    setCondIs(String(c?.args?.[1]?.const ?? ""));
    setDrafts(a.spec.actions.map((x) => toDraft(x, firstField)));
    setSaid(null);
  };
  const flip = async (call: Promise<{ ok: boolean; error?: { message?: string } }>) => {
    const got = await call;
    setSaid(got.ok ? null : got.error?.message || "That did not change.");
    reread();
  };
  const save = async () => {
    const spec: AutomationSpec = {
      name: name.trim(),
      trigger: on === "property_edited" ? { on, field: trigField, ...(trigTo ? { to: trigTo } : {}) } : { on },
      condition: condField ? { op: "eq", args: [{ field: condField }, { const: condIs }] } : null,
      actions: drafts.map((d) => toAction(d, tableId, firstField)),
    };
    const got = await client.automationDeclare({ table_id: tableId as never, spec, automation_id: (editing?.id ?? null) as never });
    if (!got.ok) return setSaid(got.error.message || "The automation was not saved.");
    if (!got.data.ok) return setSaid(Object.values(got.data._errors)[0] ?? "The automation was not saved.");
    setEditing(null);
    setSaid(null);
    reread();
  };

  if (problem) return <div className="spaces-db-automations" data-testid="spaces-automations" data-state="failed"><p className="type-secondary text-destructive">{problem}</p></div>;
  if (!list) return <div className="spaces-db-automations h-8" data-testid="spaces-automations" aria-busy="true" />;

  return (
    <div className="spaces-db-automations flex flex-col gap-2" data-testid="spaces-automations" data-state="on">
      {editing ? (
        <div className="flex flex-col gap-2" data-testid="spaces-automation-editor">
          <Input aria-label="Automation name" placeholder="Automation name" value={name} onChange={(e) => setName(e.target.value)} />
          <span className="type-secondary text-muted-foreground">When</span>
          <div className="flex flex-wrap gap-1">
            <Pill on={on === "row_added"} onClick={() => setOn("row_added")}>Page added</Pill>
            <Pill on={on === "property_edited"} onClick={() => setOn("property_edited")}>Property edited</Pill>
            <Pill on={on === "form_answered"} onClick={() => setOn("form_answered")}>Form answered</Pill>
            <Pill on={false} disabledReason="Schedules are not available for automations yet">Every…</Pill>
          </div>
          {on === "property_edited" ? (
            <div className="flex flex-wrap items-center gap-1">
              <FieldPills fields={fields} value={trigField} onPick={setTrigField} />
              <Input aria-label="Edited to" placeholder="to any value" value={trigTo} onChange={(e) => setTrigTo(e.target.value)} />
            </div>
          ) : null}
          <span className="type-secondary text-muted-foreground">Only if</span>
          <div className="flex flex-wrap items-center gap-1">
            <Pill on={condField === null} onClick={() => setCondField(null)}>Always</Pill>
            <FieldPills fields={fields} value={condField ?? ""} onPick={setCondField} />
            {condField ? <Input aria-label="Condition value" placeholder="is" value={condIs} onChange={(e) => setCondIs(e.target.value)} /> : null}
          </div>
          <span className="type-secondary text-muted-foreground">Do</span>
          {drafts.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1" data-testid="spaces-automation-action">
              {d.kind === "set" ? (
                <>
                  <span className="type-secondary">Set</span>
                  <FieldPills fields={fields} value={d.field} onPick={(field) => put(i, { field })} />
                  <ValueEditor fields={fields} d={d} put={(p) => put(i, p)} />
                </>
              ) : d.kind === "add" ? (
                <Input aria-label="New page name" placeholder="Add a page named" value={d.title} onChange={(e) => put(i, { title: e.target.value })} />
              ) : d.kind === "edit" ? (
                <>
                  <span className="type-secondary">Edit pages where</span>
                  <FieldPills fields={fields} value={d.whereField} onPick={(whereField) => put(i, { whereField })} />
                  <Input aria-label="Where value" placeholder="is" value={d.whereIs} onChange={(e) => put(i, { whereIs: e.target.value })} />
                  <span className="type-secondary">set</span>
                  <FieldPills fields={fields} value={d.field} onPick={(field) => put(i, { field })} />
                  <ValueEditor fields={fields} d={d} put={(p) => put(i, p)} />
                </>
              ) : d.kind === "notify" ? (
                <>
                  <span className="type-secondary">Notify</span>
                  <Pill on={d.to === "author"} onClick={() => put(i, { to: "author" })}>The author</Pill>
                  {fields
                    .filter((f) => /person|member|user/i.test(String(f.type)) || /person|member/i.test(String((f.config as Record<string, unknown> | undefined)?.["kind"] ?? "")))
                    .map((f) => (
                      <Pill key={f.id} on={d.to === f.id} onClick={() => put(i, { to: f.id })}>
                        {f.label}
                      </Pill>
                    ))}
                  <Input aria-label="Notification text" placeholder="Message, {{Name}} for a property" value={d.text} onChange={(e) => put(i, { text: e.target.value })} />
                </>
              ) : d.kind === "webhook" ? (
                <Input aria-label="Webhook address" placeholder="https://" value={d.url} onChange={(e) => put(i, { url: e.target.value })} />
              ) : (
                <Input aria-label="Agent prompt" placeholder="Ask an agent" value={d.prompt} onChange={(e) => put(i, { prompt: e.target.value })} />
              )}
              <Button variant="quiet" icon={<X size={14} />} aria-label="Remove action" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setDrafts([...drafts, { kind: "set", field: firstField, value: "text", text: "", from: firstField }])}>Set property</Button>
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setDrafts([...drafts, { kind: "add", title: "" }])}>Add page</Button>
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setDrafts([...drafts, { kind: "edit", whereField: firstField, whereIs: "", field: firstField, value: "text", text: "", from: firstField }])}>Edit pages</Button>
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setDrafts([...drafts, { kind: "notify", to: "author", text: "" }])}>Send notification</Button>
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setDrafts([...drafts, { kind: "webhook", url: "" }])}>Webhook</Button>
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setDrafts([...drafts, { kind: "agent", prompt: "" }])}>Agent</Button>
          </div>
          {said ? <p className="type-secondary text-destructive">{said}</p> : null}
          <div className="flex justify-end gap-1">
            <Button variant="quiet" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" disabled={drafts.length === 0 || !name.trim()} onClick={() => void save()}>
              {editing.id ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {list.length === 0 ? <p className="type-secondary text-muted-foreground">No automations</p> : null}
          {list.map((a) => (
            <div key={a.id} className="flex flex-col gap-1" data-testid="spaces-automation-row" data-archived={a.archived_at ? "true" : undefined}>
              <div className="flex items-center gap-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => (a.archived_at ? undefined : startEdit(a))}>
                  <div className="type-body truncate">{a.spec.name || a.name}</div>
                  <div className="type-secondary truncate text-muted-foreground">
                    {describeSpec(a.spec, fields)}
                    {a.last_run ? ` · last run ${a.last_run.status}` : ""}
                  </div>
                </button>
                {a.archived_at ? (
                  <Button variant="quiet" icon={<RotateCcw size={14} />} aria-label="Restore automation" onClick={() => void flip(client.automationRestore({ automation_id: a.id }))} />
                ) : (
                  <>
                    <Switch aria-label="Automation on" checked={a.enabled} onCheckedChange={(v: boolean) => void flip(client.automationSetEnabled({ automation_id: a.id, enabled: v }))} />
                    <Button variant="quiet" icon={<History size={14} />} aria-label="Runs" onClick={() => setRunsOf(runsOf === a.id ? null : a.id)} />
                    <Button variant="quiet" icon={<Trash2 size={14} />} aria-label="Archive automation" onClick={() => void flip(client.automationArchive({ automation_id: a.id }))} />
                  </>
                )}
              </div>
              {runsOf === a.id ? <RunHistory automationId={a.id} limit={runsShown} /> : null}
            </div>
          ))}
          {said ? <p className="type-secondary text-destructive">{said}</p> : null}
          <div className="flex items-center justify-between gap-1">
            <Button variant="quiet" icon={<Plus size={14} />} onClick={startNew}>New automation</Button>
            <Button variant="quiet" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide archived" : "Show archived"}</Button>
          </div>
        </>
      )}
    </div>
  );
}
