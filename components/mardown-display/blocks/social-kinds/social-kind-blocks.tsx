"use client";

/**
 * Canonical components for the social-intelligence kinds (SI-07c Stage B):
 * `social_post`, `post_transcript`, `social_profile`, `outlier_row`,
 * `ad_creative`, `swipe_collection`.
 *
 * Each is THE one renderer for its kind: dispatched standalone by the block
 * registry, rendered inside a Board tile, and composed for nested instances
 * (`social_post.transcript` is a `post_transcript`). The post card, outlier
 * badge and platform mark are the social feature's own (never re-drawn here).
 * serverData is the streaming `{ value, isComplete }` bridge output or a bare
 * kind value, both coerced by the search family's `readSearchKindValue`; every
 * field read is defensive because values are partial mid-stream. A null metric
 * renders "—", never 0. Every data surface carries the Copy / Copy-for-AI pair.
 */

import React, { useState } from "react";
import { BadgeCheck, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import { OutlierBadge } from "@/features/marketing/social/components/OutlierBadge";
import { PlatformMark } from "@/features/marketing/social/components/PlatformMark";
import { SocialPostCard } from "@/features/marketing/social/components/SocialPostCard";
import {
  postCardModelFromKind,
  postCardModelFromOutlierRow,
} from "@/features/marketing/social/kind-models";
import { relativeAge } from "@/features/marketing/social/mappers";
import { formatCompact, outlierBadgeModel } from "@/features/marketing/social/outlier";
import { num, readSearchKindValue, text } from "../search-kinds/search-kind-data";

interface SocialKindBlockProps {
  serverData?: unknown;
  className?: string;
}

const FRAME = "my-2 rounded-lg border border-border bg-card p-3";

/** "—" for a missing number, the compact form otherwise. */
const compact = (v: unknown): string => formatCompact(num(v));

// ─────────────────────────────────────────────────────────────────────────────
// post_transcript
// ─────────────────────────────────────────────────────────────────────────────

export function PostTranscriptBlock({ serverData, className }: SocialKindBlockProps) {
  const { value } = readSearchKindValue<"post_transcript">(serverData);
  const body = text(value.text);
  const words = num(value.word_count);
  const notes = (value.notes ?? []).filter((n): n is string => typeof n === "string");
  return (
    <div className={cn(FRAME, className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          Transcript
          {words !== null ? ` · ${compact(words)} words` : ""}
          {text(value.language) ? ` · ${value.language}` : ""}
        </p>
        {body ? (
          <CopyButtons
            size="xs"
            label="Copy transcript"
            hide={["export"]}
            human={() => body}
            agent={() => ({
              kind: "post_transcript",
              location: "AI Matrx — Social post",
              description: "The spoken words of one social post.",
              data: value,
            })}
            json={() => value}
          />
        ) : null}
      </div>
      {body ? (
        <p className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
          {body}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {value.status === "none" ? "No transcript for this post yet." : "Transcript is on its way."}
        </p>
      )}
      {notes.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// social_post
// ─────────────────────────────────────────────────────────────────────────────

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function SocialPostBlock({ serverData, className }: SocialKindBlockProps) {
  const { value } = readSearchKindValue<"social_post">(serverData);
  const [showTranscript, setShowTranscript] = useState(false);
  const card = postCardModelFromKind(value);
  const stat = value.stat ?? null;
  const caption = text(value.caption) ?? text(value.title);
  const hashtags = (value.hashtags ?? []).filter((h): h is string => typeof h === "string");
  const transcript = value.transcript ?? null;
  const hasTranscript = Boolean(transcript && text(transcript.text));
  const rate = num(stat?.engagement_rate);

  return (
    <div className={cn(FRAME, "flex flex-col gap-3", className)}>
      <div className="flex min-w-0 gap-3">
        <SocialPostCard post={card} compact className="w-28 shrink-0 self-start sm:w-32" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <PlatformMark platform={card.platform} size={16} />
              <span className="truncate">
                {card.handle ? `@${card.handle}` : card.platform}
                {card.postedAt ? ` · ${relativeAge(card.postedAt)}` : ""}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <OutlierBadge model={outlierBadgeModel(card.outlier)} />
              <CopyButtons
                size="xs"
                label="Copy post"
                hide={["export"]}
                human={() => [caption, hasTranscript ? transcript?.text : null].filter(Boolean).join("\n\n")}
                agent={() => ({
                  kind: "social_post",
                  location: "AI Matrx — Social post",
                  description: "One public social post with its metrics, outlier score and transcript.",
                  data: value,
                })}
                json={() => value}
              />
            </div>
          </div>
          {card.hookLine ? (
            <p className="text-sm font-medium leading-snug text-foreground">{card.hookLine}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No caption.</p>
          )}
          {caption && caption !== card.hookLine ? (
            <p className="line-clamp-3 text-xs text-muted-foreground">{caption}</p>
          ) : null}
          <div className="grid grid-cols-4 gap-2">
            <MetricCell label="Views" value={compact(stat?.views)} />
            <MetricCell label="Likes" value={compact(stat?.likes)} />
            <MetricCell label="Comments" value={compact(stat?.comments)} />
            <MetricCell
              label="Engagement"
              value={rate === null ? "—" : `${(rate * (rate <= 1 ? 100 : 1)).toFixed(1)}%`}
            />
          </div>
          {hashtags.length > 0 ? (
            <p className="line-clamp-1 text-[11px] text-muted-foreground">
              {hashtags.slice(0, 8).map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
            </p>
          ) : null}
          {card.url ? (
            <a
              href={card.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              Open original
            </a>
          ) : null}
        </div>
      </div>

      {transcript ? (
        <div>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground"
          >
            {showTranscript ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Transcript{hasTranscript ? "" : " (none yet)"}
          </button>
          {showTranscript ? <PostTranscriptBlock serverData={transcript} className="my-1" /> : null}
        </div>
      ) : null}

      {(value.media_notes ?? []).length > 0 ? (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          {(value.media_notes ?? []).map((n) => (
            <li key={String(n)}>{String(n)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// social_profile
// ─────────────────────────────────────────────────────────────────────────────

export function SocialProfileBlock({ serverData, className }: SocialKindBlockProps) {
  const { value } = readSearchKindValue<"social_profile">(serverData);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const platform = text(value.platform) ?? "";
  const handle = text(value.handle);
  const name = text(value.display_name) ?? (handle ? `@${handle}` : "Profile");
  const url = text(value.profile_url);
  const avatar = text(value.avatar_url);
  const bio = text(value.bio);
  return (
    <div className={cn(FRAME, "flex flex-col gap-2", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
          {avatar && !avatarFailed ? (
            <img
              src={avatar}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <PlatformMark platform={platform} size={22} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground">
            <span className="truncate">{name}</span>
            {value.is_verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
          </p>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <PlatformMark platform={platform} size={14} />
            {handle ? `@${handle}` : ""}
            {text(value.category) ? ` · ${value.category}` : ""}
          </p>
        </div>
        <CopyButtons
          size="xs"
          label="Copy profile"
          hide={["export"]}
          human={() => [name, handle ? `@${handle}` : null, bio].filter(Boolean).join("\n")}
          agent={() => ({
            kind: "social_profile",
            location: "AI Matrx — Social profile",
            description: "One public social account with its audience numbers.",
            data: value,
          })}
          json={() => value}
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <MetricCell label="Followers" value={compact(value.follower_count)} />
        <MetricCell label="Following" value={compact(value.following_count)} />
        <MetricCell label="Posts" value={compact(value.post_count)} />
        <MetricCell label="Likes" value={compact(value.total_likes)} />
      </div>
      {bio ? <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{bio}</p> : null}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          Open profile
        </a>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// outlier_row
// ─────────────────────────────────────────────────────────────────────────────

export function OutlierRowBlock({ serverData, className }: SocialKindBlockProps) {
  const { value } = readSearchKindValue<"outlier_row">(serverData);
  const card = postCardModelFromOutlierRow(value);
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-md border border-border bg-card p-2", className)}>
      <OutlierBadge model={outlierBadgeModel(card.outlier)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground" title={card.hookLine}>
          {card.hookLine || "No caption"}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {card.handle ? `@${card.handle} · ` : ""}
          {relativeAge(card.postedAt)} · {compact(card.views)} views
        </p>
      </div>
      {card.url ? (
        <a
          href={card.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open original"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ad_creative
// ─────────────────────────────────────────────────────────────────────────────

export function AdCreativeBlock({ serverData, className }: SocialKindBlockProps) {
  const { value } = readSearchKindValue<"ad_creative">(serverData);
  const advertiser = text(value.advertiser_name);
  const headline = text(value.headline);
  const body = text(value.body);
  const landing = text(value.landing_url);
  const ran =
    value.started_at && value.ended_at
      ? `${relativeAge(value.started_at)} to ${relativeAge(value.ended_at)}`
      : value.started_at
        ? `since ${relativeAge(value.started_at)}`
        : null;
  return (
    <div className={cn(FRAME, "flex flex-col gap-1.5", className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-xs text-muted-foreground">
          {advertiser ?? "Advertiser"} · {text(value.library) ?? "library"}
          {value.is_active === true ? " · running" : value.is_active === false ? " · stopped" : ""}
        </p>
        <CopyButtons
          size="xs"
          label="Copy ad"
          hide={["export"]}
          human={() => [headline, body].filter(Boolean).join("\n\n")}
          agent={() => ({
            kind: "ad_creative",
            location: "AI Matrx — Ad library",
            description: "One ad from an ad library: copy, call to action and landing page.",
            data: value,
          })}
          json={() => value}
        />
      </div>
      {headline ? <p className="text-sm font-medium text-foreground">{headline}</p> : null}
      {body ? <p className="line-clamp-4 whitespace-pre-line text-xs text-muted-foreground">{body}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {text(value.cta) ? <span>CTA: {value.cta}</span> : null}
        {ran ? <span>{ran}</span> : null}
        {num(value.impressions) !== null ? <span>{compact(value.impressions)} impressions</span> : null}
      </div>
      {landing ? (
        <a
          href={landing}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex w-fit max-w-full items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{landing}</span>
        </a>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// swipe_collection
// ─────────────────────────────────────────────────────────────────────────────

export function SwipeCollectionBlock({ serverData, className }: SocialKindBlockProps) {
  const { value } = readSearchKindValue<"swipe_collection">(serverData);
  return (
    <div className={cn(FRAME, className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-foreground">{text(value.name) ?? "Collection"}</p>
        <CopyButtons
          size="xs"
          label="Copy collection"
          hide={["export"]}
          human={() => [value.name, value.description].filter(Boolean).join("\n")}
          agent={() => ({
            kind: "swipe_collection",
            location: "AI Matrx — Swipe file",
            description: "A saved group of posts, ads and profiles kept for reference.",
            data: value,
          })}
          json={() => value}
        />
      </div>
      {text(value.description) ? (
        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{value.description}</p>
      ) : null}
    </div>
  );
}
