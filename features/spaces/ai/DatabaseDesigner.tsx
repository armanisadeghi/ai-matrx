"use client";

// features/spaces/ai/DatabaseDesigner.tsx — "Database with AI" / "Redesign with AI" (mandate `spaces.design_database`).
//
// Two doors open ONE request box: the "/" menu's "Database with AI" (a new inline database where the "/" was typed)
// and a database block's view settings "Redesign with AI" (the database the block shows). The run is
// `useFloatingAgentRun` (the platform's LiveRunWindow — never a spinner). Contract:
//   userInput = exactly what the person typed ("clients with status, retainer, start date, wins");
//   variables = page_title / page_markdown (context), current_design only on the redesign door;
//   result    = {name, title_property, properties[], views[], rows[], summary} → data/designed-database.ts makes
//               the table, its rows and the block's views (a redesign adds the missing properties and swaps views).

import { Button } from "@ai-matrx/design-system/controls";
import { useFloatingAgentRun } from "@ai-matrx/chat/agents/hooks/useFloatingAgentRun";
import type { RecordsClient } from "@ai-matrx/records/core";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import { applyRedesign, createDesignedDatabase, readDesign } from "../data/designed-database";
import type { SpaceDbView } from "../data/sources";
import type { PickedSource } from "../data/SourcePicker";
import { DESIGN_DATABASE_KEY } from "./spaces-ai";

import { ProTextarea } from "@/components/official/ProTextarea";
export interface DesignPage {
  spaceId: string | null;
  title: string;
  markdown: string;
}

export interface RedesignTarget extends DesignPage {
  tableId: string;
  /** The database as markdown (data/designed-database.ts `designMarkdown`). */
  currentDesign: string;
  /** The table's property names today — a redesign adds only the ones it lacks. */
  existingLabels: string[];
  /** The block's own records client (the table's organization). */
  client: RecordsClient;
}

export type DesignAnswer = { table: PickedSource; views: SpaceDbView[] };
export type RedesignAnswer = { views: SpaceDbView[]; added: string[] };

interface DesignerContext {
  wired: boolean;
  /** "/" → Database with AI: resolves with the new table and its views, or null when cancelled / failed. */
  design: (page: DesignPage) => Promise<DesignAnswer | null>;
  /** ••• → Redesign with AI: resolves with the block's new views, or null. */
  redesign: (target: RedesignTarget) => Promise<RedesignAnswer | null>;
}

const Ctx = createContext<DesignerContext>({ wired: false, design: async () => null, redesign: async () => null });
export const useDatabaseDesigner = () => useContext(Ctx);

/** Builds take 10–90 s; the wait outlasts the slowest. */
const RUN_TIMEOUT_MS = 4 * 60_000;

type Pending = { kind: "design"; page: DesignPage; resolve: (a: DesignAnswer | null) => void } | { kind: "redesign"; page: RedesignTarget; resolve: (a: RedesignAnswer | null) => void };

export function DatabaseDesignerHost({ children, userId }: { children: ReactNode; userId: string | null }) {
  useDeclaredSurfaceMandates(DESIGN_DATABASE_KEY ? [{ mandateKey: DESIGN_DATABASE_KEY, does: "designs a database from a plain request" }] : []);
  const activeOrg = useAppSelector(selectActiveOrganizationId);
  const { run, isRunning } = useFloatingAgentRun({ instanceId: "spaces-design-database" });
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [redesigning, setRedesigning] = useState(false);
  const pending = useRef<Pending | null>(null);

  const settle = (answer: null) => {
    const p = pending.current;
    pending.current = null;
    p?.resolve(answer);
  };

  const ask = (p: Pending) => {
    settle(null);
    pending.current = p;
    setRedesigning(p.kind === "redesign");
    setOpen(true);
  };

  const start = async () => {
    const words = typed.trim();
    const p = pending.current;
    if (!words || !DESIGN_DATABASE_KEY || !p) return;
    setOpen(false);
    setTyped("");
    try {
      const organizationId = await ensureOrgId(activeOrg);
      const design = await run({
        mandateKey: DESIGN_DATABASE_KEY,
        userInput: words,
        variables: {
          page_title: p.page.title,
          page_markdown: p.page.markdown,
          ...(p.kind === "redesign" ? { current_design: p.page.currentDesign } : {}),
        },
        label: p.kind === "redesign" ? "Redesigning the database" : "Designing your database",
        organizationId,
        expect: "json",
        initiation: "user",
        surfaceName: null,
        sourceFeature: "documents",
        surfaceKey: "spaces-page",
        timeoutMs: RUN_TIMEOUT_MS,
        coerce: readDesign,
      });
      pending.current = null;
      if (p.kind === "design") {
        const made = await createDesignedDatabase(design, p.page.spaceId, activeOrg, userId);
        p.resolve(made);
        toast.success(`${design.name} is ready`, design.summary ? { description: design.summary.slice(0, 140) } : undefined);
      } else {
        const changed = await applyRedesign(design, p.page.tableId, p.page.existingLabels, p.page.client);
        p.resolve(changed);
        toast.success("Database redesigned", { description: changed.added.length ? `Added ${changed.added.join(", ")}`.slice(0, 140) : design.summary.slice(0, 140) });
      }
    } catch (err) {
      p.resolve(null);
      pending.current = null;
      if (isOrganizationSelectionCancelled(err)) return;
      toast.error(p.kind === "design" ? "The database could not be designed" : "The database could not be redesigned", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const value: DesignerContext = {
    wired: Boolean(DESIGN_DATABASE_KEY),
    design: (page) => new Promise((resolve) => ask({ kind: "design", page, resolve })),
    redesign: (page) => new Promise((resolve) => ask({ kind: "redesign", page, resolve })),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && pending.current) settle(null);
        }}
      >
        <DialogContent className="max-w-[min(520px,96vw)] gap-3 p-4">
          <DialogTitle>{redesigning ? "Redesign with AI" : "Database with AI"}</DialogTitle>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <ProTextarea
              autoFocus
              rows={3}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void start();
                }
              }}
              placeholder={redesigning ? "Add a priority and a board by stage…" : "Clients with status, retainer, start date, wins…"}
              aria-label={redesigning ? "What should change" : "What to track"}
            />
            {!DESIGN_DATABASE_KEY ? <p className="type-secondary text-muted-foreground">AI is not connected yet</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="quiet" onClick={() => (setOpen(false), settle(null))}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!typed.trim() || !DESIGN_DATABASE_KEY || isRunning}>
                {redesigning ? "Redesign" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
