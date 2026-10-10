"use client";

// features/spaces/io/NotionImport.tsx — the first-party Notion importer's two doors (aidream /notion-import):
//   "Notion export (.zip)" — the person's own Notion export, uploaded through the ONE upload primitive, then
//                            POST /notion-import/zip {file_id}
//   "Connect Notion"       — their Notion integration token, kept in their vault (definition
//                            `notion_integration_token`), then POST /notion-import/connected {credential_item_id}
// Both stream NDJSON (`notion_import.progress` → `notion_import.finished` | `notion_import.failed`); the dialog
// shows the steps live and ends on the import report: what came over, what came with a difference, what did not.
// A rerun of the same export changes nothing (the server keys everything by Notion id).

import { Button, Field } from "@ai-matrx/design-system/controls";
import { createContext, useContext, useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { createVaultItem } from "@/features/secrets/vault-service";
import { postNdjson } from "@/lib/python-client";
import { createClient } from "@/utils/supabase/client";

import { useSpaces } from "../state/SpacesProvider";

type Item = { kind: string; item: string | null; reason: string | null };

interface Finished {
  type: "notion_import.finished";
  run: string;
  counts: Record<string, number>;
  report_table_id: string | null;
  came_over: Record<string, number>;
  came_with_a_difference: Item[];
  not_carried: Item[];
  top_pages: string[];
}

type Stage =
  | { phase: "token" }
  | { phase: "uploading"; loaded: number; total: number }
  | { phase: "running"; step: string; done: number; total: number; detail: string }
  | { phase: "finished"; report: Finished }
  | { phase: "failed"; message: string };

const STEPS: Record<string, string> = {
  reading: "Reading",
  tables: "Tables",
  columns: "Columns",
  rows: "Rows",
  pages: "Pages",
  report: "Report",
};

function readEvent(data: unknown): { kind: "progress"; step: string; done: number; total: number; detail: string } | { kind: "finished"; report: Finished } | { kind: "failed"; message: string } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.type === "notion_import.progress" && typeof d.step === "string" && typeof d.done === "number" && typeof d.total === "number") {
    return { kind: "progress", step: d.step, done: d.done, total: d.total, detail: typeof d.detail === "string" ? d.detail : "" };
  }
  if (d.type === "notion_import.failed") return { kind: "failed", message: typeof d.message === "string" ? d.message : "The import stopped." };
  if (d.type === "notion_import.finished" && typeof d.run === "string") {
    const list = (v: unknown): Item[] => (Array.isArray(v) ? v.filter((x): x is Item => !!x && typeof x === "object" && typeof (x as Item).kind === "string") : []);
    return {
      kind: "finished",
      report: {
        type: "notion_import.finished",
        run: d.run,
        counts: (d.counts && typeof d.counts === "object" ? d.counts : {}) as Record<string, number>,
        report_table_id: typeof d.report_table_id === "string" ? d.report_table_id : null,
        came_over: (d.came_over && typeof d.came_over === "object" ? d.came_over : {}) as Record<string, number>,
        came_with_a_difference: list(d.came_with_a_difference),
        not_carried: list(d.not_carried),
        top_pages: Array.isArray(d.top_pages) ? d.top_pages.filter((x): x is string => typeof x === "string") : [],
      },
    };
  }
  return null;
}

/** The person's saved Notion integration token, if their vault holds one. */
async function savedNotionToken(): Promise<string | null> {
  const { data } = await createClient()
    .schema("users")
    .from("credential_items")
    .select("id")
    .eq("definition_key", "notion_integration_token")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as { id?: string } | undefined)?.id ?? null;
}

export function useNotionImport() {
  const [stage, setStage] = useState<Stage | null>(null);
  const [token, setToken] = useState("");
  const { upload } = useFileUpload();

  const stream = async (path: string, body: Record<string, unknown>) => {
    setStage({ phase: "running", step: "reading", done: 0, total: 1, detail: "" });
    try {
      let ended = false;
      for await (const event of postNdjson(path, body)) {
        if (event.event !== "data") continue;
        const read = readEvent(event.data);
        if (!read) continue;
        if (read.kind === "progress") setStage({ phase: "running", step: read.step, done: read.done, total: read.total, detail: read.detail });
        else if (read.kind === "failed") {
          ended = true;
          setStage({ phase: "failed", message: read.message });
        } else {
          ended = true;
          setStage({ phase: "finished", report: read.report });
        }
      }
      if (!ended) setStage({ phase: "failed", message: "The import stopped without an answer. Run it again — nothing is made twice." });
    } catch (err) {
      setStage({ phase: "failed", message: err instanceof Error ? err.message : "The import stopped." });
    }
  };

  const fromZip = async (file: File) => {
    setStage({ phase: "uploading", loaded: 0, total: file.size });
    try {
      const uploaded = await upload({ kind: "file", file }, {
        folderPath: "Imports/Notion",
        onProgress: (loaded: number, total: number) => setStage({ phase: "uploading", loaded, total: total || file.size }),
        metadata: { origin: "notion-import" },
      });
      await stream("/notion-import/zip", { file_id: uploaded.fileId, name: file.name.replace(/\.zip$/i, "").replace(/^Export-[0-9a-f-]+$/i, "Notion export") });
    } catch (err) {
      setStage({ phase: "failed", message: err instanceof Error ? err.message : "The export could not be uploaded." });
    }
  };

  const connect = async () => {
    const saved = await savedNotionToken().catch(() => null);
    if (saved) await stream("/notion-import/connected", { credential_item_id: saved, name: "Notion workspace" });
    else setStage({ phase: "token" });
  };

  const saveTokenAndConnect = async () => {
    const value = token.trim();
    if (!value) return;
    try {
      const item = await createVaultItem({
        principal: { type: "user" },
        display_name: "Notion integration",
        definition_key: "notion_integration_token",
        fields: [{ field_key: "api_key", value, handling: "revealable", editable: true, inject_into_sandbox: false }],
      } as Parameters<typeof createVaultItem>[0]);
      setToken("");
      await stream("/notion-import/connected", { credential_item_id: item.id, name: "Notion workspace" });
    } catch (err) {
      setStage({ phase: "failed", message: err instanceof Error ? err.message : "The token could not be saved." });
    }
  };

  return { stage, setStage, fromZip, connect, token, setToken, saveTokenAndConnect };
}

export interface NotionImportDialogProps {
  state: ReturnType<typeof useNotionImport>;
  /** Open an imported page (the Spaces host and the door each know their own router). */
  onOpenPage: (spaceId: string) => void;
  /** The report was dismissed: the Spaces host re-reads its tree. */
  onFinished?: () => void;
  /** Open the report table in this tab; absent = a new tab (the Spaces host keeps its workspace). */
  onOpenTable?: (tableId: string) => void;
}

export function NotionImportDialog({ state, onOpenPage, onFinished, onOpenTable }: NotionImportDialogProps) {
  const { stage, setStage, token, setToken, saveTokenAndConnect } = state;
  const busy = stage?.phase === "uploading" || stage?.phase === "running";
  const close = () => {
    if (stage?.phase === "finished") onFinished?.();
    setStage(null);
  };

  return (
    <Dialog open={stage !== null} onOpenChange={(open) => (!open && !busy ? close() : undefined)}>
      <DialogContent className="max-w-[min(620px,96vw)] gap-3 p-4">
        <DialogTitle>{stage?.phase === "finished" ? "Notion import" : stage?.phase === "token" ? "Connect Notion" : "Importing from Notion"}</DialogTitle>
        {stage?.phase === "token" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveTokenAndConnect();
            }}
          >
            {/* ui-exception: a pasted secret (the Notion integration token), never prose */}
            <Field autoFocus type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Notion integration secret (ntn_…)" aria-label="Notion integration secret" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="quiet" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!token.trim()}>
                Save and import
              </Button>
            </div>
          </form>
        ) : null}
        {stage?.phase === "uploading" ? (
          <div className="flex flex-col gap-2">
            <span className="type-secondary text-muted-foreground">Uploading</span>
            <Progress value={stage.total ? (100 * stage.loaded) / stage.total : 0} />
          </div>
        ) : null}
        {stage?.phase === "running" ? (
          <div className="flex flex-col gap-2">
            <span className="type-secondary text-muted-foreground">
              {STEPS[stage.step] ?? stage.step} · {stage.done}/{stage.total}
              {stage.detail ? ` · ${stage.detail}` : ""}
            </span>
            <Progress value={stage.total ? (100 * stage.done) / stage.total : 0} />
          </div>
        ) : null}
        {stage?.phase === "failed" ? <p className="type-secondary text-destructive">{stage.message}</p> : null}
        {stage?.phase === "finished" ? <Report report={stage.report} onOpen={(id) => (close(), onOpenPage(id))} onOpenTable={onOpenTable ? (id) => (close(), onOpenTable(id)) : undefined} /> : null}
        {stage?.phase === "failed" || stage?.phase === "finished" ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={close}>
              Close
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Report({ report, onOpen, onOpenTable }: { report: Finished; onOpen: (spaceId: string) => void; onOpenTable?: (tableId: string) => void }) {
  const came = Object.entries(report.came_over).filter(([, n]) => n > 0);
  return (
    <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
      <section>
        <h3 className="type-label">Came over</h3>
        <ul className="type-secondary">
          {came.map(([kind, n]) => (
            <li key={kind}>
              {n} {kind}
            </li>
          ))}
        </ul>
      </section>
      {report.came_with_a_difference.length ? (
        <section>
          <h3 className="type-label">Came over differently</h3>
          <ul className="type-secondary text-muted-foreground">
            {report.came_with_a_difference.map((x, i) => (
              <li key={i}>
                {x.item}: {x.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {report.not_carried.length ? (
        <section>
          <h3 className="type-label">Not carried</h3>
          <ul className="type-secondary text-muted-foreground">
            {report.not_carried.map((x, i) => (
              <li key={i}>
                {x.item}: {x.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="flex gap-2">
        {report.top_pages[0] ? (
          <Button type="button" variant="primary" onClick={() => onOpen(report.top_pages[0])}>
            Open
          </Button>
        ) : null}
        {report.report_table_id ? (
          <Button
            type="button"
            variant={report.top_pages[0] ? "outline" : "primary"}
            onClick={() => (onOpenTable ? onOpenTable(report.report_table_id as string) : window.open(`/data/${report.report_table_id}`, "_blank", "noopener"))}
          >
            Full report
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SpacesNotionImportDialog({ state }: { state: ReturnType<typeof useNotionImport> }) {
  const spaces = useSpaces();
  return <NotionImportDialog state={state} onOpenPage={spaces.open} onFinished={spaces.retryLoad} />;
}

type Door = Pick<ReturnType<typeof useNotionImport>, "fromZip" | "connect">;
const DoorContext = createContext<Door | null>(null);

/** Holds the import above the sidebar, so the run and its report outlive any re-render of the menu that started it. */
export function NotionImportHost({ children }: { children: ReactNode }) {
  const state = useNotionImport();
  return (
    <DoorContext.Provider value={{ fromZip: state.fromZip, connect: state.connect }}>
      {children}
      <SpacesNotionImportDialog state={state} />
    </DoorContext.Provider>
  );
}

export function useNotionImportDoor(): Door {
  const door = useContext(DoorContext);
  if (!door) throw new Error("useNotionImportDoor needs <NotionImportHost> (SpacesWorkspace mounts it)");
  return door;
}
