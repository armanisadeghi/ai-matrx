// features/notes/actions/SaveSelectionButton.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Highlighter, Check } from "lucide-react";
import { NotesAPI } from "../service/notesApi";
import { useToastManager } from "@/hooks/useToastManager";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { requireOrganizationContext } from "@/lib/api/organization-context";

interface SaveSelectionButtonProps {
  folder?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
  className?: string;
}

/**
 * Button to save currently selected text to notes
 * Automatically captures window.getSelection() when clicked
 */
export function SaveSelectionButton({
  folder = "Scratch",
  variant = "ghost",
  size = "icon",
  label,
  className,
}: SaveSelectionButtonProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const toast = useToastManager("notes");
  const organizationId = useAppSelector(selectOrganizationId);

  const handleSave = async () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (!selectedText) {
      toast.error("No text selected");
      return;
    }

    setIsSaving(true);
    try {
      const capturedOrganizationId = requireOrganizationContext(organizationId);
      await NotesAPI.create({
        label: "New Note",
        content: selectedText,
        folder_name: folder,
        tags: [],
        organization_id: capturedOrganizationId,
      });

      setJustSaved(true);
      toast.success(`Saved selection to ${folder}!`);

      // Clear selection
      selection?.removeAllRanges();

      // Reset success indicator after 2 seconds
      setTimeout(() => setJustSaved(false), 2000);
    } catch (error) {
      console.error("Error saving selection:", error);
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={handleSave}
            disabled={isSaving}
            className={className}
          >
            {justSaved ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Highlighter className="h-4 w-4" />
            )}
            {label && <span className="ml-2">{label}</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {justSaved ? "Saved!" : `Save selection to ${folder}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
