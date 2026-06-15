import { useState, useEffect, useRef } from "react";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { parseTranscriptContent } from "./transcript-parser";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu/context-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Copy,
  ArrowDown,
  ArrowUp,
  Clock,
  MessageSquare,
  CheckCheck,
  FileText,
  AlignJustify,
  TextIcon,
  Edit,
  Scissors,
  Trash,
  UserRound,
  MergeIcon,
  CopyCheck,
  Link,
  ChevronsUpDown,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

// Define TypeScript types
export type TranscriptSegment = {
  id: string;
  timecode: string;
  seconds: number;
  text: string;
  speaker?: string;
  isHighlighted?: boolean;
};

export type ViewMode = "detailed" | "compact" | "text-only";

export type TranscriptViewerProps = {
  content: string;
  hideTitle?: boolean;
  onTimeClick?: (seconds: number) => void;
  onCopySegment?: (text: string) => void;
  onUpdateTranscript?: (segments: TranscriptSegment[]) => void;
  readOnly?: boolean;
  currentTime?: number;
  /** When true, copy + edit icons stay visible (not hover-only). */
  showInlineActions?: boolean;
};

export type TranscriptStats = {
  segmentCount: number;
  totalDuration: number;
  wordCount: number;
  charCount: number;
};

// Extracted component to handle individual segment rendering and hooks correctly
type TranscriptSegmentItemProps = {
  segment: TranscriptSegment;
  nextSegment?: TranscriptSegment;
  index: number;
  isActive: boolean;
  isSearchResult: boolean;
  isCurrentSearchResult: boolean;
  viewMode: ViewMode;
  readOnly: boolean;
  showTimecodes: boolean;
  copiedSegmentId: string | null;
  searchTerm: string;
  isLastSegment: boolean;
  showInlineActions: boolean;
  onTimeClick: (seconds: number) => void;
  onEdit: (segment: TranscriptSegment) => void;
  onSplit: (segment: TranscriptSegment) => void;
  onMerge: (segmentId: string) => void;
  onCopy: (text: string, id: string) => void;
  onDelete: (id: string) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
};

const TranscriptSegmentItem = React.memo(
  ({
    segment,
    nextSegment,
    index,
    isActive,
    isSearchResult,
    isCurrentSearchResult,
    viewMode,
    readOnly,
    showTimecodes,
    copiedSegmentId,
    searchTerm,
    isLastSegment,
    onTimeClick,
    onEdit,
    onSplit,
    onMerge,
    onCopy,
    onDelete,
    registerRef,
    showInlineActions,
  }: TranscriptSegmentItemProps) => {
    const itemRef = useRef<HTMLDivElement | null>(null);

    // Auto-scroll to active segment if it changes
    useEffect(() => {
      if (isActive && itemRef.current) {
        itemRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, [isActive]);

    // Combined ref callback to handle both local ref and parent ref registration
    const setRef = (el: HTMLDivElement | null) => {
      itemRef.current = el;
      registerRef(segment.id, el);
    };

    // Highlight search terms
    const highlightSearchTerm = (text: string): React.ReactNode => {
      if (!searchTerm.trim()) return <>{text}</>;

      const parts = text.split(new RegExp(`(${searchTerm})`, "gi"));

      return (
        <>
          {parts.map((part, i) =>
            part.toLowerCase() === searchTerm.toLowerCase() ? (
              <span
                key={i}
                className="bg-yellow-200 dark:bg-yellow-900 px-0.5 rounded"
              >
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </>
      );
    };

    // Text-only view
    if (viewMode === "text-only") {
      return (
        <div
          key={segment.id}
          ref={setRef}
          className={`relative px-3 py-2 transition-colors ${
            isActive
              ? "bg-blue-100 dark:bg-blue-900/30 border-l-4 border-blue-500 rounded-r"
              : isCurrentSearchResult
                ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                : isSearchResult
                  ? "bg-yellow-50/50 dark:bg-yellow-900/10"
                  : "hover:bg-accent/20"
          }`}
        >
          <p className="text-sm">{highlightSearchTerm(segment.text)}</p>
        </div>
      );
    }

    // Detailed/Compact view
    return (
      <ContextMenu key={segment.id}>
        <ContextMenuTrigger disabled={readOnly}>
          <div
            ref={setRef}
            className={`relative rounded-md transition-colors ${
              isActive
                ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 shadow-sm"
                : isCurrentSearchResult
                  ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                  : isSearchResult
                    ? "bg-yellow-50/50 dark:bg-yellow-900/10"
                    : "group hover:bg-accent/50"
            }`}
          >
            {/* Header with timecode and speaker */}
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <div className="flex items-center gap-2">
                {showTimecodes && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 font-mono text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => onTimeClick(segment.seconds)}
                  >
                    <Clock className="mr-1 h-3 w-3" />
                    {segment.timecode}
                  </Button>
                )}

                {segment.speaker && (
                  <Badge variant="outline" className="font-normal text-primary">
                    {segment.speaker}
                  </Badge>
                )}
              </div>

              <div
                className={cn(
                  "flex items-center gap-1 transition-opacity",
                  showInlineActions
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100",
                )}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => onCopy(segment.text, segment.id)}
                    >
                      {copiedSegmentId === segment.id ? (
                        <CheckCheck className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy text</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => onEdit(segment)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit segment</TooltipContent>
                </Tooltip>
                {!showInlineActions && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onSplit(segment)}
                        >
                          <Scissors className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Split Segment</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onMerge(segment.id)}
                          disabled={isLastSegment}
                        >
                          <MergeIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Merge with Next</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            const timeText = `${window.location.href.split("#")[0]}#t=${segment.seconds}`;
                            navigator.clipboard.writeText(timeText);
                          }}
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy Timestamp Link</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => onDelete(segment.id)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete Segment</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>

            {/* Line separator */}
            <Separator className="my-1" />

            {/* Transcript text */}
            <div className="px-3 pb-2 pt-1">
              <div
                className={`text-sm ${viewMode === "compact" ? "line-clamp-2" : ""}`}
              >
                {highlightSearchTerm(segment.text)}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        {!readOnly && (
          <ContextMenuContent className="w-48">
            <ContextMenuItem onClick={() => onEdit(segment)}>
              <Edit className="h-4 w-4 mr-2" /> Edit Segment
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onSplit(segment)}>
              <Scissors className="h-4 w-4 mr-2" /> Split Segment
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onMerge(segment.id)}
              disabled={isLastSegment}
            >
              <MergeIcon className="h-4 w-4 mr-2" /> Merge with Next
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onCopy(segment.text, segment.id)}>
              <Copy className="h-4 w-4 mr-2" /> Copy Text
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                const timeText = `${window.location.href.split("#")[0]}#t=${segment.seconds}`;
                navigator.clipboard.writeText(timeText);
              }}
            >
              <Link className="h-4 w-4 mr-2" /> Timestamp Link
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onDelete(segment.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash className="h-4 w-4 mr-2" /> Delete Segment
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>
    );
  },
);
TranscriptSegmentItem.displayName = "TranscriptSegmentItem";

const formatTime = (seconds: number) => {
  if (!seconds && seconds !== 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const AdvancedTranscriptViewer = ({
  content,
  hideTitle = false,
  onTimeClick = () => {},
  onCopySegment = () => {},
  onUpdateTranscript = () => {},
  readOnly = false,
  currentTime = -1,
  showInlineActions = false,
}: TranscriptViewerProps) => {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [showTimecodes, setShowTimecodes] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const [viewMode, setViewMode] = useState<ViewMode>("detailed");
  const [copiedSegmentId, setCopiedSegmentId] = useState<string | null>(null);
  const [stats, setStats] = useState<TranscriptStats>({
    segmentCount: 0,
    totalDuration: 0,
    wordCount: 0,
    charCount: 0,
  });

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSegment, setEditingSegment] =
    useState<TranscriptSegment | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editSpeaker, setEditSpeaker] = useState("");

  // Split modal state
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitSegment, setSplitSegment] = useState<TranscriptSegment | null>(
    null,
  );
  const [splitPosition, setSplitPosition] = useState(0);
  const [splitPreview, setSplitPreview] = useState<{
    before: string;
    after: string;
  }>({ before: "", after: "" });
  const [neverMidWord, setNeverMidWord] = useState(true);
  const [neverMidSentence, setNeverMidSentence] = useState(true);
  // Copy all dialog state
  const [isCopyAllOpen, setIsCopyAllOpen] = useState(false);
  const [copyFormat, setCopyFormat] = useState<
    "text-only" | "with-timestamps" | "complete"
  >("text-only");
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);

  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Parse transcript content
  useEffect(() => {
    if (!content) return;

    const parsedTranscript = parseTranscriptContent(content);
    setTranscript(parsedTranscript);

    // Calculate stats
    if (parsedTranscript.length > 0) {
      const lastSegment = parsedTranscript[parsedTranscript.length - 1];
      const totalDuration = lastSegment.seconds;

      let wordCount = 0;
      let charCount = 0;

      parsedTranscript.forEach((segment) => {
        const words = segment.text
          .trim()
          .split(/\s+/)
          .filter((word) => word.length > 0);
        wordCount += words.length;
        charCount += segment.text.length;
      });

      setStats({
        segmentCount: parsedTranscript.length,
        totalDuration,
        wordCount,
        charCount,
      });
    }
  }, [content]);

  // Search functionality
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }

    const results: number[] = [];
    const term = searchTerm.toLowerCase();

    transcript.forEach((segment, index) => {
      if (segment.text.toLowerCase().includes(term)) {
        results.push(index);
      }
    });

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);
  }, [searchTerm, transcript]);

  // Scroll to the current search result
  useEffect(() => {
    if (currentSearchIndex >= 0 && searchResults.length > 0) {
      const segmentIndex = searchResults[currentSearchIndex];
      const segment = transcript[segmentIndex];

      if (segment && segmentRefs.current[segment.id]) {
        segmentRefs.current[segment.id]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [currentSearchIndex, searchResults, transcript]);

  // Navigate search results
  const goToNextSearchResult = () => {
    if (searchResults.length === 0) return;

    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
  };

  const goToPrevSearchResult = () => {
    if (searchResults.length === 0) return;

    const prevIndex =
      (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
  };

  // Handle time click
  const handleTimeClick = (seconds: number) => {
    onTimeClick(seconds);
  };

  // Copy segment text
  const handleCopySegment = (text: string, id: string) => {
    onCopySegment(text);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSegmentId(id);
      setTimeout(() => setCopiedSegmentId(null), 2000);
    });
  };

  // Copy all transcript text
  const formatTranscriptForCopy = (
    format: "text-only" | "with-timestamps" | "complete",
  ): string => {
    let result = "";

    switch (format) {
      case "text-only":
        // Just the text with paragraph breaks
        result = transcript.map((segment) => segment.text).join("\n\n");
        break;

      case "with-timestamps":
        // Timestamps and text
        result = transcript
          .map((segment) => `[${segment.timecode}] ${segment.text}`)
          .join("\n\n");
        break;

      case "complete":
        // Full format with timestamps and speakers when available
        result = transcript
          .map((segment) => {
            let line = `[${segment.timecode}]`;
            if (segment.speaker) {
              line += ` ${segment.speaker}:`;
            }
            return `${line} ${segment.text}`;
          })
          .join("\n\n");
        break;
    }

    return result;
  };

  const handleCopyAll = () => {
    const textToCopy = formatTranscriptForCopy(copyFormat);
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopyAllSuccess(true);
      setTimeout(() => {
        setCopyAllSuccess(false);
        setIsCopyAllOpen(false);
      }, 1500);
    });
  };

  // Editing functions
  const openEditModal = (segment: TranscriptSegment) => {
    setEditingSegment(segment);
    setEditValue(segment.text);
    setEditSpeaker(segment.speaker || "");
    setIsEditModalOpen(true);
  };

  const handleEditSave = () => {
    if (!editingSegment || !editValue.trim()) {
      setIsEditModalOpen(false);
      return;
    }

    const updatedTranscript = transcript.map((segment) =>
      segment.id === editingSegment.id
        ? {
            ...segment,
            text: editValue.trim(),
            speaker: editSpeaker || undefined,
          }
        : segment,
    );

    setTranscript(updatedTranscript);
    onUpdateTranscript(updatedTranscript);
    setIsEditModalOpen(false);
  };

  // Split segment functions
  const openSplitModal = (segment: TranscriptSegment) => {
    setSplitSegment(segment);
    // Default to splitting in the middle
    const splitPos = Math.floor(segment.text.length / 2);
    setSplitPosition(splitPos);
    setSplitPreview({
      before: segment.text.substring(0, splitPos),
      after: segment.text.substring(splitPos),
    });
    setIsSplitModalOpen(true);
  };

  const handleSplitPositionChange = (pos: number) => {
    setSplitPosition(pos);

    if (splitSegment) {
      // Find the appropriate split position based on current settings
      let adjustedPos = pos;
      const text = splitSegment.text;

      if (neverMidWord) {
        // Find nearest word boundary logic (as in previous solution)
        const isAtWordBoundary =
          /\s/.test(text[pos]) || /\s/.test(text[pos - 1]);

        if (!isAtWordBoundary) {
          const prevSpace = text.lastIndexOf(" ", pos);
          const nextSpace = text.indexOf(" ", pos);

          if (
            nextSpace !== -1 &&
            (prevSpace === -1 || pos - prevSpace > nextSpace - pos)
          ) {
            adjustedPos = nextSpace;
          } else if (prevSpace !== -1) {
            adjustedPos = prevSpace + 1;
          }
        }
      }

      if (neverMidSentence) {
        // Find nearest sentence boundary
        // Look for period, question mark, or exclamation mark followed by a space or end of text
        const sentenceEndRegex = /[.!?](\s|$)/g;
        let match;
        let prevSentenceEnd = -1;
        let nextSentenceEnd = -1;

        // Find the last sentence end before position
        while ((match = sentenceEndRegex.exec(text)) !== null) {
          if (match.index < adjustedPos) {
            prevSentenceEnd = match.index + 1; // +1 to include the punctuation
          } else {
            nextSentenceEnd = match.index + 1;
            break;
          }
        }

        // Reset regex to find next sentence end if needed
        if (nextSentenceEnd === -1) {
          sentenceEndRegex.lastIndex = 0;
          while ((match = sentenceEndRegex.exec(text)) !== null) {
            if (match.index >= adjustedPos) {
              nextSentenceEnd = match.index + 1;
              break;
            }
          }
        }

        // Choose the closer sentence boundary
        if (prevSentenceEnd !== -1 && nextSentenceEnd !== -1) {
          adjustedPos =
            adjustedPos - prevSentenceEnd < nextSentenceEnd - adjustedPos
              ? prevSentenceEnd
              : nextSentenceEnd;
        } else if (prevSentenceEnd !== -1) {
          adjustedPos = prevSentenceEnd;
        } else if (nextSentenceEnd !== -1) {
          adjustedPos = nextSentenceEnd;
        }
      }

      setSplitPosition(adjustedPos);
      setSplitPreview({
        before: text.substring(0, adjustedPos),
        after: text.substring(adjustedPos),
      });
    }
  };

  const handleSplitSave = () => {
    if (!splitSegment) {
      setIsSplitModalOpen(false);
      return;
    }

    const index = transcript.findIndex((s) => s.id === splitSegment.id);
    if (index === -1) {
      setIsSplitModalOpen(false);
      return;
    }

    // Create two new segments
    const firstSegment = {
      ...splitSegment,
      text: splitPreview.before.trim(),
    };

    const secondSegment = {
      ...splitSegment,
      id: `segment-split-${Date.now()}`,
      text: splitPreview.after.trim(),
    };

    // Replace the original segment with the two new ones
    const updatedTranscript = [
      ...transcript.slice(0, index),
      firstSegment,
      secondSegment,
      ...transcript.slice(index + 1),
    ];

    setTranscript(updatedTranscript);
    onUpdateTranscript(updatedTranscript);
    setIsSplitModalOpen(false);
  };

  // Delete segment function
  const handleDeleteSegment = (segmentId: string) => {
    if (confirm("Are you sure you want to delete this segment?")) {
      const updatedTranscript = transcript.filter(
        (segment) => segment.id !== segmentId,
      );
      setTranscript(updatedTranscript);
      onUpdateTranscript(updatedTranscript);
    }
  };

  // Merge with next segment function
  const handleMergeWithNext = (segmentId: string) => {
    const index = transcript.findIndex((s) => s.id === segmentId);
    if (index === -1 || index >= transcript.length - 1) return;

    const currentSegment = transcript[index];
    const nextSegment = transcript[index + 1];

    const mergedSegment = {
      ...currentSegment,
      text: `${currentSegment.text} ${nextSegment.text}`,
    };

    const updatedTranscript = [
      ...transcript.slice(0, index),
      mergedSegment,
      ...transcript.slice(index + 2),
    ];

    setTranscript(updatedTranscript);
    onUpdateTranscript(updatedTranscript);
  };

  // Render all segments
  const renderTranscriptContent = () => {
    const content = (
      <>
        {transcript.map((segment, index) => {
          const isSearchResult = searchResults.includes(index);
          const isCurrentSearchResult =
            isSearchResult && searchResults[currentSearchIndex] === index;
          const nextSegment = transcript[index + 1];
          const isActive =
            currentTime >= 0 &&
            currentTime >= segment.seconds &&
            (!nextSegment || currentTime < nextSegment.seconds);

          return (
            <TranscriptSegmentItem
              key={segment.id}
              segment={segment}
              nextSegment={nextSegment}
              index={index}
              isActive={isActive}
              isSearchResult={isSearchResult}
              isCurrentSearchResult={isCurrentSearchResult}
              viewMode={viewMode}
              readOnly={readOnly}
              showTimecodes={showTimecodes}
              copiedSegmentId={copiedSegmentId}
              searchTerm={searchTerm}
              isLastSegment={index >= transcript.length - 1}
              showInlineActions={showInlineActions}
              onTimeClick={handleTimeClick}
              onEdit={openEditModal}
              onSplit={openSplitModal}
              onMerge={handleMergeWithNext}
              onCopy={handleCopySegment}
              onDelete={handleDeleteSegment}
              registerRef={(id, el) => {
                segmentRefs.current[id] = el;
              }}
            />
          );
        })}
      </>
    );

    if (viewMode === "text-only") {
      return (
        <div className="text-sm space-y-2 leading-relaxed bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100">
          {content}
        </div>
      );
    }

    return <div className="space-y-4">{content}</div>;
  };

  return (
    <TooltipProvider>
      <Card className="w-full bg-transparent border-0">
        <CardHeader className="pb-2">
          {!hideTitle && (
            <CardTitle>
              <div className="flex justify-between items-center">
                <span>Audio Transcription</span>
                <div className="flex items-center space-x-2 text-sm font-normal">
                  <span>Show timecodes</span>
                  <Switch
                    checked={showTimecodes}
                    onCheckedChange={setShowTimecodes}
                  />
                </div>
              </div>
            </CardTitle>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transcript..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-20"
              />
              {searchTerm && (
                <div className="absolute right-2 top-1.5 flex items-center gap-1">
                  <Badge variant="outline" className="h-7 px-2 font-mono">
                    {searchResults.length > 0
                      ? `${currentSearchIndex + 1}/${searchResults.length}`
                      : "0/0"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={goToPrevSearchResult}
                    disabled={searchResults.length === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={goToNextSearchResult}
                    disabled={searchResults.length === 0}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tabs
                  defaultValue="detailed"
                  value={viewMode}
                  onValueChange={(value) => setViewMode(value as ViewMode)}
                  className="w-auto"
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="detailed" className="h-7 px-2 text-xs">
                      <AlignJustify className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Detailed</span>
                    </TabsTrigger>
                    <TabsTrigger value="compact" className="h-7 px-2 text-xs">
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Compact</span>
                    </TabsTrigger>
                    <TabsTrigger value="text-only" className="h-7 px-2 text-xs">
                      <TextIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Text Only</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      onClick={() => setIsCopyAllOpen(true)}
                    >
                      <CopyCheck className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy all transcript text</TooltipContent>
                </Tooltip>
              </div>

              <div className="flex gap-3 text-xs text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <Clock className="h-3.5 w-3.5 pr-1" />
                      <span>{formatTime(stats.totalDuration)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Total duration</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <MessageSquare className="h-3.5 w-3.5 pr-1" />
                      <span>{stats.segmentCount} Segments</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Number of transcript segments</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <FileText className="h-3.5 w-3.5 pr-1" />
                      <span>{stats.wordCount.toLocaleString()} Words</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Total word count</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center hidden sm:flex">
                      <span>{stats.charCount.toLocaleString()} Chars</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Total character count</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </CardHeader>
        <Separator className="my-1" />
        <CardContent className="pt-0 bg-transparent border-t border-zinc-200 dark:border-zinc-700">
          {renderTranscriptContent()}
        </CardContent>
      </Card>

      {/* Edit Segment Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Transcript Segment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="speaker">Speaker (optional)</Label>
              <Input
                id="speaker"
                value={editSpeaker}
                onChange={(e) => setEditSpeaker(e.target.value)}
                placeholder="e.g. John Doe, Speaker A, Interviewer"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="segment-text">Segment Text</Label>
              <Textarea
                id="segment-text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={15}
              />
            </div>

            {editingSegment && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Time:</span>{" "}
                {editingSegment.timecode}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split Segment Modal */}
      <Dialog open={isSplitModalOpen} onOpenChange={setIsSplitModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Split Transcript Segment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {splitSegment && (
              <>
                <div className="space-y-1">
                  <Label>Original Segment</Label>
                  <div className="text-sm bg-muted p-2 rounded-md max-h-32 overflow-y-auto">
                    {splitSegment.text}
                  </div>
                </div>

                <div className="space-y-4">
                  <Label>Split Position: {splitPosition} characters</Label>
                  <Slider
                    value={[splitPosition]}
                    min={0}
                    max={splitSegment.text.length}
                    step={1}
                    onValueChange={(value) =>
                      handleSplitPositionChange(value[0])
                    }
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">First Part</Label>
                      <div className="text-sm bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md h-24 overflow-y-auto border border-blue-100 dark:border-blue-800">
                        {splitPreview.before}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Second Part</Label>
                      <div className="text-sm bg-green-50 dark:bg-green-900/20 p-2 rounded-md h-24 overflow-y-auto border border-green-100 dark:border-green-800">
                        {splitPreview.after}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="mid-word"
                        checked={neverMidWord}
                        onCheckedChange={setNeverMidWord}
                      />
                      <Label htmlFor="mid-word">
                        Snap to adjacent word boundary
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="mid-sentence"
                        checked={neverMidSentence}
                        onCheckedChange={setNeverMidSentence}
                      />
                      <Label htmlFor="mid-sentence">
                        Snap to adjacent sentence boundary
                      </Label>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSplitModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSplitSave}>Split</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy All Modal */}
      <Dialog open={isCopyAllOpen} onOpenChange={setIsCopyAllOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copy Transcript</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <RadioGroup
              value={copyFormat}
              onValueChange={(v) => setCopyFormat(v as any)}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="text-only" id="text-only" />
                <Label htmlFor="text-only">Text Only</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="with-timestamps" id="with-timestamps" />
                <Label htmlFor="with-timestamps">With Timestamps</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="complete" id="complete" />
                <Label htmlFor="complete">
                  Complete (Speakers & Timestamps)
                </Label>
              </div>
            </RadioGroup>

            <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
              {copyFormat === "text-only" &&
                "Copies the plain text of the transcript."}
              {copyFormat === "with-timestamps" &&
                "Copies text with timecodes [00:00]."}
              {copyFormat === "complete" &&
                "Copies updated text with timecodes and speaker labels."}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCopyAllOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCopyAll} disabled={copyAllSuccess}>
              {copyAllSuccess ? (
                <>
                  <CheckCheck className="mr-2 h-4 w-4" /> Copied!
                </>
              ) : (
                "Copy to Clipboard"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default AdvancedTranscriptViewer;
