// THE SHAPES COME FROM THE REGISTRY (`pnpm shape:types`) — this file never
// re-declares a registered kind's fields (`check:kind-type-twins`).
import type { TranscriptSegment as TranscriptSegmentKind } from "@/features/content-ir/kinds/generated/kinds.generated";
import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

import { 
  Search, 
  Copy, 
  ArrowDown, 
  ArrowUp, 
  Clock,
  MessageSquare,
  CheckCheck,
  ChevronsUpDown,
  FileText,
  AlignJustify
} from 'lucide-react';

// Define TypeScript types
type TranscriptSegment = Omit<
  TranscriptSegmentKind,
  "__kind" | "speaker" | "isHighlighted"
> & {
  speaker?: string;
  isHighlighted?: boolean;
};

type TranscriptViewerProps = {
  content: string;
  hideTitle?: boolean;
  onTimeClick?: (seconds: number) => void;
  onCopySegment?: (text: string) => void;
  maxHeight?: string;
};

type TranscriptStats = {
  segmentCount: number;
  totalDuration: number;
  wordCount: number;
  charCount: number;
};

const TranscriptViewer = ({
  content,
  hideTitle = false,
  onTimeClick = () => {},
  onCopySegment = () => {},
  maxHeight = '500px'
}: TranscriptViewerProps) => {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [showTimecodes, setShowTimecodes] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const [isCompactView, setIsCompactView] = useState(false);
  const [copiedSegmentId, setCopiedSegmentId] = useState<string | null>(null);
  const [stats, setStats] = useState<TranscriptStats>({ 
    segmentCount: 0, 
    totalDuration: 0, 
    wordCount: 0, 
    charCount: 0 
  });
  
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
      
      parsedTranscript.forEach(segment => {
        const words = segment.text.trim().split(/\s+/).filter(word => word.length > 0);
        wordCount += words.length;
        charCount += segment.text.length;
      });
      
      setStats({
        segmentCount: parsedTranscript.length,
        totalDuration,
        wordCount,
        charCount
      });
    }
  }, [content]);
  
  // Parse transcript content from markdown code block
  const parseTranscriptContent = (rawContent: string): TranscriptSegment[] => {
    // Extract the content between the ```transcript and ``` markers
    const transcriptMatch = rawContent.match(/```transcript\s*([\s\S]*?)\s*```/);
    if (!transcriptMatch || !transcriptMatch[1]) return [];
    
    const transcriptContent = transcriptMatch[1];
    const lines = transcriptContent.split('\n');
    
    let segments: TranscriptSegment[] = [];
    let currentSegment: Partial<TranscriptSegment> = {};
    let buffer = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines or title lines
      if (line === '' || line.startsWith('**Audio Transcription**')) continue;
      
      // Check if line contains a timecode [MM:SS] or [HH:MM:SS]
      const timecodeMatch = line.match(/^\[(\d+):(\d+)(?::(\d+))?\]/);
      
      if (timecodeMatch) {
        // If we have accumulated text, save the previous segment
        if (buffer.trim() && currentSegment.timecode) {
          segments.push({
            id: `segment-${segments.length}`,
            timecode: currentSegment.timecode || '',
            seconds: currentSegment.seconds || 0,
            text: buffer.trim(),
            speaker: currentSegment.speaker
          });
          buffer = '';
        }
        
        // Parse the timecode - handle both MM:SS and HH:MM:SS formats
        let hours = 0;
        let minutes = 0;
        let seconds = 0;
        
        if (timecodeMatch[3]) { // HH:MM:SS format
          hours = parseInt(timecodeMatch[1], 10);
          minutes = parseInt(timecodeMatch[2], 10);
          seconds = parseInt(timecodeMatch[3], 10);
        } else { // MM:SS format
          minutes = parseInt(timecodeMatch[1], 10);
          seconds = parseInt(timecodeMatch[2], 10);
        }
        
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        
        // Format timecode string based on presence of hours
        let timecodeStr = '';
        if (hours > 0) {
          timecodeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
          timecodeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Start a new segment
        currentSegment = {
          timecode: timecodeStr,
          seconds: totalSeconds
        };
        
        // Extract any speaker info or additional text on the same line
        const restOfLine = line.replace(timecodeMatch[0], '').trim();
        
        if (restOfLine) {
          // Check for speaker pattern like "Speaker A:" or similar
          const speakerMatch = restOfLine.match(/^([^:]+):\s*/);
          
          // Also check for bold format like **Speaker**
          const boldSpeakerMatch = restOfLine.match(/^(\*\*[^*]+\*\*)/);
          
          if (speakerMatch) {
            currentSegment.speaker = speakerMatch[1].trim();
            buffer += restOfLine.substring(speakerMatch[0].length) + ' ';
          } else if (boldSpeakerMatch) {
            currentSegment.speaker = boldSpeakerMatch[1].replace(/\*/g, '').trim();
            buffer += restOfLine.replace(boldSpeakerMatch[0], '') + ' ';
          } else {
            buffer += restOfLine + ' ';
          }
        }
      } else {
        // Continue with the current segment
        buffer += line + ' ';
      }
    }
    
    // Don't forget the last segment
    if (buffer.trim() && currentSegment.timecode) {
      segments.push({
        id: `segment-${segments.length}`,
        timecode: currentSegment.timecode || '',
        seconds: currentSegment.seconds || 0,
        text: buffer.trim(),
        speaker: currentSegment.speaker
      });
    }
    
    return segments;
  };
  
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
          behavior: 'smooth',
          block: 'center'
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
    
    const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
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
  
  // Highlight search terms in text
  const highlightSearchTerm = (text: string): React.ReactNode => {
    if (!searchTerm.trim()) return <>{text}</>;
    
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    
    return (
      <>
        {parts.map((part, i) => (
          part.toLowerCase() === searchTerm.toLowerCase() ? (
            <span key={i} className="bg-yellow-200 dark:bg-yellow-900 px-0.5 rounded">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        ))}
      </>
    );
  };
  
  // Format time for display
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <TooltipProvider>
      <Card className="w-full">
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
                    {searchResults.length > 0 ? 
                      `${currentSearchIndex + 1}/${searchResults.length}` : 
                      '0/0'}
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
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 gap-1"
                  onClick={() => setIsCompactView(!isCompactView)}
                >
                  {isCompactView ? (
                    <>
                      <AlignJustify className="h-3.5 w-3.5" />
                      Detailed View
                    </>
                  ) : (
                    <>
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                      Compact View
                    </>
                  )}
                </Button>
              </div>
              
              <div className="flex gap-3 text-xs text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatTime(stats.totalDuration)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Total duration</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{stats.segmentCount} segments</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Number of transcript segments</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      <FileText className="h-3.5 w-3.5" />
                      <span>{stats.wordCount.toLocaleString()} words</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Total word count</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center hidden sm:flex">
                      <span>{stats.charCount.toLocaleString()} chars</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Total character count</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-2">
          <div className="space-y-4">
            {transcript.map((segment, index) => {
              const isSearchResult = searchResults.includes(index);
              const isCurrentSearchResult = isSearchResult && searchResults[currentSearchIndex] === index;
              
              return (
                <div
                  key={segment.id}
                  ref={el => { segmentRefs.current[segment.id] = el }}
                  className={`relative rounded-md transition-colors ${
                    isCurrentSearchResult 
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' 
                      : isSearchResult
                      ? 'bg-yellow-50/50 dark:bg-yellow-900/10'
                      : 'group hover:bg-accent/50'
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
                          onClick={() => handleTimeClick(segment.seconds)}
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
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleCopySegment(segment.text, segment.id)}
                    >
                      {copiedSegmentId === segment.id ? (
                        <CheckCheck className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  
                  {/* Line separator */}
                  <Separator className="my-1" />
                  
                  {/* Transcript text */}
                  <div className="px-3 pb-2 pt-1">
                    <div className={`text-sm ${isCompactView ? 'line-clamp-2' : ''}`}>
                      {highlightSearchTerm(segment.text)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default TranscriptViewer;