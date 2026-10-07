"use client";

// features/spaces/editor/button-block.tsx — Notion's Button block (C19). A label and a list of actions run in
// order on one press: insert blocks, add a page to a database, edit pages in a database, open a page or link,
// send a notification, run an AI agent. The action shapes mirror the store's automation actions
// (`@ai-matrx/records` AutomationAction: add_row / edit_rows / notify / agent); a button runs them now, as the
// person who pressed it, through the same doors the page uses (records client, content.space_button_notify,
// launchAgentExecution). Stored as `button` { label, icon?, actions } (lib/spaces-blocks ButtonProps).

import { MousePointerClick, Plus, Settings2, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { launchAgentExecution } from "@ai-matrx/chat/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { Button } from "@ai-matrx/design-system/controls";
import { createRecordsClient, supabaseDataSource } from "@ai-matrx/records/core";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { createClient, supabase } from "@/utils/supabase/client";

import type { ButtonAction, ButtonActionKind, SpaceBlock } from "@/lib/spaces-blocks/types";
import { useSourcePicker } from "../data/SourcePicker";
import { toEngine } from "./convert";
import { DATABASE_HOST_CLASS } from "./database-host";
import { storedSpec } from "./stored-blocks";

const ACTION_WORDS: Record<ButtonActionKind, string> = {
  insert: "Insert blocks",
  addPage: "Add page to",
  editPages: "Edit pages in",
  open: "Open page",
  notify: "Send notification to",
  agent: "Run an agent",
};

/** "Name: value" lines -> { Name: value }. */
function valuesFrom(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
const valuesText = (v: Record<string, unknown> | undefined) =>
  Object.entries(v ?? {})
    .map(([k, x]) => `${k}: ${String(x ?? "")}`)
    .join("\n");

/** Typed lines -> blocks: "- " bullet, "[] " to-do, "# " heading, else text. */
export function blocksFromLines(text: string): SpaceBlock[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l): SpaceBlock => {
      const id = crypto.randomUUID();
      if (l.startsWith("- ")) return { id, type: "bulleted", text: [{ text: l.slice(2) }] };
      if (l.startsWith("[] ")) return { id, type: "todo", props: { checked: false }, text: [{ text: l.slice(3) }] };
      if (l.startsWith("# ")) return { id, type: "heading", props: { level: 2 }, text: [{ text: l.slice(2) }] };
      return { id, type: "text", text: [{ text: l }] };
    });
}
function linesFromBlocks(blocks: SpaceBlock[] | undefined): string {
  return (blocks ?? [])
    .map((b) => {
      const t = (b.text ?? []).map((s) => s.text).join("");
      return b.type === "bulleted" ? `- ${t}` : b.type === "todo" ? `[] ${t}` : b.type === "heading" ? `# ${t}` : t;
    })
    .join("\n");
}

async function pageOrganization(pageId: string): Promise<string> {
  const { data, error } = await supabase.schema("content").from("document").select("organization_id").eq("id", pageId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "This page can't be read.");
  return data.organization_id as string;
}

/** Field names a person typed -> the table's field keys (label, name or key; case-insensitive). */
async function keyed(client: ReturnType<typeof createRecordsClient>, tableId: string, values: Record<string, unknown>): Promise<Record<string, unknown>> {
  const got = await client.fields({ table_id: tableId as never });
  if (!got.ok) throw new Error(got.error.message);
  const out: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(values)) {
    const n = name.toLowerCase();
    const f = got.data.find((x) => {
      const r = x as unknown as { key?: string; label?: string; name?: string };
      return [r.key, r.label, r.name].some((w) => (w ?? "").toLowerCase() === n);
    }) as unknown as { key?: string; name?: string } | undefined;
    if (!f) throw new Error(`This database has no property “${name}”.`);
    out[f.key ?? f.name ?? name] = v;
  }
  return out;
}

/** The page this button sits on (the /spaces/[spaceId] route). */
function usePageId(): string | undefined {
  const params = useParams<{ spaceId?: string | string[] }>();
  const id = Array.isArray(params?.spaceId) ? params.spaceId[0] : params?.spaceId;
  return typeof id === "string" && /^[0-9a-f-]{36}$/.test(id) ? id : undefined;
}

type Ctx = { blockId: string; editor: never; update: (next: Record<string, unknown>) => void };

function ButtonView({ p, ctx }: { p: Record<string, unknown>; ctx: Ctx }) {
  const editor = ctx.editor as unknown as {
    isEditable: boolean;
    getBlock: (id: string) => unknown;
    insertBlocks: (blocks: unknown[], ref: unknown, placement: "before" | "after") => void;
  };
  const label = typeof p.label === "string" ? p.label : "";
  const actions = (Array.isArray(p.actions) ? p.actions : []) as ButtonAction[];
  const [editing, setEditing] = useState(false);
  const [running, setRunning] = useState(false);
  const router = useRouter();
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const pageId = usePageId();

  const run = async () => {
    if (!actions.length) return setEditing(true);
    setRunning(true);
    try {
      let client: ReturnType<typeof createRecordsClient> | null = null;
      const records = async () =>
        (client ??= createRecordsClient({
          dataSource: supabaseDataSource(createClient()),
          actor: userId ? { actor: "user", user_id: userId } : { actor: "user" },
          organizationId: await pageOrganization(pageId!),
        }));
      for (const a of actions) {
        if (a.kind === "insert") {
          const me = editor.getBlock(ctx.blockId);
          const fresh = toEngine(a.blocks.map((b) => ({ ...b, id: crypto.randomUUID() })));
          if (me && fresh.length) editor.insertBlocks(fresh as never, me, a.where === "above" ? "before" : "after");
        } else if (a.kind === "addPage") {
          const c = await records();
          const made = await c.recordWrite({ table_id: a.tableId as never, data: (await keyed(c, a.tableId, a.values ?? {})) as never });
          if (!made.ok) throw new Error(made.error.message);
        } else if (a.kind === "editPages") {
          const c = await records();
          const patch = await keyed(c, a.tableId, a.values);
          const rows = await c.query({ table_id: a.tableId as never });
          if (!rows.ok) throw new Error(rows.error.message);
          const changes = rows.data.rows
            .map((r) => (r as unknown as { id?: string; record_id?: string }).record_id ?? (r as unknown as { id?: string }).id)
            .filter((id): id is string => !!id)
            .map((record_id) => ({ op: "update" as const, record_id: record_id as never, patch: patch as never }));
          if (changes.length) {
            const done = await c.recordChangeMany({ table_id: a.tableId as never, changes });
            if (!done.ok) throw new Error(done.error.message);
          }
        } else if (a.kind === "open") {
          if (a.spaceId) router.push(`/spaces/${a.spaceId}`);
          else if (a.url) window.open(a.url, "_blank", "noopener");
        } else if (a.kind === "notify") {
          const to = a.userId === "me" ? userId : a.userId;
          if (!to || !pageId) continue;
          const { error } = await (supabase.schema("content") as unknown as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> })
            .rpc("space_button_notify", { p_document_id: pageId, p_block_id: ctx.blockId, p_recipients: [to], p_text: a.message || label || "Button pressed" });
          if (error) throw new Error(error.message);
        } else if (a.kind === "agent") {
          await dispatch(
            launchAgentExecution({
              agentId: a.agentId,
              sourceFeature: "spaces",
              surfaceKey: "spaces",
              runtime: { userInput: a.prompt || undefined },
              config: { displayMode: "sidebar", allowChat: true, autoRun: true },
            } as never),
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The button could not finish.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={`${DATABASE_HOST_CLASS} spaces-button-block`} contentEditable={false} data-testid="spaces-button-block">
      <div className="spaces-button-row">
        <button type="button" className="spaces-button-press" onClick={() => void run()} disabled={running} aria-busy={running || undefined}>
          <MousePointerClick size={14} strokeWidth={1.8} />
          <span>{label || "New button"}</span>
        </button>
        {editor.isEditable ? (
          <button type="button" className="spaces-button-gear" aria-label="Edit button" onClick={() => setEditing((v) => !v)}>
            <Settings2 size={14} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
      {editing && editor.isEditable ? (
        <ButtonEditor
          label={label}
          actions={actions}
          spaceId={pageId}
          onDone={(next) => {
            ctx.update({ ...p, ...next });
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ButtonEditor({ label, actions, spaceId, onDone }: { label: string; actions: ButtonAction[]; spaceId?: string; onDone: (next: { label: string; actions: ButtonAction[] }) => void }) {
  const [name, setName] = useState(label);
  const [list, setList] = useState<ButtonAction[]>(actions);
  const [picker, pick] = useSourcePicker(spaceId);
  const [tableNames, setTableNames] = useState<Record<string, string>>({});
  const set = (i: number, a: ButtonAction) => setList((l) => l.map((x, j) => (j === i ? a : x)));
  const add = async (kind: ButtonActionKind) => {
    if (kind === "addPage" || kind === "editPages") {
      const src = await pick();
      if (!src?.tableId) return;
      setTableNames((t) => ({ ...t, [src.tableId]: src.name }));
      setList((l) => [...l, kind === "addPage" ? { kind, tableId: src.tableId, values: {} } : { kind, tableId: src.tableId, values: {} }]);
      return;
    }
    const fresh: ButtonAction =
      kind === "insert" ? { kind, blocks: [] } : kind === "open" ? { kind, url: "" } : kind === "notify" ? { kind, userId: "me", message: "" } : { kind: "agent", agentId: "", prompt: "" };
    setList((l) => [...l, fresh]);
  };
  return (
    <div className="spaces-button-editor" data-testid="spaces-button-editor">
      <ProInput aria-label="Button name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Button name" />
      {list.map((a, i) => (
        <div key={i} className="spaces-button-action" data-testid="spaces-button-action">
          <div className="spaces-button-action-head">
            <span>
              {ACTION_WORDS[a.kind]}
              {a.kind === "addPage" || a.kind === "editPages" ? ` ${tableNames[a.tableId] ?? "database"}` : ""}
            </span>
            <Button variant="quiet" icon={<Trash2 size={14} />} aria-label="Remove action" onClick={() => setList((l) => l.filter((_, j) => j !== i))} />
          </div>
          {a.kind === "insert" ? (
            <ProTextarea aria-label="Blocks to insert" rows={3} value={linesFromBlocks(a.blocks)} onChange={(e) => set(i, { ...a, blocks: blocksFromLines(e.target.value) })} placeholder="One block per line: - bullet, [] to-do, # heading" />
          ) : a.kind === "addPage" || a.kind === "editPages" ? (
            <ProTextarea aria-label="Property values" rows={2} value={valuesText(a.values)} onChange={(e) => set(i, { ...a, values: valuesFrom(e.target.value) } as ButtonAction)} placeholder="Property: value" />
          ) : a.kind === "open" ? (
            <ProInput aria-label="Page or link to open" value={a.spaceId ? `/spaces/${a.spaceId}` : (a.url ?? "")} onChange={(e) => {
              const v = e.target.value;
              const id = v.match(/\/spaces\/([0-9a-f-]{36})/)?.[1];
              set(i, id ? { kind: "open", spaceId: id } : { kind: "open", url: v });
            }} placeholder="Page link or web address" />
          ) : a.kind === "notify" ? (
            <ProInput aria-label="Notification text" value={a.message} onChange={(e) => set(i, { ...a, message: e.target.value })} placeholder="Message (sent to you)" />
          ) : (
            <div className="spaces-button-agent">
              <AgentListDropdown activeAgentId={a.agentId || null} onSelect={(id: string) => set(i, { ...a, agentId: id })} />
              <ProInput aria-label="Agent prompt" value={a.prompt ?? ""} onChange={(e) => set(i, { ...a, prompt: e.target.value })} placeholder="What to ask" />
            </div>
          )}
        </div>
      ))}
      <div className="spaces-button-add">
        {(Object.keys(ACTION_WORDS) as ButtonActionKind[]).map((k) => (
          <Button key={k} variant="quiet" icon={<Plus size={14} />} onClick={() => void add(k)}>
            {ACTION_WORDS[k]}
          </Button>
        ))}
      </div>
      <div className="spaces-button-done">
        <Button variant="primary" onClick={() => onDone({ label: name, actions: list })}>
          Done
        </Button>
      </div>
      {picker}
    </div>
  );
}

export const ButtonBlock = storedSpec("button", (p, ctx) => <ButtonView p={p} ctx={ctx} />);
