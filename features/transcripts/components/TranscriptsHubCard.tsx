import Link from "next/link";
import {
  Columns2,
  Eraser,
  Eye,
  FileAudio,
  FileText,
  Inbox,
  Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptHubItem } from "@/features/transcripts/types/hub";

const KIND_META: Record<
  TranscriptHubItem["kind"],
  { label: string; icon: typeof FileText; accent: string }
> = {
  processor: {
    label: "Transcript",
    icon: FileText,
    accent: "text-sky-500",
  },
  session: {
    label: "Session",
    icon: Columns2,
    accent: "text-violet-500",
  },
  cleanup: {
    label: "Cleanup",
    icon: Eraser,
    accent: "text-amber-500",
  },
  unsorted: {
    label: "Unsorted",
    icon: Inbox,
    accent: "text-rose-500",
  },
};

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatRelative(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function primaryHref(item: TranscriptHubItem): string {
  switch (item.kind) {
    case "processor":
      return `/transcripts/processor?focus=${encodeURIComponent(item.id)}`;
    case "session":
      return `/transcripts/studio?session=${encodeURIComponent(item.id)}`;
    case "cleanup":
      return `/transcripts/cleanup?session=${encodeURIComponent(item.id)}`;
    case "unsorted":
      return "/transcripts/scribe/unsorted";
  }
}

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
  const KindIcon = meta.icon;
  const href = primaryHref(item);

  const subtitle =
    item.kind === "processor"
      ? [
          item.sourceType,
          formatDuration(item.durationSeconds),
          item.wordCount != null ? `${item.wordCount} words` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : item.kind === "unsorted"
        ? [
            formatDuration(
              item.durationMs != null ? item.durationMs / 1000 : null,
            ),
            `capture #${item.segmentIndex + 1}`,
          ].join(" · ")
        : [
            item.status,
            formatDuration(item.durationMs / 1000),
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
          <span title={item.updatedAt}>{formatRelative(item.updatedAt)}</span>
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
