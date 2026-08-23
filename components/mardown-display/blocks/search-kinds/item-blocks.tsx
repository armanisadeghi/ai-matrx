"use client";

/**
 * Canonical components for the search item kinds: `web_result`,
 * `news_result`, `video_result`, `faq_item`, `discussion_result`.
 *
 * Each is THE one renderer for its kind (THE CANONICAL COMPONENT LAW):
 * dispatched standalone by the block registry AND composed by
 * `WebSearchResultsBlock` for nested instances. serverData is the streaming
 * `{ value, isComplete }` bridge output or a bare kind value — both coerced
 * by `readSearchKindValue`; every field read is defensive because values are
 * partial mid-stream.
 *
 * Visual idiom: the Google-done-right row from the canonical tool-viz search
 * renderer (SearchInline.ResultRow) for web results; the NewsInline 16:9
 * thumbnail card for news; a duration-badged thumbnail row for videos.
 */

import React, { useState } from "react";
import {
  ExternalLink,
  MessagesSquare,
  Play,
  HelpCircle,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/features/tool-call-visualization/renderers/search/parseSearch";
import {
  dateLine,
  formatDuration,
  num,
  readSearchKindValue,
  items,
  text,
} from "./search-kind-data";
import {
  BreadcrumbLine,
  RatingStars,
  SearchChip,
  SearchFavicon,
} from "./search-kind-shared";

interface SearchKindBlockProps {
  serverData?: unknown;
  className?: string;
}

/** External thumbnail with a hide-on-error guard (provider media, not ours). */
const Thumb: React.FC<{ src: string; className?: string; alt?: string }> = ({
  src,
  className,
  alt = "",
}) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
     
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// web_result
// ─────────────────────────────────────────────────────────────────────────────

export function WebResultBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue<"web_result">(serverData);
  const title = text(value.title);
  const url = text(value.url);
  if (!title) return null;

  const siteName = text(value.site_name);
  const snippet = text(value.snippet);
  const date = dateLine(value, formatDate);
  const rating = value.rating ?? null;
  const sitelinks = items(value.sitelinks);
  const thumbnail = text(value.thumbnail);

  return (
    <div className={cn("group/result", className)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Favicon + site identity over the breadcrumb, Google's layout. */}
          <div className="flex items-center gap-3">
            <SearchFavicon
              iconUrl={text(value.favicon)}
              url={url}
              className="h-9 w-9 flex-shrink-0 rounded-full border border-border bg-card p-1.5"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium leading-tight text-foreground">
                {siteName ?? ""}
              </div>
              <BreadcrumbLine url={url} displayedUrl={text(value.displayed_url)} />
            </div>
          </div>

          <a
            href={url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="group/link mt-1.5 flex items-start gap-1.5"
          >
            <span className="text-lg font-medium leading-snug text-primary underline-offset-2 group-hover/link:underline">
              {title}
            </span>
            <ExternalLink className="mt-1.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/result:opacity-100" />
          </a>

          {snippet && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {snippet}
            </p>
          )}

          {(date || rating || text(value.author)) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {rating && typeof rating.value === "number" && (
                <RatingStars
                  value={rating.value}
                  bestPossible={num(rating.best_possible)}
                  count={num(rating.count)}
                />
              )}
              {date && <span className="opacity-80">{date}</span>}
              {text(value.author) && <span>{text(value.author)}</span>}
            </div>
          )}

          {sitelinks.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {sitelinks.slice(0, 6).map((link, i) => {
                const linkTitle = text(link.title);
                const linkUrl = text(link.url);
                if (!linkTitle || !linkUrl) return null;
                return (
                  <a
                    key={i}
                    href={linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    {linkTitle}
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {thumbnail && (
          <Thumb
            src={thumbnail}
            className="mt-1 h-16 w-24 flex-shrink-0 rounded-md border border-border object-cover"
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// news_result
// ─────────────────────────────────────────────────────────────────────────────

export function NewsResultBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue<"news_result">(serverData);
  const title = text(value.title);
  const url = text(value.url);
  if (!title) return null;

  const thumbnail = text(value.thumbnail);
  const date = dateLine(value, formatDate);

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group flex max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40",
        className,
      )}
    >
      {thumbnail && (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <Thumb
            src={thumbnail}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <SearchFavicon
            iconUrl={text(value.source_logo)}
            url={url}
            className="h-4 w-4 rounded"
          />
          <span className="truncate">{text(value.site_name) ?? ""}</span>
          {value.is_breaking === true && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              <Radio className="h-2.5 w-2.5" />
              Breaking
            </span>
          )}
        </div>
        <div className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
          {title}
        </div>
        {text(value.snippet) && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {text(value.snippet)}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          {date && <span>{date}</span>}
          {text(value.author) && <span className="truncate">· {text(value.author)}</span>}
        </div>
      </div>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// video_result
// ─────────────────────────────────────────────────────────────────────────────

export function VideoResultBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue<"video_result">(serverData);
  const title = text(value.title);
  const url = text(value.url);
  if (!title) return null;

  const thumbnail = text(value.thumbnail);
  const duration = num(value.duration_seconds);
  const date = dateLine(value, formatDate);
  const byline = [text(value.channel), text(value.platform)]
    .filter(Boolean)
    .join(" · ");

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group flex max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40",
        className,
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {thumbnail ? (
          <Thumb src={thumbnail} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Play className="h-8 w-8" />
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="rounded-full bg-background/80 p-2.5">
            <Play className="h-5 w-5 fill-current text-foreground" />
          </span>
        </span>
        {duration !== null && duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
            {formatDuration(duration)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
          {title}
        </div>
        {(byline || date) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {byline && <span className="truncate">{byline}</span>}
            {date && <span>{byline ? "· " : ""}{date}</span>}
          </div>
        )}
      </div>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// faq_item — shared with authored SEO FAQs (merged kind): source fields are
// optional; a bare question with no answer is the honest Google-PAA state.
// ─────────────────────────────────────────────────────────────────────────────

export function FaqItemBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue<"faq_item">(serverData);
  const question = text(value.question);
  if (!question) return null;

  const answer = text(value.answer);
  const sourceUrl = text(value.source_url);
  const sourceTitle = text(value.source_title);

  return (
    <div className={cn("rounded-md border border-border bg-card p-3", className)}>
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{question}</div>
          {answer && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {answer}
            </p>
          )}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1.5 inline-flex max-w-full items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
            >
              <SearchFavicon
                iconUrl={text(value.favicon)}
                url={sourceUrl}
                className="h-3.5 w-3.5 rounded"
              />
              <span className="truncate">{sourceTitle ?? sourceUrl}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// discussion_result
// ─────────────────────────────────────────────────────────────────────────────

export function DiscussionResultBlock({
  serverData,
  className,
}: SearchKindBlockProps) {
  const { value } = readSearchKindValue<"discussion_result">(serverData);
  const title = text(value.title);
  const url = text(value.url);
  if (!title) return null;

  const answers = num(value.answer_count);
  const score = text(value.score);
  const date = dateLine(value, formatDate);
  const body = text(value.top_answer) ?? text(value.question_text) ?? text(value.snippet);

  return (
    <div className={cn("group/result flex items-start gap-3", className)}>
      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MessagesSquare className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <SearchFavicon
            iconUrl={text(value.favicon)}
            url={url}
            className="h-3.5 w-3.5 rounded"
          />
          <span className="truncate">{text(value.forum_name) ?? ""}</span>
          {date && <span className="opacity-80">· {date}</span>}
        </div>
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 block text-sm font-medium leading-snug text-primary underline-offset-2 hover:underline"
        >
          {title}
        </a>
        {body && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {body}
          </p>
        )}
        {(answers !== null || score) && (
          <div className="mt-1 flex items-center gap-2">
            {answers !== null && (
              <SearchChip>{Intl.NumberFormat().format(answers)} answers</SearchChip>
            )}
            {score && <SearchChip>{score}</SearchChip>}
          </div>
        )}
      </div>
    </div>
  );
}
