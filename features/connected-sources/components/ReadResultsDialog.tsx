"use client";

/**
 * What the bulk reads on /connected-sources actually read — shown, not counted.
 *
 * "Read comments", "Read history" and "Read speaker notes" each walk the picked
 * Google files and hand the result here: every comment with its quoted passage
 * and replies, every kept revision, every slide with its speaker notes. One
 * dialog, one Copy menu over the whole read (for a person and for an agent).
 */

import { formatRelativeTime } from "@ai-matrx/kit/format";
import { formatFileSize } from "@ai-matrx/kit/format";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import type {
  GoogleCommentsResponse,
  GooglePresentationResponse,
  GoogleRevisionsResponse,
} from "../types";

interface FileRef {
  title: string;
  url: string | null;
}

export type ConnectedReadResult =
  | { kind: "comments"; files: (FileRef & { thread: GoogleCommentsResponse })[] }
  | { kind: "revisions"; files: (FileRef & { history: GoogleRevisionsResponse })[] }
  | { kind: "slides"; files: (FileRef & { deck: GooglePresentationResponse })[] };

const TITLES: Record<ConnectedReadResult["kind"], string> = {
  comments: "Comments",
  revisions: "Revision history",
  slides: "Speaker notes",
};

function when(iso: string | null): string {
  return iso ? formatRelativeTime(iso) : "";
}

/** The whole read as plain text — what Copy hands a person. */
export function readResultText(result: ConnectedReadResult): string {
  const blocks: string[] = [];
  if (result.kind === "comments") {
    for (const file of result.files) {
      const lines = [`# ${file.title}`];
      if (!file.thread.comments.length) lines.push("No comments.");
      for (const c of file.thread.comments) {
        if (c.quoted_text) lines.push(`> ${c.quoted_text}`);
        lines.push(`${c.author_name ?? "Someone"}${c.resolved ? " (resolved)" : ""}: ${c.content}`);
        for (const r of c.replies) lines.push(`  - ${r.author_name ?? "Someone"}: ${r.content}`);
      }
      blocks.push(lines.join("\n"));
    }
  } else if (result.kind === "revisions") {
    for (const file of result.files) {
      const lines = [`# ${file.title}`];
      if (!file.history.revisions.length) lines.push("No kept revisions.");
      for (const r of file.history.revisions) {
        lines.push(`- ${r.modified_at ?? "unknown date"} by ${r.author_name ?? "someone"}`);
      }
      blocks.push(lines.join("\n"));
    }
  } else {
    for (const file of result.files) {
      const lines = [`# ${file.title}`];
      for (const s of file.deck.slides) {
        lines.push(`## Slide ${s.index + 1}${s.title ? ` — ${s.title}` : ""}`);
        if (s.body_text) lines.push(s.body_text);
        lines.push(s.speaker_notes ? `Notes: ${s.speaker_notes}` : "No speaker notes.");
      }
      blocks.push(lines.join("\n"));
    }
  }
  return blocks.join("\n\n");
}

function FileHeading({ file }: { file: FileRef }) {
  return file.url ? (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-foreground hover:underline"
    >
      {file.title}
    </a>
  ) : (
    <span className="text-sm font-medium text-foreground">{file.title}</span>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Body({ result }: { result: ConnectedReadResult }) {
  if (result.kind === "comments") {
    return (
      <>
        {result.files.map((file) => (
          <section key={file.thread.file_id} className="space-y-2">
            <FileHeading file={file} />
            {file.thread.comments.length ? (
              <ul className="space-y-3">
                {file.thread.comments.map((c) => (
                  <li key={c.comment_id} className="space-y-1 border-l-2 border-border pl-3">
                    {c.quoted_text ? (
                      <p className="text-sm italic text-muted-foreground">“{c.quoted_text}”</p>
                    ) : null}
                    <p className="text-sm text-foreground">{c.content}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{c.author_name ?? "Someone"}</span>
                      <span>{when(c.modified_at ?? c.created_at)}</span>
                      {c.resolved ? <Badge variant="outline">Resolved</Badge> : null}
                    </p>
                    {c.replies.length ? (
                      <ul className="space-y-1 pl-3">
                        {c.replies.map((r) => (
                          <li key={r.reply_id} className="text-sm">
                            <span className="text-muted-foreground">
                              {r.author_name ?? "Someone"}:{" "}
                            </span>
                            {r.content}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No comments on this file.</Empty>
            )}
            {file.thread.truncated ? (
              <Empty>Only the first comments are shown; the file holds more.</Empty>
            ) : null}
          </section>
        ))}
      </>
    );
  }
  if (result.kind === "revisions") {
    return (
      <>
        {result.files.map((file) => (
          <section key={file.history.file_id} className="space-y-2">
            <FileHeading file={file} />
            {file.history.revisions.length ? (
              <ul className="divide-y divide-border">
                {file.history.revisions.map((r) => (
                  <li
                    key={r.revision_id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-sm"
                  >
                    <span className="text-foreground">{when(r.modified_at) || "Unknown date"}</span>
                    <span className="text-muted-foreground">{r.author_name ?? "Someone"}</span>
                    {r.size_bytes ? (
                      <span className="tabular-nums text-muted-foreground">
                        {formatFileSize(r.size_bytes)}
                      </span>
                    ) : null}
                    {r.keep_forever ? <Badge variant="outline">Kept forever</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No kept revisions on this file.</Empty>
            )}
          </section>
        ))}
      </>
    );
  }
  return (
    <>
      {result.files.map((file) => (
        <section key={file.deck.file_id} className="space-y-2">
          <FileHeading file={file} />
          <ol className="space-y-3">
            {file.deck.slides.map((s) => (
              <li key={s.slide_id} className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Slide {s.index + 1}
                  {s.title ? ` — ${s.title}` : ""}
                </p>
                {s.speaker_notes ? (
                  <p className="whitespace-pre-wrap text-sm text-foreground">{s.speaker_notes}</p>
                ) : (
                  <Empty>No speaker notes.</Empty>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}

export function ReadResultsDialog({
  result,
  onClose,
}: {
  result: ConnectedReadResult | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={result !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {result ? (
        <DialogContent className="matrx-touch-targets flex max-h-[85dvh] max-w-2xl flex-col">
          <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 pr-8">
            <DialogTitle>{TITLES[result.kind]}</DialogTitle>
            <CopyButtons
              size="icon"
              label={TITLES[result.kind]}
              human={() => readResultText(result)}
              agent={() => ({
                kind: "connected-source-read",
                location: "Connected sources",
                description: `${TITLES[result.kind]} read live from the person's picked Google files.`,
                data: result,
                summary: readResultText(result),
              })}
            />
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            <Body result={result} />
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
