"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  AppWindow,
  Eye,
  EyeOff,
  Minimize2,
  Maximize2,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Columns3,
  Rows3,
  Crown,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  toggleWindowsHidden,
  minimizeAll,
  restoreAll,
  restoreWindow,
  focusWindow,
  selectWindowsHidden,
  selectAllWindows,
  selectAllMinimized,
  type WindowState,
  arrangeActiveWindows,
} from "@/lib/redux/slices/windowManagerSlice";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectIsCreator } from "@/lib/redux/selectors/userSelectors";
import { LayoutIconButton } from "@/features/window-panels/components/LayoutIcon";
import {
  MenuDivider,
  MenuItem,
  MenuSection,
} from "@/features/window-panels/tools-grid/menuPrimitives";
import ToolsGrid from "@/features/window-panels/tools-grid/ToolsGrid";
import { getStaticEntryBySlug } from "@/features/window-panels/registry/windowRegistryMetadata";

// ─── State dot colours ────────────────────────────────────────────────────────

const STATE_DOT: Record<WindowState, string> = {
  windowed: "bg-emerald-400",
  minimized: "bg-amber-400",
  maximized: "bg-blue-400",
};

const STATE_LABEL: Record<WindowState, string> = {
  windowed: "Open",
  minimized: "Minimized",
  maximized: "Maximized",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SidebarWindowToggle() {
  const dispatch = useAppDispatch();
  const hidden = useAppSelector(selectWindowsHidden);
  const allMinimized = useAppSelector(selectAllMinimized);
  const windows = useAppSelector(selectAllWindows);
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isCreator = useAppSelector(selectIsCreator);
  const hasWindows = windows.length > 0;

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "visibility" | "layout" | "tools" | "admin" | "creator"
  >("tools");
  const [layoutDirX, setLayoutDirX] = useState<"ltr" | "rtl">("rtl");
  const [layoutDirY, setLayoutDirY] = useState<"ttb" | "btt">("ttb");
  const [layoutPrimary, setLayoutPrimary] = useState<"horizontal" | "vertical">(
    "vertical",
  );
  const [pos, setPos] = useState({ x: 0, bottom: 0, maxHeight: 0 });
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Measure trigger position + available headroom (from the menu's bottom
  // anchor up to 8px below the top of the viewport). This caps the menu so
  // it can't grow past the top of the screen — content scrolls instead.
  const measure = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({
      x: r.right + 8,
      bottom: window.innerHeight - r.bottom,
      maxHeight: Math.max(0, r.bottom - 8),
    });
  }, []);

  // Measure trigger and open/close
  const handleToggle = useCallback(() => {
    measure();
    setOpen((v) => !v);
  }, [measure]);

  // Re-measure on viewport resize while menu is open so the cap stays accurate.
  useEffect(() => {
    if (!open) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, measure]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const act = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
  }, []);

  const closePopover = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* ── Trigger ──────────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={cn(
          "shell-nav-item shell-tactile",
          (open || hidden) && "shell-nav-item-active",
        )}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Manage floating windows"
        title="Windows"
      >
        <span className="shell-nav-icon">
          <AppWindow size={18} strokeWidth={1.75} />
        </span>
        <span className="shell-nav-label flex items-center gap-1">
          Windows
          {hasWindows && (
            <span className="ml-1 text-[10px] font-semibold text-muted-foreground/60">
              {windows.length}
            </span>
          )}
        </span>
      </button>

      {/* ── Menu portal — escapes sidebar overflow/transform ─────────────── */}
      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              "fixed z-[10000] flex flex-col",
              "w-[350px] rounded-xl overflow-hidden",
              "bg-card/97 backdrop-blur-xl border border-blue-300 dark:border-blue-700 shadow-2xl",
              "py-1 text-sm",
            )}
            style={{
              left: pos.x,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
              minHeight: Math.min(380, pos.maxHeight),
            }}
          >
            {/* ── Tabs Header ──────────────────────────────────────────────── */}
            <div className="flex items-center px-2 py-1 mb-1 border-b border-border/50 gap-1 overflow-x-auto">
              <button
                type="button"
                className={cn(
                  "px-2 py-1 text-[11px] font-medium uppercase tracking-wider rounded-md transition-colors",
                  activeTab === "tools"
                    ? "bg-accent/80 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                )}
                onClick={() => setActiveTab("tools")}
              >
                Tools
              </button>
              <button
                type="button"
                className={cn(
                  "px-2 py-1 text-[11px] font-medium uppercase tracking-wider rounded-md transition-colors",
                  activeTab === "visibility"
                    ? "bg-accent/80 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                )}
                onClick={() => setActiveTab("visibility")}
              >
                Visibility
              </button>
              <button
                type="button"
                className={cn(
                  "px-2 py-1 text-[11px] font-medium uppercase tracking-wider rounded-md transition-colors",
                  activeTab === "layout"
                    ? "bg-accent/80 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                )}
                onClick={() => setActiveTab("layout")}
              >
                Layout
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className={cn(
                    "px-2 py-1 text-[11px] font-medium uppercase tracking-wider rounded-md transition-colors flex items-center gap-1",
                    activeTab === "admin"
                      ? "bg-amber-500/15 text-amber-500"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                  )}
                  onClick={() => setActiveTab("admin")}
                >
                  <ShieldAlert className="w-3 h-3" />
                  Admin
                </button>
              )}
              {isCreator && (
                <button
                  type="button"
                  className={cn(
                    "px-2 py-1 text-[11px] font-medium uppercase tracking-wider rounded-md transition-colors flex items-center gap-1",
                    activeTab === "creator"
                      ? "bg-violet-500/15 text-violet-500"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                  )}
                  onClick={() => setActiveTab("creator")}
                >
                  <Crown className="w-3 h-3" />
                  Creator
                </button>
              )}
            </div>

            {/* ── Tab Content: Visibility ──────────────────────────────────── */}
            {activeTab === "visibility" && (
              <div className="flex-1 flex flex-col">
                <MenuItem
                  icon={
                    hidden ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )
                  }
                  label={hidden ? "Show All Windows" : "Hide All Windows"}
                  description={
                    hidden
                      ? "Make all windows visible again"
                      : "Keep windows running, hide from view"
                  }
                  onClick={() => act(() => dispatch(toggleWindowsHidden()))}
                  disabled={!hasWindows}
                />

                {/* ── Per-window list ───────────────────────────────────────────── */}
                {hasWindows ? (
                  <>
                    <MenuDivider />
                    <MenuSection label="Windows" />
                    <div className="max-h-60 overflow-y-auto">
                      {windows.map((win) => {
                        const isDeprecated = !!getStaticEntryBySlug(win.id)
                          ?.deprecated;
                        return (
                          <button
                            key={win.id}
                            type="button"
                            role="menuitem"
                            className="flex items-center gap-2.5 w-full px-3 py-1.5 hover:bg-accent transition-colors text-left text-foreground/80"
                            onClick={() =>
                              act(() => {
                                if (win.state === "minimized")
                                  dispatch(restoreWindow(win.id));
                                dispatch(focusWindow(win.id));
                                if (hidden) dispatch(toggleWindowsHidden());
                              })
                            }
                          >
                            <span
                              className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                STATE_DOT[win.state],
                              )}
                              title={STATE_LABEL[win.state]}
                            />
                            <span
                              className={cn(
                                "flex-1 truncate text-xs font-medium",
                                isDeprecated && "text-destructive",
                              )}
                            >
                              {isDeprecated ? `* ${win.title}` : win.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50 shrink-0">
                              {STATE_LABEL[win.state]}
                            </span>
                            <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="px-3 py-2 text-xs text-muted-foreground/50 italic">
                    No windows open
                  </p>
                )}
                <div className="mt-auto">
                  <MenuDivider />
                  <MenuSection label="Window Controls" />
                  <MenuItem
                    icon={<Minimize2 className="w-3.5 h-3.5" />}
                    label="Minimize All"
                    description="Collapse all open windows to the tray"
                    onClick={() =>
                      act(() =>
                        dispatch(
                          minimizeAll({
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                          }),
                        ),
                      )
                    }
                    disabled={!hasWindows || allMinimized}
                  />
                  <MenuItem
                    icon={<Maximize2 className="w-3.5 h-3.5" />}
                    label="Restore All"
                    description="Return all windows to their last size"
                    onClick={() => act(() => dispatch(restoreAll()))}
                    disabled={!hasWindows || !allMinimized}
                  />
                </div>
              </div>
            )}

            {/* ── Tab Content: Layout ──────────────────────────────────────── */}
            {activeTab === "layout" && (
              <div className="flex-1 flex flex-col">
                <MenuSection label="Progression" />
                <div className="flex justify-center items-center gap-1.5 px-2 py-1.5 bg-accent/30 rounded-md mx-2 mb-2">
                  <button
                    onClick={() =>
                      setLayoutDirX((d) => (d === "ltr" ? "rtl" : "ltr"))
                    }
                    className="flex-1 flex justify-center items-center gap-1 py-1 rounded transition-colors bg-card hover:bg-accent border border-border/50 text-foreground shadow-sm"
                    title="Toggle Horizontal Progression"
                  >
                    {layoutDirX === "rtl" ? (
                      <ArrowLeft className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5" />
                    )}
                    <span className="text-[10px] font-medium leading-none tracking-wide">
                      {layoutDirX === "rtl" ? "R→L" : "L→R"}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      setLayoutDirY((d) => (d === "ttb" ? "btt" : "ttb"))
                    }
                    className="flex-1 flex justify-center items-center gap-1 py-1 rounded transition-colors bg-card hover:bg-accent border border-border/50 text-foreground shadow-sm"
                    title="Toggle Vertical Progression"
                  >
                    {layoutDirY === "btt" ? (
                      <ArrowUp className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDown className="w-3.5 h-3.5" />
                    )}
                    <span className="text-[10px] font-medium leading-none tracking-wide">
                      {layoutDirY === "btt" ? "B↑T" : "T↓B"}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      setLayoutPrimary((p) =>
                        p === "horizontal" ? "vertical" : "horizontal",
                      )
                    }
                    className="flex-1 flex justify-center items-center gap-1 py-1 rounded transition-colors bg-card hover:bg-accent border border-border/50 text-foreground shadow-sm"
                    title="Toggle Primary Flow Direction"
                  >
                    {layoutPrimary === "horizontal" ? (
                      <Rows3 className="w-3.5 h-3.5" />
                    ) : (
                      <Columns3 className="w-3.5 h-3.5" />
                    )}
                    <span className="text-[10px] font-medium leading-none tracking-wide">
                      {layoutPrimary === "horizontal" ? "HORZ" : "VERT"}
                    </span>
                  </button>
                </div>

                <MenuSection label="Arrange All" />
                <div className="flex flex-col gap-1 px-2 pb-2">
                  <div className="flex gap-1 justify-center">
                    <LayoutIconButton
                      type="grid4"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "grid4",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                    <LayoutIconButton
                      type="grid6"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "grid6",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                    <LayoutIconButton
                      type="grid8"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "grid8",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                    <LayoutIconButton
                      type="grid9"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "grid9",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                    <LayoutIconButton
                      type="grid12"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "grid12",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                  </div>
                  <div className="flex gap-1 justify-center">
                    <LayoutIconButton
                      type="stackRight2"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "stackRight2",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                    <LayoutIconButton
                      type="stackRight3"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "stackRight3",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                    <LayoutIconButton
                      type="stackRight4"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "stackRight4",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                    <LayoutIconButton
                      type="stackRight5"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "stackRight5",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                  </div>
                  <div className="flex gap-1 justify-center">
                    <LayoutIconButton
                      type="stackLeft2"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "stackLeft2",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                    <LayoutIconButton
                      type="stackLeft3"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "stackLeft3",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                    <LayoutIconButton
                      type="stackLeft4"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "stackLeft4",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                    <LayoutIconButton
                      type="stackLeft5"
                      onClick={() =>
                        dispatch(
                          arrangeActiveWindows({
                            layout: "stackLeft5",
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            dirX: layoutDirX,
                            dirY: layoutDirY,
                            primary: layoutPrimary,
                          }),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab Content: Tools ───────────────────────────────────────── */}
            {activeTab === "tools" && (
              <ToolsGrid section="tools" onAfterActivate={closePopover} />
            )}

            {/* ── Tab Content: Admin ───────────────────────────────────────── */}
            {activeTab === "admin" && isAdmin && (
              <ToolsGrid section="admin" onAfterActivate={closePopover} />
            )}

            {/* ── Tab Content: Creator ─────────────────────────────────────── */}
            {activeTab === "creator" && isCreator && (
              <ToolsGrid section="creator" onAfterActivate={closePopover} />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
