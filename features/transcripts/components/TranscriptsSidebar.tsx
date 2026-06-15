// features/transcripts/components/TranscriptsSidebar.tsx
"use client";

import React, { useState, useMemo } from "react";
import { useTranscriptsContext } from "../context/TranscriptsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Search,
  Plus,
  Folder,
  Clock,
  Video,
  Mic,
  Users,
  FileAudio,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Transcript } from "../types";
import { formatDuration, formatRelativeTime } from "../utils/dateFormatting";
import { DraftIndicator } from "./DraftIndicator";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import { useToastManager } from "@/hooks/useToastManager";

interface TranscriptsSidebarProps {
  onCreateTranscript?: () => void;
}

export function TranscriptsSidebar({
  onCreateTranscript,
}: TranscriptsSidebarProps) {
  const {
    transcripts,
    activeTranscript,
    setActiveTranscript,
    updateTranscript,
  } = useTranscriptsContext();
  const toast = useToastManager("transcripts");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  // Group transcripts by folder
  const folderGroups = useMemo(() => {
    const groups = new Map<string, Transcript[]>();

    transcripts.forEach((transcript) => {
      const folder = transcript.folder_name || "Transcripts";
      if (!groups.has(folder)) {
        groups.set(folder, []);
      }
      groups.get(folder)!.push(transcript);
    });

    return Array.from(groups.entries()).map(([folder, items]) => ({
      folder,
      transcripts: items,
      count: items.length,
    }));
  }, [transcripts]);

  // Filter transcripts
  const filteredTranscripts = useMemo(() => {
    let filtered = transcripts;

    if (selectedFolder) {
      filtered = filtered.filter((t) => t.folder_name === selectedFolder);
    }

    if (searchTerm.trim()) {
      filtered = filterAndSortBySearch(filtered, searchTerm, [
        { get: (t) => t.title, weight: "title" },
        { get: (t) => t.description, weight: "body" },
        { get: (t) => t.tags, weight: "tag" },
      ]);
    }

    return filtered;
  }, [transcripts, selectedFolder, searchTerm]);

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case "audio":
        return <FileAudio className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "meeting":
        return <Users className="h-4 w-4" />;
      case "interview":
        return <Mic className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const startRename = (transcript: Transcript, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(transcript.id);
    setRenameValue(transcript.title);
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(null);
    setRenameValue("");
  };

  const saveRename = async (transcriptId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error("Title cannot be empty");
      return;
    }
    setRenameBusy(true);
    try {
      await updateTranscript(transcriptId, { title: trimmed });
      setRenamingId(null);
      setRenameValue("");
      toast.success("Recording renamed");
    } catch {
      toast.error("Failed to rename recording");
    } finally {
      setRenameBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* Header */}
      <div className="p-3 md:p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h2 className="text-base md:text-lg font-semibold">Transcripts</h2>
          <Button
            size="sm"
            onClick={onCreateTranscript}
            className="h-7 md:h-8 text-xs md:text-sm"
          >
            <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="ml-1">New</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 md:left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          <Input
            placeholder="Search transcripts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 md:pl-9 h-9 text-sm md:text-base"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      {/* Folders */}
      <div className="p-2 border-b border-border">
        <ScrollArea className="h-32">
          <div className="space-y-1">
            <button
              onClick={() => setSelectedFolder(null)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                !selectedFolder
                  ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                  : "hover:bg-gray-100 dark:hover:bg-gray-700",
              )}
            >
              <span className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                All Transcripts
              </span>
              <Badge variant="secondary" className="text-xs">
                {transcripts.length}
              </Badge>
            </button>

            {folderGroups.map(({ folder, count }) => (
              <button
                key={folder}
                onClick={() => setSelectedFolder(folder)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                  selectedFolder === folder
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700",
                )}
              >
                <span className="flex items-center gap-2">
                  <Folder className="h-4 w-4" />
                  {folder}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {count}
                </Badge>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Transcripts List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredTranscripts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
              {searchTerm ? "No transcripts found" : "No transcripts yet"}
            </div>
          ) : (
            filteredTranscripts.map((transcript) => (
              <div
                key={transcript.id}
                className={cn(
                  "w-full rounded-md transition-colors group relative",
                  activeTranscript?.id === transcript.id
                    ? "bg-blue-50 border-l-2 border-blue-500 dark:bg-blue-900/20 dark:border-blue-400"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700",
                )}
              >
                {renamingId === transcript.id ? (
                  <div
                    className="p-3 space-y-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="h-8 text-sm"
                      style={{ fontSize: "16px" }}
                      autoFocus
                      disabled={renameBusy}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRename(transcript.id);
                        if (e.key === "Escape") {
                          setRenamingId(null);
                          setRenameValue("");
                        }
                      }}
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-7 flex-1"
                        disabled={renameBusy}
                        onClick={(e) => void saveRename(transcript.id, e)}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        disabled={renameBusy}
                        onClick={cancelRename}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTranscript(transcript)}
                    className="w-full p-3 text-left"
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 text-gray-500 dark:text-gray-400">
                        {getSourceIcon(transcript.source_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate flex-1">
                            {transcript.title}
                          </h3>
                          {transcript.is_draft && <DraftIndicator size="sm" />}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Rename recording"
                            onClick={(e) => startRename(transcript, e)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                        {transcript.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                            {transcript.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                          {transcript.metadata?.duration && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(transcript.metadata.duration)}
                            </span>
                          )}
                          {transcript.updated_at && (
                            <span className="flex items-center gap-1">
                              • {formatRelativeTime(transcript.updated_at)}
                            </span>
                          )}
                        </div>
                        {transcript.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {transcript.tags.slice(0, 2).map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-xs px-1 py-0"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {transcript.tags.length > 2 && (
                              <Badge
                                variant="outline"
                                className="text-xs px-1 py-0"
                              >
                                +{transcript.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
