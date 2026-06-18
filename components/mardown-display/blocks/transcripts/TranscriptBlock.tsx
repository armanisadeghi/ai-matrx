"use client";
import React, { useState, useMemo } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdvancedTranscriptViewer from "@/components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer";
import { ImportTranscriptModal } from "@/features/transcripts/components/ImportTranscriptModal";
import { parseTranscript } from "./transcript-parser";
import { useToast } from "@/components/ui/use-toast";

interface TranscriptBlockProps {
  content: string;
}

const TranscriptBlock: React.FC<TranscriptBlockProps> = ({ content }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const { toast } = useToast();

  const parsed = useMemo(() => parseTranscript(content), [content]);

  const collapsibleTitle = parsed.title ?? "Transcript";

  const handleCopySegment = (text: string) => {
    toast({
      title: "Copied to clipboard",
      description: "The transcript segment has been copied to your clipboard",
    });
  };

  const handleTimeClick = (seconds: number) => {
    toast({
      title: "Time selected",
      description: `Jumped to ${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")} in the audio`,
    });
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm my-4"
    >
      <div className="relative flex w-full items-center justify-between rounded-t-lg border-b border-zinc-200 dark:border-zinc-700">
        <CollapsibleTrigger className="flex-1 flex items-center gap-2 py-3 px-4 font-medium hover:bg-accent/50">
          <FileText className="h-4 w-4 text-primary" />
          <span>{collapsibleTitle}</span>
          <ChevronDown
            className={`h-4 w-4 ml-auto shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setIsImportModalOpen(true);
          }}
          className="mr-2 h-8 px-3"
        >
          <Upload className="h-4 w-4" />
          Import
        </Button>
      </div>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-slide-down data-[state=closed]:animate-slide-up bg-transparent">
        <div className="p-2 bg-transparent">
          <AdvancedTranscriptViewer
            content={content}
            parsedTranscript={parsed}
            hideTitle={false}
            onTimeClick={handleTimeClick}
            onCopySegment={handleCopySegment}
          />
        </div>
      </CollapsibleContent>

      {/* Import Modal */}
      <ImportTranscriptModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        segments={parsed.segments}
      />
    </Collapsible>
  );
};

export default TranscriptBlock;
