"use client";

import React, { useEffect, useRef } from "react";
import type {
  GroupImperativeHandle,
  PanelImperativeHandle,
} from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ActivityBar } from "../activity-bar/ActivityBar";
import { EditorArea } from "../editor/EditorArea";
import { BottomPanel } from "../terminal/BottomPanel";
import { SidePanelRouter } from "../views/SidePanelRouter";
import { StatusBar } from "./StatusBar";
import {
  selectActiveView,
  selectFarRightOpen,
  selectRightOpen,
  selectSideOpen,
  setFarRightOpen,
  setRightOpen,
  setSideOpen,
} from "../redux/codeWorkspaceSlice";
import {
  selectTerminalOpen,
  setOpen as setTerminalOpen,
} from "../redux/terminalSlice";
import { PANE_BORDER, SIDE_PANEL_BG, WORKSPACE_BG } from "../styles/tokens";

export interface WorkspaceLayoutProps {
  rightSlot?: React.ReactNode;
  farRightSlot?: React.ReactNode;
  showStatusBar?: boolean;
  className?: string;
  /** Override for the default side-panel width (percent of body width).
   *  Use to de-emphasise the file tree on focused-edit surfaces (e.g. the
   *  agent-app editor wants ~12% instead of the full /code 18%). */
  defaultSideSize?: number;
}

/** Preferred percentages each horizontal panel snaps to whenever it
 *  re-opens after the user has not manually resized it. */
const DEFAULT_SIDE = 18;
const DESIRED_RIGHT = 20;
const DESIRED_FAR_RIGHT = 16;

/** Center vertical-group split between editor and the small bottom terminal. */
const DESIRED_TERMINAL = 15;
const DESIRED_EDITOR = 100 - DESIRED_TERMINAL;

const PANEL_IDS = {
  SIDE: "side",
  CENTER: "center",
  RIGHT: "right",
  FAR_RIGHT: "farRight",
} as const;

/**
 * Top-level VSCode-style layout.
 *
 * ┌──┬──────────┬────────────────────────────┬──────────┬──────────┐
 * │AB│ SidePnl  │            Editor           │  Right   │ FarRight │
 * │  │          ├────────────────────────────┤   slot   │   slot   │
 * │  │          │          Bottom             │          │          │
 * └──┴──────────┴────────────────────────────┴──────────┴──────────┘
 *                                StatusBar
 *
 * No-shift contract:
 *   - Every panel's `defaultSize` is computed from current Redux state at
 *     render time, so the visible panels' defaults always sum to exactly
 *     100% — no SSR scaling, no first-paint snap.
 *   - The body-group `useEffect` and the terminal `useEffect` skip their
 *     first run via `isMountedRef`. Server-rendered layout stays put on
 *     mount; the effects only fire on subsequent Redux state changes.
 *   - Toggle behaviour goes through a single `groupRef.setLayout()` call —
 *     never `panel.collapse()` for adjacent collapsibles (right + farRight
 *     are adjacent and the lib's pivot would push freed space into the
 *     other neighbour, re-expanding it).
 *   - All sizes are PERCENTAGE STRINGS (`"18%"`) — bare numbers in v4 are
 *     pixels, which would mount the sidebar at 18px and the terminal at
 *     30px and produce hydration mismatches.
 */
export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  rightSlot,
  farRightSlot,
  showStatusBar = true,
  className,
  defaultSideSize = DEFAULT_SIDE,
}) => {
  const dispatch = useAppDispatch();
  const activeView = useAppSelector(selectActiveView);
  const sideOpen = useAppSelector(selectSideOpen);
  const rightOpen = useAppSelector(selectRightOpen);
  const farRightOpen = useAppSelector(selectFarRightOpen);
  const terminalOpen = useAppSelector(selectTerminalOpen);

  const bodyGroupRef = useRef<GroupImperativeHandle | null>(null);
  const bottomRef = useRef<PanelImperativeHandle>(null);

  const rightAvailable = Boolean(rightSlot);
  const farRightAvailable = Boolean(farRightSlot);

  // ── DYNAMIC DEFAULTS ─────────────────────────────────────────────────
  // Each panel's defaultSize is derived from Redux state so the visible
  // panels always sum to 100% on mount. This is what prevents the lib
  // from scaling defaults proportionally and producing a first-paint snap.
  const sideDefault = sideOpen ? defaultSideSize : 0;
  const rightDefault = rightAvailable && rightOpen ? DESIRED_RIGHT : 0;
  const farRightDefault =
    farRightAvailable && farRightOpen ? DESIRED_FAR_RIGHT : 0;
  const centerDefault = Math.max(
    100 - sideDefault - rightDefault - farRightDefault,
    0,
  );
  const editorDefault = terminalOpen ? DESIRED_EDITOR : 100;
  const terminalDefault = terminalOpen ? DESIRED_TERMINAL : 0;

  /** Only one panel can be the rightmost (avatar-colliding) column. Priority,
   *  from right to left: farRight > right > editor. */
  const farRightIsRightmost = farRightAvailable && farRightOpen;
  const rightIsRightmost = !farRightIsRightmost && rightAvailable && rightOpen;
  const editorIsRightmost = !farRightIsRightmost && !rightIsRightmost;

  const decoratedRightSlot = React.isValidElement(rightSlot)
    ? React.cloneElement(
        rightSlot as React.ReactElement<{ rightmost?: boolean }>,
        { rightmost: rightIsRightmost },
      )
    : rightSlot;
  const decoratedFarRightSlot = React.isValidElement(farRightSlot)
    ? React.cloneElement(
        farRightSlot as React.ReactElement<{ rightmost?: boolean }>,
        { rightmost: farRightIsRightmost },
      )
    : farRightSlot;

  // ── BODY GROUP TOGGLE EFFECT ─────────────────────────────────────────
  // On first mount this is a no-op (server already rendered the correct
  // layout via dynamic defaults). On subsequent Redux changes, compute the
  // new full layout in one shot and apply via setLayout — bypassing the
  // pivot trap that would otherwise re-expand a collapsed neighbour.
  const isBodyMounted = useRef(false);
  useEffect(() => {
    if (!isBodyMounted.current) {
      isBodyMounted.current = true;
      return;
    }
    const group = bodyGroupRef.current;
    if (!group) return;

    const current = group.getLayout();
    const preserve = (val: number | undefined, target: number) =>
      typeof val === "number" && val >= target / 2 ? val : target;

    const sideSize = sideOpen
      ? preserve(current[PANEL_IDS.SIDE], defaultSideSize)
      : 0;
    const rightSize =
      rightAvailable && rightOpen
        ? preserve(current[PANEL_IDS.RIGHT], DESIRED_RIGHT)
        : 0;
    const farRightSize =
      farRightAvailable && farRightOpen
        ? preserve(current[PANEL_IDS.FAR_RIGHT], DESIRED_FAR_RIGHT)
        : 0;

    const centerSize = Math.max(100 - sideSize - rightSize - farRightSize, 25);
    const total = sideSize + centerSize + rightSize + farRightSize;
    const scale = 100 / total;

    const layout: Record<string, number> = {
      [PANEL_IDS.SIDE]: sideSize * scale,
      [PANEL_IDS.CENTER]: centerSize * scale,
    };
    if (rightAvailable) layout[PANEL_IDS.RIGHT] = rightSize * scale;
    if (farRightAvailable) layout[PANEL_IDS.FAR_RIGHT] = farRightSize * scale;

    group.setLayout(layout);
  }, [
    sideOpen,
    activeView,
    rightOpen,
    farRightOpen,
    rightAvailable,
    farRightAvailable,
    defaultSideSize,
  ]);

  // ── TERMINAL TOGGLE EFFECT ───────────────────────────────────────────
  // Same skip-on-mount pattern. Terminal is the only collapsible in its
  // inner vertical group (editor isn't collapsible) so the pivot trap
  // doesn't apply here — panel.collapse()/expand() is safe and gives us
  // the lib's free prior-size memory.
  const isTerminalMounted = useRef(false);
  useEffect(() => {
    if (!isTerminalMounted.current) {
      isTerminalMounted.current = true;
      return;
    }
    const ref = bottomRef.current;
    if (!ref) return;
    if (terminalOpen && ref.isCollapsed()) ref.expand();
    else if (!terminalOpen && !ref.isCollapsed()) ref.collapse();
  }, [terminalOpen]);

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden",
        WORKSPACE_BG,
        className,
      )}
    >
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <ResizablePanelGroup
          orientation="horizontal"
          groupRef={bodyGroupRef}
          className="h-full min-h-0 flex-1"
        >
          {/* ── Side panel (Explorer/Search/Git/etc.) ─────────────────── */}
          <ResizablePanel
            id={PANEL_IDS.SIDE}
            defaultSize={`${sideDefault}%`}
            minSize="6%"
            collapsible
            collapsedSize="0%"
            onResize={(size) => {
              const open = size.asPercentage > 0;
              if (open !== sideOpen) dispatch(setSideOpen(open));
            }}
            className={cn("min-w-0 border-r", PANE_BORDER, SIDE_PANEL_BG)}
          >
            <SidePanelRouter />
          </ResizablePanel>
          <ResizableHandle />

          {/* ── Center split (Editor over Bottom panel) ───────────────── */}
          <ResizablePanel
            id={PANEL_IDS.CENTER}
            defaultSize={`${centerDefault}%`}
            minSize="25%"
          >
            <ResizablePanelGroup
              orientation="vertical"
              className="h-full min-h-0"
            >
              <ResizablePanel
                id="editor"
                defaultSize={`${editorDefault}%`}
                minSize="20%"
              >
                <EditorArea
                  rightSlotAvailable={rightAvailable}
                  rightmost={editorIsRightmost}
                />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel
                panelRef={bottomRef}
                id="bottom"
                defaultSize={`${terminalDefault}%`}
                minSize="10%"
                collapsible
                collapsedSize="0%"
                onResize={(size) => {
                  const open = size.asPercentage > 0;
                  if (open !== terminalOpen) dispatch(setTerminalOpen(open));
                }}
              >
                <BottomPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          {/* ── Optional right slot (chat) ────────────────────────────── */}
          {rightAvailable && (
            <>
              <ResizableHandle />
              <ResizablePanel
                id={PANEL_IDS.RIGHT}
                defaultSize={`${rightDefault}%`}
                minSize="12%"
                collapsible
                collapsedSize="0%"
                onResize={(size) => {
                  const open = size.asPercentage > 0;
                  if (open !== rightOpen) dispatch(setRightOpen(open));
                }}
                className={cn("min-w-0 border-l", PANE_BORDER)}
              >
                <div className="h-full overflow-hidden">
                  {decoratedRightSlot}
                </div>
              </ResizablePanel>
            </>
          )}

          {/* ── Optional far-right slot (chat history) ────────────────── */}
          {farRightAvailable && (
            <>
              <ResizableHandle />
              <ResizablePanel
                id={PANEL_IDS.FAR_RIGHT}
                defaultSize={`${farRightDefault}%`}
                minSize="10%"
                collapsible
                collapsedSize="0%"
                onResize={(size) => {
                  const open = size.asPercentage > 0;
                  if (open !== farRightOpen) dispatch(setFarRightOpen(open));
                }}
                className={cn("min-w-0 border-l", PANE_BORDER)}
              >
                <div className="h-full overflow-hidden">
                  {decoratedFarRightSlot}
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      {showStatusBar && (
        <StatusBar
          rightSlotAvailable={rightAvailable}
          farRightSlotAvailable={farRightAvailable}
        />
      )}
    </div>
  );
};
