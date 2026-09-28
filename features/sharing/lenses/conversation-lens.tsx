"use client";

/**
 * The shared-chat lens — what an Anyone link to an AI chat shows (access
 * ladder T-19). Champion: Claude's and ChatGPT's shared-chat pages — the
 * transcript itself, read-only, readable on a phone, with "continue this chat"
 * at the end.
 *
 * Text renders through the ONE rich-content core, statically, so every word is
 * in the server-rendered HTML (fast first paint, no layout shift). The data is
 * the database's narrowed projection (`./conversation-transcript.ts`): tool
 * steps are names only, private attachments are named but never served.
 */

import Link from "next/link";
import {
  ArrowUpRight,
  FileText,
  MessageSquare,
  Paperclip,
  Wrench,
} from "lucide-react";
import { RichContentStaticStandard } from "@/components/rich-content/RichContentStaticProse";
import { Button } from "@/components/ui/button";
import { DuplicateToEditButton } from "@/features/sharing/components/DuplicateToEditButton";
import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";
import {
  readSharedConversation,
  toolStepLabel,
  type SharedChatBlock,
  type SharedChatTurn,
} from "./conversation-transcript";
import { resourceTitle } from "./default-renderers";

function ToolStep({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Used {toolStepLabel(name)}
        {count > 1 ? ` ×${count}` : ""}
      </span>
    </div>
  );
}

function MediaBlock({
  block,
}: {
  block: Extract<SharedChatBlock, { type: "media" }>;
}) {
  const name = block.title ?? `${block.kind} attachment`;
  if (!block.url) {
    return (
      <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-foreground">{name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          · private, not included in the shared view
        </span>
      </div>
    );
  }
  if (block.kind === "image") {
    return (
      // A public-CDN URL (the only kind the projection serves) — a raw tag is
      // right on this anonymous page, as in ./file-lens.tsx.
      <img
        src={block.url}
        alt={name}
        width={block.width ?? undefined}
        height={block.height ?? undefined}
        loading="lazy"
        className="h-auto max-h-[28rem] w-auto max-w-full rounded-lg border border-border"
      />
    );
  }
  if (block.kind === "audio") {
    return <audio src={block.url} controls className="w-full max-w-md" />;
  }
  if (block.kind === "video") {
    return (
      <video
        src={block.url}
        controls
        className="max-h-[28rem] w-full max-w-full rounded-lg border border-border"
      />
    );
  }
  return (
    <a
      href={block.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{name}</span>
    </a>
  );
}

function UserTurn({ turn }: { turn: SharedChatTurn }) {
  return (
    <div className="flex flex-col items-end gap-2">
      {turn.blocks.map((block, i) =>
        block.type === "text" ? (
          <div
            key={i}
            className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-base text-foreground sm:max-w-[75%]"
          >
            {block.text}
          </div>
        ) : block.type === "media" ? (
          <MediaBlock key={i} block={block} />
        ) : null,
      )}
    </div>
  );
}

function AssistantTurn({ turn }: { turn: SharedChatTurn }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {turn.blocks.map((block, i) => {
        if (block.type === "text") {
          return (
            <div key={i} className="min-w-0">
              <RichContentStaticStandard source={block.text} />
            </div>
          );
        }
        if (block.type === "tool") {
          return <ToolStep key={i} name={block.name} count={block.count} />;
        }
        return <MediaBlock key={i} block={block} />;
      })}
    </div>
  );
}

export function ConversationShareLens({
  result,
  token,
}: {
  result: ResolvedShareToken;
  token: string;
}) {
  const transcript = readSharedConversation(result);
  const title = resourceTitle(result);
  const createdAt =
    typeof result.resource?.["created_at"] === "string"
      ? new Date(result.resource["created_at"] as string)
      : null;

  return (
    <article className="mx-auto w-full max-w-3xl pb-10">
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          <span>Shared chat</span>
          {transcript && (
            <span>
              · {transcript.total} {transcript.total === 1 ? "message" : "messages"}
            </span>
          )}
          {createdAt && !Number.isNaN(createdAt.getTime()) && (
            <span>
              ·{" "}
              {createdAt.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </span>
          )}
        </p>
      </header>

      {!transcript ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          This chat&apos;s messages could not be loaded from the link. Ask the
          person who shared it to send a new link.
        </p>
      ) : transcript.turns.length === 0 ? (
        <p className="text-sm text-muted-foreground">This chat has no messages yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {transcript.turns.map((turn) =>
            turn.role === "user" ? (
              <UserTurn key={turn.id} turn={turn} />
            ) : (
              <AssistantTurn key={turn.id} turn={turn} />
            ),
          )}
          {transcript.truncated && (
            <p className="text-center text-sm text-muted-foreground">
              Showing the first part of a long chat. Continue it to read the rest.
            </p>
          )}
        </div>
      )}

      <section className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-4 py-6 text-center">
        <p className="text-base font-medium text-foreground">
          Pick up where this chat left off
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          Save a copy to your own AI Matrx account and keep the conversation
          going. It&apos;s free to start.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {result.resourceId && (
            <DuplicateToEditButton
              resourceType="conversation"
              resourceId={result.resourceId}
              returnPath={`/s/${token}`}
              shareToken={token}
              size="default"
            />
          )}
          <Button asChild variant="outline">
            <Link href="/chat">
              Try AI Matrx
              <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </section>
    </article>
  );
}
