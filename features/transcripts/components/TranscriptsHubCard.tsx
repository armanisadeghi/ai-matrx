import Link from "next/link";
import { Columns2, Eraser, Eye, FileText, Inbox, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptHubItem } from "@/features/transcripts/types/hub";
import {
  formatHubDuration,
  hubItemDurationSeconds,
  KIND_META,
  primaryHubHref,
} from "@/features/transcripts/utils/hubDisplay";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";

const KIND_ICONS = {
  processor: FileText,
  session: Columns2,
  cleanup: Eraser,
  unsorted: Inbox,
  recording: Mic,
} as const;

function CardAction({
  href,
  label,
  icon: Icon,
  text,
}: {
  href: string;
  label: string;
  icon: typeof Eye;
  text: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-7 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium",
        "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {text}
    </Link>
  );
}

export function TranscriptsHubCard({ item }: { item: TranscriptHubItem }) {
  const meta = KIND_META[item.kind];
  const KindIcon = KIND_ICONS[item.kind];
  const href = primaryHubHref(item);

  const subtitle =
    item.kind === "processor"
      ? [
          item.sourceType,
          formatHubDuration(hubItemDurationSeconds(item)),
          item.wordCount != null ? `${item.wordCount} words` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : item.kind === "unsorted"
        ? [
            formatHubDuration(hubItemDurationSeconds(item)),
            `capture #${item.segmentIndex + 1}`,
          ].join(" · ")
        : item.kind === "recording"
          ? [
              formatHubDuration(hubItemDurationSeconds(item)),
              `capture #${item.segmentIndex + 1}`,
            ].join(" · ")
          : [
              item.status,
              formatHubDuration(hubItemDurationSeconds(item)),
              item.recordingCount
                ? `${item.recordingCount} recording${item.recordingCount === 1 ? "" : "s"}`
                : null,
              item.charCount
                ? `${item.charCount.toLocaleString()} chars`
                : null,
              item.transcriptId ? "linked" : null,
            ]
              .filter(Boolean)
              .join(" · ");

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        "transition-colors hover:border-primary/40 hover:shadow-md",
      )}
    >
      <Link href={href} className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex min-w-0 items-start gap-2">
          <KindIcon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.accent)} />
          <h3 className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {item.title}
          </h3>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0 text-[10px] font-medium uppercase leading-4 tracking-wider",
              "bg-muted/60 text-muted-foreground",
            )}
          >
            {meta.label}
          </span>
          {item.kind === "processor" && item.isDraft ? (
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0 text-[10px] uppercase leading-4 tracking-wider",
                "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400",
              )}
            >
              draft
            </span>
          ) : null}
        </div>

        {item.kind === "processor" && item.description ? (
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {item.description}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] tabular-nums text-muted-foreground">
          <span>{subtitle}</span>
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          <span title={formatAbsoluteDate(item.updatedAt)}>
            {formatRelativeTime(item.updatedAt, { style: "long" })}
          </span>
        </div>

        {item.kind === "processor" &&
        item.folderName &&
        item.folderName !== "Transcripts" ? (
          <div className="truncate text-[11px] text-muted-foreground/80">
            in {item.folderName}
          </div>
        ) : null}
      </Link>

      <div className="flex items-center gap-1 border-t border-border bg-muted/20 px-2 py-1">
        {item.kind === "processor" ? (
          <>
            <CardAction
              href={href}
              label="Open in Processor"
              icon={Eye}
              text="Open"
            />
            <CardAction
              href={`/transcripts/studio?import=${encodeURIComponent(item.id)}`}
              label="Open in Studio"
              icon={Columns2}
              text="Studio"
            />
            <CardAction
              href={`/transcripts/cleanup?import=${encodeURIComponent(item.id)}`}
              label="Run Cleanup"
              icon={Eraser}
              text="Clean"
            />
          </>
        ) : item.kind === "session" ? (
          <>
            <CardAction
              href={`/transcripts/studio?session=${encodeURIComponent(item.id)}`}
              label="Open in Studio"
              icon={Columns2}
              text="Studio"
            />
            <CardAction
              href={`/transcripts/scribe/${encodeURIComponent(item.id)}`}
              label="Open in Scribe"
              icon={Mic}
              text="Scribe"
            />
          </>
        ) : item.kind === "cleanup" ? (
          <CardAction
            href={href}
            label="Open cleanup session"
            icon={Eraser}
            text="Open"
          />
        ) : item.kind === "recording" ? (
          <CardAction
            href={href}
            label="Open in Scribe"
            icon={Mic}
            text="Scribe"
          />
        ) : (
          <CardAction
            href={href}
            label="View unsorted recordings"
            icon={Inbox}
            text="View"
          />
        )}
      </div>
    </div>
  );
}
