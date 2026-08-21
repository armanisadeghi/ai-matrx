"use client";

import React from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe2,
  MonitorUp,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import type { FileSource } from "@/features/files/handler/types";
import type { MediaRef } from "@/features/files/types";
import { useOpenCloudBrowserCanvas } from "@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { useOpenImageViewerWindow } from "@/features/overlays/openers/imageViewer";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { cn } from "@/lib/utils";

import type { ToolRendererProps } from "../../types";
import { ResultValue } from "../../result-fields/ResultValue";
import { ToolResultCard } from "../_shared-entity/ToolResultCard";
import {
  cloudBrowserActivity,
  cloudBrowserProfileId,
  cloudBrowserRunId,
  cloudBrowserRunSubtitle,
  cloudBrowserRunTitle,
  rawEntryObject,
} from "./cloudBrowserRun";

interface CloudBrowserRunCardProps {
  entries: ToolLifecycleEntry[];
  conversationId?: string;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  className?: string;
  compact?: boolean;
}

function mediaSource(media: MediaRef): FileSource | null {
  if (media.file_id) return { kind: "file_id", fileId: media.file_id };
  if (media.url) return { kind: "external_url", url: media.url };
  return null;
}

function ScreenshotPreview({
  media,
  index,
}: {
  media: MediaRef;
  index: number;
}) {
  const openImageViewer = useOpenImageViewerWindow();
  const source = mediaSource(media);
  const resolvedUrl = useFileSrc(source);
  const label = `Cloud Browser screenshot ${index + 1}`;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
      <InlineMediaRef
        ref={{ ...media }}
        as="img"
        size="fill"
        fit="contain"
        rounded="lg"
        alt={label}
        fallback="skeleton"
        onClick={() => {
          if (!resolvedUrl) return;
          openImageViewer({
            images: [resolvedUrl],
            alts: [label],
            title: "Cloud Browser screenshot",
          });
        }}
        className={cn(
          "max-h-80 w-full bg-muted/20 object-contain transition-opacity",
          resolvedUrl && "cursor-zoom-in hover:opacity-95",
        )}
      />
    </div>
  );
}

function ActivityUrl({ url }: { url: string }) {
  let label = url;
  try {
    const parsed = new URL(url);
    label = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    // Preserve the honest raw destination when it is not a valid absolute URL.
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="inline-flex min-w-0 max-w-[min(22rem,48vw)] items-center gap-1 text-primary hover:underline"
      title={url}
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

export function CloudBrowserRunCard({
  entries,
  conversationId,
  expanded,
  onToggleExpanded,
  className,
  compact = false,
}: CloudBrowserRunCardProps) {
  const openBrowser = useOpenCloudBrowserCanvas();
  const runId = cloudBrowserRunId(entries);
  const profileId = cloudBrowserProfileId(entries);
  const activities = entries.map(cloudBrowserActivity);
  const lastAction = activities.at(-1)?.action;
  const browserIsClosed = lastAction === "close";
  const latestUrl = [...activities]
    .reverse()
    .find((activity) => activity.url)?.url;
  const activityBody = (
    <div className="px-3 py-2">
      <ol className="space-y-0.5">
        {activities.map((activity, index) => {
          const Icon = activity.icon;
          return (
            <li key={entries[index]?.callId ?? index} className="min-w-0">
              <div className="flex min-h-6 min-w-0 items-center gap-2 text-[12px] leading-5">
                <Icon
                  className={cn("size-3.5 shrink-0", activity.iconClassName)}
                  strokeWidth={2}
                />
                <span
                  className={cn(
                    "min-w-0 truncate",
                    activity.isError
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                  title={activity.label}
                >
                  {activity.label}
                </span>
                {activity.url && (
                  <span className="ml-auto hidden min-w-0 shrink sm:block">
                    <ActivityUrl url={activity.url} />
                  </span>
                )}
              </div>
              {activity.media && (
                <ScreenshotPreview media={activity.media} index={index} />
              )}
            </li>
          );
        })}
      </ol>

      <details className="group/details mt-1.5 border-t border-border/40 pt-1.5">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-3" />
          Details
        </summary>
        <div className="mt-1.5 max-h-64 space-y-2 overflow-y-auto rounded-md bg-muted/30 p-2 scrollbar-thin">
          {entries.map((entry, index) => (
            <div key={entry.callId} className="min-w-0">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Step {index + 1}
              </p>
              <ResultValue value={rawEntryObject(entry)} density="full" />
            </div>
          ))}
        </div>
      </details>
    </div>
  );

  if (compact) {
    return (
      <div className={cn("mb-1 w-full min-w-0", className)}>
        <div className="flex min-h-7 min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          <Globe2 className="size-3.5 shrink-0 text-info" />
          <button
            type="button"
            onClick={onToggleExpanded}
            className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-accent/40 hover:text-foreground"
            aria-expanded={expanded}
          >
            <span className="min-w-0 truncate">
              Continued browsing · {entries.length} actions
            </span>
            {expanded ? (
              <ChevronDown className="size-3 shrink-0" />
            ) : (
              <ChevronRight className="size-3 shrink-0" />
            )}
          </button>
          {latestUrl && (
            <span className="hidden min-w-0 flex-1 sm:block">
              <ActivityUrl url={latestUrl} />
            </span>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() =>
              openBrowser({
                initialProfileId: profileId,
                runId,
                conversationId,
              })
            }
            className="ml-auto size-7 shrink-0 rounded-md"
            aria-label={browserIsClosed ? "View browser" : "View live browser"}
            title={browserIsClosed ? "View browser" : "View live browser"}
          >
            <MonitorUp className="size-3.5" />
          </Button>
        </div>
        {expanded && <div className="mt-1">{activityBody}</div>}
      </div>
    );
  }

  return (
    <ToolResultCard
      icon={Globe2}
      iconClassName="text-info"
      title={cloudBrowserRunTitle(entries)}
      sub={cloudBrowserRunSubtitle(entries)}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      className={className}
      headerAction={
        <Button
          type="button"
          size="sm"
          variant={browserIsClosed ? "outline" : "default"}
          onClick={() =>
            openBrowser({
              initialProfileId: profileId,
              runId,
              conversationId,
            })
          }
          className="h-8 rounded-lg px-2.5 text-xs"
        >
          <MonitorUp className="size-3.5" />
          {browserIsClosed ? "View browser" : "View live browser"}
        </Button>
      }
    >
      {activityBody}
    </ToolResultCard>
  );
}

export const CloudBrowserInline: React.FC<ToolRendererProps> = ({
  entry,
  conversationId,
  expanded,
  onToggleExpanded,
}) => (
  <CloudBrowserRunCard
    entries={[entry]}
    conversationId={conversationId}
    expanded={expanded}
    onToggleExpanded={onToggleExpanded}
  />
);

export default CloudBrowserInline;
