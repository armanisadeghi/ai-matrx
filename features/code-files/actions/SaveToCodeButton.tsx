"use client";
// features/code-files/actions/SaveToCodeButton.tsx
//
// A small icon/text button that opens the Save-to-Code dialog via the global
// overlay system. Drop this anywhere a snippet of code exists and you want
// a one-click save entry point (CodeBlock header, chat message actions, etc.).

import React from "react";
import { FileCode } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

export interface SaveToCodeButtonProps {
  content: string;
  language?: string;
  suggestedName?: string;
  defaultFolderId?: string | null;
  className?: string;
  iconClassName?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  label?: string;
  iconOnly?: boolean;
  tooltip?: string;
}

export function SaveToCodeButton({
  content,
  language,
  suggestedName,
  defaultFolderId = null,
  className,
  iconClassName,
  variant = "ghost",
  size = "sm",
  label = "Save to Code",
  iconOnly = false,
  tooltip = "Save to your code files",
}: SaveToCodeButtonProps) {
  const dispatch = useAppDispatch();

  const handleClick = () => {
    if (!content?.trim()) return;
    dispatch(
      openOverlay({
        overlayId: "saveToCode",
        data: {
          initialContent: content,
          initialLanguage: language ?? "plaintext",
          suggestedName,
          defaultFolderId: defaultFolderId ?? null,
        },
      }),
    );
  };

  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={!content?.trim()}
      className={cn("gap-1.5", iconOnly && "h-8 w-8 p-0", className)}
      aria-label={tooltip}
    >
      <FileCode className={cn("h-4 w-4", iconClassName)} />
      {!iconOnly && <span className="text-xs">{label}</span>}
    </Button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
