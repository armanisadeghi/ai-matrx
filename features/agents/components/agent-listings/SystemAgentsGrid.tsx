"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Webhook, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast-service";
import { useIsMobile } from "@/hooks/use-mobile";
import { AgentCard } from "./AgentCard";
import { selectBuiltinAgents } from "@/features/agents/redux/agent-definition/selectors";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import {
  deleteAgent,
  duplicateAgent,
  fetchAgentsListFull,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_SYSTEM_AGENTS_SURFACE_NAME,
  createAdminSystemAgentsScope,
} from "@/features/surfaces/manifests/admin-system-agents.manifest";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import {
  buildSystemAgentRosterEntries,
  systemAgentRosterEntrySummary,
} from "@/features/agents/format";

const ADMIN_BASE_PATH = "/administration/agents/system-agents/agents";
const NEW_HREF = "/administration/agents/system-agents/agents/new";

/**
 * Admin-only grid for system ("builtin") agents. Simpler than the user-facing
 * `AgentsGrid` — system agents don't have ownership tabs, sharing, access levels,
 * or the filter panel. Reuses `AgentCard` with a custom `basePath` so clicks
 * route to the admin builder/runner.
 */
export function SystemAgentsGrid() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const agents = useAppSelector(selectBuiltinAgents);

  useEffect(() => {
    dispatch(fetchAgentsListFull());
  }, [dispatch]);

  const [search, setSearch] = useState("");
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [duplicatingIds, setDuplicatingIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const filtered = useMemo(
    () =>
      // `filterAndSortBySearch` auto-matches the row's UUID `id`, so pasting a
      // full or partial agent id into the search box finds the record — no
      // explicit id field needed.
      filterAndSortBySearch(agents, search, [
        { get: (a) => a.name, weight: "title" },
        { get: (a) => a.category, weight: "tag" },
        { get: (a) => a.description, weight: "body" },
      ]),
    [agents, search],
  );

  const navigationIds = useMemo(() => filtered.map((a) => a.id), [filtered]);

  const handleNavigate = (id: string, path: string) => {
    if (navigatingId) return;
    setNavigatingId(id);
    startTransition(() => router.push(path));
  };

  const handleDeleteClick = (id: string, name: string) => {
    setAgentToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!agentToDelete) return;
    const { id } = agentToDelete;
    setDeletingIds((prev) => new Set(prev).add(id));
    setDeleteDialogOpen(false);
    setAgentToDelete(null);
    try {
      await dispatch(deleteAgent(id)).unwrap();
      toast.success("System agent deleted.");
    } catch {
      toast.error("Failed to delete system agent.");
    } finally {
      setDeletingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingIds((prev) => new Set(prev).add(id));
    try {
      // Every row in this grid is a builtin system agent, and every viewer is
      // a super admin (the page is gated by the admin layout). Pass the
      // explicit flag so the RPC inserts the copy as a builtin instead of
      // silently downgrading it to a personal user agent.
      await dispatch(duplicateAgent({ agentId: id, asSystem: true })).unwrap();
      toast.success("System agent duplicated.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to duplicate system agent.",
      );
    } finally {
      setDuplicatingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  };

  // Surface emitter — assembled at trigger time from live state, never on
  // mount. Roster values only; the open-agent half of the surface is emitted
  // by SystemAgentSurfaceEmitter on the [id] detail routes.
  const getSurfaceScope = () =>
    createAdminSystemAgentsScope({
      roster_agent_ids: agents.map((a) => a.id),
      roster_count: agents.length,
      roster_agents: buildSystemAgentRosterEntries(agents),
      roster_filtered_agent_ids: filtered.map((a) => a.id),
      roster_search_query: search || undefined,
      selection: window.getSelection()?.toString() || undefined,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_SYSTEM_AGENTS_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex-1 relative">
          <div className="flex items-center gap-3 p-1 pl-3 rounded-full border border-border bg-card">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search system agents..."
              className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground py-1"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0 px-1">
          {filtered.length} agent{filtered.length !== 1 ? "s" : ""}
        </span>
        {filtered.length > 0 && (
          <>
            <CopyButtons
              size="icon"
              label="System agents roster"
              human={() =>
                buildSystemAgentRosterEntries(filtered)
                  .map(systemAgentRosterEntrySummary)
                  .join("\n")
              }
              json={() => buildSystemAgentRosterEntries(filtered)}
              agent={() => ({
                kind: "system-agents",
                location:
                  "AI Matrx Admin — System Agents · Roster (/administration/agents/system-agents/agents)",
                description: "All filtered system agents currently listed.",
                data: filtered,
                attributes: { count: filtered.length },
                context: { search: search || undefined, total: agents.length },
              })}
              aiVariants={[
                {
                  id: "roster-summary",
                  label: "Roster summary",
                  hint: "Compact projection — id, name, category, model, status",
                  build: () => ({
                    kind: "system-agents-roster",
                    location:
                      "AI Matrx Admin — System Agents · Roster (/administration/agents/system-agents/agents)",
                    description:
                      "Compact roster projection of all filtered system agents.",
                    data: buildSystemAgentRosterEntries(filtered),
                    attributes: { count: filtered.length },
                  }),
                },
              ]}
            />
            <ExportMenu
              label="system-agents-roster"
              items={[
                jsonExportItem(() => buildSystemAgentRosterEntries(filtered)),
                csvExportItem(
                  () =>
                    buildSystemAgentRosterEntries(
                      filtered,
                    ) as unknown as Array<Record<string, unknown>>,
                  "CSV",
                ),
              ]}
            />
          </>
        )}
        <Link href={NEW_HREF}>
          <Button size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1.5" />
            New system agent
          </Button>
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div
          className={cn(
            "border border-primary/20 rounded-xl p-8",
            "bg-gradient-to-br from-primary/5 to-secondary/5",
          )}
        >
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <Webhook className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">
                {search
                  ? "No system agents match your search"
                  : "No system agents yet"}
              </h3>
              <p className="text-muted-foreground text-sm">
                {search
                  ? "Try a different query."
                  : "Create a new system agent, or promote an existing user agent to system scope."}
              </p>
            </div>
            {!search && (
              <Link href={NEW_HREF}>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create System Agent
                </Button>
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-3">
          {filtered.map((a) => (
            <AgentCard
              key={a.id}
              id={a.id}
              basePath={ADMIN_BASE_PATH}
              onDelete={handleDeleteClick}
              onDuplicate={handleDuplicate}
              onNavigate={handleNavigate}
              isDeleting={deletingIds.has(a.id)}
              isDuplicating={duplicatingIds.has(a.id)}
              isNavigating={navigatingId === a.id}
              isAnyNavigating={navigatingId !== null}
              navigationIds={navigationIds}
            />
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Delete System Agent
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{agentToDelete?.name}
              &rdquo;? This will remove the agent for every user on the
              platform. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteDialogOpen(false);
                setAgentToDelete(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete System Agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SurfaceRuntimeProvider>
  );
}
