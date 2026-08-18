"use client";

// features/vision-interview/components/ExpertFeedPanel.tsx
//
// The room's RIGHT panel (v3): the live aggregate feed of everyone in the
// room. One collapsible section per expert — the human's own section pinned
// at the very top — each accumulating that speaker's contributions in order.
// The panel is never static: while an expert's workflow node speaks, its
// tokens land in its section as they are produced.
//
// STREAM SOURCE — the mechanism this feature already owns, consumed, never
// rebuilt: the run's SSE events feed is followed by `followWorkflowRunStream`
// into `activeRequests.nodeStreams`; this panel reads them with
// `selectWorkflowNodeStreams(requestId)` (factory-cached selector) and maps
// node → role with `roleFromNodeId`. Token text renders through
// <LiveTurnCard> → BasicMarkdownContent; persisted turns render through
// <TurnCard> → RichDocument. Nothing here buckets a chunk, opens a parse
// session, or routes an envelope.
//
// THE DUPLICATE-STREAM RULE (Arman, 2026-08-18, explicit): the role whose tab
// is ACTIVE in the center panel is already streaming there, so this panel
// suppresses its LIVE TOKENS and shows an honest quiet line in their place.
// Switching tabs flips it instantly: the role just left starts streaming
// here, the role just entered stops. A FINISHED turn always lands here,
// whichever tab is active — only the live token layer is ever suppressed.
// `shouldStreamHere` below is that decision, exported and unit-pinned.

import { useEffect, useRef, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Accordion } from "@/components/ui/accordion";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkflowNodeStreams } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { WorkflowNodeStreamEntry } from "@/features/agents/types/request.types";
import {
  selectActiveRoleTab,
  selectRoomHydrated,
  selectRoomRequestId,
  selectRoomSession,
  selectTurnsOrdered,
} from "../redux/vision-interview.slice";
import {
  observerRoles,
  ROLE_ORDER,
  roleFromNodeId,
  type InterviewTurnRow,
  type RoleKey,
} from "../types";
import { ExpertFeedSection } from "./ExpertFeedSection";

/** Accordion value of the human's pinned section. */
const YOU = "you";

// Stable empty result while no run has been adopted — a fresh [] per call
// would re-render the panel on every store change.
const EMPTY_NODE_STREAMS: WorkflowNodeStreamEntry[] = [];
const NO_NODE_STREAMS = () => EMPTY_NODE_STREAMS;

/**
 * THE DUPLICATE-STREAM DECISION, in one pure function so it can be proved.
 *
 * A role's live tokens stream in THIS panel unless that role's tab is the one
 * currently active in the center panel (where the same tokens are already
 * streaming). Nothing else suppresses them — in particular, a role with no
 * active run simply has no stream to suppress, and persisted turns are not
 * governed by this at all.
 */
export function shouldStreamHere(
  role: RoleKey,
  activeRoleTab: RoleKey | null,
): boolean {
  return role !== activeRoleTab;
}

interface FeedSection {
  key: string;
  role: RoleKey | null;
  turns: InterviewTurnRow[];
  live: WorkflowNodeStreamEntry | null;
  liveSuppressed: boolean;
  observing: boolean;
}

export function ExpertFeedPanel() {
  const turns = useAppSelector(selectTurnsOrdered);
  const hydrated = useAppSelector(selectRoomHydrated);
  const session = useAppSelector(selectRoomSession);
  const requestId = useAppSelector(selectRoomRequestId);
  const activeRoleTab = useAppSelector(selectActiveRoleTab);
  const nodeStreams = useAppSelector(
    requestId ? selectWorkflowNodeStreams(requestId) : NO_NODE_STREAMS,
  );

  const currentRound = session?.current_round ?? 0;
  const silentRoles = observerRoles(session);

  // ── Group the transcript by speaker ──────────────────────────────────────
  const humanTurns: InterviewTurnRow[] = [];
  const roleTurns = new Map<RoleKey, InterviewTurnRow[]>();
  for (const turn of turns) {
    if (turn.speaker === "human") {
      humanTurns.push(turn);
      continue;
    }
    const role = turn.speaker as RoleKey;
    const bucket = roleTurns.get(role);
    if (bucket) bucket.push(turn);
    else roleTurns.set(role, [turn]);
  }

  // ── The live layer, per role ─────────────────────────────────────────────
  // Same no-double-render rule the transcript uses: a node's live entry is
  // dropped the moment its persisted turn for this round has landed.
  const liveByRole = new Map<RoleKey, WorkflowNodeStreamEntry>();
  for (const stream of nodeStreams) {
    if (stream.status !== "streaming") continue;
    const role = roleFromNodeId(stream.nodeId);
    if (!role) continue; // router / gate / apply nodes — not speakers
    const persisted = (roleTurns.get(role) ?? []).some(
      (t) => t.round >= currentRound,
    );
    if (persisted) continue;
    liveByRole.set(role, stream);
  }

  const sections: FeedSection[] = [
    // PINNED: the human is always first, and always present — this is where
    // the Expert sees their own words accumulate.
    {
      key: YOU,
      role: null,
      turns: humanTurns,
      live: null,
      liveSuppressed: false,
      observing: false,
    },
  ];
  for (const role of ROLE_ORDER) {
    const roleHistory = roleTurns.get(role) ?? [];
    const live = liveByRole.get(role) ?? null;
    if (roleHistory.length === 0 && !live) continue;
    sections.push({
      key: role,
      role,
      turns: roleHistory,
      live,
      liveSuppressed: !shouldStreamHere(role, activeRoleTab),
      observing: silentRoles.has(role),
    });
  }

  // ── Open/closed state ────────────────────────────────────────────────────
  // Default: you + whoever spoke most recently. As the room moves on, the
  // newly-speaking expert's section opens itself once (never re-opening a
  // section the reader deliberately closed while that speaker was still the
  // latest one).
  const liveRole = ROLE_ORDER.find((r) => liveByRole.has(r)) ?? null;
  const lastRoleTurn = [...turns].reverse().find((t) => t.speaker !== "human");
  const latestRole =
    liveRole ?? ((lastRoleTurn?.speaker ?? null) as RoleKey | null);

  const [open, setOpen] = useState<string[]>([YOU]);
  const autoOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!latestRole || autoOpened.current === latestRole) return;
    autoOpened.current = latestRole;
    setOpen((prev) => (prev.includes(latestRole) ? prev : [...prev, latestRole]));
  }, [latestRole]);

  const allKeys = sections.map((s) => s.key);
  const anyClosed = allKeys.some((k) => !open.includes(k));

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
        <h2 className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Everyone in the room
        </h2>
        {/* shrink-0: on touch the repo's tap-target law grows these
            icon-only controls to 44px — the TITLE gives way, never them. */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setOpen(allKeys)}
            disabled={!anyClosed}
            title="Expand all"
            aria-label="Expand all"
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent",
            )}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen([])}
            disabled={open.length === 0}
            title="Collapse all"
            aria-label="Collapse all"
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent",
            )}
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {hydrated && sections.length === 1 && humanTurns.length === 0 ? (
          <p className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">
            Every expert&apos;s output collects here as the room works — yours
            at the top, theirs below, live as it is written.
          </p>
        ) : (
          <Accordion
            type="multiple"
            value={open}
            onValueChange={setOpen}
            className="w-full"
          >
            {sections.map((section) => (
              <ExpertFeedSection
                key={section.key}
                sectionKey={section.key}
                role={section.role}
                turns={section.turns}
                live={section.live}
                liveSuppressed={section.liveSuppressed}
                observing={section.observing}
                round={currentRound}
              />
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
