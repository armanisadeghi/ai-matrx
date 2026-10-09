"use client";

// features/meet/components/record/RecordExportMenu.tsx
//
// EXPORT, ONE MENU (Meet wave 3). The documents are the package's
// (`notesDocument`, `transcriptDocument`, `attendanceCsv`) so every client
// exports the same bytes; Word and PDF go through the platform's one document
// exporter (`@ai-matrx/print/document`), never a second converter.

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import { Copy, Database, Download, Loader2, Mail } from "lucide-react";
import {
  attendanceCsv,
  attendanceReport,
  groupTranscript,
  notesDocument,
  transcriptDocument,
  type MeetingRecord,
  type MeetingRecordBundle,
} from "@ai-matrx/meet/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { downloadBlob } from "@/utils/file-operations/utils";
import { fileSafe } from "@/features/meet/components/record/AttendancePanel";
import { useOpenSaveToTable } from "@/features/overlays/openers/saveToTable";

/**
 * The transcript as rows for THE one "Save to a table": one row per line — when it was said (a
 * date-time column), who said it (the package's grouping names the speaker), what was said.
 */
export function meetingTranscriptRows(
  bundle: MeetingRecordBundle,
): Array<Record<string, unknown>> {
  return groupTranscript(bundle.transcript, bundle.names).flatMap((block) =>
    block.lines.map((line) => ({
      said_at: line.startedAt,
      speaker: block.speaker,
      text: line.text,
    })),
  );
}

type DocFormat = "docx" | "pdf";

export function RecordExportMenu({
  meeting,
  bundle,
  when,
  link,
  onSendRecap,
}: {
  meeting: MeetingRecord;
  bundle: MeetingRecordBundle;
  when: string;
  link: string;
  /** Present for the host: "Email the recap…" opens the recap. */
  onSendRecap?: () => void;
}) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const openSaveToTable = useOpenSaveToTable();
  const base = fileSafe(meeting.title);
  const notes = () => notesDocument(bundle, { link, when });
  const transcript = (format: "txt" | "md" | "vtt") =>
    transcriptDocument(bundle, format);
  const hasTranscript = bundle.transcript.length > 0;

  const copy = async (label: string, text: string) => {
    if (!(await copyText(text, `${label} copied.`, `${label} could not be copied — this browser blocked the clipboard. Download it instead.`))) return;
  };

  const text = (body: string, name: string, type: string) =>
    downloadBlob(new Blob([body], { type }), name);

  const doc = async (
    key: string,
    markdown: string,
    format: DocFormat,
    fileName: string,
  ) => {
    setBusy(key);
    try {
      const { exportDocument, downloadDocumentExport } = await import(
        "@ai-matrx/print/document"
      );
      downloadDocumentExport(
        await exportDocument(markdown, format, { fileName }),
      );
    } catch (thrown) {
      toast.error(
        `The ${format === "pdf" ? "PDF" : "Word document"} could not be made: ${(thrown as Error).message}`,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button icon={busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )} variant="outline">
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Notes
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void copy("Notes", notes())}>
          <Copy className="h-4 w-4" aria-hidden="true" /> Copy notes
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            text(notes(), `${base}-notes.md`, "text/markdown;charset=utf-8")
          }
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void doc("notes-docx", notes(), "docx", `${base}-notes`)
          }
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Word (.docx)
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void doc("notes-pdf", notes(), "pdf", `${base}-notes`)}
        >
          <Download className="h-4 w-4" aria-hidden="true" /> PDF
        </DropdownMenuItem>
        {hasTranscript ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Transcript
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => void copy("Transcript", transcript("txt"))}
            >
              <Copy className="h-4 w-4" aria-hidden="true" /> Copy transcript
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                text(
                  transcript("txt"),
                  `${base}-transcript.txt`,
                  "text/plain;charset=utf-8",
                )
              }
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Text (.txt)
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                text(transcript("vtt"), `${base}.vtt`, "text/vtt;charset=utf-8")
              }
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Captions
              (.vtt)
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void doc(
                  "transcript-docx",
                  transcript("md"),
                  "docx",
                  `${base}-transcript`,
                )
              }
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Word (.docx)
            </DropdownMenuItem>
            {openSaveToTable ? (
              <DropdownMenuItem
                onSelect={() =>
                  openSaveToTable({
                    value: meetingTranscriptRows(bundle),
                    title: `${meeting.title} transcript`,
                    organizationId: meeting.organizationId,
                  })
                }
              >
                <Database className="h-4 w-4" aria-hidden="true" /> Save to a
                table…
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        {bundle.attendees.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                text(
                  attendanceCsv([
                    {
                      meeting,
                      rows: attendanceReport(
                        meeting,
                        bundle.attendees,
                        bundle.names,
                      ),
                    },
                  ]),
                  `${base}-attendance.csv`,
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Attendance
              (.csv)
            </DropdownMenuItem>
          </>
        ) : null}
        {onSendRecap ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSendRecap}>
              <Mail className="h-4 w-4" aria-hidden="true" /> Email the recap…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
