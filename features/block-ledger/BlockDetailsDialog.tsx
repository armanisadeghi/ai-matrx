"use client";

// features/block-ledger/BlockDetailsDialog.tsx
//
// ONE block, completely — what we were trying to get, every rung the ladder
// actually reached, the exact words the other side used, and what would unblock it.
//
// 🚨 THE RUNG TRAIL IS SHOWN, NOT SUMMARISED. The ladder's law is that no rung is
// silently skipped; a screen that collapsed the trail into "failed" would undo that
// law at the last step. Every entry the server wrote is rendered, in order, with its
// own reason and note.

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ENGINE_LABELS,
  RUNG_LABELS,
  SOURCE_TYPE_LABELS,
  STATUS_LABELS,
  labelFor,
  type AcquisitionBlock,
} from "./types";

interface TrailEntry {
  rung?: string;
  ok?: boolean;
  reason?: string | null;
  note?: string | null;
  chars?: number;
  at?: string;
}

function readTrail(value: unknown): TrailEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is TrailEntry => typeof entry === "object" && entry !== null);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function BlockDetailsDialog({
  block,
  onClose,
}: {
  block: AcquisitionBlock | null;
  onClose: () => void;
}) {
  const trail = readTrail(block?.rung_trail);

  return (
    <Dialog open={block !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="matrx-touch-targets max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {block && (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="text-base break-all">
                {block.input_label?.trim() ||
                  block.input_ref.replace(/^https?:\/\//, "")}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Seen {block.occurrence_count.toLocaleString()}
                {block.occurrence_count === 1 ? " time" : " times"} — this is a
                record of a wall, not of a mistake.
              </DialogDescription>
            </DialogHeader>

            <dl className="divide-y divide-border/60">
              <Row label="Address">
                {/^https?:\/\//.test(block.input_ref) ? (
                  <a
                    className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    href={block.input_ref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="break-all">{block.input_ref}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="break-all">{block.input_ref}</span>
                )}
              </Row>
              <Row label="Source">
                {labelFor(SOURCE_TYPE_LABELS, block.source_type)}
              </Row>
              <Row label="Engine">
                {labelFor(ENGINE_LABELS, block.engine)}
                {block.rung && (
                  <span className="text-muted-foreground">
                    {" "}
                    — {labelFor(RUNG_LABELS, block.rung)}
                  </span>
                )}
              </Row>
              <Row label="It said">
                <span className="text-foreground">{block.error_sentence}</span>
                <div className="mt-1">
                  <code className="text-[11px] text-muted-foreground">
                    {block.error_class}
                  </code>
                </div>
              </Row>
              <Row label="Unblocks by">
                {block.unblock_note?.trim() || (
                  <span className="text-muted-foreground">
                    We don&apos;t have a lawful route for this one yet. That is
                    an honest blank, not an oversight — a guessed route sends
                    somebody down a dead end.
                  </span>
                )}
              </Row>
              <Row label="Status">
                <Badge variant="outline" className="py-0 text-[10px]">
                  {labelFor(STATUS_LABELS, block.status)}
                </Badge>
                {block.retry_count > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    Retried {block.retry_count.toLocaleString()}
                    {block.retry_count === 1 ? " time" : " times"}
                  </span>
                )}
              </Row>
              <Row label="What we did">
                {block.retry_count === 0 && !block.handoff_id ? (
                  <span className="text-muted-foreground">
                    Nothing yet — nobody has run this one again or sent it to their
                    own browser.
                  </span>
                ) : (
                  <div className="flex flex-col gap-1">
                    {block.retry_count > 0 && (
                      <span>
                        Tried again{" "}
                        {block.retry_count === 1
                          ? "once"
                          : `${block.retry_count.toLocaleString()} times`}
                        {block.last_retry_at && (
                          <span className="text-muted-foreground">
                            {" "}
                            — last {new Date(block.last_retry_at).toLocaleString()}
                          </span>
                        )}
                      </span>
                    )}
                    {block.handoff_id && (
                      // THE DOOR LAW: the handoff this block produced is a thing the
                      // UI names, so it opens.
                      <Link
                        href="/capture/needs-you"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        Waiting in your own browser — open the list
                      </Link>
                    )}
                  </div>
                )}
              </Row>
              <Row label="First seen">
                {new Date(block.first_seen_at).toLocaleString()}
              </Row>
              <Row label="Last seen">
                {new Date(block.last_seen_at).toLocaleString()}
              </Row>
            </dl>

            <div className="mt-2">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                Every step that was tried
              </h3>
              {trail.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  This engine is not on the capture ladder, so there are no rungs
                  to show — a file reader and a connected account either read the
                  thing or say why they cannot.
                </p>
              ) : (
                <ol className="mt-1.5 space-y-1.5">
                  {trail.map((entry, index) => (
                    <li
                      key={`${entry.rung ?? index}-${index}`}
                      className="rounded-md border border-border/60 px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {labelFor(RUNG_LABELS, entry.rung)}
                        </span>
                        <Badge
                          variant="outline"
                          className="py-0 text-[10px] font-normal"
                        >
                          {entry.ok ? "read it" : "did not"}
                        </Badge>
                        {typeof entry.chars === "number" && entry.chars > 0 && (
                          <span className="text-muted-foreground">
                            {entry.chars.toLocaleString()} characters
                          </span>
                        )}
                      </div>
                      {entry.note && (
                        <p className="mt-1 text-muted-foreground">{entry.note}</p>
                      )}
                      {!entry.note && entry.reason && (
                        <p className="mt-1 text-muted-foreground">
                          <code className="text-[11px]">{entry.reason}</code>
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
