"use client";

import { useEffect } from "react";
import {
  Panel,
  usePanelRef,
  type PanelProps,
  type OnPanelResize,
} from "react-resizable-panels";
import { usePanelControls } from "./PanelControlProvider";

interface Props extends Omit<PanelProps, "panelRef" | "onResize"> {
  /** Logical name used by usePanelControls()/header buttons. */
  registerAs: string;
  /** The Group this panel belongs to — must match a ClientGroup's groupKey. */
  groupKey: string;
}

function parseDefaultSizePercent(value: PanelProps["defaultSize"]): number {
  if (value === undefined) return 0;
  if (typeof value === "number") return value <= 100 ? value : 0;
  const m = /^(\d+(?:\.\d+)?)%?$/.exec(value);
  return m ? parseFloat(m[1]) : 0;
}

// Wraps <Panel> and:
//   1. Registers its panelRef with the PanelControlProvider under groupKey.
//   2. Reports resize percentages so the provider can keep lastOpenSize fresh
//      and flip the boolean intent on drag-to-collapse.
//
// `children` passes through to <Panel> — server components are fine.
export function RegisteredPanel({
  registerAs,
  groupKey,
  defaultSize,
  children,
  ...rest
}: Props) {
  const panelRef = usePanelRef();
  const { registerPanel, notifyResize } = usePanelControls();
  const defaultSizePercent = parseDefaultSizePercent(defaultSize);

  useEffect(() => {
    registerPanel(registerAs, groupKey, panelRef, defaultSizePercent);
  }, [registerPanel, registerAs, groupKey, panelRef, defaultSizePercent]);

  const onResize: OnPanelResize = (next) => {
    notifyResize(registerAs, next.asPercentage);
  };

  return (
    <Panel
      {...rest}
      defaultSize={defaultSize}
      panelRef={panelRef}
      onResize={onResize}
    >
      {children}
    </Panel>
  );
}
