import React from "react";
import { PresentationComponent } from "./types";
import {
  defaultConfig,
  getPresentationClasses,
  getPresentationHandlers,
  PresentationButtons,
  PresentationHeader,
} from "./common";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const TooltipPresentation: PresentationComponent = ({
  trigger,
  content,
  className,
  config = defaultConfig,
  onOpenChange,
}) => {
  return (
    <Tooltip onOpenChange={onOpenChange}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        className={cn(
          getPresentationClasses(config, className),
          `matrx-density-${config?.density || "normal"}`,
        )}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
};
