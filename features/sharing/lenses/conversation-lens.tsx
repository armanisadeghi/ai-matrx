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
 * steps render through the chat's own tool cards from their CLEANED record;
 * attachments stream from the files service's token-scoped child route
 * (`/share/{token}/files/{fileId}`, access ladder T-19b) — images inline,
 * documents as download cards; decision questions/answers and speech scripts
 * render in their read-only transcript form.
 */

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowUpRight,
  Download,
  FileText,
  ImageOff,
  MessageSquare,
  Paperclip,
} from "lucide-react";
import { RichContentStaticStandard } from "@/components/rich-content/RichContentStaticProse";
import { Button } from "@/components/ui/button";
import { DuplicateToEditButton } from "@/features/sharing/components/DuplicateToEditButton";
import { DecisionQuestionsTranscriptView } from "@/features/agents/decision-questions/DecisionQuestionsTranscriptView";
import { SpeechScriptTranscriptView } from "@/features/agents/speech-script/SpeechScriptTranscriptView";
import DecisionAnswersBlock from "@/components/mardown-display/blocks/decision-answers/DecisionAnswersBlock";
import {
  pythonBaseUrl,
  shareChildFileUrls,
} from "@/features/files/handler/utils/python-base";
import { formatFileSize } from "@/features/files/utils/format";
import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";
import {
  readSharedConversation,
  type SharedChatBlock,
  type SharedChatTurn,
} from "./conversation-transcript";
import { resourceTitle } from "./default-renderers";

// The chat's tool renderers are a large graph; keep them out of every other
// share lens's chunk. Rendered on the server too (default ssr), so the tool
// lines are in the first paint.
const SharedConversationToolSteps = dynamic(
  () => import("./conversation-tool-steps"),
);

type MediaBlockData = Extract<SharedChatBlock, { type: "media" }>;

const noopSubscribe = () => () => {};
function filesBaseOrNull(): string | null {
  try {
    return pythonBaseUrl();
  } catch {
    return null;
  }
}

/**
 * The files-service origin the attachment URLs point at. The server renders
 * the default origin; the browser may resolve a different one (an admin's
 * per-service override) — `useSyncExternalStore` hands the server value to
 * hydration and then re-renders with the browser's, instead of keeping a
 * mismatched `src` forever.
 */
function useFilesBaseUrl(): string | null {
  return useSyncExternalStore(noopSubscribe, filesBaseOrNull, filesBaseOrNull);
}

/** Where this attachment's bytes come from for a link holder, if anywhere. */
function useMediaSources(
  block: MediaBlockData,
  token: string,
): { inline: string; attachment: string } | null {
  const base = useFilesBaseUrl();
  if (block.fileId && base) {
    return shareChildFileUrls(token, block.fileId, { baseUrl: base });
  }
  if (block.url) return { inline: block.url, attachment: block.url };
  return null;
}

function mediaName(block: MediaBlockData): string {
  return block.title ?? (block.kind === "image" ? "Image" : `${block.kind} attachment`);
}

function FileCard({
  block,
  href,
  note,
}: {
  block: MediaBlockData;
  href: string | null;
  note?: string;
}) {
  const name = mediaName(block);
  const meta = [
    block.mimeType?.split("/")[1]?.toUpperCase(),
    block.sizeBytes != null ? formatFileSize(block.sizeBytes) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {note ?? (meta || "Attachment")}
        </span>
      </span>
      {href ? (
        <Download className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </>
  );
  const cls =
    "flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5";
  return href ? (
    <a
      href={href}
      download={block.title ?? true}
      rel="noreferrer"
      className={`${cls} hover:bg-accent`}
      aria-label={`Download ${name}`}
    >
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function MediaBlock({ block, token }: { block: MediaBlockData; token: string }) {
  const src = useMediaSources(block, token);
  const [failed, setFailed] = useState(false);
  const name = mediaName(block);

  if (!src) {
    return (
      <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-foreground">{name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          · not included in the shared view
        </span>
      </div>
    );
  }
  if (block.kind === "image") {
    if (failed) {
      return (
        <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <ImageOff className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">
            {name} could not be loaded. Reload the page, or ask the person who
            shared it to send a new link.
          </span>
        </div>
      );
    }
    return (
      <a href={src.inline} target="_blank" rel="noreferrer" className="block max-w-full">
        {/* A token-scoped byte URL on the files service, readable by anyone
            holding this link — a raw tag is right on this anonymous page, as in
            ./file-lens.tsx. */}
        <img
          src={src.inline}
          alt={name}
          width={block.width ?? undefined}
          height={block.height ?? undefined}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-auto max-h-[28rem] w-auto max-w-full rounded-lg border border-border"
        />
      </a>
    );
  }
  if (block.kind === "audio") {
    return (
      <div className="flex w-full max-w-md flex-col gap-1">
        <audio src={src.inline} controls preload="none" className="w-full" />
        <FileCard block={block} href={src.attachment} />
      </div>
    );
  }
  if (block.kind === "video") {
    return (
      <video
        src={src.inline}
        controls
        preload="metadata"
        className="max-h-[28rem] w-full max-w-full rounded-lg border border-border"
      />
    );
  }
  return <FileCard block={block} href={src.attachment} />;
}

function StructuredBlock({
  block,
}: {
  block: Extract<
    SharedChatBlock,
    { type: "decision_questions" | "decision_answers" | "speech_script" }
  >;
}) {
  if (block.type === "decision_questions") {
    return <DecisionQuestionsTranscriptView payload={block.payload} />;
  }
  if (block.type === "speech_script") {
    return <SpeechScriptTranscriptView payload={block.payload} />;
  }
  return <DecisionAnswersBlock serverData={{ payload: block.payload }} />;
}

function Block({
  block,
  token,
  conversationId,
}: {
  block: SharedChatBlock;
  token: string;
  conversationId: string;
}) {
  switch (block.type) {
    case "text":
      return (
        <div className="min-w-0">
          <RichContentStaticStandard source={block.text} />
        </div>
      );
    case "tools":
      return (
        <SharedConversationToolSteps
          tools={block.tools}
          conversationId={conversationId}
        />
      );
    case "media":
      return <MediaBlock block={block} token={token} />;
    default:
      return <StructuredBlock block={block} />;
  }
}

function UserTurn({
  turn,
  token,
  conversationId,
}: {
  turn: SharedChatTurn;
  token: string;
  conversationId: string;
}) {
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
        ) : (
          <div key={i} className="flex max-w-[85%] justify-end sm:max-w-[75%]">
            <Block block={block} token={token} conversationId={conversationId} />
          </div>
        ),
      )}
    </div>
  );
}

function AssistantTurn({
  turn,
  token,
  conversationId,
}: {
  turn: SharedChatTurn;
  token: string;
  conversationId: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {turn.blocks.map((block, i) => (
        <Block key={i} block={block} token={token} conversationId={conversationId} />
      ))}
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
  const conversationId = result.resourceId ?? "shared-conversation";
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
              <UserTurn
                key={turn.id}
                turn={turn}
                token={token}
                conversationId={conversationId}
              />
            ) : (
              <AssistantTurn
                key={turn.id}
                turn={turn}
                token={token}
                conversationId={conversationId}
              />
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
