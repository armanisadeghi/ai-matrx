"use client";

import React, { useState } from "react";
import { X, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShowForm, EpisodeForm } from "./PodcastForm";
import { podcastService } from "../../service";
import type { PcShow, PcEpisodeWithShow } from "../../types";
import { archiveConfirmSentence } from "@/features/trash/archiveCopy";

interface PodcastDetailPanelProps {
  activeTab: "shows" | "episodes";
  show: PcShow | null;
  episode: PcEpisodeWithShow | null;
  isNew: boolean;
  shows: PcShow[];
  onClose: () => void;
  onShowSaved: (saved: PcShow) => void;
  onEpisodeSaved: (saved: PcEpisodeWithShow) => void;
  onShowDeleted: (id: string) => void;
  onEpisodeDeleted: (id: string) => void;
}

export function PodcastDetailPanel({
  activeTab,
  show,
  episode,
  isNew,
  shows,
  onClose,
  onShowSaved,
  onEpisodeSaved,
  onShowDeleted,
  onEpisodeDeleted,
}: PodcastDetailPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentId = activeTab === "shows" ? show?.id : episode?.id;
  const currentSlug = activeTab === "shows" ? show?.slug : episode?.slug;
  const label = activeTab === "shows" ? "show" : "episode";

  const handleDelete = async () => {
    if (!currentId) return;
    setIsDeleting(true);
    try {
      if (activeTab === "shows") {
        await podcastService.removeShow(currentId);
        onShowDeleted(currentId);
      } else {
        await podcastService.removeEpisode(currentId);
        onEpisodeDeleted(currentId);
      }
    } catch (err) {
      console.error("Delete failed", err);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const panelTitle = isNew
    ? `New ${label}`
    : activeTab === "shows"
      ? (show?.title ?? "Edit show")
      : (episode?.title ?? "Edit episode");

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
          <h2 className="font-semibold text-sm truncate">{panelTitle}</h2>
          <div className="flex items-center gap-1">
            {!isNew && currentSlug && (
              <a
                href={`/podcast/${currentSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Open public page"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {!isNew && currentId && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title={`Delete ${label}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "shows" ? (
            <ShowForm
              show={show}
              isNew={isNew}
              onSaved={onShowSaved}
              onCancel={onClose}
            />
          ) : (
            <EpisodeForm
              episode={episode}
              isNew={isNew}
              shows={shows}
              onSaved={onEpisodeSaved}
              onCancel={onClose}
            />
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveConfirmSentence(`this ${label}`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
