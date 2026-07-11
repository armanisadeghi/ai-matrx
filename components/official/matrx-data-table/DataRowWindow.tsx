"use client";

/**
 * DataRowWindow — generic WindowPanel for any table row.
 *
 * Thin composition root: body is content ONLY. Default body is
 * `DataRowInspector`; callers pass `children` to override with a custom
 * ReactNode. Page-local close via `onClose` (no overlay required) so custom
 * JSX never has to travel through Redux.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { DataRowInspector } from "./DataRowInspector";

export interface DataRowWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Serializable row for the default inspector. Ignored when children set. */
  row?: unknown;
  /** Custom window body — wins over the default inspector. */
  children?: React.ReactNode;
  width?: number;
  height?: number;
  windowId?: string;
}

export function DataRowWindow({
  isOpen,
  onClose,
  title = "Row details",
  row,
  children,
  width = 720,
  height = 560,
  windowId = "matrx-data-row-window",
}: DataRowWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      id={windowId}
      title={title}
      onClose={onClose}
      width={width}
      height={height}
      minWidth={360}
      minHeight={280}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {children ?? <DataRowInspector row={row} />}
    </WindowPanel>
  );
}
