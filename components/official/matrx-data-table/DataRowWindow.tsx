"use client";

/**
 * DataRowWindow — generic WindowPanel for any table row.
 *
 * Uses WindowPanel's built-in sidebar for View / Edit tabs when an edit body
 * is provided. Page-local close via `onClose` (no overlay required) so custom
 * JSX never has to travel through Redux.
 */

import { useEffect, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { cn } from "@/lib/utils";
import { DataRowInspector } from "./DataRowInspector";

export type DataRowWindowTab = "view" | "edit";

export interface DataRowWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Serializable row for the default inspector. Ignored when viewContent set. */
  row?: unknown;
  /**
   * Full-body override (no tabs). Escape hatch — prefer viewContent +
   * editContent so the window stays editable.
   */
  children?: React.ReactNode;
  /** View tab body. Defaults to DataRowInspector. */
  viewContent?: React.ReactNode;
  /** Edit tab body. When set, View/Edit sidebar tabs are shown. */
  editContent?: React.ReactNode;
  /** Which tab to open. Default: "edit" when editContent exists, else "view". */
  defaultTab?: DataRowWindowTab;
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
  viewContent,
  editContent,
  defaultTab,
  width = 720,
  height = 560,
  windowId = "matrx-data-row-window",
}: DataRowWindowProps) {
  const hasEdit = editContent != null;
  const hasTabs = hasEdit && children == null;
  const initialTab: DataRowWindowTab =
    defaultTab ?? (hasEdit ? "edit" : "view");
  const [tab, setTab] = useState<DataRowWindowTab>(initialTab);

  // Reset tab when the window opens on a different row / edit availability.
  useEffect(() => {
    if (!isOpen) return;
    setTab(defaultTab ?? (hasEdit ? "edit" : "view"));
  }, [isOpen, windowId, hasEdit, defaultTab]);

  if (!isOpen) return null;

  const viewBody = viewContent ?? <DataRowInspector row={row} />;

  const body = children ?? (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {hasTabs ? (
        tab === "edit" ? (
          <div className="min-h-0 flex-1 overflow-hidden">{editContent}</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden">{viewBody}</div>
        )
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">{viewBody}</div>
      )}
    </div>
  );

  return (
    <WindowPanel
      id={windowId}
      title={title}
      onClose={onClose}
      width={width}
      height={height}
      minWidth={420}
      minHeight={320}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      sidebarDefaultSize={140}
      sidebarMinSize={110}
      sidebar={
        hasTabs ? (
          <nav
            aria-label="Row window tabs"
            className="flex h-full flex-col gap-0.5 overflow-y-auto p-1.5"
          >
            <TabButton
              active={tab === "view"}
              icon={<Eye className="h-4 w-4 shrink-0" />}
              label="View"
              onClick={() => setTab("view")}
            />
            <TabButton
              active={tab === "edit"}
              icon={<Pencil className="h-4 w-4 shrink-0" />}
              label="Edit"
              onClick={() => setTab("edit")}
            />
          </nav>
        ) : undefined
      }
    >
      {body}
    </WindowPanel>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
