"use client";

// features/spaces/ai/MoveIn.tsx — "Import from Notion" (Move-in Assistant, mandate `spaces.move_in`).
//
// Two doors open ONE box: the sidebar Import menu's "From Notion" and a blank page's "Import from Notion". The
// person pastes a Notion page (export markdown or text copied out of Notion) or picks an exported .md / .txt file.
// The run is `useFloatingAgentRun` (LiveRunWindow). Contract:
//   variables = notion_content (exactly what was pasted / the file's text), source_name (the file's name);
//   result    = {title, icon, markdown, databases[], notes[]} → each database becomes a real table
//               (data/designed-database.ts), the markdown goes through the ONE Notion-flavored converter
//               (`notionMarkdownToBlocks`), a `[[database:N]]` line becomes that table's database block, and the
//               new page opens.

import { Button } from "@ai-matrx/design-system/controls";
import { useFloatingAgentRun } from "@ai-matrx/chat/agents/hooks/useFloatingAgentRun";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { notionMarkdownToBlocks } from "@/lib/spaces-blocks/notion-markdown";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import type { SpaceBlock } from "../contract";
import { createDesignedDatabase, readDesign } from "../data/designed-database";
import { adoptPageDatabase } from "../data/new-database";
import { useSpaces } from "../state/SpacesProvider";
import { MOVE_IN_KEY } from "./spaces-ai";

import { ProTextarea } from "@/components/official/ProTextarea";
export interface MovedPage {
  title: string;
  icon: string;
  markdown: string;
  databases: unknown[];
  notes: string[];
}

/** The agent's JSON, read strictly enough to build the page from. */
export function readMovedPage(value: unknown): MovedPage {
  const v = (value && typeof value === "object" ? value : null) as Record<string, unknown> | null;
  if (!v || typeof v.markdown !== "string") throw new Error("The move-in finished without a page");
  return {
    title: typeof v.title === "string" && v.title.trim() ? v.title.trim() : "Imported page",
    icon: typeof v.icon === "string" ? v.icon.trim() : "",
    markdown: v.markdown,
    databases: Array.isArray(v.databases) ? v.databases : [],
    notes: Array.isArray(v.notes) ? v.notes.filter((n): n is string => typeof n === "string" && !!n.trim()) : [],
  };
}

const DB_LINE = /^\s*\[\[database:(\d+)\]\]\s*$/;

/** The page's blocks: markdown runs through the Notion converter, each `[[database:N]]` line is that table's block. */
export function movedBlocks(markdown: string, tables: Array<{ tableId: string; name: string; views: SpaceBlock["props"][] } | null>): { blocks: SpaceBlock[]; warnings: string[] } {
  const blocks: SpaceBlock[] = [];
  const warnings: string[] = [];
  const used = new Set<number>();
  let run: string[] = [];
  const flush = (): void => {
    if (!run.join("").trim()) {
      run = [];
      return;
    }
    const out = notionMarkdownToBlocks(run.join("\n"), { idSeed: `move-in:${crypto.randomUUID()}` });
    blocks.push(...out.blocks);
    warnings.push(...out.warnings);
    run = [];
  };
  const dbBlock = (i: number): SpaceBlock | null => {
    const t = tables[i];
    if (!t) return null;
    used.add(i);
    return { id: crypto.randomUUID(), type: "database", props: { source: { kind: "table", tableId: t.tableId }, inline: true, title: t.name, linked: false, views: t.views, activeViewId: (t.views[0] as { id?: string } | undefined)?.id } } as unknown as SpaceBlock;
  };
  for (const line of markdown.split(/\r?\n/)) {
    const m = DB_LINE.exec(line);
    if (!m) {
      run.push(line);
      continue;
    }
    flush();
    const b = dbBlock(Number(m[1]) - 1);
    if (b) blocks.push(b);
  }
  flush();
  // A database the markdown never placed still lands, at the end — nothing the person brought is dropped.
  tables.forEach((_, i) => {
    if (!used.has(i)) {
      const b = dbBlock(i);
      if (b) blocks.push(b);
    }
  });
  return { blocks, warnings };
}

interface MoveInContext {
  wired: boolean;
  ask: () => void;
}

const Ctx = createContext<MoveInContext>({ wired: false, ask: () => undefined });
export const useMoveIn = () => useContext(Ctx);

const RUN_TIMEOUT_MS = 6 * 60_000;

export function MoveInHost({ children, userId }: { children: ReactNode; userId: string | null }) {
  useDeclaredSurfaceMandates(MOVE_IN_KEY ? [{ mandateKey: MOVE_IN_KEY, does: "moves a Notion page into Spaces" }] : []);
  const spaces = useSpaces();
  const activeOrg = useAppSelector(selectActiveOrganizationId);
  const { run, isRunning } = useFloatingAgentRun({ instanceId: "spaces-move-in" });
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const start = async () => {
    const content = text.trim();
    if (!content || !MOVE_IN_KEY) return;
    const source = fileName;
    setOpen(false);
    setText("");
    setFileName("");
    try {
      const organizationId = await ensureOrgId(activeOrg);
      const page = await run({
        mandateKey: MOVE_IN_KEY,
        variables: { notion_content: content, ...(source ? { source_name: source } : {}) },
        label: "Moving your Notion page in",
        organizationId,
        expect: "json",
        initiation: "user",
        surfaceName: null,
        sourceFeature: "documents",
        surfaceKey: "spaces-page",
        timeoutMs: RUN_TIMEOUT_MS,
        coerce: readMovedPage,
      });
      const tables = [];
      for (const raw of page.databases) {
        try {
          const design = readDesign({ views: [{ name: "Table", layout: "table" }], summary: "", ...(raw as object) });
          const made = await createDesignedDatabase(design, null, activeOrg, userId);
          tables.push({ tableId: made.table.tableId, name: made.table.name, views: made.views as unknown as SpaceBlock["props"][] });
        } catch (err) {
          tables.push(null);
          toast.warning("A database could not be made", { description: err instanceof Error ? err.message : undefined });
        }
      }
      const { blocks, warnings } = movedBlocks(page.markdown, tables);
      const doc = await spaces.store.create({ parentId: null, title: page.title, blocks });
      // The moved-in page owns the databases made for it (sharing the page shares them).
      for (const t of tables) if (t) await adoptPageDatabase(doc.id, t.tableId).catch((err: unknown) => toast.warning(`${t.name}: not shared with the page`, { description: err instanceof Error ? err.message : undefined }));
      spaces.retryLoad();
      spaces.open(doc.id);
      const left = [...page.notes, ...warnings];
      toast.success(`${page.title} moved in`, left.length ? { description: left.slice(0, 2).join(" · ").slice(0, 140) } : undefined);
    } catch (err) {
      if (isOrganizationSelectionCancelled(err)) return;
      toast.error("The page could not be moved in", { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <Ctx.Provider value={{ wired: Boolean(MOVE_IN_KEY), ask: () => setOpen(true) }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(620px,96vw)] gap-3 p-4">
          <DialogTitle>Import from Notion</DialogTitle>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <ProTextarea
              autoFocus
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a Notion page, or choose an exported file…"
              aria-label="Notion page content"
            />
            {!MOVE_IN_KEY ? <p className="type-secondary text-muted-foreground">AI is not connected yet</p> : null}
            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto truncate type-secondary text-muted-foreground">{fileName}</span>
              <Button type="button" variant="outline" onClick={() => file.current?.click()}>
                Choose file
              </Button>
              <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!text.trim() || !MOVE_IN_KEY || isRunning}>
                Import
              </Button>
            </div>
          </form>
          <input
            ref={file}
            type="file"
            hidden
            aria-hidden
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (!f) return;
              void f.text().then((t) => {
                setText(t);
                setFileName(f.name);
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
