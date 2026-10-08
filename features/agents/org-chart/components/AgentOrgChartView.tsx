// features/agents/org-chart/components/AgentOrgChartView.tsx
//
// THE org chart surface: agents, people, teams and positions in one chart, with
// every link type (constants.ts ORG_LINK_KIND_META). Used full-page at
// /agents/org-chart and, rooted at one Conductor, inside the Orchestra builder.
//
// Editing happens on the chart itself:
//   • drag a card (or a selection) onto another card — what that means is
//     decided by `dropActions` below; an unambiguous drop acts at once with
//     Undo, an ambiguous one (Orchestra involved) asks with a small menu;
//   • right-click or "…" on a card for every action; "+" under a card adds below;
//   • arrows walk the tree, Enter opens, Delete removes the selected placements.
// Orchestra links belong to their Orchestra: moving into / out of one changes
// who the Conductor directs, and the menu says so before it happens.
// Every id here is a BOX id (`type:entityId`).

"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  Archive,
  ArrowUpToLine,
  ClipboardList,
  Coins,
  Eraser,
  Stethoscope,
  Focus,
  LinkIcon,
  MoreHorizontal,
  Network,
  PencilLine,
  Plus,
  Share2,
  Unlink,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  addCrossLink,
  removeManualManager,
  removeOrgPosition,
  restoreOrgPosition,
  setManualManager,
  updateOrgPosition,
} from "@/features/agents/redux/orchestras/orgChartThunks";
import { addAgentToOrchestra, removeAgentFromOrchestra } from "@/features/agents/redux/orchestras/thunks";
import { saveAgentField } from "@/features/agents/redux/builder-write.thunks";
import { archiveTeam, restoreTeam } from "@/features/organizations/service/teamsService";
import { OrgChart, type OrgChartCrossLink } from "@/components/official/org-chart/OrgChart";
import type { OrgChartTreeNode } from "@/components/official/org-chart/layout";
import { Button } from "@ai-matrx/design-system/controls";
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
import { TextInputDialog } from "@ai-matrx/design-system";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { announceReversible } from "@/lib/reversible/announceReversible";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  ORG_BOX_LABEL,
  ORG_LINK_KIND_META,
  boxId,
  parseBoxId,
  type OrgBoxType,
  type RecordedLinkKind,
} from "../constants";
import { crossLinksOf, type AgentOrgNodeData } from "../buildAgentOrgForest";
import { useAgentOrgChart } from "../useAgentOrgChart";
import { OrgChartActivityProvider, useOrgChartActivity } from "../useOrgChartActivity";
import { OrgChartPointsProvider, branchTotals, useOrgChartPoints } from "../useOrgChartPoints";
import { orgChartHealth, type HealthIssueId } from "../orgChartHealth";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { loadOrgDirectory } from "../useBoxIdentity";
import type { OrgPosition } from "../positionsService";
import { AgentOrgCard, boxHref } from "./AgentOrgCard";
import { OrgBoxPicker } from "./OrgBoxPicker";
import { DefineSeatJobDialog } from "./DefineSeatJobDialog";
import { MakeOrchestraDialog, type MakeOrchestraRequest } from "./MakeOrchestraDialog";
import { selectSeatJobs } from "@/features/agents/redux/orchestras/selectors";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useAgentsById } from "@ai-matrx/chat/agents/identity/agent-catalog-lists";

type CrossKind = Exclude<RecordedLinkKind, "reports_to">;

type PickMode =
  | { kind: "manager-for"; reportIds: string[]; adding?: boolean } // choose who these sit under ("adding": step 2 of Add to chart)
  | { kind: "report-of"; managerId: string } // choose a box to put under this one
  | { kind: "cross-link"; fromId: string; link: CrossKind } // where this hands off / has a dotted line
  | { kind: "fill"; positionId: string } // who fills this position
  | { kind: "new-root" }; // choose a box, then who it sits under

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
    if (!firstKeyOf.has(n.data.boxId)) firstKeyOf.set(n.data.boxId, n.key);
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return { byKey, firstKeyOf };
}

export function AgentOrgChartView({
  rootIds,
  emptyTitle = "No org chart yet",
  emptyBody = "Orchestras appear here on their own. Add people, teams, positions and agents to record the rest.",
}: {
  /** Chart only what hangs under these AGENTS (plain agent ids). Omit for the whole chart. */
  rootIds?: string[];
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const agents = useAgentsById();
  // "Show only this branch" narrows the chart to one box and what hangs under it.
  const [branchRoot, setBranchRoot] = useState<string | null>(null);
  const effectiveRoots = branchRoot ? [branchRoot] : rootIds?.map((id) => boxId("agent", id));
  const { forest, orchestras, manualEdges, positions, loading, error } = useAgentOrgChart({
    rootIds: effectiveRoots,
  });
  const [selection, setSelection] = useState<string[]>([]);
  const [pick, setPick] = useState<PickMode | null>(null);
  const [renaming, setRenaming] = useState<OrgPosition | null>(null);
  const [defining, setDefining] = useState<OrgPosition | null>(null);
  const [making, setMaking] = useState<MakeOrchestraRequest | null>(null);
  /** The chart around a seat, for the job suggester: the box above it and the boxes beside it. */
  const seatContextOf = (positionId: string) => {
    const key = firstKeyOf.get(boxId("position", positionId));
    const node = key ? byKey.get(key) : undefined;
    const parentKey = key?.includes("/") ? key.slice(0, key.lastIndexOf("/")) : null;
    const parent = parentKey ? byKey.get(parentKey) : undefined;
    const label = (b: string) => `${nameOf(b)} (${ORG_BOX_LABEL[parseBoxId(b).type]})`;
    return {
      reportsTo: parent ? label(parent.data.boxId) : null,
      team: (parent?.children ?? []).filter((c) => c.key !== node?.key).map((c) => label(c.data.boxId)),
    };
  };
  /** Form A: these agent nodes become a new Orchestra, taking their shared recorded place. */
  const makeOrchestraOf = (nodes: Node[]) => {
    const agentsOnly = nodes.filter((x) => x.data.boxType === "agent");
    const parents = new Set(agentsOnly.map((x) => (x.data.edgeKind === "reports_to" ? x.data.parentId : null)));
    const shared = parents.size === 1 ? [...parents][0] : null;
    setMaking({
      memberIds: [...new Set(agentsOnly.map((x) => x.data.entityId))],
      underBoxId: shared,
      leaving: shared ? agentsOnly.map((x) => ({ managerId: shared, reportId: x.data.boxId })) : [],
      suggestedName: shared ? `${nameOf(shared)} team lead` : "Team lead",
      underName: shared ? nameOf(shared) : null,
    });
  };
  const seatJobs = useAppSelector(selectSeatJobs);
  const openMandateWindow = useOpenMandateWindow();
  /** The seat's job, in place: goal writer, building its agent and testing all live there. */
  const openSeatJob = (p: OrgPosition) => {
    const job = p.mandateId ? seatJobs[p.mandateId] : undefined;
    if (!job) {
      toast.error("This position's job is still loading. Try again in a moment.");
      return;
    }
    openMandateWindow({ initialMandateKey: job.mandateKey, mandateKeys: [job.mandateKey] });
  };
  const [dropMenu, setDropMenu] = useState<{ x: number; y: number; title: string; actions: ChartAction[] } | null>(
    null,
  );

  const { byKey, firstKeyOf } = indexForest(forest);
  const chartAgentIds = [...firstKeyOf.keys()].map(parseBoxId).filter((b) => b.type === "agent").map((b) => b.id);
  const activity = useOrgChartActivity(chartAgentIds);
  // Points per branch: an optional view, off until asked for.
  const [showPoints, setShowPoints] = useState(false);
  const points = useOrgChartPoints(chartAgentIds, showPoints);
  const pointTotals = points.byAgent ? branchTotals(forest, points.byAgent) : null;
  const [spreadWarnAt, setSpreadWarnAt] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    knobInt("agents.org_chart", "spread_warn_places")
      .then((n) => live && setSpreadWarnAt(n))
      .catch(() => live && setSpreadWarnAt(null)); // without the knob the spread check is skipped, not guessed
    return () => {
      live = false;
    };
  }, []);
  const health = orgChartHealth(forest, {
    activity: activity.byAgentId,
    spreadWarnAt,
    isOpenPosition: (id) => {
      const p = positions.find((x) => x.id === id);
      return Boolean(p && !p.filledByUserId && !(p.mandateId && seatJobs[p.mandateId]?.holderAgentId));
    },
  });
  const seriousCount = health.filter((h) => h.serious).reduce((n, h) => n + h.keys.length, 0);
  const [healthView, setHealthView] = useState<HealthIssueId | null>(null);
  const shownIssue = health.find((h) => h.id === healthView) ?? null;
  const positionById = new Map(positions.map((p) => [p.id, p]));

  // Names of people and teams for menus and messages (cards resolve their own).
  const [names, setNames] = useState<Record<string, string>>({});
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryTry, setDirectoryTry] = useState(0);
  const unnamed = [...firstKeyOf.keys()]
    .filter((b) => {
      const t = parseBoxId(b).type;
      return (t === "membership" || t === "team") && !(b in names);
    })
    .sort()
    .join(",");
  useEffect(() => {
    if (!unnamed) return;
    let live = true;
    void (async () => {
      const found: Record<string, string> = {};
      const dir = await loadOrgDirectory();
      if (live) setDirectoryError(dir.failed.length ? `Could not load ${dir.failed.join(", ")}.` : null);
      for (const b of unnamed.split(",")) {
        const { type, id } = parseBoxId(b);
        // Unresolved while the read failed: left unnamed so a retry fills it.
        const name = type === "membership" ? dir.members.get(id)?.name : dir.teams.get(id)?.name;
        if (name || !dir.failed.length) found[b] = name ?? (type === "membership" ? "this person" : "this team");
      }
      if (live) setNames((cur) => ({ ...cur, ...found }));
    })();
    return () => {
      live = false;
    };
  }, [unnamed, directoryTry]);

  const nameOf = (b: string) => {
    const { type, id } = parseBoxId(b);
    if (type === "agent") return agents[id]?.name ?? "this agent";
    if (type === "position") return positionById.get(id)?.name ?? "this position";
    return names[b] ?? (type === "membership" ? "this person" : "this team");
  };
  const nounOf = (b: string) => ORG_BOX_LABEL[parseBoxId(b).type].toLowerCase();
  /** A name for a message, even for a person or team that isn't on the chart yet. */
  const nameNow = async (b: string): Promise<string> => {
    const { type, id } = parseBoxId(b);
    if (type === "membership" || type === "team") {
      const dir = await loadOrgDirectory();
      const found = type === "membership" ? dir.members.get(id)?.name : dir.teams.get(id)?.name;
      if (found) return found;
    }
    return nameOf(b);
  };
  const agentOf = (n: Node) => (n.data.boxType === "agent" ? n.data.entityId : null);

  const focusBox = searchParams.get("focus");
  const focusKey = focusBox ? (firstKeyOf.get(focusBox) ?? firstKeyOf.get(boxId("agent", focusBox)) ?? null) : null;

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
  const placeUnder = async (managerId: string, reportId: string) => {
    const before = manualEdges.find((e) => e.reportId === reportId && ORG_LINK_KIND_META[e.kind].tree);
    const res = await dispatch(setManualManager(managerId, reportId));
    if (!res.ok) {
      if (res.loop && managerId !== reportId) {
        const [m, r] = [await nameNow(managerId), await nameNow(reportId)];
        fail(`${m} already sits under ${r}, so this would make a loop. Move ${m} first.`);
      } else fail(res.error);
      return false;
    }
    if (res.unchanged) return true;
    const replaced = res.replaced;
    announceReversible({
      verb: "move",
      noun: nounOf(reportId),
      subject: `${await nameNow(reportId)} under ${await nameNow(managerId)}`,
      undo: async () => {
        // A hand-off or dotted line this pair held comes back as it was.
        const back = before
          ? await dispatch(setManualManager(before.managerId, reportId))
          : replaced
            ? { ok: true }
            : await dispatch(removeManualManager(managerId, reportId));
        if (!back.ok) throw new Error(back.error ?? "Could not put it back.");
        if (replaced) {
          const link = await dispatch(addCrossLink(managerId, reportId, replaced.kind as CrossKind));
          if (!link.ok) throw new Error(link.error ?? "Could not put the earlier link back.");
        }
      },
    });
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
      subject: `${await nameNow(reportId)} from under ${await nameNow(managerId)}`,
      undo: async () => {
        const back =
          before && !ORG_LINK_KIND_META[before.kind].tree
            ? await dispatch(addCrossLink(managerId, reportId, before.kind as CrossKind))
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
      subject: `${agents[agentId]?.name ?? "the agent"} into the ${agents[conductorId]?.name ?? ""} Orchestra`,
      undo: async () => {
        const back = await dispatch(removeAgentFromOrchestra({ conductorId, agentId }));
        if (!back.ok) throw new Error(back.error ?? "Could not take it back out.");
      },
    });
  };

  const leaveOrchestra = async (conductorId: string, agentId: string) => {
    const conductorName = agents[conductorId]?.name ?? "the Conductor";
    const agentName = agents[agentId]?.name ?? "this agent";
    const ok = await confirm({
      title: `Take ${agentName} out of the ${conductorName} Orchestra?`,
      description: `${conductorName} will stop directing it, so its runs no longer use ${agentName}.`,
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
      subject: `${agentName} from the ${conductorName} Orchestra`,
      undo: async () => {
        const back = await dispatch(addAgentToOrchestra({ conductorId, agentId }));
        if (!back.ok) throw new Error(back.error ?? "Could not put it back.");
      },
    });
  };

  const linkAcross = async (fromId: string, toId: string, link: CrossKind) => {
    const res = await dispatch(addCrossLink(fromId, toId, link));
    if (!res.ok) {
      fail(res.error);
      return;
    }
    toast.success(`${await nameNow(fromId)} ${ORG_LINK_KIND_META[link].verb} ${await nameNow(toId)}.`);
  };

  /** Fill a position with a person (their membership box), or mark it open (null). */
  const fillPosition = async (positionId: string, memberBox: string | null) => {
    const before = positionById.get(positionId)?.filledByUserId ?? null;
    const userId = memberBox ? ((await loadOrgDirectory()).members.get(parseBoxId(memberBox).id)?.userId ?? null) : null;
    if (memberBox && !userId) {
      fail("That person could not be found.");
      return;
    }
    const res = await dispatch(updateOrgPosition(positionId, { filledByUserId: userId }));
    if (!res.ok) {
      fail(res.error);
      return;
    }
    announceReversible({
      verb: "change",
      noun: "position",
      subject: positionById.get(positionId)?.name ?? null,
      undo: async () => {
        const back = await dispatch(updateOrgPosition(positionId, { filledByUserId: before }));
        if (!back.ok) throw new Error(back.error ?? "Could not put it back.");
      },
    });
  };

  const deletePosition = async (p: OrgPosition) => {
    const res = await dispatch(removeOrgPosition(p));
    if (!res.ok) {
      fail(res.error);
      return;
    }
    announceReversible({
      verb: "archive",
      noun: "position",
      subject: p.name,
      undo: async () => {
        const back = await dispatch(restoreOrgPosition(p));
        if (!back.ok) throw new Error(back.error ?? "Could not restore it.");
      },
    });
  };

  /**
   * Take boxes off the chart: every recorded link they hold (above, below,
   * hand-offs, dotted lines) goes, with Undo. Orchestra membership is the
   * Orchestra's, so it stays — the confirm says so.
   */
  const removeFromChart = async (boxIds: string[]) => {
    const ids = new Set(boxIds);
    const links = manualEdges.filter((e) => !e.edgeId.startsWith("pending:") && (ids.has(e.managerId) || ids.has(e.reportId)));
    const inOrchestra = boxIds.some((b) =>
      [...orchestras.values()].some((o) => o.members.some((m) => boxId("agent", m.agentId) === b)),
    );
    const what = boxIds.length === 1 ? nameOf(boxIds[0]) : `these ${boxIds.length}`;
    if (links.length === 0 && !inOrchestra) {
      toast.info(`${what} has no recorded links to remove.`);
      return;
    }
    const ok = await confirm({
      title: `Remove ${what} from the chart?`,
      description: [
        links.length ? `${links.length} recorded ${links.length === 1 ? "link goes" : "links go"}.` : null,
        inOrchestra ? "Orchestra membership stays; take it out of its Orchestra separately." : null,
      ]
        .filter(Boolean)
        .join(" "),
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    const removed: typeof links = [];
    for (const e of links) {
      const res = await dispatch(removeManualManager(e.managerId, e.reportId));
      if (res.ok) removed.push(e);
      else fail(res.error);
    }
    if (!removed.length) return;
    announceReversible({
      verb: "remove",
      noun: boxIds.length === 1 ? nounOf(boxIds[0]) : "boxes",
      subject: `${what} from the chart`,
      undo: async () => {
        for (const e of removed) {
          const back = ORG_LINK_KIND_META[e.kind].tree
            ? await dispatch(setManualManager(e.managerId, e.reportId))
            : await dispatch(addCrossLink(e.managerId, e.reportId, e.kind as CrossKind));
          if (!back.ok) throw new Error(back.error ?? "Could not put it back.");
        }
      },
    });
  };

  /** Archive the record itself (agent, team or position): it leaves the chart and every list, restorable. */
  const archiveBox = async (b: string) => {
    const { type, id } = parseBoxId(b);
    const name = nameOf(b);
    const ok = await confirm({
      title: `Archive ${name}?`,
      description:
        type === "agent"
          ? "It leaves the chart and your agent lists. Its runs and history are kept."
          : type === "team"
            ? "The team is archived for everyone in the organization and leaves the chart."
            : "The position leaves the chart. Its links are kept for a restore.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    if (type === "position") {
      const p = positionById.get(id);
      if (p) await deletePosition(p);
      return;
    }
    try {
      if (type === "agent") await dispatch(saveAgentField({ agentId: id, field: "isArchived", value: true as never })).unwrap();
      else if (type === "team") {
        await archiveTeam(id);
        void loadOrgDirectory(true);
      } else return;
    } catch (e) {
      fail(e instanceof Error ? e.message : "It could not be archived.");
      return;
    }
    announceReversible({
      verb: "archive",
      noun: nounOf(b),
      subject: name,
      undo: async () => {
        if (type === "agent") await dispatch(saveAgentField({ agentId: id, field: "isArchived", value: false as never })).unwrap();
        else {
          await restoreTeam(id);
          void loadOrgDirectory(true);
        }
      },
    });
  };

  // ── what a drop means ─────────────────────────────────────────────────────
  /** Every sensible outcome of dropping `dragged` onto `target`, best first. */
  const dropActions = (dragged: Node, target: Node): ChartAction[] => {
    const d = dragged.data;
    const t = target.data;
    const actions: ChartAction[] = [];
    const draggedAgent = agentOf(dragged);
    const fromOrchestra = d.edgeKind === "directs" && d.parentId ? parseBoxId(d.parentId).id : null;
    if (t.isConductor && draggedAgent) {
      actions.push({
        label: fromOrchestra ? `Move into the ${nameOf(t.boxId)} Orchestra` : `Add to the ${nameOf(t.boxId)} Orchestra`,
        hint: `${nameOf(t.boxId)} will direct it when it runs.`,
        run: async () => {
          await joinOrchestra(t.entityId, draggedAgent);
          if (fromOrchestra && fromOrchestra !== t.entityId) await leaveOrchestra(fromOrchestra, draggedAgent);
        },
      });
    }
    actions.push({
      label: `Place under ${nameOf(t.boxId)}`,
      hint: fromOrchestra ? `Recorded only — stays in the ${agents[fromOrchestra]?.name ?? ""} Orchestra` : "Recorded only.",
      run: () => void placeUnder(t.boxId, d.boxId),
    });
    if (fromOrchestra && draggedAgent) {
      actions.push({
        label: `Place under ${nameOf(t.boxId)} and leave the Orchestra`,
        run: async () => {
          if (await placeUnder(t.boxId, d.boxId)) await leaveOrchestra(fromOrchestra, draggedAgent);
        },
      });
    }
    actions.push({
      label: `${nameOf(d.boxId)} hands off to ${nameOf(t.boxId)}`,
      hint: "Draws an arrow; nothing moves.",
      run: () => void linkAcross(d.boxId, t.boxId, "hands_off_to"),
    });
    return actions;
  };

  const onDrop = (dragKeys: string[], targetKey: string | null, point: { x: number; y: number }) => {
    const dragged = dragKeys.map((k) => byKey.get(k)).filter((n): n is Node => Boolean(n));
    if (dragged.length === 0) return;
    if (!targetKey) {
      // Dropped on empty canvas: take recorded boxes out from under their manager (to the top).
      const manual = dragged.filter((n) => n.data.edgeKind === "reports_to" && n.data.parentId);
      manual.forEach((n) => void unplace(n.data.parentId as string, n.data.boxId));
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
      dragged.forEach((n) => void placeUnder(target.data.boxId, n.data.boxId));
      return;
    }
    if (dragged.length === 1) {
      setDropMenu({
        ...point,
        title: `Drop ${nameOf(dragged[0].data.boxId)} on ${nameOf(target.data.boxId)}`,
        actions: dropActions(dragged[0], target),
      });
    } else {
      const agentsDragged = dragged.map(agentOf).filter((a): a is string => Boolean(a));
      setDropMenu({
        ...point,
        title: `Drop ${dragged.length} on ${nameOf(target.data.boxId)}`,
        actions: [
          ...(target.data.isConductor && agentsDragged.length
            ? [
                {
                  label: `Add the agents to the ${nameOf(target.data.boxId)} Orchestra`,
                  run: () => agentsDragged.forEach((a) => void joinOrchestra(target.data.entityId, a)),
                },
              ]
            : []),
          {
            label: `Place all under ${nameOf(target.data.boxId)}`,
            hint: "Recorded only.",
            run: () => dragged.forEach((n) => void placeUnder(target.data.boxId, n.data.boxId)),
          },
        ],
      });
    }
  };

  const canDrop = (dragKeys: string[], targetKey: string) => {
    const target = byKey.get(targetKey);
    if (!target) return false;
    return dragKeys.every((k) => {
      const n = byKey.get(k);
      if (!n || n.data.boxId === target.data.boxId) return false;
      // Never under its own team: a key path is ancestry ("a/b/c").
      return !targetKey.startsWith(`${k}/`);
    });
  };

  const selectedBoxIds = () =>
    [...new Set(selection.map((k) => byKey.get(k)?.data.boxId).filter((x): x is string => Boolean(x)))];

  const onDelete = (keys: string[]) => {
    for (const k of keys) {
      const n = byKey.get(k);
      if (!n?.data.parentId) continue;
      const agent = agentOf(n);
      if (n.data.edgeKind === "directs" && agent) void leaveOrchestra(parseBoxId(n.data.parentId).id, agent);
      else void unplace(n.data.parentId, n.data.boxId);
    }
  };

  const copyLink = async (b: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("focus", b);
    await copyText(url.toString(), "Link to this box copied.", "Couldn't copy — your browser blocked the clipboard.");
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
    const outgoing = manualEdges.filter((e) => e.managerId === d.boxId && !ORG_LINK_KIND_META[e.kind].tree);
    const href = boxHref(d);
    const position = d.boxType === "position" ? positionById.get(d.entityId) : undefined;
    return (
      <>
        {many ? (
          <>
            <Label className="text-xs text-muted-foreground">{selection.length} selected</Label>
            <Item
              onSelect={() =>
                setPick({
                  kind: "manager-for",
                  reportIds: selection.map((k) => byKey.get(k)?.data.boxId).filter((x): x is string => Boolean(x)),
                })
              }
            >
              <ArrowUpToLine className="mr-2 h-4 w-4" />
              Place all under…
            </Item>
            {selection.every((k) => byKey.get(k)?.data.boxType === "agent") && (
              <Item onSelect={() => makeOrchestraOf(selection.map((k) => byKey.get(k)).filter((x): x is Node => Boolean(x)))}>
                <Network className="mr-2 h-4 w-4" />
                Make an Orchestra of these…
              </Item>
            )}
            <Item onSelect={() => onDelete(selection)}>
              <Unlink className="mr-2 h-4 w-4" />
              Remove these placements
            </Item>
            <Sep />
          </>
        ) : null}
        {href && (
          <Item onSelect={() => router.push(href)}>
            <Network className="mr-2 h-4 w-4" />
            {d.isConductor ? "Open Orchestra" : `Open ${ORG_BOX_LABEL[d.boxType].toLowerCase()}`}
          </Item>
        )}
        <Item onSelect={() => setBranchRoot(d.boxId)}>
          <Focus className="mr-2 h-4 w-4" />
          Show only this branch
        </Item>
        <Item onSelect={() => void copyLink(d.boxId)}>
          <LinkIcon className="mr-2 h-4 w-4" />
          Copy link to this box
        </Item>
        {d.boxType === "membership" && (
          <Item
            onSelect={() =>
              setMaking({
                memberIds: [],
                underBoxId: d.boxId,
                leaving: [],
                suggestedName: `${nameOf(d.boxId)}'s lead agent`,
                underName: nameOf(d.boxId),
              })
            }
          >
            <Network className="mr-2 h-4 w-4" />
            Add a leader agent…
          </Item>
        )}
        {position && (
          <>
            <Sep />
            <Label className="text-xs text-muted-foreground">Position</Label>
            {position.mandateId ? (
              <Item onSelect={() => openSeatJob(position)}>
                <INTELLIGENCE_ICON className="mr-2 h-4 w-4" />
                {seatJobs[position.mandateId]?.holderAgentId ? "Open its job" : "Build its agent…"}
              </Item>
            ) : (
              <Item onSelect={() => setDefining(position)}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Define the job…
              </Item>
            )}
            <Item
              onSelect={() =>
                setMaking({
                  memberIds: [],
                  underBoxId: d.boxId,
                  leaving: [],
                  suggestedName: `${position.name} lead`,
                  underName: position.name,
                })
              }
            >
              <Network className="mr-2 h-4 w-4" />
              Add a leader agent…
            </Item>
            <Item onSelect={() => setRenaming(position)}>
              <PencilLine className="mr-2 h-4 w-4" />
              Rename…
            </Item>
            <Item onSelect={() => setPick({ kind: "fill", positionId: position.id })}>
              <UserRoundPlus className="mr-2 h-4 w-4" />
              {position.filledByUserId ? "Change who fills it…" : "Fill with a person…"}
            </Item>
            {position.filledByUserId && (
              <Item onSelect={() => void fillPosition(position.id, null)}>
                <X className="mr-2 h-4 w-4" />
                Mark as open
              </Item>
            )}

          </>
        )}
        <Sep />
        <Label className="text-xs text-muted-foreground">Arrange</Label>
        <Item onSelect={() => setPick({ kind: "manager-for", reportIds: [d.boxId] })}>
          <ArrowUpToLine className="mr-2 h-4 w-4" />
          Place under…
        </Item>
        <Item onSelect={() => setPick({ kind: "report-of", managerId: d.boxId })}>
          <ArrowDownToLine className="mr-2 h-4 w-4" />
          Put something under this one…
        </Item>
        <Item onSelect={() => setPick({ kind: "cross-link", fromId: d.boxId, link: "hands_off_to" })}>
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Hands off to…
        </Item>
        <Item onSelect={() => setPick({ kind: "cross-link", fromId: d.boxId, link: "dotted_line" })}>
          <Share2 className="mr-2 h-4 w-4" />
          Dotted line to…
        </Item>
        {d.parentId && d.edgeKind === "reports_to" && (
          <Item onSelect={() => void unplace(d.parentId as string, d.boxId)}>
            <Unlink className="mr-2 h-4 w-4" />
            Remove from under {nameOf(d.parentId)}
          </Item>
        )}
        {d.parentId && d.edgeKind === "directs" && agentOf(n) && (
          <Item onSelect={() => void leaveOrchestra(parseBoxId(d.parentId as string).id, d.entityId)}>
            <Unlink className="mr-2 h-4 w-4" />
            Take out of the {nameOf(d.parentId)} Orchestra…
          </Item>
        )}
        <Sep />
        <Label className="text-xs text-muted-foreground">Remove</Label>
        <Item onSelect={() => void removeFromChart(many ? selectedBoxIds() : [d.boxId])}>
          <Eraser className="mr-2 h-4 w-4" />
          {many ? `Remove ${selection.length} from the chart…` : "Remove from the chart…"}
        </Item>
        {!many && d.boxType !== "membership" && (
          <Item onSelect={() => void archiveBox(d.boxId)}>
            <Archive className="mr-2 h-4 w-4" />
            Archive {ORG_BOX_LABEL[d.boxType].toLowerCase()}…
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
  const onPicked = async (picked: string) => {
    const mode = pick;
    setPick(null);
    if (!mode) return;
    if (mode.kind === "manager-for") for (const r of mode.reportIds) await placeUnder(picked, r);
    else if (mode.kind === "report-of") await placeUnder(mode.managerId, picked);
    else if (mode.kind === "cross-link") await linkAcross(mode.fromId, picked, mode.link);
    else if (mode.kind === "fill") await fillPosition(mode.positionId, picked);
    else if (parseBoxId(picked).type === "position" && !manualEdges.some((e) => e.reportId === picked)) {
      // A new or unplaced position is already on the chart on its own; placing it is optional.
      setSelection([firstKeyOf.get(picked) ?? picked]);
      setPick({ kind: "manager-for", reportIds: [picked] });
    } else setPick({ kind: "manager-for", reportIds: [picked], adding: true }); // step 2 of "Add to chart"
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
      <Button variant="outline" icon={<Plus />} onClick={() => setPick({ kind: "new-root" })}>
        Add to chart
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" icon={<Stethoscope />}>
            {seriousCount ? `Health · ${seriousCount}` : "Health"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {health.length === 0 ? (
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Nothing needs attention</DropdownMenuLabel>
          ) : (
            health.map((h) => (
              <DropdownMenuItem
                key={h.id}
                className="flex items-start gap-2"
                onSelect={() => setHealthView(h.id)}
              >
                <span
                  className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    h.serious ? "bg-warning" : "bg-muted-foreground/50",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block type-body">{h.label}</span>
                  <span className="block truncate type-secondary text-muted-foreground">{h.hint}</span>
                </span>
                <span className="type-secondary tabular-nums text-muted-foreground">{h.keys.length}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant={showPoints ? "primary" : "outline"}
        icon={<Coins />}
        aria-pressed={showPoints}
        title={
          showPoints && points.days ? `Points spent in the last ${points.days} days, per box and per branch` : "Show points per box and branch"
        }
        onClick={() => setShowPoints((v) => !v)}
      >
        Points
      </Button>
      {branchRoot && (
        <div className="flex h-9 items-center gap-1 rounded-lg border border-border bg-card/95 pl-2.5 pr-1 type-secondary shadow-sm">
          <Focus className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="max-w-40 truncate">{nameOf(branchRoot)}&apos;s branch</span>
          <Button variant="quiet" onClick={() => setBranchRoot(null)}>
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
        ? `Put something under ${nameOf(pick.managerId)}`
        : pick?.kind === "cross-link"
          ? `${nameOf(pick.fromId)} ${ORG_LINK_KIND_META[pick.link].verb}…`
          : pick?.kind === "fill"
            ? `Who fills ${nameOf(boxId("position", pick.positionId))}?`
            : "Add to the chart";
  const pickerBody =
    pick?.kind === "cross-link"
      ? ORG_LINK_KIND_META[pick.link].description
      : pick?.kind === "new-root"
        ? "Pick what to add, then who it sits under."
        : pick?.kind === "fill"
          ? "The person who holds this seat."
          : "Recorded structure. To have an agent direct others, make it an Orchestra.";
  const pickerTypes: readonly OrgBoxType[] =
    pick?.kind === "fill" ? ["membership"] : ["agent", "membership", "team", "position"];
  const pickerExclude =
    pick?.kind === "manager-for"
      ? pick.reportIds
      : pick?.kind === "report-of"
        ? [pick.managerId]
        : pick?.kind === "cross-link"
          ? [pick.fromId]
          : [];

  return (
    <OrgChartActivityProvider value={activity.byAgentId}>
    <OrgChartPointsProvider value={pointTotals}>
    <div className="relative h-full w-full">
      {!error && points.error && (
        <div className="absolute inset-x-3 top-14 z-30 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 type-secondary text-destructive-ink">
          Points could not load: {points.error}
        </div>
      )}
      {!error && !directoryError && activity.error && (
        <div className="absolute inset-x-3 top-14 z-30 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 type-secondary text-destructive-ink">
          Live activity is unavailable: {activity.error}
        </div>
      )}
      {error && (
        <div className="absolute inset-x-3 top-14 z-30 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 type-secondary text-destructive-ink">
          Part of the chart could not load: {error}
          <ErrorAlchemyMenu error={error} operation="Load the org chart" />
        </div>
      )}
      {!error && directoryError && (
        <div className="absolute inset-x-3 top-14 z-30 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 type-secondary text-destructive-ink">
          <span className="min-w-0 flex-1 truncate" title={directoryError}>
            {directoryError}
          </span>
          <Button
            variant="outline"
            onClick={() => {
              setDirectoryError(null);
              void loadOrgDirectory(true).then(() => setDirectoryTry((n) => n + 1));
            }}
          >
            Retry
          </Button>
        </div>
      )}
      <OrgChart
        roots={forest}
        edgeKinds={ORG_LINK_KIND_META}
        crossLinks={crossLinks}
        selection={selection}
        highlight={
          shownIssue ? { keys: shownIssue.keys, label: shownIssue.label, onClear: () => setHealthView(null) } : null
        }
        onSelectionChange={setSelection}
        focusKey={focusKey}
        persistKey={`agents:${(effectiveRoots ?? ["all"]).join(",")}`}
        getSearchText={(d) => `${nameOf(d.boxId)} ${d.roleTitle ?? ""}`}
        dragLabel={(d) => nameOf(d.boxId)}
        onDrop={onDrop}
        canDrop={canDrop}
        onAddBelow={(key) => {
          const n = byKey.get(key);
          if (n) setPick({ kind: "report-of", managerId: n.data.boxId });
        }}
        onOpen={(key) => {
          const n = byKey.get(key);
          const href = n ? boxHref(n.data) : null;
          if (href) router.push(href);
        }}
        onDelete={onDelete}
        ariaLabel="Org chart"
        exportTitle={branchRoot ? `${nameOf(branchRoot)} — org chart` : "Org chart"}
        toolbar={toolbar}
        emptyState={
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-textured p-6 text-center">
            <Network className="h-8 w-8 text-muted-foreground" />
            <div className="type-title text-foreground">{emptyTitle}</div>
            <p className="max-w-sm type-body text-muted-foreground">{emptyBody}</p>
            <div className="flex gap-2">
              <Button variant="primary" icon={<Plus />} onClick={() => setPick({ kind: "new-root" })}>
                Add to chart
              </Button>
              <Button variant="outline" asChild>
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
                  spreadWarnAt={spreadWarnAt}
                  memberCount={
                    n.node.data.boxType === "agent" ? orchestras.get(n.node.data.entityId)?.members.length : undefined
                  }
                  menu={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="quiet"
                          icon={<MoreHorizontal />}
                          aria-label="More actions"
                          title="More actions"
                          onClick={(e) => e.stopPropagation()}
                        />
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
              {a.hint && <span className="type-secondary text-muted-foreground">{a.hint}</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={pick !== null}
        onOpenChange={(open) => {
          if (open) return;
          // A person or team shows on the chart only once it sits somewhere:
          // closing step 2 leaves it off, and says so.
          const t = pick?.kind === "manager-for" && pick.adding ? parseBoxId(pick.reportIds[0]).type : null;
          if (pick?.kind === "manager-for" && (t === "membership" || t === "team")) {
            toast.info(`${nameOf(pick.reportIds[0])} wasn't added — it needs a place.`);
          }
          setPick(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{pickerTitle}</DialogTitle>
            <DialogDescription>{pickerBody}</DialogDescription>
          </DialogHeader>
          {pick && (
            <OrgBoxPicker
              key={JSON.stringify(pick)}
              onPick={(b) => void onPicked(b)}
              exclude={pickerExclude}
              types={pickerTypes}
              initialType={pick.kind === "fill" ? "membership" : "agent"}
              organizationId={pick.kind === "fill" ? positionById.get(pick.positionId)?.organizationId : undefined}
            />
          )}
        </DialogContent>
      </Dialog>

      <MakeOrchestraDialog
        request={making}
        onClose={() => setMaking(null)}
        onMade={(conductorId, warnings) => {
          setMaking(null);
          if (!warnings.length) toast.success("Orchestra made.");
          setSelection([]);
          const params = new URLSearchParams(searchParams.toString());
          params.set("focus", boxId("agent", conductorId));
          router.replace(`${pathname}?${params.toString()}`);
        }}
      />

      <DefineSeatJobDialog
        position={defining}
        context={defining ? seatContextOf(defining.id) : undefined}
        onClose={() => setDefining(null)}
        onDefined={(job) => {
          const p = defining;
          setDefining(null);
          toast.success(`${p?.name ?? "The position"} now has a job. Next, build its agent.`);
          openMandateWindow({ initialMandateKey: job.mandateKey, mandateKeys: [job.mandateKey] });
        }}
      />

      <TextInputDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        title="Rename position"
        defaultValue={renaming?.name ?? ""}
        confirmLabel="Rename"
        onConfirm={async (value) => {
          const p = renaming;
          setRenaming(null);
          if (!p || value.trim() === p.name) return;
          const res = await dispatch(updateOrgPosition(p.id, { name: value }));
          if (!res.ok) fail(res.error);
        }}
      />
    </div>
    </OrgChartPointsProvider>
    </OrgChartActivityProvider>
  );
}
