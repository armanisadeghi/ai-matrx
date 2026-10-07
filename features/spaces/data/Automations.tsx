"use client";

/**
 * N9 — Notion's database Automations: a trigger (a page is added, or a property is edited to a value) and
 * its actions (set a property, add a page, send a notification), listed per database.
 *
 * The store door is being built elsewhere (`custom.automation_declare` / `custom.automations`, NEEDS row
 * N9). This screen speaks that door's expected shape; until the door answers, it says "not connected yet"
 * and writes nothing. No automation store lives in Spaces.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button, Input } from "@ai-matrx/design-system/controls";
import type { Field } from "@ai-matrx/records/react";

import { createClient } from "@/utils/supabase/client";

export type AutomationTrigger = { on: "created" } | { on: "updated"; field: string; to: string | null };
export type AutomationAction =
  | { set: { field: string; value: string } }
  | { add: { table_id: string; values: Record<string, string> } }
  | { notify: { who: "me" | "page_creator"; text: string } };
export interface Automation {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  is_active: boolean;
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
    const { data, error } = await door().rpc("automations", { p_organization_id: organizationId, p_table_id: tableId });
    if (notConnected(error)) setState({ kind: "off" });
    else if (error) setState({ kind: "failed", message: error.message ?? "The automations could not be read." });
    else setState({ kind: "ok", list: (Array.isArray(data) ? data : []) as Automation[] });
  }, [tableId, organizationId]);
  useEffect(() => {
    void read();
  }, [read]);
  const declare = useCallback(
    async (automation: Omit<Automation, "id" | "is_active"> & { id?: string; is_active?: boolean; archived?: boolean }) => {
      const { error } = await door().rpc("automation_declare", { p_organization_id: organizationId, p_table_id: tableId, p_automation: automation });
      if (notConnected(error)) {
        setState({ kind: "off" });
        return "Automations are not connected yet.";
      }
      if (error) return error.message ?? "The automation was not saved.";
      await read();
      return null;
    },
    [tableId, organizationId, read],
  );
  return { state, declare };
}

export function describeTrigger(t: AutomationTrigger, fields: Field[]): string {
  if (t.on === "created") return "When a page is added";
  const name = fields.find((f) => f.key === t.field)?.label ?? t.field;
  return t.to ? `When ${name} is set to ${t.to}` : `When ${name} is edited`;
}

export function describeAction(a: AutomationAction, fields: Field[]): string {
  if ("set" in a) return `Set ${fields.find((f) => f.key === a.set.field)?.label ?? a.set.field} to ${a.set.value}`;
  if ("add" in a) return `Add a page${a.add.values.name ? ` "${a.add.values.name}"` : ""}`;
  return `Notify ${a.notify.who === "me" ? "me" : "the page's creator"}`;
}

function Pill({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <Button variant={on ? "outline" : "quiet"} data-active={on ? "true" : undefined} onClick={onClick}>
      {children}
    </Button>
  );
}

/** The Automations popover body: the list, then a new automation (trigger + actions). */
export function AutomationsPanel({ tableId, organizationId, fields }: { tableId: string; organizationId: string | null; fields: Field[] }) {
  const { state, declare } = useAutomations(tableId, organizationId);
  const [editing, setEditing] = useState(false);
  const [trigger, setTrigger] = useState<AutomationTrigger>({ on: "created" });
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const firstField = fields[0]?.key ?? "name";

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
    const message = await declare({ name: describeTrigger(trigger, fields), trigger, actions });
    setSaid(message);
    if (!message) {
      setEditing(false);
      setActions([]);
      setTrigger({ on: "created" });
    }
  };

  return (
    <div className="spaces-db-automations flex flex-col gap-2" data-testid="spaces-automations" data-state="on">
      {state.list.map((a) => (
        <div key={a.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="type-body truncate">{describeTrigger(a.trigger, fields)}</div>
            <div className="type-secondary truncate text-muted-foreground">{a.actions.map((x) => describeAction(x, fields)).join(" · ")}</div>
          </div>
          <Button variant="quiet" icon={<Trash2 size={14} />} aria-label="Delete automation" onClick={() => void declare({ ...a, archived: true })} />
        </div>
      ))}
      {editing ? (
        <div className="flex flex-col gap-2">
          <span className="type-secondary text-muted-foreground">Trigger</span>
          <div className="flex flex-wrap gap-1">
            <Pill on={trigger.on === "created"} onClick={() => setTrigger({ on: "created" })}>Page added</Pill>
            <Pill on={trigger.on === "updated"} onClick={() => setTrigger({ on: "updated", field: firstField, to: null })}>Property edited</Pill>
          </div>
          {trigger.on === "updated" ? (
            <div className="flex flex-wrap items-center gap-1">
              {fields.map((f) => (
                <Pill key={f.key} on={trigger.field === f.key} onClick={() => setTrigger({ ...trigger, field: f.key })}>
                  {f.label || f.key}
                </Pill>
              ))}
              <Input aria-label="Edited to" placeholder="to any value" value={trigger.to ?? ""} onChange={(e) => setTrigger({ ...trigger, to: e.target.value || null })} />
            </div>
          ) : null}
          <span className="type-secondary text-muted-foreground">Actions</span>
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-1">
              {"set" in a ? (
                <>
                  <span className="type-secondary">Set</span>
                  {fields.map((f) => (
                    <Pill key={f.key} on={a.set.field === f.key} onClick={() => setActions(actions.map((x, j) => (j === i ? { set: { ...a.set, field: f.key } } : x)))}>
                      {f.label || f.key}
                    </Pill>
                  ))}
                  <Input aria-label="Set to" value={a.set.value} onChange={(e) => setActions(actions.map((x, j) => (j === i ? { set: { ...a.set, value: e.target.value } } : x)))} />
                </>
              ) : "add" in a ? (
                <Input aria-label="New page name" placeholder="Add a page named" value={a.add.values.name ?? ""} onChange={(e) => setActions(actions.map((x, j) => (j === i ? { add: { table_id: tableId, values: { name: e.target.value } } } : x)))} />
              ) : (
                <Input aria-label="Notification text" placeholder="Notify me" value={a.notify.text} onChange={(e) => setActions(actions.map((x, j) => (j === i ? { notify: { who: "me", text: e.target.value } } : x)))} />
              )}
              <Button variant="quiet" icon={<X size={14} />} aria-label="Remove action" onClick={() => setActions(actions.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setActions([...actions, { set: { field: firstField, value: "" } }])}>Set property</Button>
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setActions([...actions, { add: { table_id: tableId, values: { name: "" } } }])}>Add page</Button>
            <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setActions([...actions, { notify: { who: "me", text: "" } }])}>Send notification</Button>
          </div>
          {said ? <p className="type-secondary text-destructive">{said}</p> : null}
          <div className="flex justify-end gap-1">
            <Button variant="quiet" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" disabled={actions.length === 0} onClick={() => void save()}>Create</Button>
          </div>
        </div>
      ) : (
        <Button variant="quiet" icon={<Plus size={14} />} onClick={() => setEditing(true)}>New automation</Button>
      )}
    </div>
  );
}
