"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Group,
  Panel,
  useGroupRef,
  type Layout,
} from "react-resizable-panels";
import { Info } from "lucide-react";
import { Handle } from "../_lib/Handle";
import { useMountState } from "./MountStateProvider";

const GROUP_ID = "demo-05";

function buildLayoutCookieKey(panelIds: string[]) {
  return `react-resizable-panels:${[GROUP_ID, ...panelIds].join(":")}`;
}

function readLayoutFromCookie(key: string): Layout | undefined {
  if (typeof document === "undefined") return undefined;
  const row = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${encodeURIComponent(key)}=`));
  if (!row) return undefined;
  try {
    return JSON.parse(decodeURIComponent(row.split("=")[1])) as Layout;
  } catch {
    return undefined;
  }
}

function writeLayoutToCookie(key: string, value: Layout) {
  if (typeof document === "undefined") return;
  document.cookie =
    `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}` +
    `; path=/; max-age=31536000; SameSite=Lax`;
}

interface Props {
  initialLayout: Layout | undefined;
}

// Hand-rolls SSR-safe persistence instead of using useDefaultLayout because
// useDefaultLayout's defaultLayout return value is undefined on the server but
// populated on first client paint — that mismatch is the hydration error.
//
// Server passes the per-combo layout via initialLayout (read from the cookie
// matching the current panelIds). Group renders identically on server and
// client. When the user toggles, panelIds changes and we manually load the
// new combination's stored layout via setLayout.
export function ConditionalGroup({ initialLayout }: Props) {
  const { showRight } = useMountState();
  const groupRef = useGroupRef();
  const isInitialMount = useRef(true);

  const panelIds = useMemo(
    () => ["left", "center", ...(showRight ? ["right"] : [])],
    [showRight],
  );

  useEffect(() => {
    // First effect: skip — initialLayout is already applied as defaultLayout.
    // Subsequent effects (panelIds changed): load the new combo's layout.
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const layout = readLayoutFromCookie(buildLayoutCookieKey(panelIds));
    if (layout && groupRef.current) {
      groupRef.current.setLayout(layout);
    }
  }, [panelIds, groupRef]);

  const handleLayoutChanged = (layout: Layout) => {
    writeLayoutToCookie(buildLayoutCookieKey(panelIds), layout);
  };

  const storageKey = buildLayoutCookieKey(panelIds);

  return (
    <Group
      id={GROUP_ID}
      groupRef={groupRef}
      orientation="horizontal"
      defaultLayout={initialLayout}
      onLayoutChanged={handleLayoutChanged}
      className="h-full w-full"
    >
      <Panel id="left" defaultSize="20%" minSize="5%">
        <div className="h-full overflow-auto bg-muted px-4 pb-4 pt-[var(--shell-header-h)]">
          <h2 className="text-sm font-medium mb-1">Left</h2>
          <p className="text-xs text-muted-foreground">
            <code className="text-foreground">defaultSize=&quot;20%&quot;</code> · always mounted
          </p>
        </div>
      </Panel>
      <Handle />
      <Panel id="center" minSize="30%">
        <div className="h-full overflow-auto bg-card px-4 pb-4 pt-[var(--shell-header-h)] space-y-3">
          <h2 className="text-sm font-medium">Center</h2>
          <p className="text-xs text-muted-foreground">
            Currently mounted panels:{" "}
            <code className="text-foreground">{panelIds.join(", ")}</code>
          </p>
          <div className="rounded border border-border bg-muted/50 p-3 flex gap-2 text-xs">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-foreground/85 leading-relaxed">
              <p className="mb-1">
                Each permutation of mounted panels is stored under its own cookie:
              </p>
              <code className="text-foreground font-mono break-all">{storageKey}</code>
              <p className="mt-2">
                Resize, then toggle the right panel. Resize again. Toggle back.
                Each combination is remembered independently — and the SSR pass
                reads the matching cookie so the first paint matches the persisted layout.
              </p>
            </div>
          </div>
        </div>
      </Panel>
      {showRight && (
        <>
          <Handle />
          <Panel id="right" defaultSize="22%" minSize="5%">
            <div className="h-full overflow-auto bg-muted px-4 pb-4 pt-[var(--shell-header-h)]">
              <h2 className="text-sm font-medium mb-1">Right</h2>
              <p className="text-xs text-muted-foreground">
                Mounted/unmounted via toggle. Not just collapsed.
              </p>
            </div>
          </Panel>
        </>
      )}
    </Group>
  );
}
