'use client';

import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  Clock,
  ChevronRight,
  ChevronDown,
  Wrench,
  MessageSquareText,
  AlertCircle,
  BarChart3,
  Radio,
  Globe,
  FileText,
  Zap,
  Timer,
  Hash,
  ArrowRight,
  Copy,
  Check,
  Brain,
} from 'lucide-react';
import {
  TimestampedEvent,
  EventCategory,
  classifyEvent,
  groupByCategory,
  groupToolEventsById,
  categoryLabel,
  subTypeLabel,
  categoryColor,
  formatDuration,
} from './stream-event-classifier';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// ─── Props ───────────────────────────────────────────────────────────────────

interface StreamAnalyzerProps {
  /** Raw events from the NDJSON stream (parsed JSON objects) */
  rawEvents: Array<Record<string, unknown>>;
  /** Whether the stream is currently active */
  isStreaming: boolean;
  /** Epoch ms when stream started (set on submit click) */
  streamStartTime: number | null;
  /** Whether this tab is currently visible/active — controls expensive processing */
  isActive: boolean;
  /** Bumped each time a new event is added — triggers re-render */
  eventVersion: number;
}

// ─── Category icon map ───────────────────────────────────────────────────────

function CategoryIcon({ category, className }: { category: EventCategory; className?: string }) {
  const cn = className ?? 'h-3.5 w-3.5';
  switch (category) {
    case 'phase': return <Radio className={cn} />;
    case 'chunk': return <MessageSquareText className={cn} />;
    case 'reasoning_chunk': return <Brain className={cn} />;
    case 'tool_event': return <Wrench className={cn} />;
    case 'completion': return <BarChart3 className={cn} />;
    case 'data': return <BarChart3 className={cn} />;
    case 'error': return <AlertCircle className={cn} />;
    case 'end': return <Zap className={cn} />;
    case 'heartbeat': return <Activity className={cn} />;
    case 'broker': return <Globe className={cn} />;
    default: return <Activity className={cn} />;
  }
}

// ─── Category ordering (controls tab display order) ──────────────────────────

const CATEGORY_ORDER: EventCategory[] = [
  'phase',
  'chunk',
  'reasoning_chunk',
  'tool_event',
  'completion',
  'data',
  'error',
  'end',
  'heartbeat',
  'broker',
  'unknown',
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function StreamAnalyzer({ rawEvents, isStreaming, streamStartTime, isActive, eventVersion }: StreamAnalyzerProps) {
  // eventVersion is intentionally accepted as a prop — its value change triggers re-render
  // so the ref-based incremental classification below picks up new events
  void eventVersion;

  const [activeTab, setActiveTab] = useState<EventCategory | 'timeline' | 'tool_debug'>('timeline');
  const [hasEverBeenActive, setHasEverBeenActive] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  // Classify events — only process once this tab has been activated at least once
  const classifiedRef = useRef<TimestampedEvent[]>([]);
  const lastProcessedCount = useRef(0);

  // Track first activation — once active, stay active for processing
  useEffect(() => {
    if (isActive && !hasEverBeenActive) {
      setHasEverBeenActive(true);
    }
  }, [isActive, hasEverBeenActive]);

  // Live timer
  useEffect(() => {
    if (isStreaming && streamStartTime) {
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - streamStartTime);
      }, 50);
    } else if (!isStreaming && streamStartTime) {
      if (timerRef.current) clearInterval(timerRef.current);
      // Final elapsed
      setElapsedMs(rawEvents.length > 0
        ? (classifiedRef.current.length > 0
          ? classifiedRef.current[classifiedRef.current.length - 1].offsetMs
          : Date.now() - streamStartTime)
        : 0
      );
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedMs(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStreaming, streamStartTime, rawEvents.length]);

  // Incrementally classify new events (only after tab has been activated at least once)
  if (hasEverBeenActive && rawEvents.length > lastProcessedCount.current && streamStartTime) {
    const newEvents = rawEvents.slice(lastProcessedCount.current);
    for (const raw of newEvents) {
      // Use the event count as a rough time proxy during streaming;
      // the actual receivedAt is when we process the event here.
      const now = Date.now();
      classifiedRef.current.push(classifyEvent(raw, now, streamStartTime));
    }
    lastProcessedCount.current = rawEvents.length;
  }

  // Reset when stream restarts (rawEvents goes to 0)
  if (rawEvents.length === 0 && lastProcessedCount.current > 0) {
    classifiedRef.current = [];
    lastProcessedCount.current = 0;
  }

  const classified = classifiedRef.current;
  const grouped = groupByCategory(classified);

  // Determine which categories actually have events
  const presentCategories = CATEGORY_ORDER.filter(cat => (grouped[cat]?.length ?? 0) > 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ─── Timing Bar ─── */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
        <TimingBar
          streamStartTime={streamStartTime}
          elapsedMs={elapsedMs}
          isStreaming={isStreaming}
          totalEvents={classified.length}
          categoryCounts={Object.fromEntries(
            presentCategories.map(cat => [cat, grouped[cat]?.length ?? 0])
          )}
        />
        </div>
        <AnalyzerCopyButton rawEvents={rawEvents} />
      </div>

      {/* ─── Sub-tab navigation ─── */}
      <div className="flex-shrink-0 mt-2">
        <ScrollArea className="w-full">
          <div className="flex gap-1 pb-1">
            {/* Timeline is always the first tab */}
            <TabButton
              active={activeTab === 'timeline'}
              onClick={() => setActiveTab('timeline')}
              label="Timeline"
              icon={<Clock className="h-3 w-3" />}
              count={classified.length}
              colorClass="bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/25"
            />
            {/* Tool Debug tab */}
            <TabButton
              active={activeTab === 'tool_debug'}
              onClick={() => setActiveTab('tool_debug')}
              label="Tool Debug"
              icon={<Wrench className="h-3 w-3" />}
              count={grouped['tool_event']?.length ?? 0}
              colorClass="bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/25"
            />
            {presentCategories.map(cat => (
              <TabButton
                key={cat}
                active={activeTab === cat}
                onClick={() => setActiveTab(cat)}
                label={categoryLabel(cat)}
                icon={<CategoryIcon category={cat} className="h-3 w-3" />}
                count={grouped[cat]?.length ?? 0}
                colorClass={categoryColor(cat)}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* ─── Tab content ─── */}
      <div className="flex-1 min-h-0 mt-2 overflow-y-auto rounded border bg-muted/30 p-2">
        {activeTab === 'timeline' ? (
          <TimelineView events={classified} streamStartTime={streamStartTime} />
        ) : activeTab === 'tool_debug' ? (
          <ToolDebugView events={grouped['tool_event'] ?? []} />
        ) : (
          <CategoryView
            category={activeTab}
            events={grouped[activeTab] ?? []}
          />
        )}
      </div>
    </div>
  );
}

// ─── Analyzer Copy Button ────────────────────────────────────────────────────

function AnalyzerCopyButton({ rawEvents }: { rawEvents: Array<Record<string, unknown>> }) {
  const [copied, setCopied] = useState(false);
  const content = rawEvents.length > 0 ? JSON.stringify(rawEvents, null, 2) : '';

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Copied events to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs px-2 gap-1 flex-shrink-0"
      onClick={handleCopy}
      disabled={!content}
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy Events'}
    </Button>
  );
}

// ─── Timing Bar ──────────────────────────────────────────────────────────────

function TimingBar({
  streamStartTime,
  elapsedMs,
  isStreaming,
  totalEvents,
  categoryCounts,
}: {
  streamStartTime: number | null;
  elapsedMs: number;
  isStreaming: boolean;
  totalEvents: number;
  categoryCounts: Record<string, number>;
}) {
  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-2 py-1.5 rounded bg-card border text-xs font-mono">
      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        <div className={`h-2 w-2 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : streamStartTime ? 'bg-zinc-400' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
        <span className="text-muted-foreground">
          {isStreaming ? 'Streaming' : streamStartTime ? 'Complete' : 'Idle'}
        </span>
      </div>

      {/* Elapsed time */}
      <div className="flex items-center gap-1 text-foreground">
        <Timer className="h-3 w-3 text-muted-foreground" />
        <span className="font-semibold tabular-nums">{streamStartTime ? formatDuration(elapsedMs) : '--'}</span>
      </div>

      {/* Separator */}
      <div className="h-3 w-px bg-border" />

      {/* Total events */}
      <div className="flex items-center gap-1">
        <Hash className="h-3 w-3 text-muted-foreground" />
        <span className="tabular-nums">{totalEvents}</span>
        <span className="text-muted-foreground">events</span>
      </div>

      {/* Category mini-badges */}
      <div className="flex items-center gap-1 ml-auto">
        {Object.entries(categoryCounts).map(([cat, count]) => (
          <span
            key={cat}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${categoryColor(cat as EventCategory)}`}
          >
            <CategoryIcon category={cat as EventCategory} className="h-2.5 w-2.5" />
            {count}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Tab Button ──────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  label,
  icon,
  count,
  colorClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  count: number;
  colorClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all
        border whitespace-nowrap
        ${active
          ? `${colorClass} ring-1 ring-current/20 shadow-sm`
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
        }
      `}
    >
      {icon}
      {label}
      <span className={`ml-0.5 tabular-nums text-[10px] ${active ? 'opacity-80' : 'opacity-60'}`}>
        ({count})
      </span>
    </button>
  );
}

// ─── Timeline View ───────────────────────────────────────────────────────────

function TimelineView({ events, streamStartTime }: { events: TimestampedEvent[]; streamStartTime: number | null }) {
  if (events.length === 0) {
    return <EmptyState message="No events received yet. Click Run Test to start." />;
  }

  return (
    <div className="space-y-0.5">
      {events.map((evt, i) => (
        <div
          key={i}
          className="flex items-start gap-2 px-2 py-1 rounded hover:bg-muted/50 group text-xs font-mono"
        >
          {/* Timestamp */}
          <span className="flex-shrink-0 w-16 text-right tabular-nums text-muted-foreground">
            {formatDuration(evt.offsetMs)}
          </span>

          {/* Category badge */}
          <span className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${categoryColor(evt.category)}`}>
            <CategoryIcon category={evt.category} className="h-2.5 w-2.5" />
            {evt.category}
          </span>

          {/* Sub-type */}
          {evt.subType && (
            <span className="flex-shrink-0 text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
              {subTypeLabel(evt.subType)}
            </span>
          )}

          {/* Preview */}
          <span className="truncate text-muted-foreground group-hover:text-foreground transition-colors">
            {eventPreview(evt)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Category View (dispatches to specific renderers) ────────────────────────

function CategoryView({ category, events }: { category: EventCategory; events: TimestampedEvent[] }) {
  if (events.length === 0) {
    return <EmptyState message={`No ${categoryLabel(category).toLowerCase()} events received.`} />;
  }

  switch (category) {
    case 'chunk':
      return <ChunkCategoryView events={events} />;
    case 'reasoning_chunk':
      return <ReasoningChunkCategoryView events={events} />;
    case 'tool_event':
      return <ToolUpdateCategoryView events={events} />;
    case 'phase':
      return <StatusUpdateCategoryView events={events} />;
    case 'data':
      return <DataCategoryView events={events} />;
    case 'error':
      return <ErrorCategoryView events={events} />;
    default:
      return <GenericCategoryView events={events} />;
  }
}

// ─── Chunk Category View ─────────────────────────────────────────────────────

function ChunkCategoryView({ events }: { events: TimestampedEvent[] }) {
  const reasoning = events.filter(e => e.subType === 'chunk_reasoning');
  const content = events.filter(e => e.subType === 'chunk_content');

  // Build assembled text (new ChunkPayload shape: { text: string })
  const assembledContent = content.map(e => {
    const data = e.raw.data;
    if (typeof data === 'object' && data !== null && 'text' in data) {
      return (data as Record<string, unknown>).text as string;
    }
    return typeof data === 'string' ? data : '';
  }).join('');

  const assembledReasoning = reasoning.map(e => {
    const data = e.raw.data;
    if (typeof data === 'object' && data !== null && 'text' in data) {
      return (data as Record<string, unknown>).text as string;
    }
    return typeof data === 'string' ? data : '';
  }).join('');

  const firstChunkTime = events.length > 0 ? events[0].offsetMs : 0;
  const lastChunkTime = events.length > 0 ? events[events.length - 1].offsetMs : 0;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
        <span>{events.length} chunks</span>
        <span className="text-[10px]">|</span>
        <span>Content: {content.length}</span>
        <span>Reasoning: {reasoning.length}</span>
        <span className="text-[10px]">|</span>
        <span>First: {formatDuration(firstChunkTime)}</span>
        <ArrowRight className="h-3 w-3" />
        <span>Last: {formatDuration(lastChunkTime)}</span>
        <span className="text-[10px]">|</span>
        <span>Span: {formatDuration(lastChunkTime - firstChunkTime)}</span>
      </div>

      {/* Assembled content */}
      {assembledContent && (
        <CollapsibleSection title="Assembled Content" defaultOpen count={content.length}>
          <pre className="text-xs font-mono whitespace-pre-wrap text-foreground leading-relaxed">
            {assembledContent}
          </pre>
        </CollapsibleSection>
      )}

      {/* Assembled reasoning */}
      {assembledReasoning && (
        <CollapsibleSection title="Assembled Reasoning" defaultOpen={false} count={reasoning.length}>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground leading-relaxed italic">
            {assembledReasoning}
          </pre>
        </CollapsibleSection>
      )}

      {/* Raw chunks array */}
      <CollapsibleSection title="Raw Chunks (JSON)" defaultOpen={false} count={events.length}>
        <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-60 overflow-y-auto">
          {JSON.stringify(events.map(e => e.raw), null, 2)}
        </pre>
      </CollapsibleSection>
    </div>
  );
}

// ─── Reasoning chunk category (dedicated reasoning_chunk events from server) ─

function ReasoningChunkCategoryView({ events }: { events: TimestampedEvent[] }) {
  const assembled = events
    .map((e) => {
      const data = e.raw.data as Record<string, unknown>;
      return typeof data.text === 'string' ? data.text : '';
    })
    .join('');

  const firstTime = events.length > 0 ? events[0].offsetMs : 0;
  const lastTime = events.length > 0 ? events[events.length - 1].offsetMs : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
        <span>{events.length} reasoning chunks</span>
        <span className="text-[10px]">|</span>
        <span>First: {formatDuration(firstTime)}</span>
        <ArrowRight className="h-3 w-3" />
        <span>Last: {formatDuration(lastTime)}</span>
      </div>
      {assembled && (
        <CollapsibleSection title="Assembled reasoning" defaultOpen count={events.length}>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground leading-relaxed italic">
            {assembled}
          </pre>
        </CollapsibleSection>
      )}
      <CollapsibleSection title="Raw events (JSON)" defaultOpen={false} count={events.length}>
        <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-60 overflow-y-auto">
          {JSON.stringify(events.map((e) => e.raw), null, 2)}
        </pre>
      </CollapsibleSection>
    </div>
  );
}

// ─── Tool Update Category View ───────────────────────────────────────────────

function ToolUpdateCategoryView({ events }: { events: TimestampedEvent[] }) {
  const grouped = groupToolEventsById(events);

  return (
    <div className="space-y-3">
      <div className="text-xs font-mono text-muted-foreground">
        {events.length} tool events across {grouped.size} tool call{grouped.size !== 1 ? 's' : ''}
      </div>

      {Array.from(grouped.entries()).map(([groupId, groupEvents]) => (
        <ToolCallGroup key={groupId} groupId={groupId} events={groupEvents} />
      ))}
    </div>
  );
}

function ToolCallGroup({ groupId, events }: { groupId: string; events: TimestampedEvent[] }) {
  // Find key pieces of information
  const inputEvent = events.find(e => e.subType === 'tool_input');
  const outputEvent = events.find(e => e.subType === 'tool_output');
  const errorEvent = events.find(e => e.subType === 'tool_error');
  const progressEvents = events.filter(e => e.subType === 'tool_progress');
  const summaryEvent = events.find(e => e.subType === 'tool_web_summary');

  const toolName = inputEvent
    ? ((inputEvent.raw.data as Record<string, unknown>)?.tool_name as string) ?? 'Unknown Tool'
    : 'Unknown Tool';

  const firstTime = events[0]?.offsetMs ?? 0;
  const lastTime = events[events.length - 1]?.offsetMs ?? 0;
  const hasError = !!errorEvent;

  return (
    <Card className="p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-3.5 w-3.5 text-violet-500" />
          <span className="text-xs font-semibold">{toolName}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 font-mono">
            {groupId === '__ungrouped__' ? 'no-id' : groupId.substring(0, 20)}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <span>{events.length} events</span>
          <span>|</span>
          <span>{formatDuration(firstTime)} → {formatDuration(lastTime)}</span>
          <span>({formatDuration(lastTime - firstTime)})</span>
          {hasError && <Badge variant="destructive" className="text-[10px] px-1">Error</Badge>}
        </div>
      </div>

      {/* Tool Input */}
      {inputEvent && (
        <CollapsibleSection title="Input" defaultOpen count={1}>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify((inputEvent.raw.data as Record<string, unknown>)?.mcp_input, null, 2)}
          </pre>
        </CollapsibleSection>
      )}

      {/* Progress messages */}
      {progressEvents.length > 0 && (
        <CollapsibleSection title="Progress Messages" defaultOpen count={progressEvents.length}>
          <div className="space-y-0.5">
            {progressEvents.map((evt, i) => {
              const data = evt.raw.data as Record<string, unknown>;
              return (
                <div key={i} className="flex items-center gap-2 text-xs font-mono py-0.5">
                  <span className="text-[10px] text-muted-foreground tabular-nums w-14 text-right">
                    {formatDuration(evt.offsetMs)}
                  </span>
                  <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground">{(data.user_message) as string}</span>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Web Result Summary */}
      {summaryEvent && (
        <CollapsibleSection title="Web Result Summary" defaultOpen={false} count={1}>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-40 overflow-y-auto">
            {(() => {
              const stepData = (summaryEvent.raw.data as Record<string, unknown>)?.step_data as Record<string, unknown> | null;
              const content = stepData?.content as Record<string, unknown> | null;
              return content?.text as string ?? JSON.stringify(stepData, null, 2);
            })()}
          </pre>
        </CollapsibleSection>
      )}

      {/* Tool Output */}
      {outputEvent && (
        <CollapsibleSection title="Output" defaultOpen={false} count={1}>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-40 overflow-y-auto">
            {JSON.stringify((outputEvent.raw.data as Record<string, unknown>)?.mcp_output, null, 2)}
          </pre>
        </CollapsibleSection>
      )}

      {/* Tool Error */}
      {errorEvent && (
        <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs">
          <pre className="font-mono whitespace-pre-wrap text-destructive">
            {JSON.stringify((errorEvent.raw.data as Record<string, unknown>)?.mcp_error, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
}

// ─── Status Update Category View ─────────────────────────────────────────────

function StatusUpdateCategoryView({ events }: { events: TimestampedEvent[] }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-mono text-muted-foreground mb-2">
        {events.length} status update{events.length !== 1 ? 's' : ''}
      </div>
      {events.map((evt, i) => {
        const data = evt.raw.data as Record<string, unknown>;
        const metadata = data.metadata as Record<string, unknown> | null;

        return (
          <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-xs font-mono">
            <span className="flex-shrink-0 w-16 text-right tabular-nums text-muted-foreground">
              {formatDuration(evt.offsetMs)}
            </span>
            <Badge variant="outline" className={`text-[10px] px-1.5 ${categoryColor('phase')}`}>
              {(data.phase as string) ?? '?'}
            </Badge>
            <span className="text-muted-foreground">{data.system_message as string}</span>
            {(data.user_message) && (
              <span className="text-foreground ml-auto">
                {(data.user_message) as string}
              </span>
            )}
            {metadata && (
              <span className="text-[10px] text-muted-foreground ml-2">
                {Object.entries(metadata).map(([k, v]) => `${k}: ${v}`).join(' | ')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Data / Usage Category View ──────────────────────────────────────────────

function DataCategoryView({ events }: { events: TimestampedEvent[] }) {
  const usageEvent = events.find(e => e.subType === 'usage_complete');
  const otherEvents = events.filter(e => e.subType !== 'usage_complete');

  return (
    <div className="space-y-3">
      {/* Usage Complete (the main one people care about) */}
      {usageEvent && <UsageDisplay event={usageEvent} />}

      {/* Other data events */}
      {otherEvents.length > 0 && (
        <CollapsibleSection title="Other Data Events" defaultOpen={false} count={otherEvents.length}>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(otherEvents.map(e => e.raw), null, 2)}
          </pre>
        </CollapsibleSection>
      )}
    </div>
  );
}

function UsageDisplay({ event }: { event: TimestampedEvent }) {
  const data = event.raw.data as Record<string, unknown>;
  const totalUsage = data.total_usage as Record<string, unknown> | undefined;
  const timingStats = data.timing_stats as Record<string, unknown> | undefined;
  const toolCallStats = data.tool_call_stats as Record<string, unknown> | undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        <span className="font-semibold text-foreground">Usage & Performance Summary</span>
        <span>received at {formatDuration(event.offsetMs)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Timing */}
        {timingStats && (
          <Card className="p-2 space-y-1">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Timing</div>
            {Object.entries(timingStats).map(([key, val]) => (
              <div key={key} className="flex justify-between text-xs font-mono">
                <span className="text-muted-foreground">{key}:</span>
                <span className="text-foreground tabular-nums">
                  {typeof val === 'number' ? (key.includes('duration') ? `${val.toFixed(2)}s` : val) : String(val)}
                </span>
              </div>
            ))}
          </Card>
        )}

        {/* Token Usage */}
        {totalUsage?.total && (
          <Card className="p-2 space-y-1">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tokens</div>
            {Object.entries(totalUsage.total as Record<string, unknown>).map(([key, val]) => (
              <div key={key} className="flex justify-between text-xs font-mono">
                <span className="text-muted-foreground">{key}:</span>
                <span className="text-foreground tabular-nums">
                  {typeof val === 'number' ? val.toLocaleString() : String(val)}
                </span>
              </div>
            ))}
          </Card>
        )}

        {/* Tool Calls */}
        {toolCallStats && (
          <Card className="p-2 space-y-1">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tool Calls</div>
            {Object.entries(toolCallStats).map(([key, val]) => (
              <div key={key} className="flex justify-between text-xs font-mono">
                <span className="text-muted-foreground">{key}:</span>
                <span className="text-foreground tabular-nums">
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Per-model breakdown */}
      {totalUsage?.by_model && (
        <CollapsibleSection title="Per-Model Breakdown" defaultOpen count={Object.keys(totalUsage.by_model as Record<string, unknown>).length}>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(totalUsage.by_model, null, 2)}
          </pre>
        </CollapsibleSection>
      )}

      {/* Full raw data */}
      <CollapsibleSection title="Full Raw Data" defaultOpen={false} count={1}>
        <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-60 overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </CollapsibleSection>
    </div>
  );
}

// ─── Error Category View ─────────────────────────────────────────────────────

function ErrorCategoryView({ events }: { events: TimestampedEvent[] }) {
  return (
    <div className="space-y-2">
      {events.map((evt, i) => {
        const data = evt.raw.data as Record<string, unknown>;
        return (
          <Card key={i} className="p-3 border-destructive/30 bg-destructive/5">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-semibold text-destructive">Error at {formatDuration(evt.offsetMs)}</span>
            </div>
            {typeof data === 'object' && data !== null ? (
              <div className="space-y-1 text-xs font-mono">
                {((data as Record<string, unknown>).user_message) && (
                  <div className="text-destructive font-medium">{((data as Record<string, unknown>).user_message) as string}</div>
                )}
                <pre className="whitespace-pre-wrap text-muted-foreground mt-1">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap text-destructive">
                {JSON.stringify(evt.raw, null, 2)}
              </pre>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Generic Category View (fallback) ────────────────────────────────────────

function GenericCategoryView({ events }: { events: TimestampedEvent[] }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-mono text-muted-foreground mb-2">
        {events.length} event{events.length !== 1 ? 's' : ''}
      </div>
      {events.map((evt, i) => (
        <div key={i} className="px-2 py-1 rounded hover:bg-muted/50 text-xs font-mono">
          <div className="flex items-center gap-2 mb-1">
            <span className="tabular-nums text-muted-foreground">{formatDuration(evt.offsetMs)}</span>
            {evt.subType && (
              <Badge variant="outline" className="text-[10px] px-1">
                {subTypeLabel(evt.subType)}
              </Badge>
            )}
          </div>
          <pre className="whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(evt.raw, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

// ─── Tool Debug View ─────────────────────────────────────────────────────────

function ToolDebugView({ events }: { events: TimestampedEvent[] }) {
  const grouped = groupToolEventsById(events);

  if (events.length === 0) {
    return <EmptyState message="No tool events received yet." />;
  }

  // Get all tool call IDs in order of first appearance
  const toolCallIds = Array.from(grouped.keys()).filter(id => id !== '__ungrouped__');
  
  // If there's only one tool call or none, show a simple view
  if (toolCallIds.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-mono text-muted-foreground mb-2">
          No tool call IDs found
        </div>
        {events.map((evt, i) => (
          <RawEventDisplay key={i} event={evt} index={i} />
        ))}
      </div>
    );
  }

  if (toolCallIds.length === 1) {
    const toolCallId = toolCallIds[0];
    const toolEvents = grouped.get(toolCallId) ?? [];
    return (
      <div className="space-y-2">
        <div className="text-xs font-mono text-muted-foreground mb-2">
          Tool Call ID: <span className="text-foreground">{toolCallId}</span>
        </div>
        {toolEvents.map((evt, i) => (
          <RawEventDisplay key={i} event={evt} index={i} />
        ))}
      </div>
    );
  }

  // Multiple tool calls - use tabs
  return (
    <Tabs defaultValue={toolCallIds[0]} className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto gap-1 bg-transparent p-0">
        {toolCallIds.map(toolCallId => {
          const toolEvents = grouped.get(toolCallId) ?? [];
          const toolName = toolEvents.find(e => e.subType === 'tool_input')
            ? ((toolEvents.find(e => e.subType === 'tool_input')!.raw.data as Record<string, unknown>)?.tool_name as string) ?? 'Unknown'
            : 'Unknown';
          
          return (
            <TabsTrigger 
              key={toolCallId} 
              value={toolCallId}
              className="text-xs font-mono px-2 py-1 data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-700 dark:data-[state=active]:text-orange-300"
            >
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-[10px] text-muted-foreground">{toolName}</span>
                <span className="text-[9px] opacity-70">{toolCallId.substring(0, 24)}...</span>
              </div>
            </TabsTrigger>
          );
        })}
      </TabsList>
      
      {toolCallIds.map(toolCallId => {
        const toolEvents = grouped.get(toolCallId) ?? [];
        return (
          <TabsContent key={toolCallId} value={toolCallId} className="mt-3 space-y-2">
            <div className="text-xs font-mono text-muted-foreground mb-2">
              {toolEvents.length} event{toolEvents.length !== 1 ? 's' : ''} for tool call <span className="text-foreground">{toolCallId}</span>
            </div>
            {toolEvents.map((evt, i) => (
              <RawEventDisplay key={i} event={evt} index={i} />
            ))}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function RawEventDisplay({ event, index }: { event: TimestampedEvent; index: number }) {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(event.raw, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      toast.success('Copied event to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  // Extract metadata from event.raw.data
  const data = event.raw.data as Record<string, unknown> | undefined;
  const type = data?.type as string | undefined;
  const userMessage = data?.user_message as string | undefined;
  
  // Check for presence of key fields
  const hasInput = data?.mcp_input !== undefined && data?.mcp_input !== null;
  const hasOutput = data?.mcp_output !== undefined && data?.mcp_output !== null;
  const hasError = data?.mcp_error !== undefined && data?.mcp_error !== null;
  const hasStepData = data?.step_data !== undefined && data?.step_data !== null;
  const hasResult = data?.result !== undefined && data?.result !== null;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] px-1.5 font-mono">
            #{index + 1}
          </Badge>
          <span className="text-[10px] font-mono text-muted-foreground">
            {formatDuration(event.offsetMs)}
          </span>
          {event.subType && (
            <Badge variant="outline" className={`text-[10px] px-1.5 ${categoryColor(event.category)}`}>
              {subTypeLabel(event.subType)}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs px-2 gap-1"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      
      <div className="flex gap-3">
        {/* Left: Metadata Panel */}
        <div className="flex-shrink-0 w-48 space-y-2 text-xs">
          {/* Type and User Message */}
          <div className="space-y-1.5">
            {type && (
              <div className="space-y-0.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Type</div>
                <div className="font-mono text-foreground bg-muted/50 px-2 py-1 rounded">
                  {type}
                </div>
              </div>
            )}
            
            {userMessage && (
              <div className="space-y-0.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">User Message</div>
                <div className="text-foreground bg-muted/50 px-2 py-1 rounded text-[11px] leading-relaxed">
                  {userMessage}
                </div>
              </div>
            )}
          </div>
          
          {/* Presence Indicators */}
          <div className="pt-2 border-t space-y-1">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Fields Present
            </div>
            <PresenceIndicator label="Input" present={hasInput} />
            <PresenceIndicator label="Output" present={hasOutput} />
            <PresenceIndicator label="Error" present={hasError} />
            <PresenceIndicator label="Step Data" present={hasStepData} />
            <PresenceIndicator label="Result" present={hasResult} />
          </div>
        </div>
        
        {/* Right: JSON Object */}
        <pre className="flex-1 text-xs font-mono whitespace-pre-wrap text-foreground bg-muted/50 p-2 rounded max-h-96 overflow-y-auto">
          {jsonString}
        </pre>
      </div>
    </Card>
  );
}

function PresenceIndicator({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      {present ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <span className="text-muted-foreground text-[10px]">—</span>
      )}
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function CollapsibleSection({
  title,
  defaultOpen = false,
  count,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-1">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
        {count !== undefined && (
          <span className="text-[10px] opacity-60 tabular-nums">({count})</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 pl-4 border-l-2 border-border/50">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
      <Activity className="h-6 w-6 mb-2 opacity-40" />
      <span className="text-xs">{message}</span>
    </div>
  );
}

/** Generate a short preview string for an event in the timeline */
function eventPreview(evt: TimestampedEvent): string {
  const data = evt.raw.data;

  switch (evt.category) {
    case 'chunk': {
      const d = data as Record<string, unknown>;
      const text = typeof d.text === 'string' ? d.text : '';
      const clean = text.replace(/<reasoning>|<\/reasoning>/g, '').trim();
      return clean.length > 80 ? clean.slice(0, 80) + '...' : clean || '(empty chunk)';
    }

    case 'reasoning_chunk': {
      const d = data as Record<string, unknown>;
      const text = typeof d.text === 'string' ? d.text : '';
      return text.length > 80 ? text.slice(0, 80) + '...' : text || '(empty reasoning chunk)';
    }

    case 'phase': {
      const d = data as Record<string, unknown>;
      return `[${d.phase ?? '?'}]`;
    }

    case 'tool_event': {
      const d = data as Record<string, unknown>;
      const toolName = d.tool_name as string | null;
      const msg = d.message as string | null;
      return toolName
        ? `${toolName} → ${msg ?? evt.subType ?? ''}`
        : msg ?? evt.subType ?? '';
    }

    case 'completion': {
      return 'Completion — final output and usage stats';
    }

    case 'heartbeat': {
      return 'Keepalive';
    }

    case 'data': {
      const d = data as Record<string, unknown>;
      return JSON.stringify(d).slice(0, 80);
    }

    case 'error': {
      const d = data as Record<string, unknown>;
      return (d.user_message as string) ?? (d.message as string) ?? 'Error';
    }

    case 'end':
      return 'Stream ended';

    default:
      return JSON.stringify(data).slice(0, 80);
  }
}
