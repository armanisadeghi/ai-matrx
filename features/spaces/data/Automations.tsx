"use client";

/**
 * N9 — Notion's database Automations: a trigger (a page is added, or a property is edited to a value) and
 * its actions (set a property, add a page, send a notification), listed per database.
 *
 * The store's automation door (`custom.automation_declare` / `custom.automations` / `custom.automation_archive`)
 * runs them; properties are named by Field id. A database without the door says "not connected yet" and
 * writes nothing. No automation store lives in Spaces.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button, Input } from "@ai-matrx/design-system/controls";
import type { Field } from "@ai-matrx/records/react";

import { createClient } from "@/utils/supabase/client";

/** The store's automation spec (`custom._automation_check`): properties by Field id. */
export type AutomationTrigger = { on: "row_added" } | { on: "property_edited"; field: string; to?: unknown };
export type AutomationAction =
  | { do: "set"; values: Record<string, unknown> }
  | { do: "add_row"; table_id: string; values: Record<string, unknown> }
  | { do: "notify"; to: { author: true } | { person: string } | { field: string }; text: string };
export interface AutomationSpec {
  name: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
}
export interface Automation {
  id: string;
  name?: string;
  spec: AutomationSpec;
  enabled: boolean;
  archived_at?: string | null;
}

/** A door the database does not have yet (PostgREST: function not found). */
function notConnected(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function|does not exist/i.test(error.message ?? "");
}

type Door = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
const door = (): Door => (createClient() as unknown as { schema: (s: string) => Door }).schema("custom");

export function useAutomations(tableId: string, organizationId: string | null) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "off" } | { kind: "failed"; message: string } | { kind: "ok"; list: Automation[] }>({ kind: "loading" });
  const read = useCallback(async () => {
    if (!organizationId) return;
    const { data, error } = await door().rpc("automations", { p_table_id: tableId, p_organization_id: organizationId, p_include_archived: false });
    if (notConnected(error)) setState({ kind: "off" });
    else if (error) setState({ kind: "failed", message: error.message ?? "The automations could not be read." });
    else {
      const raw = Array.isArray(data) ? data : ((data as { automations?: unknown } | null)?.automations ?? []);
      setState({ kind: "ok", list: (Array.isArray(raw) ? raw : []) as Automation[] });
    }
  }, [tableId, organizationId]);
  useEffect(() => {
    void read();
  }, [read]);
  /** Store one automation; null when it was kept, else the store's own sentence. */
  const declare = useCallback(
    async (spec: AutomationSpec) => {
      const { data, error } = await door().rpc("automation_declare", { p_organization_id: organizationId, p_table_id: tableId, p_spec: spec });
      if (notConnected(error)) {
        setState({ kind: "off" });
        return "Automations are not connected yet.";
      }
      if (error) return error.message ?? "The automation was not saved.";
      const answer = data as { ok?: boolean; _errors?: Record<string, string> } | null;
      if (answer && answer.ok === false) return Object.values(answer._errors ?? {})[0] ?? "The automation was not saved.";
      await read();
      return null;
    },
    [tableId, organizationId, read],
  );
  const archive = useCallback(
    async (automationId: string) => {
      const { error } = await door().rpc("automation_archive", { p_organization_id: organizationId, p_automation_id: automationId });
      if (!error) await read();
      return error?.message ?? null;
    },
    [organizationId, read],
  );
  return { state, declare, archive };
}

const fieldName = (fields: Field[], id: string) => fields.find((f) => f.id === id)?.label ?? "a property";

export function describeTrigger(t: AutomationTrigger, fields: Field[]): string {
  if (t.on === "row_added") return "When a page is added";
  const name = fieldName(fields, t.field);
  return t.to !== undefined && t.to !== null && t.to !== "" ? `When ${name} is set to ${String(t.to)}` : `When ${name} is edited`;
}

export function describeAction(a: AutomationAction, fields: Field[]): string {
  if (a.do === "set") return Object.entries(a.values).map(([id, v]) => `Set ${fieldName(fields, id)} to ${String(v)}`).join(", ");
  if (a.do === "add_row") return "Add a page";
  return "Send a notification";
}

function Pill({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <Button variant={on ? "outline" : "quiet"} data-active={on ? "true" : undefined} onClick={onClick}>
      {children}
    </Button>
  );
}

/** One action as the panel edits it; turned into the store's spec on Create. */
type Draft = { kind: "set"; field: string; value: string } | { kind: "add"; title: string } | { kind: "notify"; text: string };

function toAction(d: Draft, tableId: string, titleField: string): AutomationAction {
  if (d.kind === "set") return { do: "set", values: { [d.field]: d.value } };
  if (d.kind === "add") return { do: "add_row", table_id: tableId, values: { [titleField]: d.title } };
  return { do: "notify", to: { author: true }, text: d.text };
}

/** The Automations popover body: the list, then a new automation (trigger + actions). */
export function AutomationsPanel({ tableId, organizationId, fields }: { tableId: string; organizationId: string | null; fields: Field[] }) {
  const { state, declare, archive } = useAutomations(tableId, organizationId);
  const [editing, setEditing] = useState(false);
  const [trigger, setTrigger] = useState<AutomationTrigger>({ on: "row_added" });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const firstField = fields[0]?.id ?? "";
  const put = (i: number, d: Draft) => setDrafts(drafts.map((x, j) => (j === i ? d : x)));

  if (state.kind === "loading") return <div className="spaces-db-automations" aria-busy="true" />;
  if (state.kind === "off")
    return (
      <div className="spaces-db-automations" data-testid="spaces-automations" data-state="off">
        <p className="type-secondary text-muted-foreground">Automations are not connected yet.</p>
      </div>
    );
  if (state.kind === "failed")
    return (
      <div className="spaces-db-automations" data-testid="spaces-automations" data-state="failed">
        <p className="type-secondary text-destructive">{state.message}</p>
      </div>
    );

  const save = async () => {
    const spec: AutomationSpec = { name: describeTrigger(trigger, fields), trigger, actions: drafts.map((d) => toAction(d, tableId, firstField)) };
    const message = await declare(spec);
    setSaid(message);
    if (!message) {
      setEditing(false);
      setDrafts([]);
      setTrigger({ on: "row_added" });
    }
  };

  return (
    <div className="spaces-db-automations flex flex-col gap-2" data-testid="spaces-automations" data-state="on">
      {state.list.map((a) => (
        <div key={a.id} className="flex items-start gap-2" data-testid="spaces-automation-row">
          <div className="min-w-0 flex-1">
            <div className="type-body truncate">{a.spec?.name ?? a.name ?? describeTrigger(a.spec.trigger, fields)}</div>
            <div className="type-secondary truncate text-muted-foreground">{(a.spec?.actions ?? []).map((x) => describeAction(x, fields)).join(" · ")}</div>
          </div>
          <Button variant="quiet" icon={<Trash2 size={14} />} aria-label="Delete automation" onClick={() => void archive(a.id).then(setSaid)} />
        </div>
      ))}
      {editing ? (
        <div className="flex flex-col gap-2">
          <span className="type-secondary text-muted-foreground">Trigger</span>
          <div className="flex flex-wrap gap-1">
            <Pill on={trigger.on === "row_added"} onClick={() => setTrigger({ on: "row_added" })}>Page added</Pill>
            <Pill on={trigger.on === "property_edited"} onClick={() => setTrigger({ on: "property_edited", field: firstField })}>Property edited</Pill>
          </div>
          {trigger.on === "property_edited" ? (
            <div className="flex flex-wrap items-center gap-1">
              {fields.map((f) => (
                <Pill key={f.id} on={trigger.field === f.id} onClick={() => setTrigger({ ...trigger, field: f.id })}>
                  {f.label || f.key}
                </Pill>
              ))}
              <Input
                aria-label="Edited to"
                placeholder="to any value"
                value={typeof trigger.to === "string" ? trigger.to : ""}
                onChange={(e) => setTrigger(e.target.value ? { on: "property_edited", field: trigger.field, to: e.target.value } : { on: "property_edited", field: trigger.field })}
              />
            </div>
          ) : null}
          <span className="type-secondary text-muted-foreground">Actions</span>
          {drafts.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1">
              {d.kind === "set" ? (
                <>
                  {fields.map((f) => (
                    <Pill key={f.id} on={d.field === f.id} onClick={() => put(i, { ...d, field: f.id })}>
                      {f.label || f.key}
                    </Pill>
                  ))}
                  <Input aria-label="Set to" placeholder="Set to" value={d.value} onChange={(e) => put(i, { ...d, value: e.target.value })} />
                </>
              ) : d.kind === "add" ? (
                <Input aria-label="New page name" placeholder="Add a page named" value={d.title} onChange={(e) => put(i, { kind: "add", title: e.target.value })} />
              ) : (
                <Input aria-label="Notification text" placeholder="Notify me" value={d.text} onChange={(e) => put(i, { kind: "notify", text: e.target.value })} />
              )}
              <Button variant="quiet" icon={<X size={14} />} aria-label="Remove action" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setDrafts([...drafts, { kind: "set", field: firstField, value: "" }])}>Set property</Button>
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setDrafts([...drafts, { kind: "add", title: "" }])}>Add page</Button>
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setDrafts([...drafts, { kind: "notify", text: "" }])}>Send notification</Button>
          </div>
          {said ? <p className="type-secondary text-destructive">{said}</p> : null}
          <div className="flex justify-end gap-1">
            <Button variant="quiet" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" disabled={drafts.length === 0} onClick={() => void save()}>Create</Button>
          </div>
        </div>
      ) : (
        <>
          {said ? <p className="type-secondary text-destructive">{said}</p> : null}
          <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setEditing(true)}>New automation</Button>
        </>
      )}
    </div>
  );
}
