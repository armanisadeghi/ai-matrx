// features/notes/actions/QuickCaptureButton.tsx
"use client";

import React from "react";
import { Button } from "@ai-matrx/design-system";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

interface QuickCaptureButtonProps {
  defaultContent?: string;
  defaultFolder?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
  className?: string;
}

/**
 * Opens the global Quick Save to Notes dialog (OverlayController).
 * Parent tree must include Redux + OverlayController (authenticated Providers or PublicProviders).
 */
export function QuickCaptureButton({
  defaultContent = "",
  defaultFolder = "Scratch",
  variant = "default",
  size = "default",
  label = "Quick Note",
  className,
}: QuickCaptureButtonProps) {
  const dispatch = useAppDispatch();

  const handleClick = () => {
    dispatch(
      openOverlay({
        overlayId: "saveToNotes",
        instanceId: crypto.randomUUID(),
        data: {
          initialContent: defaultContent,
          defaultFolder,
          initialEditorMode: undefined,
        },
      }),
    );
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={handleClick}
            className={className}
          >
            <Plus className="h-4 w-4" />
            {size !== "icon" && label && <span className="ml-2">{label}</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Create quick note</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
