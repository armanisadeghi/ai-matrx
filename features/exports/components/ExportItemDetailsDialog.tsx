"use client";

// features/exports/components/ExportItemDetailsDialog.tsx
//
// Everything the platform holds about ONE extracted item — and a plain
// sentence saying that the message text itself was never read in.
//
// 🚨 THIS IS NOT A PREVIEW PANE AND MUST NEVER BECOME ONE. No field below is
// message content; the API serves none, and adding one would mean reading
// other people's words into a screen nobody asked to publish them on.

import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { directionLabel, formatCount } from "../format";
import type { ExportItem, ExportItemParty } from "../types";

function partyText(party: ExportItemParty | null): string {
  if (!party) return "";
  const name = party.name?.trim();
  const contact = party.email?.trim() || party.handle?.trim();
  if (name && contact && name !== contact) return `${name} (${contact})`;
  return name || contact || "";
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function ExportItemDetailsDialog({
  item,
  onClose,
}: {
  item: ExportItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="matrx-touch-targets max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {item && (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="text-base">
                {item.title?.trim() || "(no subject)"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Matrx holds this item&apos;s details only. The message text was
                never read in, and there is no way to read it here.
              </DialogDescription>
            </DialogHeader>
            <dl className="divide-y divide-border">
              <Row label="Direction">{directionLabel(item.direction)}</Row>
              <Row label="Type">
                <span className="capitalize">{item.kind.replace(/_/g, " ")}</span>
              </Row>
              <Row label="From">{partyText(item.author) || "—"}</Row>
              <Row label="To">
                {item.recipients.length === 0
                  ? "—"
                  : item.recipients.map(partyText).filter(Boolean).join(", ") || "—"}
              </Row>
              <Row label="When">
                {item.occurred_at
                  ? new Date(item.occurred_at).toLocaleString()
                  : "—"}
              </Row>
              <Row label="Thread">{item.container_label || "—"}</Row>
              <Row label="Labels">
                {item.labels.length === 0 ? (
                  "—"
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {item.labels.map((label) => (
                      <Badge key={label} variant="secondary" className="py-0 text-[10px]">
                        {label}
                      </Badge>
                    ))}
                  </span>
                )}
              </Row>
              <Row label="Length">
                {formatCount(item.char_count)} characters ·{" "}
                {formatCount(item.word_count)} words
              </Row>
              <Row label="Attachments">
                {item.attachment_count === 0 ? (
                  "None"
                ) : (
                  <span className="flex flex-col gap-1">
                    {item.attachment_names.map((name) => (
                      <span key={name} className="flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {name}
                      </span>
                    ))}
                    {item.attachment_names.length === 0 && (
                      <span>{formatCount(item.attachment_count)}</span>
                    )}
                  </span>
                )}
              </Row>
              <Row label="Reply">{item.is_reply ? "Yes" : "No"}</Row>
              {item.external_id && (
                <Row label="Original id">
                  <code className="break-all text-xs text-muted-foreground">
                    {item.external_id}
                  </code>
                </Row>
              )}
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
