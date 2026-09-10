"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  Panel,
  type PanelProps,
  type OnPanelResize,
} from "react-resizable-panels";
import { useGroupDefaultLayout } from "./ClientGroup";
import { usePanelControls } from "./PanelControlProvider";

interface Props
  extends Omit<PanelProps, "panelRef" | "onResize" | "elementRef"> {
  /** Logical name used by usePanelControls()/header buttons. MUST equal the
   *  Panel `id` — toggle() addresses the group layout by it. */
  registerAs: string;
  /** The Group this panel belongs to — must match a ClientGroup's groupKey. */
  groupKey: string;
}

const subscribeNever = () => () => {};

/** true while rendering on the server and while hydrating that render; false
 *  for every client render after (and for client-only mounts). */
function useServerSnapshot(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => false,
    () => true,
  );
}

// Wraps <Panel> and:
//   1. Registers with the PanelControlProvider under groupKey: its element (to
//      measure the group for px/rem sizes) and its RAW defaultSize/minSize —
//      converted to % only when a toggle needs them, by the library's unit
//      rules (a bare number is px, never percent).
//   2. Mirrors the collapsed boolean on every onResize so header icons and
//      hidden handles follow a drag-to-collapse.
//   3. Paints a saved-collapsed column collapsed on the server. The library's
//      server render treats a layout entry of 0 as missing and falls back to
//      flex-basis: defaultSize, so a cookie-collapsed column would paint open
//      and snap shut after hydration. While the server snapshot is in use
//      (server render + hydration) and the ClientGroup's defaultLayout holds
//      this panel at 0, the Panel gets defaultSize "0%"; the first client
//      render hands the library the real defaultSize again (it also drives
//      the separator double-click reset). The provider always registers the
//      real defaultSize, so the next toggle still reopens at it.
//
// `children` passes through to <Panel> — server components are fine.
export function RegisteredPanel({
  registerAs,
  groupKey,
  defaultSize,
  minSize,
  children,
  ...rest
}: Props) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const { registerPanel, notifyResize } = usePanelControls();
  const groupDefaultLayout = useGroupDefaultLayout();
  const serverSnapshot = useServerSnapshot();
  // A saved 0 is only ever written for a 0 collapsedSize (a non-zero collapsed
  // size is saved as its own truthy %, which the library paints correctly).
  const paintCollapsed =
    serverSnapshot && groupDefaultLayout?.[rest.id ?? registerAs] === 0;

  useEffect(() => {
    registerPanel(registerAs, groupKey, elementRef, { defaultSize, minSize });
  }, [registerPanel, registerAs, groupKey, defaultSize, minSize]);

  const onResize: OnPanelResize = (next) => {
    notifyResize(registerAs, next.asPercentage);
  };

  return (
    <Panel
      {...rest}
      defaultSize={paintCollapsed ? "0%" : defaultSize}
      minSize={minSize}
      elementRef={elementRef}
      onResize={onResize}
    >
      {children}
    </Panel>
  );
}
