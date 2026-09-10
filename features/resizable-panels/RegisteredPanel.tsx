"use client";

import { useEffect, useRef } from "react";
import {
  Panel,
  type PanelProps,
  type OnPanelResize,
} from "react-resizable-panels";
import { usePanelControls } from "./PanelControlProvider";

interface Props
  extends Omit<PanelProps, "panelRef" | "onResize" | "elementRef"> {
  /** Logical name used by usePanelControls()/header buttons. MUST equal the
   *  Panel `id` — toggle() addresses the group layout by it. */
  registerAs: string;
  /** The Group this panel belongs to — must match a ClientGroup's groupKey. */
  groupKey: string;
}

// Wraps <Panel> and:
//   1. Registers with the PanelControlProvider under groupKey: its element (to
//      measure the group for px/rem sizes) and its RAW defaultSize/minSize —
//      converted to % only when a toggle needs them, by the library's unit
//      rules (a bare number is px, never percent).
//   2. Mirrors the collapsed boolean on every onResize so header icons and
//      hidden handles follow a drag-to-collapse.
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

  useEffect(() => {
    registerPanel(registerAs, groupKey, elementRef, { defaultSize, minSize });
  }, [registerPanel, registerAs, groupKey, defaultSize, minSize]);

  const onResize: OnPanelResize = (next) => {
    notifyResize(registerAs, next.asPercentage);
  };

  return (
    <Panel
      {...rest}
      defaultSize={defaultSize}
      minSize={minSize}
      elementRef={elementRef}
      onResize={onResize}
    >
      {children}
    </Panel>
  );
}
