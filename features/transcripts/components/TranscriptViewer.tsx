"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranscriptsContext } from "../context/TranscriptsContext";
import AdvancedTranscriptViewer, {
  TranscriptSegment,
} from "@/components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Download,
  Edit2,
  Save,
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Loader2,
  RotateCw,
  FileText,
  Gauge,
  Check,
  Copy,
  CheckCheck,
} from "lucide-react";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import { useToastManager } from "@/hooks/useToastManager";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useFileSrc } from "@/features/files";
import type { FileSource } from "@/features/files";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PromoteToStudioButton } from "@/features/transcript-studio/components/conversion/PromoteToStudioButton";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { UnifiedAgentContextMenu } from "@/features/context-menu-v2/UnifiedAgentContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";
import { useTranscriptsSurfaceScope } from "@/features/transcripts/hooks/useTranscriptsSurfaceScope";
import {
  TRANSCRIPTS_CONTEXT_MENU_PROPS,
  buildTranscriptsContextData,
} from "@/features/transcripts/agent-context/buildTranscriptsContextData";
import { createTranscriptsExtraSections } from "@/features/transcripts/agent-context/transcriptsExtraSections";

export function TranscriptViewer() {
  const { activeTranscript, updateTranscript } = useTranscriptsContext();
  const toast = useToastManager("transcripts");

  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [contentSaveBusy, setContentSaveBusy] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const segmentContainerRef = useRef<HTMLDivElement>(null);
  const editContentRef = useRef<HTMLTextAreaElement>(null);

  // Build the `matrx-user/transcripts` surface scope. The builder snapshots
  // Redux/context state at call time, and reads live `currentTime` /
  // `paused` / `playbackRate` directly off the <audio> element so the
  // scope reflects the moment the user clicks an action — not the last
  // render. We invoke it here so the scope flows in via UnifiedAgentContextMenu's
  // `contextData` prop on every render (cheap; audio onTimeUpdate fires
  // a few times per second).
  const buildSurfaceScope = useTranscriptsSurfaceScope({
    audioRef,
    isEditingMetadata,
    contentContainerRef: segmentContainerRef,
  });
  const surfaceScope = buildSurfaceScope();

  // Presentational region: the user reads the rendered transcript. The browser
  // text selection is captured live at click time (DOM selection, no editable
  // element), and the surface scope flows in as `contextData`. Stable per the
  // surface-pro-rollout recipe (the one sanctioned manual callback).
  const getViewerApplicationScope = useCallback(
    () =>
      buildApplicationScopeFromMenuContext({
        selectedText: window.getSelection?.()?.toString() ?? "",
        selectionRange: null,
        contextData: surfaceScope as unknown as Record<string, unknown>,
      }),
    [surfaceScope],
  );

  // Editable region: the inline transcript-body editor. Reads the live
  // textarea selection at click time and builds the scope off the in-flight
  // buffer so agent actions operate on exactly what's on screen.
  const getEditorApplicationScope = useCallback(() => {
    const el = editContentRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? start;
    const text = el?.value ?? editContent;
    const selectedText =
      start !== end ? text.slice(Math.min(start, end), Math.max(start, end)) : "";
    const contextData = buildTranscriptsContextData({
      transcript: activeTranscript ?? null,
      currentTime: audioRef.current?.currentTime ?? 0,
      isPlaying: audioRef.current
        ? !audioRef.current.paused && !audioRef.current.ended
        : false,
      playbackSpeed: audioRef.current?.playbackRate ?? 1,
      selectionText: selectedText,
      isEditingMetadata,
    });
    // The editable buffer is the plain in-flight text; the surface `content`
    // baseline must reflect what the user is editing, not the timecoded
    // display join. Keep every rich custom value, override only `content`.
    contextData.content = text;
    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: el
        ? { type: "editable", element: el, start, end }
        : null,
      contextData,
    });
  }, [activeTranscript, editContent, isEditingMetadata]);

  const transcriptExtraSections = createTranscriptsExtraSections({
    getTranscriptText: () => plainTranscriptText,
  });

  // Playback speed options
  const speedOptions = [0.75, 1, 1.25, 1.5, 1.75, 2, 3];

  // Get signed URL for audio. The handler auto-refreshes before expiry.
  const audioSource: FileSource | null = activeTranscript?.audio_file_path
    ? { kind: "file_id", fileId: activeTranscript.audio_file_path }
    : null;
  const audioUrl = useFileSrc(audioSource);
  const isLoadingUrl = !audioUrl && !!audioSource;
  const urlError: string | null = null;

  useEffect(() => {
    if (activeTranscript) {
      setEditTitle(activeTranscript.title);
      setEditDescription(activeTranscript.description);
      setIsEditingContent(false);
      setEditContent("");
      setCopiedAll(false);
      // Reset player when transcript changes
      setIsPlaying(false);
      setCurrentTime(0);
      setPlaybackSpeed(1);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.playbackRate = 1;
      }
    }
  }, [activeTranscript]);

  const handleUpdateMetadata = async () => {
    if (!activeTranscript) return;

    try {
      await updateTranscript(activeTranscript.id, {
        title: editTitle,
        description: editDescription,
      });
      setIsEditingMetadata(false);
      toast.success("Transcript details updated");
    } catch (error) {
      toast.error("Failed to update details");
    }
  };

  const handleUpdateSegments = async (segments: TranscriptSegment[]) => {
    if (!activeTranscript) return;

    try {
      await updateTranscript(activeTranscript.id, {
        segments: segments,
      });
      // Toast is handled by the viewer context menu mostly, but good to confirm
    } catch (error) {
      toast.error("Failed to update segments");
    }
  };

  // Audio Player Handlers
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.volume = value[0];
      setVolume(value[0]);
    }
  };

  const handleSpeedChange = (speed: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  };

  const formatSpeed = (speed: number) => {
    // Format speed consistently to avoid UI shifts
    if (speed === 1) return "1.0×";
    if (speed === 2) return "2.0×";
    if (speed === 3) return "3.0×";
    return `${speed.toFixed(2)}×`;
  };

  const handleTranscriptTimeClick = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const plainTranscriptText = React.useMemo(() => {
    if (!activeTranscript?.segments?.length) return "";
    return activeTranscript.segments.map((s) => s.text).join("\n\n");
  }, [activeTranscript]);

  const handleCopyAllText = async () => {
    if (!plainTranscriptText.trim()) return;
    try {
      await copyToClipboard(plainTranscriptText, {
        onSuccess: () => {
          setCopiedAll(true);
          toast.success("Transcript copied");
          setTimeout(() => setCopiedAll(false), 2000);
        },
        onError: () => toast.error("Failed to copy"),
      });
    } catch {
      toast.error("Failed to copy");
    }
  };

  const startContentEdit = () => {
    setEditContent(plainTranscriptText);
    setIsEditingContent(true);
  };

  // Insert agent output relative to the caret in the inline content editor.
  const insertEditContent = (text: string, position: "before" | "after") => {
    const ta = editContentRef.current;
    const base = ta?.value ?? editContent;
    const start = ta?.selectionStart ?? base.length;
    const end = ta?.selectionEnd ?? base.length;
    const next =
      position === "before"
        ? `${base.slice(0, start)}${text}\n\n${base.slice(start)}`
        : `${base.slice(0, end)}\n\n${text}${base.slice(end)}`;
    setEditContent(next);
  };

  const handleSaveContent = async () => {
    if (!activeTranscript) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      toast.error("Transcript text cannot be empty");
      return;
    }
    setContentSaveBusy(true);
    try {
      let updatedSegments;
      if (activeTranscript.segments.length <= 1) {
        const base = activeTranscript.segments[0] ?? {
          id: String(Date.now()),
          timecode: "0:00",
          seconds: 0,
          text: "",
        };
        updatedSegments = [{ ...base, text: trimmed }];
      } else {
        const parts = trimmed.split(/\n\n+/).filter(Boolean);
        updatedSegments = activeTranscript.segments.map((seg, i) => ({
          ...seg,
          text: parts[i] ?? seg.text,
        }));
      }
      await updateTranscript(activeTranscript.id, {
        segments: updatedSegments,
      });
      setIsEditingContent(false);
      toast.success("Transcript updated");
    } catch {
      toast.error("Failed to update transcript");
    } finally {
      setContentSaveBusy(false);
    }
  };

  // Construct the transcript content string for the viewer if segments exist
  const transcriptContent = React.useMemo(() => {
    if (!activeTranscript?.segments) return "";
    // Reconstruct content from segments for the viewer
    return activeTranscript.segments
      .map((s) => {
        let line = `[${s.timecode}]`;
        if (s.speaker) line += ` ${s.speaker}:`;
        line += ` ${s.text}`;
        return line;
      })
      .join("\n\n");
  }, [activeTranscript]);

  if (!activeTranscript) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground bg-background">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <p>Select a transcript to view</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border shrink-0">
        {isEditingMetadata ? (
          <div className="space-y-3">
            <ProInput
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="font-semibold text-base md:text-lg"
              aria-label="Transcript title"
            />
            <ProTextarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Description"
              rows={2}
              className="text-sm"
              // ProTextarea has no built-in iOS 16px guard; keep ≥16px so iOS
              // Safari doesn't auto-zoom on focus (text-sm renders at 14px).
              style={{ fontSize: "16px" }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdateMetadata}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditingMetadata(false)}
              >
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {activeTranscript.title}
              </h1>
              {activeTranscript.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {activeTranscript.description}
                </p>
              )}
              <div className="flex gap-2 mt-2">
                {activeTranscript.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <ReferenceCopyButton
                referenceType="transcript"
                id={activeTranscript.id}
                label={activeTranscript.title}
                toastLabel={activeTranscript.title}
                size="sm"
              />
              {plainTranscriptText.trim().length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Copy transcript text"
                  onClick={() => void handleCopyAllText()}
                >
                  {copiedAll ? (
                    <CheckCheck className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              )}
              {plainTranscriptText.trim().length > 0 && !isEditingContent && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Edit transcript text"
                  onClick={startContentEdit}
                >
                  <FileText className="h-4 w-4" />
                </Button>
              )}
              {transcriptContent.trim().length > 0 && (
                <ContentActionBar
                  content={transcriptContent}
                  title={activeTranscript.title}
                  metadata={{
                    source: "transcripts",
                    transcript_id: activeTranscript.id,
                    description: activeTranscript.description,
                    tags: activeTranscript.tags,
                  }}
                  instanceKey={`transcript-${activeTranscript.id}`}
                  hideSpeaker
                  hidePencil
                />
              )}
              <PromoteToStudioButton transcript={activeTranscript} />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Edit title & description"
                onClick={() => setIsEditingMetadata(true)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Audio Player */}
      {activeTranscript.source_type === "audio" && (
        <div className="px-4 md:px-6 py-2 md:py-3 bg-muted/50 border-b border-border shrink-0">
          <div className="flex flex-col gap-2">
            {/* Hidden Audio Element */}
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
              />
            )}

            <div className="flex items-center gap-2 md:gap-4">
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9 md:h-10 md:w-10 rounded-full shrink-0"
                onClick={togglePlay}
                disabled={!audioUrl}
              >
                {isLoadingUrl ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 ml-0.5" />
                )}
              </Button>

              {/* Playback Speed Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 px-2 md:px-3 shrink-0 font-mono text-xs md:text-sm min-w-[52px] md:min-w-[60px]"
                    disabled={!audioUrl}
                    title="Playback speed"
                  >
                    <Gauge className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1 md:mr-1.5" />
                    {formatSpeed(playbackSpeed)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[140px]">
                  {speedOptions.map((speed) => (
                    <DropdownMenuItem
                      key={speed}
                      onSelect={() => handleSpeedChange(speed)}
                      className="font-mono cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>{formatSpeed(speed)}</span>
                        {playbackSpeed === speed && (
                          <Check className="h-4 w-4 ml-2 text-primary" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
                <Slider
                  value={[currentTime]}
                  max={duration || 100}
                  step={0.1}
                  onValueChange={handleSeek}
                  className="cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Volume Control - Hidden on mobile */}
              <div className="hidden sm:flex items-center gap-2 w-20 md:w-24 shrink-0">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <Slider
                  value={[volume]}
                  max={1}
                  step={0.1}
                  onValueChange={handleVolumeChange}
                />
              </div>

              {activeTranscript.audio_file_path &&
                !audioUrl &&
                !isLoadingUrl && (
                  <div className="text-xs text-red-500 flex items-center shrink-0">
                    <X className="h-3 w-3 mr-1" />
                    Failed to load audio
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div
        ref={segmentContainerRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/30 pb-safe"
      >
        {isEditingContent ? (
          <div className="max-w-3xl mx-auto space-y-3">
            <UnifiedAgentContextMenu
              {...TRANSCRIPTS_CONTEXT_MENU_PROPS}
              isEditable
              getTextarea={() => editContentRef.current}
              getApplicationScope={getEditorApplicationScope}
              onTextReplace={setEditContent}
              onTextInsertBefore={(text) => insertEditContent(text, "before")}
              onTextInsertAfter={(text) => insertEditContent(text, "after")}
              extraSections={transcriptExtraSections}
              contextData={surfaceScope as unknown as Record<string, unknown>}
            >
              <ProTextarea
                ref={editContentRef}
                surfaceName={TRANSCRIPTS_CONTEXT_MENU_PROPS.surfaceName}
                getApplicationScope={getEditorApplicationScope}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={16}
                className="text-sm leading-relaxed min-h-[40dvh] resize-y"
                disabled={contentSaveBusy}
                // ProTextarea has no built-in iOS 16px guard; keep ≥16px so iOS
                // Safari doesn't auto-zoom on focus (text-sm renders at 14px).
                style={{ fontSize: "16px" }}
              />
            </UnifiedAgentContextMenu>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void handleSaveContent()}
                disabled={contentSaveBusy}
              >
                {contentSaveBusy ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={contentSaveBusy}
                onClick={() => {
                  setIsEditingContent(false);
                  setEditContent("");
                }}
              >
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <UnifiedAgentContextMenu
            {...TRANSCRIPTS_CONTEXT_MENU_PROPS}
            isEditable={false}
            getApplicationScope={getViewerApplicationScope}
            extraSections={transcriptExtraSections}
            // ApplicationScope.context is typed as object; the menu's
            // contextData.context is string. We don't populate `context`
            // here either way — surface values flow through the index
            // signature — so widen at the boundary.
            contextData={surfaceScope as unknown as Record<string, unknown>}
          >
            <Card className="border-0 shadow-none bg-transparent">
              <CardContent className="p-0">
                <AdvancedTranscriptViewer
                  content={transcriptContent}
                  hideTitle={true}
                  transcriptId={activeTranscript?.id}
                  onUpdateTranscript={handleUpdateSegments}
                  onTimeClick={handleTranscriptTimeClick}
                  currentTime={currentTime}
                  showInlineActions
                />
              </CardContent>
            </Card>
          </UnifiedAgentContextMenu>
        )}
      </div>
    </div>
  );
}
