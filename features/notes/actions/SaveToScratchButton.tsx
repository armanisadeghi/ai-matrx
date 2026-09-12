// features/notes/actions/SaveToScratchButton.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileText, Check } from "lucide-react";
import { NotesAPI } from "../service/notesApi";
import { useToastManager } from "@/hooks/useToastManager";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";

interface SaveToScratchButtonProps {
  content: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
  className?: string;
}

/**
 * One-click button to save content directly to Scratch folder
 * Perfect for quick captures from anywhere in the app
 */
export function SaveToScratchButton({
  content,
  variant = "ghost",
  size = "icon",
  label,
  className,
}: SaveToScratchButtonProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const toast = useToastManager("notes");
  const organizationId = useAppSelector(selectOrganizationId);

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error("No content to save");
      return;
    }

    setIsSaving(true);
    try {
      const capturedOrganizationId = await ensureOrganizationContext({ organizationId });
      await NotesAPI.create({
        label: "New Note",
        content: content.trim(),
        folder_name: "Scratch",
        tags: [],
        organization_id: capturedOrganizationId,
      });

      setJustSaved(true);
      toast.success("Saved to Scratch!");

      // Reset success indicator after 2 seconds
      setTimeout(() => setJustSaved(false), 2000);
    } catch (error) {
      console.error("Error saving to scratch:", error);
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
            disabled={isSaving || !content.trim()}
            className={className}
          >
            {justSaved ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {label && <span className="ml-2">{label}</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {justSaved ? "Saved!" : "Save to Scratch"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
