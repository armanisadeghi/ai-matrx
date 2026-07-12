"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Activity, Check, Copy, Radio, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  clearBatchExtractDebugSessions,
  selectBatchExtractDebugSession,
  selectPdfBatchExtractDebugSelectedSession,
  selectPdfBatchExtractDebugSessions,
  type BatchExtractDebugSession,
} from "@/features/pdf-extractor/state/pdfBatchExtractDebugSlice";
import { cn } from "@/lib/utils";

function useCopyText(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return { copied, copy };
}

const STATUS_COLORS: Record<BatchExtractDebugSession["status"], string> = {
  pending: "bg-gray-500/20 text-gray-400",
  streaming: "bg-blue-500/20 text-blue-400 animate-pulse",
  complete: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
};

function SessionSidebarRow({
  session,
  isSelected,
  onSelect,
}: {
  session: BatchExtractDebugSession;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const shortId = session.id.slice(0, 8);
  const fileLabel =
    session.request.fileNames.length === 1
      ? session.request.fileNames[0]
      : `${session.request.fileNames.length} files`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-0.5 border-l-2 px-2 py-2 text-left transition-colors",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-transparent hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] px-1 py-0 h-4 font-mono",
            STATUS_COLORS[session.status],
          )}
        >
          {session.status}
        </Badge>
        <span className="truncate text-[10px] font-medium">{fileLabel}</span>
      </div>
      <span className="font-mono text-[9px] text-muted-foreground">
        {shortId} · {session.lines.length} lines
      </span>
    </button>
  );
}

function DebugSidebar({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: BatchExtractDebugSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
        <Radio className="h-6 w-6 opacity-20" />
        <p className="text-xs">No batch-extract runs yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col py-1">
        {sessions.map((session) => (
          <SessionSidebarRow
            key={session.id}
            session={session}
            isSelected={session.id === selectedId}
            onSelect={() => onSelect(session.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function RequestBlock({ session }: { session: BatchExtractDebugSession }) {
  const curl = useMemo(() => {
    const files = session.request.fileNames
      .map((name) => `-F "files=@${name}"`)
      .join(" \\\n  ");
    const auth = session.request.authorizationPreview
      ? `-H "Authorization: ${session.request.authorizationPreview}"`
      : "";
    return [
      `curl -X ${session.request.method} \\`,
      `  "${session.request.url}" \\`,
      auth,
      files,
    ]
      .filter(Boolean)
      .join("\n");
  }, [session]);

  const { copied, copy } = useCopyText(curl);

  return (
    <div className="space-y-2 border-b border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          API call
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={copy}
        >
          {copied ? (
            <Check className="mr-1 h-3 w-3 text-green-500" />
          ) : (
            <Copy className="mr-1 h-3 w-3" />
          )}
          Copy curl
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[10px] leading-relaxed text-foreground">
        {curl}
      </pre>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <span className="text-muted-foreground">Files:</span>{" "}
          {session.request.fileNames.join(", ") || "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Sizes:</span>{" "}
          {session.request.fileSizes
            .map((s) => `${(s / 1024).toFixed(1)} KB`)
            .join(", ") || "—"}
        </div>
        <div className="col-span-2 break-all">
          <span className="text-muted-foreground">URL:</span>{" "}
          {session.request.url}
        </div>
      </div>
    </div>
  );
}

function ResponseBlock({ session }: { session: BatchExtractDebugSession }) {
  if (!session.response && !session.error) return null;

  return (
    <div className="space-y-1 border-b border-border px-3 py-2 text-[10px]">
      <div className="font-semibold uppercase tracking-wider text-muted-foreground">
        Response
      </div>
      {session.response && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">
            HTTP {session.response.httpStatus} {session.response.statusText}
          </Badge>
          {session.response.contentType && (
            <span className="text-muted-foreground">
              {session.response.contentType}
            </span>
          )}
          {session.response.requestId && (
            <span className="font-mono text-muted-foreground">
              X-Request-ID: {session.response.requestId}
            </span>
          )}
        </div>
      )}
      {session.error && <p className="text-destructive">{session.error}</p>}
    </div>
  );
}

function StreamLog({ session }: { session: BatchExtractDebugSession }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.lines.length, autoScroll]);

  const fullLog = useMemo(
    () => session.lines.map((line) => line.raw).join("\n"),
    [session.lines],
  );
  const { copied, copy } = useCopyText(fullLog);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          NDJSON stream ({session.lines.length} lines)
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={autoScroll ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setAutoScroll((v) => !v)}
          >
            Auto-scroll {autoScroll ? "ON" : "OFF"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={copy}
            disabled={session.lines.length === 0}
          >
            {copied ? (
              <Check className="mr-1 h-3 w-3 text-green-500" />
            ) : (
              <Copy className="mr-1 h-3 w-3" />
            )}
            Copy log
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2 font-mono text-[10px] leading-relaxed">
          {session.lines.length === 0 ? (
            <p className="px-2 py-6 text-center text-muted-foreground">
              Waiting for stream lines…
            </p>
          ) : (
            session.lines.map((line) => (
              <div
                key={`${line.index}-${line.receivedAt}`}
                className="rounded px-1.5 py-0.5 hover:bg-muted/40"
              >
                <span className="mr-2 text-muted-foreground/60">
                  {String(line.index).padStart(4, "0")}
                </span>
                <span className="whitespace-pre-wrap break-all text-foreground">
                  {line.raw}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}

function PdfBatchExtractDebugWindowInner({
  onClose,
  initialSessionId,
}: {
  onClose: () => void;
  initialSessionId: string | null;
}) {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin);
  const sessions = useAppSelector(selectPdfBatchExtractDebugSessions);
  const selectedSession = useAppSelector(
    selectPdfBatchExtractDebugSelectedSession,
  );
  const selectedId = selectedSession?.id ?? null;

  useEffect(() => {
    if (initialSessionId) {
      dispatch(selectBatchExtractDebugSession(initialSessionId));
    }
  }, [dispatch, initialSessionId]);

  const collectData = useCallback(
    (): Record<string, unknown> => ({ selectedSessionId: selectedId }),
    [selectedId],
  );

  if (!isAdmin) return null;

  return (
    <WindowPanel
      id="pdf-batch-extract-debug-window"
      title="PDF Batch Extract Debug"
      actionsRight={
        sessions.length > 0 ? (
          <Badge
            variant="outline"
            className="mr-1 h-4 px-1.5 py-0 font-mono text-[10px]"
          >
            {sessions.length}
          </Badge>
        ) : undefined
      }
      onClose={onClose}
      width={920}
      height={680}
      minWidth={560}
      minHeight={360}
      overlayId="pdfBatchExtractDebugWindow"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      sidebar={
        <DebugSidebar
          sessions={sessions}
          selectedId={selectedId}
          onSelect={(id) => dispatch(selectBatchExtractDebugSession(id))}
        />
      }
      sidebarDefaultSize={220}
      sidebarMinSize={160}
      defaultSidebarOpen
      footer={
        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground">
            Persists across route changes · Redux-backed
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => dispatch(clearBatchExtractDebugSessions())}
            disabled={sessions.length === 0}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear sessions
          </Button>
        </div>
      }
    >
      {selectedSession ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <RequestBlock session={selectedSession} />
          <ResponseBlock session={selectedSession} />
          <StreamLog session={selectedSession} />
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <Activity className="h-10 w-10 opacity-15" />
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No session selected
            </p>
            <p className="text-xs opacity-60">
              Upload a PDF to capture the live{" "}
              <code className="font-mono">/utilities/pdf/batch-extract</code>{" "}
              stream.
            </p>
          </div>
        </div>
      )}
    </WindowPanel>
  );
}

interface PdfBatchExtractDebugWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialSessionId?: string | null;
}

export default function PdfBatchExtractDebugWindow({
  isOpen,
  onClose,
  initialSessionId = null,
}: PdfBatchExtractDebugWindowProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  if (!isOpen || !isAdmin) return null;
  return (
    <PdfBatchExtractDebugWindowInner
      onClose={onClose}
      initialSessionId={initialSessionId}
    />
  );
}
