"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { TranscriptsSidebar } from "./TranscriptsSidebar";
import { TranscriptViewer } from "./TranscriptViewer";
import { CreateTranscriptModal } from "./CreateTranscriptModal";
import { DeleteTranscriptDialog } from "./DeleteTranscriptDialog";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { TranscriptsProcessorHeader } from "./TranscriptsProcessorHeader";
import { useTranscriptsContext } from "../context/TranscriptsContext";
import { useToastManager } from "@/hooks/useToastManager";
import { Loader2, Menu } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TranscriptsLayoutProps {
  className?: string;
}

export function TranscriptsLayout({ className }: TranscriptsLayoutProps) {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const {
    isLoading,
    activeTranscript,
    transcripts,
    setActiveTranscript,
    initialize,
    copyTranscript,
    refreshTranscripts,
  } = useTranscriptsContext();
  const toast = useToastManager("transcripts");

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Deep-link from hub cards: /transcripts/processor?focus=<id>
  useEffect(() => {
    if (!focusId || transcripts.length === 0) return;
    if (activeTranscript?.id === focusId) return;
    const target = transcripts.find((t) => t.id === focusId);
    if (target) setActiveTranscript(target);
  }, [focusId, transcripts, activeTranscript?.id, setActiveTranscript]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleCreateNew = () => {
    setIsCreateModalOpen(true);
    setIsMobileSidebarOpen(false);
  };

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleCopy = async () => {
    if (!activeTranscript) return;
    try {
      await copyTranscript(activeTranscript.id);
      toast.success("Transcript copied");
    } catch (error) {
      console.error("Error copying transcript:", error);
      toast.error("Failed to copy transcript");
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshTranscripts();
      toast.success("Transcripts refreshed");
    } catch (error) {
      console.error("Error refreshing transcripts:", error);
      toast.error("Failed to refresh");
    }
  };

  const handleExport = () => {
    if (!activeTranscript) return;
    const text = activeTranscript.segments
      .map(
        (seg) =>
          `[${seg.timecode}]${seg.speaker ? ` ${seg.speaker}:` : ""} ${seg.text}`,
      )
      .join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTranscript.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Transcript exported");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <PageHeader>
        <TranscriptsProcessorHeader
          hasActiveTranscript={activeTranscript !== null}
          onCreateNew={handleCreateNew}
          onRefresh={() => void handleRefresh()}
          onCopy={() => void handleCopy()}
          onExport={handleExport}
          onDelete={handleDeleteClick}
        />
      </PageHeader>

      <div
        className={cn(
          "flex h-full overflow-hidden pt-[var(--shell-header-h)]",
          className,
        )}
      >
        {/* Desktop Sidebar */}
        <div className="w-80 shrink-0 hidden md:block">
          <TranscriptsSidebar onCreateTranscript={handleCreateNew} />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile: Show menu button and title */}
          <div className="flex items-center border-b border-border bg-textured md:hidden h-9">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 m-1"
              onClick={() => setIsMobileSidebarOpen(true)}
            >
              <Menu className="h-3.5 w-3.5" />
            </Button>
            <MatrxDynamicPanelHost
              open={isMobileSidebarOpen}
              onOpenChange={setIsMobileSidebarOpen}
              title="Transcripts"
              position="left"
              defaultSize={80}
              contentClassName="flex min-h-0 flex-1 flex-col p-0 pb-safe"
            >
              <TranscriptsSidebar onCreateTranscript={handleCreateNew} />
            </MatrxDynamicPanelHost>

            {/* Mobile - Show active transcript title */}
            {activeTranscript && (
              <div className="flex-1 px-2 text-xs font-medium text-foreground truncate">
                {activeTranscript.title}
              </div>
            )}
          </div>

          {/* Transcript Viewer */}
          <TranscriptViewer />
        </div>
      </div>

      {/* Modals */}
      <CreateTranscriptModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <DeleteTranscriptDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        transcript={activeTranscript}
      />
    </>
  );
}
