"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Group,
  Panel,
  useDefaultLayout,
  type LayoutStorage,
} from "react-resizable-panels";
import { PanelRight, PanelRightClose, Info } from "lucide-react";
import { Handle } from "../_lib/Handle";

// Cookie-backed LayoutStorage adapter — useDefaultLayout reads/writes through
// this so persistence round-trips through the same cookies the server can read.
const cookieStorage: LayoutStorage = {
  getItem(key) {
    if (typeof document === "undefined") return null;
    const row = document.cookie
      .split("; ")
      .find((r) => r.startsWith(`${encodeURIComponent(key)}=`));
    return row ? decodeURIComponent(row.split("=")[1]) : null;
  },
  setItem(key, value) {
    if (typeof document === "undefined") return;
    document.cookie =
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}` +
      `; path=/; max-age=31536000; SameSite=Lax`;
  },
};

interface Props {
  initialShowRight: boolean;
  toggleCookie: string;
}

export function ConditionalWorkbench({ initialShowRight, toggleCookie }: Props) {
  const [showRight, setShowRight] = useState(initialShowRight);

  // Persist the toggle state itself so SSR can pick the right initial set.
  useEffect(() => {
    document.cookie =
      `${toggleCookie}=${encodeURIComponent(JSON.stringify({ showRight }))}` +
      `; path=/; max-age=31536000; SameSite=Lax`;
  }, [showRight, toggleCookie]);

  // panelIds reflects which panels are CURRENTLY MOUNTED. The lib builds a
  // different storage key per permutation, so each combination remembers its
  // own layout independently.
  const panelIds = useMemo(
    () => ["left", "center", ...(showRight ? ["right"] : [])],
    [showRight],
  );

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "demo-05",
    panelIds,
    storage: cookieStorage,
  });

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <header className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5">
        <h1 className="text-sm font-medium">Conditional panels</h1>
        <div className="text-xs text-muted-foreground ml-2">
          right panel is{" "}
          <span className="text-foreground font-medium">
            {showRight ? "mounted" : "unmounted"}
          </span>{" "}
          · resize, toggle, resize, toggle back — each combination is remembered separately
        </div>
        <div className="ml-auto" />
        <button
          type="button"
          onClick={() => setShowRight((v) => !v)}
          aria-label={showRight ? "Unmount right panel" : "Mount right panel"}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          {showRight ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
        </button>
      </header>

      <div className="flex-1 overflow-hidden">
        <Group
          id="demo-05"
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="h-full w-full"
        >
          <Panel id="left" defaultSize="20%" minSize="5%">
            <Surface label="Left" tone="muted" />
          </Panel>
          <Handle />
          <Panel id="center" minSize="30%">
            <CenterSurface panelIds={panelIds} />
          </Panel>
          {showRight && (
            <>
              <Handle />
              <Panel id="right" defaultSize="22%" minSize="5%">
                <Surface label="Right" tone="muted" />
              </Panel>
            </>
          )}
        </Group>
      </div>
    </div>
  );
}

function Surface({ label, tone }: { label: string; tone: "card" | "muted" }) {
  return (
    <div
      className={`h-full overflow-auto p-4 ${tone === "muted" ? "bg-muted" : "bg-card"}`}
    >
      <h2 className="text-sm font-medium mb-1">{label}</h2>
      <p className="text-xs text-muted-foreground">
        defaultSize · minSize=&quot;5%&quot; · collapsible (no, this one is mounted/unmounted
        instead)
      </p>
    </div>
  );
}

function CenterSurface({ panelIds }: { panelIds: string[] }) {
  const storageKey = `react-resizable-panels:${["demo-05", ...panelIds].join(":")}`;
  return (
    <div className="h-full overflow-auto bg-card p-4 space-y-3">
      <h2 className="text-sm font-medium">Center</h2>
      <p className="text-xs text-muted-foreground">
        Currently mounted panels (in order):{" "}
        <code className="text-foreground">{panelIds.join(", ")}</code>
      </p>
      <div className="rounded border border-border bg-muted/50 p-3 flex gap-2 text-xs">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-foreground/85 leading-relaxed">
          <p className="mb-1">
            The library stores each permutation of mounted panels under a different cookie:
          </p>
          <code className="text-foreground font-mono">{storageKey}</code>
          <p className="mt-2">
            Resize this layout, then toggle the right panel. Resize again. Toggle
            back. Each combination is remembered independently.
          </p>
        </div>
      </div>
    </div>
  );
}
