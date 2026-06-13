"use client";

import React from "react";
import {
  Pencil,
  Pin,
  Copy,
  Share2,
  Archive,
  Trash2,
  ExternalLink,
  Download,
  FileText,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { ItemMenu, ItemContextMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { Button } from "@/components/ui/button";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

const demoConfig: ItemMenuConfig = {
  header: { title: "Project Phoenix" },
  sections: [
    {
      id: "actions",
      items: [
        {
          id: "rename",
          label: "Rename",
          icon: Pencil,
          shortcutKey: "r",
          onSelect: () => void toast.info("Rename (standalone: opens a dialog)"),
        },
        {
          id: "pin",
          label: "Pin",
          icon: Pin,
          iconClassName: "text-amber-500",
          shortcutKey: "p",
          onSelect: () => void toast.success("Pinned"),
        },
        {
          id: "open",
          kind: "link",
          label: "Open in new tab",
          icon: ExternalLink,
          href: "https://example.com",
          target: "_blank",
        },
      ],
    },
    {
      id: "manage",
      label: "Manage",
      items: [
        {
          id: "duplicate",
          label: "Duplicate",
          icon: Copy,
          shortcutKey: "d",
          description: "Make a full copy",
          onSelect: () => new Promise((r) => setTimeout(r, 1400)),
          toast: {
            loading: "Duplicating…",
            success: "Duplicated",
            error: "Duplicate failed",
          },
        },
        { id: "share", label: "Share…", icon: Share2, onSelect: () => void toast.info("Share") },
        {
          id: "export",
          kind: "submenu",
          label: "Export as",
          icon: Download,
          sections: [
            {
              items: [
                {
                  id: "pdf",
                  label: "PDF",
                  icon: FileText,
                  onSelect: () => void toast.success("Exported PDF"),
                },
                {
                  id: "md",
                  label: "Markdown",
                  icon: FileText,
                  onSelect: () => void toast.success("Exported Markdown"),
                },
              ],
            },
          ],
        },
        {
          id: "show-meta",
          kind: "checkbox",
          label: "Show metadata",
          icon: Eye,
          checked: true,
          onCheckedChange: (next) => void toast.message(`Metadata ${next ? "on" : "off"}`),
        },
        {
          id: "archive",
          label: "Archive",
          icon: Archive,
          disabled: true,
          disabledReason: "Already archived",
          onSelect: () => {},
        },
      ],
    },
    {
      id: "danger",
      items: [
        {
          id: "delete",
          label: "Delete",
          icon: Trash2,
          tone: "destructive",
          onSelect: () => void toast.error("Deleted (demo)"),
        },
      ],
    },
  ],
};

const code = `import { ItemMenu, ItemContextMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";

const config: ItemMenuConfig = {
  header: { title: "Project Phoenix" },
  sections: [
    { id: "actions", items: [
      { id: "rename", label: "Rename", icon: Pencil, shortcutKey: "r", onSelect },
      { id: "pin", label: "Pin", icon: Pin, iconClassName: "text-amber-500", onSelect },
      { id: "open", kind: "link", label: "Open in new tab", href, target: "_blank" },
    ]},
    { id: "manage", label: "Manage", items: [
      { id: "duplicate", label: "Duplicate", icon: Copy, onSelect: asyncFn,
        toast: { loading: "Duplicating…", success: "Duplicated", error: "Failed" } },
      { id: "export", kind: "submenu", label: "Export as", sections: [...] },
      { id: "show-meta", kind: "checkbox", label: "Show metadata", checked, onCheckedChange },
    ]},
    { id: "danger", items: [
      { id: "delete", label: "Delete", icon: Trash2, tone: "destructive", onSelect },
    ]},
  ],
};

// Kebab dropdown (no dimming backdrop — page stays interactive)
<ItemMenu config={config}>
  <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
</ItemMenu>

// Right-click anywhere on a surface — same config, same renderer
<ItemContextMenu config={config}><div>Right-click me</div></ItemContextMenu>`;

export default function ItemMenuDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Schema-driven menu rendered as a non-blocking dropdown (desktop), a right-click context menu, or a bottom drawer with submenu drill-in (mobile / forced). Single-key shortcuts (P/R/D) work while open. No dimming backdrop, ever."
    >
      <div className="flex w-full flex-wrap items-start justify-center gap-8 p-8">
        <div className="flex flex-col items-center gap-2">
          <ItemMenu config={demoConfig}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <MoreHorizontal className="h-4 w-4" />
              Kebab dropdown
            </Button>
          </ItemMenu>
          <span className="text-xs text-muted-foreground">
            Click — try keys P / R / D
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <ItemContextMenu config={demoConfig}>
            <div className="flex h-24 w-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-sm text-muted-foreground">
              Right-click me
            </div>
          </ItemContextMenu>
          <span className="text-xs text-muted-foreground">Context menu</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <ItemMenu config={demoConfig} presentation="drawer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <MoreHorizontal className="h-4 w-4" />
              Forced drawer
            </Button>
          </ItemMenu>
          <span className="text-xs text-muted-foreground">
            Mobile drawer + drill-in
          </span>
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
}
