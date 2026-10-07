"use client";

// features/spaces/ai/SpaceBuilder.tsx — "Build with AI" (Space Builder, mandate `spaces.build`).
//
// Three doors open ONE request box: the sidebar's New page menu and an empty page ("build a Space"), and
// the page ••• menu ("Ask AI to change this page"). The run is `useLiveAgentRun` (through
// `useFloatingAgentRun`, which floats it in the platform's LiveRunWindow — a build takes 1–8 minutes and
// is never a spinner). The host lives in the Spaces frame, above every page, so switching pages never
// kills a run. Contract: common-docs systems/content/spaces/STATE.md § Space Builder —
//   userInput  = exactly what the person typed;
//   variables  = space_id / page_title / page_markdown, only when a Space is open (the change door);
//   the run    = the active organization (where new tables and Spaces are made);
//   result     = {summary, root_space_id, space_ids[], table_ids[]} → open /spaces/<root_space_id> and
//                read the tree again; a change re-opens the current page on its stored content.

import { Button } from "@ai-matrx/design-system/controls";
import { useFloatingAgentRun } from "@ai-matrx/chat/agents/hooks/useFloatingAgentRun";
import { createContext, useContext, useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import { useSpaces } from "../state/SpacesProvider";
import { BUILD_KEY, useSpaceBuilderDisclosure } from "./spaces-ai";

import { ProTextarea } from "@/components/official/ProTextarea";
/** The open page, when the request is to change it. */
export interface BuilderPage {
  spaceId: string;
  title: string;
  markdown: string;
}

export interface SpaceBuildResult {
  summary: string;
  root_space_id: string | null;
  space_ids: string[];
  table_ids: string[];
}

/** The agent's JSON, read strictly enough to act on (a missing root is a change, not a failure). */
export function readBuildResult(value: unknown): SpaceBuildResult {
  if (!value || typeof value !== "object") throw new Error("The builder finished without a result");
  const v = value as Record<string, unknown>;
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []);
  return {
    summary: typeof v.summary === "string" ? v.summary : "",
    root_space_id: typeof v.root_space_id === "string" && v.root_space_id ? v.root_space_id : null,
    space_ids: ids(v.space_ids),
    table_ids: ids(v.table_ids),
  };
}

/** What the run is sent: the person's words, and the page only on the change door. */
export function buildRequest(typed: string, page: BuilderPage | null): { userInput: string; variables?: Record<string, string> } {
  return page ? { userInput: typed, variables: { space_id: page.spaceId, page_title: page.title, page_markdown: page.markdown } } : { userInput: typed };
}

/** Builds take 1–8 minutes; the wait outlasts the slowest one. */
const RUN_TIMEOUT_MS = 12 * 60_000;

interface BuilderContext {
  wired: boolean;
  running: boolean;
  /** Open the request box: `page` = change this page; none = build a new Space. */
  ask: (page?: BuilderPage | null) => void;
}

const Ctx = createContext<BuilderContext>({ wired: false, running: false, ask: () => undefined });
export const useSpaceBuilder = () => useContext(Ctx);

export function SpaceBuilderHost({ children }: { children: ReactNode }) {
  useSpaceBuilderDisclosure();
  const spaces = useSpaces();
  const activeOrg = useAppSelector(selectActiveOrganizationId);
  const { run, isRunning } = useFloatingAgentRun({ instanceId: "spaces-build" });
  const [page, setPage] = useState<BuilderPage | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const ask = (p?: BuilderPage | null) => {
    setPage(p ?? null);
    setOpen(true);
  };

  const start = async () => {
    const words = typed.trim();
    if (!words || !BUILD_KEY) return;
    const target = page;
    setOpen(false);
    setTyped("");
    try {
      const organizationId = await ensureOrgId(activeOrg);
      const result = await run({
        mandateKey: BUILD_KEY,
        ...buildRequest(words, target),
        label: target ? `Changing ${target.title || "this page"}` : "Building your Space",
        organizationId,
        expect: "json",
        initiation: "user",
        surfaceName: null,
        sourceFeature: "documents",
        surfaceKey: "spaces-page",
        timeoutMs: RUN_TIMEOUT_MS,
        coerce: readBuildResult,
      });
      spaces.retryLoad();
      if (target) spaces.reopenPage(target.spaceId);
      else if (result.root_space_id) spaces.open(result.root_space_id);
      toast.success(target ? "Page updated" : "Your Space is ready", result.summary ? { description: result.summary.slice(0, 140) } : undefined);
    } catch (err) {
      if (isOrganizationSelectionCancelled(err)) return;
      toast.error(target ? "The page could not be changed" : "The Space could not be built", { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <Ctx.Provider value={{ wired: Boolean(BUILD_KEY), running: isRunning, ask }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(520px,96vw)] gap-3 p-4">
          <DialogTitle>{page ? "Ask AI to change this page" : "Build with AI"}</DialogTitle>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <ProTextarea
              autoFocus
              rows={4}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void start();
                }
              }}
              placeholder={page ? "What should change?" : "A client tracker for my dental office…"}
              aria-label={page ? "What should change" : "What to build"}
            />
            {!BUILD_KEY ? <p className="type-secondary text-muted-foreground">AI is not connected yet</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!typed.trim() || !BUILD_KEY || isRunning}>
                {page ? "Change page" : "Build"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
