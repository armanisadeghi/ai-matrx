// features/agents/org-chart/components/AgentOrgChartView.tsx
//
// THE agent org chart surface: every link type (constants.ts ORG_LINK_KIND_META)
// in one chart. Used full-page at /agents/org-chart and, rooted at one
// Conductor, inside the Orchestra builder.
//
// Editing happens on the chart itself:
//   • drag a card (or a selection) onto another card — what that means is
//     decided by `dropActions` below; an unambiguous drop acts at once with
//     Undo, an ambiguous one (Orchestra involved) asks with a small menu;
//   • right-click or "…" on a card for every action; "+" under a card adds below;
//   • arrows walk the tree, Enter opens, Delete removes the selected placements.
// Orchestra links belong to their Orchestra: moving into / out of one changes
// who the Conductor directs, and the menu says so before it happens.

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpToLine,
  Focus,
  LinkIcon,
  MoreHorizontal,
  Network,
  Plus,
  Share2,
  Unlink,
  X,
} from "lucide-react";
import { AgentListInlinePicker } from "@ai-matrx/agents/catalog/react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllAgents } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  addCrossLink,
  removeManualManager,
  setManualManager,
} from "@/features/agents/redux/orchestras/orgChartThunks";
import { addAgentToOrchestra, removeAgentFromOrchestra } from "@/features/agents/redux/orchestras/thunks";
import { OrgChart, type OrgChartCrossLink } from "@/components/official/org-chart/OrgChart";
import type { OrgChartTreeNode } from "@/components/official/org-chart/layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { toast } from "@/lib/toast";
import { announceReversible } from "@/lib/reversible/announceReversible";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ORG_LINK_KIND_META, type RecordedLinkKind } from "../constants";
import { crossLinksOf, type AgentOrgNodeData } from "../buildAgentOrgForest";
import { useAgentOrgChart } from "../useAgentOrgChart";
import { AgentOrgCard } from "./AgentOrgCard";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type PickMode =
  | { kind: "manager-for"; reportIds: string[] } // choose who these sit under
  | { kind: "report-of"; managerId: string } // choose an agent to put under this one
  | { kind: "cross-link"; fromId: string; link: Exclude<RecordedLinkKind, "reports_to"> } // choose where this hands off / has a dotted line
  | { kind: "new-root" }; // choose an agent, then who it sits under

/** One thing a drop (or a menu item) can do. */
interface ChartAction {
  label: string;
  /** Plain sentence of what changes, shown where the person chooses. */
  hint?: string;
  run: () => Promise<void> | void;
}

type Node = OrgChartTreeNode<AgentOrgNodeData>;

function indexForest(forest: Node[]) {
  const byKey = new Map<string, Node>();
  const firstKeyOf = new Map<string, string>();
  const stack = [...forest].reverse();
  while (stack.length) {
    const n = stack.pop() as Node;
    byKey.set(n.key, n);
    if (!firstKeyOf.has(n.data.agentId)) firstKeyOf.set(n.data.agentId, n.key);
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return { byKey, firstKeyOf };
}

export function AgentOrgChartView({
  rootIds,
  emptyTitle = "No org chart yet",
  emptyBody = "Orchestras appear here on their own. You can also place any agent under another by hand.",
}: {
  /** Chart only what hangs under these agents. Omit for the whole chart. */
  rootIds?: string[];
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agents = useAppSelector(selectAllAgents);
  // "Show only this branch" narrows the chart to one box and what hangs under it.
  const [branchRoot, setBranchRoot] = useState<string | null>(null);
  const effectiveRoots = branchRoot ? [branchRoot] : rootIds;
  const { forest, orchestras, manualEdges, loading, error } = useAgentOrgChart({ rootIds: effectiveRoots });
  const [selection, setSelection] = useState<string[]>([]);
  const [pick, setPick] = useState<PickMode | null>(null);
  const [dropMenu, setDropMenu] = useState<{ x: number; y: number; title: string; actions: ChartAction[] } | null>(
    null,
  );

  const { byKey, firstKeyOf } = indexForest(forest);
  const nameOf = (id: string) => agents[id]?.name ?? "this agent";
  const focusAgent = searchParams.get("focus");
  const focusKey = focusAgent ? (firstKeyOf.get(focusAgent) ?? null) : null;

  const crossLinks: OrgChartCrossLink[] = crossLinksOf(manualEdges).flatMap((l) => {
    const fromKey = firstKeyOf.get(l.fromId);
    const toKey = firstKeyOf.get(l.toId);
    return fromKey && toKey ? [{ key: l.edgeId, fromKey, toKey, kind: l.kind }] : [];
  });

  // ── writes, each announced with Undo ──────────────────────────────────────
  const fail = (msg?: string) => {
    toast.error(msg ?? "That change could not be saved.");
  };

  /** Place `reportId` under `managerId` (recorded). Undo puts back its earlier manager, if any. */
  const placeUnder = async (managerId: string, reportId: string, quiet = false) => {
    const before = manualEdges.find((e) => e.reportId === reportId && ORG_LINK_KIND_META[e.kind].tree);
    const res = await dispatch(setManualManager(managerId, reportId));
    if (!res.ok) {
      if (res.loop && managerId !== reportId) {
        fail(`${nameOf(managerId)} already sits under ${nameOf(reportId)}, so this would make a loop. Move ${nameOf(managerId)} first.`);
      } else fail(res.error);
      return false;
    }
    if (!quiet) {
      announceReversible({
        verb: "move",
        noun: "agent",
        subject: `${nameOf(reportId)} under ${nameOf(managerId)}`,
        undo: async () => {
          const back = before
            ? await dispatch(setManualManager(before.managerId, reportId))
            : await dispatch(removeManualManager(managerId, reportId));
          if (!back.ok) throw new Error(back.error ?? "Could not put it back.");
        },
      });
    }
    return true;
  };

  const unplace = async (managerId: string, reportId: string) => {
    const before = manualEdges.find((e) => e.managerId === managerId && e.reportId === reportId);
    const res = await dispatch(removeManualManager(managerId, reportId));
    if (!res.ok) {
      fail(res.error);
      return;
    }
    announceReversible({
      verb: "remove",
      noun: "link",
      subject: `${nameOf(reportId)} from under ${nameOf(managerId)}`,
      undo: async () => {
        const back =
          before && !ORG_LINK_KIND_META[before.kind].tree
            ? await dispatch(addCrossLink(managerId, reportId, before.kind as Exclude<RecordedLinkKind, "reports_to">))
            : await dispatch(setManualManager(managerId, reportId));
        if (!back.ok) throw new Error(back.error ?? "Could not put it back.");
      },
    });
  };

  const joinOrchestra = async (conductorId: string, agentId: string) => {
    const res = await dispatch(addAgentToOrchestra({ conductorId, agentId }));
    if (!res.ok) {
      fail(res.error);
      return;
    }
    announceReversible({
      verb: "move",
      noun: "agent",
      subject: `${nameOf(agentId)} into the ${nameOf(conductorId)} Orchestra`,
      undo: async () => {
        const back = await dispatch(removeAgentFromOrchestra({ conductorId, agentId }));
        if (!back.ok) throw new Error(back.error ?? "Could not take it back out.");
      },
    });
  };

  const leaveOrchestra = async (conductorId: string, agentId: string) => {
    const ok = await confirm({
      title: `Take ${nameOf(agentId)} out of the ${nameOf(conductorId)} Orchestra?`,
      description: `${nameOf(conductorId)} will stop directing it, so its runs no longer use ${nameOf(agentId)}.`,
      confirmLabel: "Take it out",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await dispatch(removeAgentFromOrchestra({ conductorId, agentId }));
    if (!res.ok) {
      fail(res.error);
      return;
    }
    announceReversible({
      verb: "remove",
      noun: "agent",
      subject: `${nameOf(agentId)} from the ${nameOf(conductorId)} Orchestra`,
      undo: async () => {
        const back = await dispatch(addAgentToOrchestra({ conductorId, agentId }));
        if (!back.ok) throw new Error(back.error ?? "Could not put it back.");
      },
    });
  };

  const linkAcross = async (fromId: string, toId: string, link: Exclude<RecordedLinkKind, "reports_to">) => {
    const res = await dispatch(addCrossLink(fromId, toId, link));
    if (!res.ok) {
      fail(res.error);
      return;
    }
    toast.success(`${nameOf(fromId)} ${ORG_LINK_KIND_META[link].verb} ${nameOf(toId)}.`);
  };

  // ── what a drop means ─────────────────────────────────────────────────────
  /** Every sensible outcome of dropping `dragged` onto `target`, best first. */
  const dropActions = (dragged: Node, target: Node): ChartAction[] => {
    const d = dragged.data;
    const t = target.data;
    const actions: ChartAction[] = [];
    const fromOrchestra = d.edgeKind === "directs" && d.parentId ? d.parentId : null;
    if (t.isConductor) {
      actions.push({
        label: fromOrchestra ? `Move into the ${nameOf(t.agentId)} Orchestra` : `Add to the ${nameOf(t.agentId)} Orchestra`,
        hint: `${nameOf(t.agentId)} will direct it when it runs.`,
        run: async () => {
          await joinOrchestra(t.agentId, d.agentId);
          if (fromOrchestra && fromOrchestra !== t.agentId) await leaveOrchestra(fromOrchestra, d.agentId);
        },
      });
    }
    actions.push({
      label: `Place under ${nameOf(t.agentId)}`,
      hint: fromOrchestra ? `Recorded only. It stays in the ${nameOf(fromOrchestra)} Orchestra.` : "Recorded only.",
      run: () => void placeUnder(t.agentId, d.agentId),
    });
    if (fromOrchestra) {
      actions.push({
        label: `Place under ${nameOf(t.agentId)} and leave ${nameOf(fromOrchestra)}`,
        run: async () => {
          if (await placeUnder(t.agentId, d.agentId)) await leaveOrchestra(fromOrchestra, d.agentId);
        },
      });
    }
    actions.push({
      label: `${nameOf(d.agentId)} hands off to ${nameOf(t.agentId)}`,
      hint: "Draws an arrow; nothing moves.",
      run: () => void linkAcross(d.agentId, t.agentId, "hands_off_to"),
    });
    return actions;
  };

  const onDrop = (dragKeys: string[], targetKey: string | null, point: { x: number; y: number }) => {
    const dragged = dragKeys.map((k) => byKey.get(k)).filter((n): n is Node => Boolean(n));
    if (dragged.length === 0) return;
    if (!targetKey) {
      // Dropped on empty canvas: take recorded boxes out from under their manager (to the top).
      const manual = dragged.filter((n) => n.data.edgeKind === "reports_to" && n.data.parentId);
      manual.forEach((n) => void unplace(n.data.parentId as string, n.data.agentId));
      if (manual.length < dragged.length) {
        toast.info("Orchestra members stay in their Orchestra — use the card menu to take one out.");
      }
      return;
    }
    const target = byKey.get(targetKey);
    if (!target) return;
    const simple = dragged.every((n) => n.data.edgeKind !== "directs") && !target.data.isConductor;
    if (simple) {
      // Unambiguous: act at once, Undo in the announcement.
      dragged.forEach((n) => void placeUnder(target.data.agentId, n.data.agentId));
      return;
    }
    if (dragged.length === 1) {
      setDropMenu({ ...point, title: `Drop ${nameOf(dragged[0].data.agentId)} on ${nameOf(target.data.agentId)}`, actions: dropActions(dragged[0], target) });
    } else {
      setDropMenu({
        ...point,
        title: `Drop ${dragged.length} agents on ${nameOf(target.data.agentId)}`,
        actions: [
          ...(target.data.isConductor
            ? [{ label: `Add all to the ${nameOf(target.data.agentId)} Orchestra`, run: () => dragged.forEach((n) => void joinOrchestra(target.data.agentId, n.data.agentId)) }]
            : []),
          { label: `Place all under ${nameOf(target.data.agentId)}`, hint: "Recorded only.", run: () => dragged.forEach((n) => void placeUnder(target.data.agentId, n.data.agentId)) },
        ],
      });
    }
  };

  const canDrop = (dragKeys: string[], targetKey: string) => {
    const target = byKey.get(targetKey);
    if (!target) return false;
    return dragKeys.every((k) => {
      const n = byKey.get(k);
      if (!n || n.data.agentId === target.data.agentId) return false;
      // Never under its own team: a key path is ancestry ("a/b/c").
      return !targetKey.startsWith(`${k}/`);
    });
  };

  const onDelete = (keys: string[]) => {
    for (const k of keys) {
      const n = byKey.get(k);
      if (!n?.data.parentId) continue;
      if (n.data.edgeKind === "directs") void leaveOrchestra(n.data.parentId, n.data.agentId);
      else void unplace(n.data.parentId, n.data.agentId);
    }
  };

  const hrefOf = (d: AgentOrgNodeData) => (d.isConductor ? `/agents/orchestras/${d.agentId}` : `/agents/${d.agentId}`);

  const copyLink = async (agentId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("focus", agentId);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success("Link to this box copied.");
    } catch {
      toast.error("Couldn't copy — your browser blocked the clipboard.");
    }
  };

  // ── the card's actions, shared by "…" and right-click ─────────────────────
  type MenuParts = {
    Item: typeof DropdownMenuItem | typeof ContextMenuItem;
    Label: typeof DropdownMenuLabel | typeof ContextMenuLabel;
    Sep: typeof DropdownMenuSeparator | typeof ContextMenuSeparator;
  };
  const cardMenu = (n: Node, { Item, Label, Sep }: MenuParts) => {
    const d = n.data;
    const many = selection.length > 1 && selection.includes(n.key);
    const outgoing = manualEdges.filter((e) => e.managerId === d.agentId && !ORG_LINK_KIND_META[e.kind].tree);
    return (
      <>
        {many ? (
          <>
            <Label className="text-xs text-muted-foreground">{selection.length} selected</Label>
            <Item
              onSelect={() =>
                setPick({
                  kind: "manager-for",
                  reportIds: selection.map((k) => byKey.get(k)?.data.agentId).filter((x): x is string => Boolean(x)),
                })
              }
            >
              <ArrowUpToLine className="mr-2 h-4 w-4" />
              Place all under another agent…
            </Item>
            <Item onSelect={() => onDelete(selection)}>
              <Unlink className="mr-2 h-4 w-4" />
              Remove these placements
            </Item>
            <Sep />
          </>
        ) : null}
        <Item onSelect={() => router.push(hrefOf(d))}>
          <Network className="mr-2 h-4 w-4" />
          {d.isConductor ? "Open Orchestra" : "Open agent"}
        </Item>
        <Item onSelect={() => setBranchRoot(d.agentId)}>
          <Focus className="mr-2 h-4 w-4" />
          Show only this branch
        </Item>
        <Item onSelect={() => void copyLink(d.agentId)}>
          <LinkIcon className="mr-2 h-4 w-4" />
          Copy link to this box
        </Item>
        <Sep />
        <Label className="text-xs text-muted-foreground">Arrange</Label>
        <Item onSelect={() => setPick({ kind: "manager-for", reportIds: [d.agentId] })}>
          <ArrowUpToLine className="mr-2 h-4 w-4" />
          Place under another agent…
        </Item>
        <Item onSelect={() => setPick({ kind: "report-of", managerId: d.agentId })}>
          <ArrowDownToLine className="mr-2 h-4 w-4" />
          Put an agent under this one…
        </Item>
        <Item onSelect={() => setPick({ kind: "cross-link", fromId: d.agentId, link: "hands_off_to" })}>
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Hands off to…
        </Item>
        <Item onSelect={() => setPick({ kind: "cross-link", fromId: d.agentId, link: "dotted_line" })}>
          <Share2 className="mr-2 h-4 w-4" />
          Dotted line to…
        </Item>
        {d.parentId && d.edgeKind === "reports_to" && (
          <Item onSelect={() => void unplace(d.parentId as string, d.agentId)}>
            <Unlink className="mr-2 h-4 w-4" />
            Remove from under {nameOf(d.parentId)}
          </Item>
        )}
        {d.parentId && d.edgeKind === "directs" && (
          <Item onSelect={() => void leaveOrchestra(d.parentId as string, d.agentId)}>
            <Unlink className="mr-2 h-4 w-4" />
            Take out of the {nameOf(d.parentId)} Orchestra…
          </Item>
        )}
        {outgoing.length > 0 && (
          <>
            <Sep />
            {outgoing.map((e) => (
              <Item key={e.edgeId} onSelect={() => void unplace(e.managerId, e.reportId)}>
                <X className="mr-2 h-4 w-4" />
                Remove “{ORG_LINK_KIND_META[e.kind].label}” to {nameOf(e.reportId)}
              </Item>
            ))}
          </>
        )}
      </>
    );
  };

  // ── pickers ───────────────────────────────────────────────────────────────
  const onPicked = async (agentId: string) => {
    const mode = pick;
    setPick(null);
    if (!mode) return;
    if (mode.kind === "manager-for") for (const r of mode.reportIds) await placeUnder(agentId, r);
    else if (mode.kind === "report-of") await placeUnder(mode.managerId, agentId);
    else if (mode.kind === "cross-link") await linkAcross(mode.fromId, agentId, mode.link);
    else setPick({ kind: "manager-for", reportIds: [agentId] }); // step 2 of "Place an agent"
  };

  if (forest.length === 0 && loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-textured">
        <SuspenseLoader size="md" centered={false} message="Building the org chart…" />
      </div>
    );
  }

  const toolbar = (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-9 bg-card/95 px-2.5 shadow-sm"
        aria-label="Place an agent"
        title="Place an agent"
        onClick={() => setPick({ kind: "new-root" })}
      >
        <Plus className="h-3.5 w-3.5 sm:mr-1" />
        <span className="hidden sm:inline">Place an agent</span>
      </Button>
      {branchRoot && (
        <div className="flex h-9 items-center gap-1 rounded-lg border border-border bg-card/95 pl-2.5 pr-1 text-xs shadow-sm">
          <Focus className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="max-w-40 truncate">{nameOf(branchRoot)}&apos;s branch</span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setBranchRoot(null)}>
            Show all
          </Button>
        </div>
      )}
    </>
  );

  const pickerTitle =
    pick?.kind === "manager-for"
      ? pick.reportIds.length > 1
        ? `Who do these ${pick.reportIds.length} sit under?`
        : `Who does ${nameOf(pick.reportIds[0])} sit under?`
      : pick?.kind === "report-of"
        ? `Put an agent under ${nameOf(pick.managerId)}`
        : pick?.kind === "cross-link"
          ? `${nameOf(pick.fromId)} ${ORG_LINK_KIND_META[pick.link].verb}…`
          : "Place an agent on the chart";
  const pickerBody =
    pick?.kind === "cross-link"
      ? ORG_LINK_KIND_META[pick.link].description
      : pick?.kind === "new-root"
        ? "Pick the agent first, then who it sits under."
        : "Recorded structure. To have one agent direct others, make it an Orchestra.";

  return (
    <div className="relative h-full w-full">
      {error && (
        <div className="absolute inset-x-3 top-14 z-30 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Part of the chart could not load: {error}
          <ErrorAlchemyMenu error={error} operation="Load the agent org chart" />
        </div>
      )}
      <OrgChart
        roots={forest}
        edgeKinds={ORG_LINK_KIND_META}
        crossLinks={crossLinks}
        selection={selection}
        onSelectionChange={setSelection}
        focusKey={focusKey}
        persistKey={`agents:${(effectiveRoots ?? ["all"]).join(",")}`}
        getSearchText={(d) => `${agents[d.agentId]?.name ?? ""} ${d.roleTitle ?? ""}`}
        dragLabel={(d) => nameOf(d.agentId)}
        onDrop={onDrop}
        canDrop={canDrop}
        onAddBelow={(key) => {
          const n = byKey.get(key);
          if (n) setPick({ kind: "report-of", managerId: n.data.agentId });
        }}
        onOpen={(key) => {
          const n = byKey.get(key);
          if (n) router.push(hrefOf(n.data));
        }}
        onDelete={onDelete}
        ariaLabel="Agent org chart"
        toolbar={toolbar}
        emptyState={
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-textured p-6 text-center">
            <Network className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">{emptyTitle}</div>
            <p className="max-w-sm text-sm text-muted-foreground">{emptyBody}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setPick({ kind: "new-root" })}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Place an agent
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/agents/orchestras">Open Orchestras</Link>
              </Button>
            </div>
          </div>
        }
        renderCard={(n, state) => (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="h-full w-full">
                <AgentOrgCard
                  node={n}
                  state={state}
                  memberCount={orchestras.get(n.node.data.agentId)?.members.length}
                  menu={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="More actions"
                          title="More actions"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72" onClick={(e) => e.stopPropagation()}>
                        {cardMenu(n.node, { Item: DropdownMenuItem, Label: DropdownMenuLabel, Sep: DropdownMenuSeparator })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-72">
              {cardMenu(n.node, { Item: ContextMenuItem, Label: ContextMenuLabel, Sep: ContextMenuSeparator })}
            </ContextMenuContent>
          </ContextMenu>
        )}
      />

      {/* What a drop should mean, when it could mean more than one thing. */}
      <DropdownMenu open={dropMenu !== null} onOpenChange={(open) => !open && setDropMenu(null)}>
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed h-px w-px"
            style={{ left: dropMenu?.x ?? 0, top: dropMenu?.y ?? 0 }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel className="text-xs text-muted-foreground">{dropMenu?.title}</DropdownMenuLabel>
          {dropMenu?.actions.map((a) => (
            <DropdownMenuItem
              key={a.label}
              className="flex flex-col items-start gap-0.5"
              onSelect={() => {
                setDropMenu(null);
                void a.run();
              }}
            >
              <span>{a.label}</span>
              {a.hint && <span className="text-xs text-muted-foreground">{a.hint}</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pick !== null} onOpenChange={(open) => !open && setPick(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{pickerTitle}</DialogTitle>
            <DialogDescription>{pickerBody}</DialogDescription>
          </DialogHeader>
          {pick && (
            <AgentListInlinePicker
              key={JSON.stringify(pick)}
              consumerId="agent-org-chart-picker"
              onSelect={(id: string) => void onPicked(id)}
              showPinnedAgent={false}
              excludeAgentIds={
                pick.kind === "manager-for"
                  ? pick.reportIds
                  : pick.kind === "report-of"
                    ? [pick.managerId]
                    : pick.kind === "cross-link"
                      ? [pick.fromId]
                      : []
              }
              className="h-96 rounded-md border border-border bg-card"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
