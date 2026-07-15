// components/markdown-studio/TemplatesPalette.tsx
// Card-based dropdown of curated starter templates. Each card shows
// the icon, title, blurb, and the block types it exercises — so the
// user can pick a sample that demos exactly the platform feature they
// want to see.

"use client";

import React from "react";
import {
  BarChart3,
  Brain,
  FileCode,
  GitBranch,
  Image,
  Layers,
  ListChecks,
  Mic,
  PenTool,
  Quote,
  Table,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { cn } from "@/lib/utils";
import { STUDIO_TEMPLATES, type StudioTemplate } from "./templates";
import { getBlockTypeStyle } from "./block-type-colors";

// Note: the trigger lives in the route header (a `HeaderAction`), so this
// component is fully controlled from outside — no internal open state or
// trigger button of its own.

const ICON_MAP: Record<StudioTemplate["icon"], LucideIcon> = {
  FileCode,
  Table,
  Brain,
  Image,
  Quote,
  ListChecks,
  GitBranch,
  BarChart3,
  Mic,
  PenTool,
};

interface TemplatesPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: StudioTemplate) => void;
}

export function TemplatesPalette({
  open,
  onOpenChange,
  onSelect,
}: TemplatesPaletteProps) {
  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Start from a template
        </span>
      }
      description="Curated samples covering each render-block type the platform supports."
      position="right"
      defaultSize={38}
      contentClassName="flex min-h-0 flex-1 flex-col p-0"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid grid-cols-1 gap-1 p-2">
          {STUDIO_TEMPLATES.map((template) => {
            const Icon = ICON_MAP[template.icon];
            return (
              <button
                key={template.id}
                className={cn(
                  "group flex items-start gap-3 rounded-md border border-transparent",
                  "px-2.5 py-2 text-left transition-colors",
                  "hover:bg-accent hover:border-border",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                onClick={() => {
                  onSelect(template);
                  onOpenChange(false);
                }}
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">
                      {template.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                    {template.blurb}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {template.blocks.map((blockType) => {
                      const style = getBlockTypeStyle(blockType);
                      return (
                        <Badge
                          key={blockType}
                          variant="outline"
                          className={cn(
                            "h-4 px-1.5 text-[10px] font-medium",
                            style.bg,
                            style.text,
                            style.border,
                          )}
                        >
                          {blockType}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </MatrxDynamicPanelHost>
  );
}
