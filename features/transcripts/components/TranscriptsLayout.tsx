"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { TranscriptsSidebar } from "./TranscriptsSidebar";
import { TranscriptViewer } from "./TranscriptViewer";
import { CreateTranscriptModal } from "./CreateTranscriptModal";
import { DeleteTranscriptDialog } from "./DeleteTranscriptDialog";
import { TranscriptsHeaderPortal } from "@/components/layout/new-layout/PageSpecificHeader";
import { useTranscriptsContext } from "../context/TranscriptsContext";
import { Loader2, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
  } = useTranscriptsContext();

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-page">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Header Portal Injection */}
      <TranscriptsHeaderPortal
        onCreateNew={handleCreateNew}
        onDeleteTranscript={handleDeleteClick}
      />

      <div className={cn("flex h-page overflow-hidden", className)}>
        {/* Desktop Sidebar */}
        <div className="w-80 shrink-0 hidden md:block">
          <TranscriptsSidebar onCreateTranscript={handleCreateNew} />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile: Show menu button and title */}
          <div className="flex items-center border-b border-border bg-textured md:hidden h-9">
            <Sheet
              open={isMobileSidebarOpen}
              onOpenChange={setIsMobileSidebarOpen}
            >
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 m-1">
                  <Menu className="h-3.5 w-3.5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[320px] pb-safe">
                <TranscriptsSidebar onCreateTranscript={handleCreateNew} />
              </SheetContent>
            </Sheet>

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
