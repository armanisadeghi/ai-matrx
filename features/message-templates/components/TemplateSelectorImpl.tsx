"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MessageRole } from "@/features/content-templates/types/content-templates-db";
import { TemplateBrowserModal } from "./TemplateBrowserModal";
import { SaveTemplateModal } from "./SaveTemplateModal";

export interface TemplateSelectorImplProps {
  role: MessageRole;
  currentContent: string;
  onTemplateSelected: (content: string) => void;
  onSaveTemplate?: (label: string, content: string, tags: string[]) => void;
  messageIndex?: number;
  /** Open the popover on first mount (after lazy load from the shell). */
  initialOpen?: boolean;
}

export function TemplateSelectorImpl({
  role,
  currentContent,
  onTemplateSelected,
  onSaveTemplate,
  messageIndex,
  initialOpen = false,
}: TemplateSelectorImplProps) {
  const [popoverOpen, setPopoverOpen] = useState(initialOpen);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const handleBrowse = () => {
    setPopoverOpen(false);
    setBrowserOpen(true);
  };

  const handleSave = () => {
    setPopoverOpen(false);
    setSaveOpen(true);
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <FileText className="w-3.5 h-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2 h-[76px]" align="start">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-8 px-2 text-xs text-foreground hover:bg-accent"
              onClick={handleBrowse}
            >
              Browse Templates
            </Button>
            {onSaveTemplate && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start h-8 px-2 text-xs text-foreground hover:bg-accent"
                onClick={handleSave}
                disabled={!currentContent.trim()}
              >
                Save as Template
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <TemplateBrowserModal
        isOpen={browserOpen}
        onClose={() => setBrowserOpen(false)}
        role={role}
        onSelectTemplate={onTemplateSelected}
      />

      {onSaveTemplate && (
        <SaveTemplateModal
          isOpen={saveOpen}
          onClose={() => setSaveOpen(false)}
          role={role}
          currentContent={currentContent}
          onSave={onSaveTemplate}
        />
      )}
    </>
  );
}
