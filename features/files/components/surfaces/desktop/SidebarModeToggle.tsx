/**
 * features/files/components/surfaces/dropbox/SidebarModeToggle.tsx
 *
 * Flat ↔ Tree toggle for the secondary nav sidebar. The mode is shared via
 * React context and persisted in a cookie so SSR and subsequent sessions
 * render with the user's preference — no flash.
 *
 * Default = flat (matches Dropbox).
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { FolderTree, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipIcon } from "@/features/files/components/core/Tooltip/TooltipIcon";
import { SIDEBAR_MODE_COOKIE } from "./sidebarModeCookie";

export type SidebarMode = "flat" | "tree";

const COOKIE_NAME = SIDEBAR_MODE_COOKIE;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface SidebarModeContextValue {
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
}

const SidebarModeContext = createContext<SidebarModeContextValue | null>(null);

export interface SidebarModeProviderProps {
  initialMode?: SidebarMode;
  children: React.ReactNode;
}

export function SidebarModeProvider({
  initialMode = "flat",
  children,
}: SidebarModeProviderProps) {
  const [mode, setModeState] = useState<SidebarMode>(initialMode);

  // Rehydrate from cookie on mount in case the server didn't pre-read it.
  useEffect(() => {
    const fromCookie = readCookie();
    if (fromCookie && fromCookie !== mode) {
      setModeState(fromCookie);
    }
    // Only run on mount — server-set value takes precedence otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback((next: SidebarMode) => {
    setModeState(next);
    if (typeof document !== "undefined") {
      document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
    }
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return (
    <SidebarModeContext.Provider value={value}>
      {children}
    </SidebarModeContext.Provider>
  );
}

export function useSidebarMode(): SidebarModeContextValue {
  const ctx = useContext(SidebarModeContext);
  if (!ctx) {
    throw new Error(
      "useSidebarMode must be used inside <SidebarModeProvider>",
    );
  }
  return ctx;
}

function readCookie(): SidebarMode | null {
  if (typeof document === "undefined") return null;
  const entries = document.cookie.split(";");
  for (const entry of entries) {
    const [name, ...rest] = entry.trim().split("=");
    if (name === COOKIE_NAME) {
      const value = rest.join("=");
      if (value === "flat" || value === "tree") return value;
    }
  }
  return null;
}


export interface SidebarModeToggleProps {
  className?: string;
}

export function SidebarModeToggle({ className }: SidebarModeToggleProps) {
  const { mode, setMode } = useSidebarMode();
  return (
    <div
      role="radiogroup"
      aria-label="Sidebar folder view"
      className={cn(
        "inline-flex items-center rounded-md border bg-background p-0.5",
        className,
      )}
    >
      <ToggleButton
        active={mode === "flat"}
        label="Flat folders"
        onClick={() => setMode("flat")}
      >
        <List className="h-3 w-3" />
      </ToggleButton>
      <ToggleButton
        active={mode === "tree"}
        label="Folder tree"
        onClick={() => setMode("tree")}
      >
        <FolderTree className="h-3 w-3" />
      </ToggleButton>
    </div>
  );
}

interface ToggleButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ToggleButton({ active, label, onClick, children }: ToggleButtonProps) {
  return (
    <TooltipIcon label={label}>
      <button
        type="button"
        role="radio"
        aria-checked={active}
        aria-label={label}
        onClick={onClick}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded",
          active
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/60",
        )}
      >
        {children}
      </button>
    </TooltipIcon>
  );
}
