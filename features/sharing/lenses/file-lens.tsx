"use client";

/**
 * The shared-FILE lens — the recipient landing for resource type `file`
 * (and the future dedicated pdf entry, if one is ever split out).
 *
 * A shared file is a product surface, not a download card: the recipient is
 * a prospect (see common-docs/systems/sharing-experience/VISION.md — a share
 * IS a referral). Two jobs:
 *
 *   1. VIEW IT PROPERLY — full-bleed use of the landing (the registry marks
 *      this lens full-bleed; the shell drops its padded column), a true
 *      fullscreen affordance, and the CANONICAL PDF viewer
 *      (`PdfDocumentRenderer` — real paging/zoom/rotate/fit, progressive
 *      Range loading) instead of a cramped iframe. Bytes come from aidream's
 *      token-validated `/share/{token}` endpoint (`shareUrls(token)`) — a
 *      durable public URL, NOT an expiring signed URL, so raw media tags and
 *      pdfjs fetches are safe here (the anonymous page can't re-mint).
 *
 *   2. SHOW WHAT THE PLATFORM CAN DO — a per-type capability section under
 *      the viewer turns the landing into the conversion moment ("Extract the
 *      tables from this PDF → sign up free"). Anonymous visitors get honest
 *      CTAs only — nothing here widens what the token authorizes.
 *
 * PdfDocumentRenderer is a heavy engine (react-pdf/pdfjs); it keeps a
 * `React.lazy` boundary here (the in-gate form — same pattern as
 * `PublicCanvasRenderer` in ./default-renderers.tsx) so non-PDF shares and
 * non-file shares never pay for it.
 */

import React from "react";
import Link from "next/link";
import {
  ArrowDown,
  BrainCircuit,
  Download,
  ExternalLink,
  FileIcon,
  FileSearch,
  FolderLock,
  ListChecks,
  Loader2,
  Maximize2,
  MessageCircleQuestion,
  Mic,
  Minimize2,
  ScanSearch,
  ShieldCheck,
  SlidersHorizontal,
  Table,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";
import { shareUrls } from "@/features/files/handler/utils/python-base";
import { formatFileSize } from "@/features/files/utils/format";
import { signUpHref } from "@/utils/auth/auth-destination";
import { resourceTitle } from "@/features/sharing/lenses/default-renderers";

// The one heavy engine on this lens — React.lazy in-gate boundary so the
// react-pdf/pdfjs chunk loads only when a PDF share actually renders.
const PdfDocumentRenderer = React.lazy(
  () => import("@/features/pdf/components/viewer/PdfDocumentRenderer"),
);

// useSyncExternalStore subscriptions (module-level so identities are stable).
const emptySubscribe = () => () => {};
const subscribeFullscreenChange = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
};

type PreviewKind = "pdf" | "image" | "video" | "audio" | "none";

function previewKind(mime: string): PreviewKind {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "none";
}

function str(
  resource: Record<string, unknown> | undefined,
  key: string,
): string {
  const v = resource?.[key];
  return typeof v === "string" ? v : "";
}

// ---------------------------------------------------------------------------
// Capability section — the per-type "what AI Matrx can do with this file"
// conversion moment. Copy is for a brilliant NON-technical recipient: zero
// jargon, verbs they recognize, one honest promise per card.
// ---------------------------------------------------------------------------

interface CapabilityCard {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}

const PDF_CAPABILITIES: CapabilityCard[] = [
  {
    icon: Table,
    title: "Extract the text and tables",
    body: "Turn this PDF into clean, editable text and real data — no retyping, no copy-paste cleanup.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Ask AI about this document",
    body: "Get answers, summaries, and explanations grounded in what is actually on these pages.",
  },
  {
    icon: ScanSearch,
    title: "Analyze and annotate",
    body: "Automatic page analysis with regions and annotations you can review side by side.",
  },
  {
    icon: ShieldCheck,
    title: "Redact sensitive information",
    body: "Find and remove private details before the document goes anywhere else — with a full audit trail.",
  },
];

const IMAGE_CAPABILITIES: CapabilityCard[] = [
  {
    icon: SlidersHorizontal,
    title: "Edit with AI",
    body: "Enhance, adjust, and transform images without design software.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Ask AI about this image",
    body: "Describe it, extract the text in it, or use it in an AI conversation.",
  },
  {
    icon: FolderLock,
    title: "Keep it organized and shareable",
    body: "One place for every file, with links like this one that just work.",
  },
];

const AV_CAPABILITIES: CapabilityCard[] = [
  {
    icon: Mic,
    title: "Transcribe this recording",
    body: "Accurate, readable transcripts — speakers, timestamps, and all.",
  },
  {
    icon: ListChecks,
    title: "Summarize and clean it up",
    body: "Turn a raw recording into notes, action items, or polished content.",
  },
  {
    icon: FolderLock,
    title: "Keep it organized and shareable",
    body: "One place for every file, with links like this one that just work.",
  },
];

const GENERIC_CAPABILITIES: CapabilityCard[] = [
  {
    icon: FileSearch,
    title: "Let AI read and work with your files",
    body: "Ask questions, pull out what matters, and reuse it anywhere.",
  },
  {
    icon: FolderLock,
    title: "Store and share securely",
    body: "One place for every file, with links like this one that just work.",
  },
  {
    icon: TrendingUp,
    title: "Turn expertise into results",
    body: "AI Matrx is where your knowledge becomes reliable, reusable work.",
  },
];

function capabilitiesFor(kind: PreviewKind): {
  heading: string;
  cards: CapabilityCard[];
} {
  switch (kind) {
    case "pdf":
      return {
        heading: "This PDF is more than a preview",
        cards: PDF_CAPABILITIES,
      };
    case "image":
      return {
        heading: "Do more with this image",
        cards: IMAGE_CAPABILITIES,
      };
    case "video":
    case "audio":
      return {
        heading: "Do more with this recording",
        cards: AV_CAPABILITIES,
      };
    default:
      return {
        heading: "Do more with your files",
        cards: GENERIC_CAPABILITIES,
      };
  }
}

function CapabilitySection({
  kind,
  token,
}: {
  kind: PreviewKind;
  token: string;
}) {
  const { heading, cards } = capabilitiesFor(kind);
  const href = signUpHref(`/s/${token}`);
  return (
    <section className="border-t border-border bg-card/60">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              AI Matrx
            </p>
            <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
              {heading}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This file was shared with AI Matrx — where AI actually works on
              your documents, not just stores them.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href={href}>
              Create your free account
              <ExternalLink className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.title}
              href={href}
              className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <card.icon className="mb-3 h-5 w-5 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                {card.title}
              </p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
                {card.body}
              </p>
              <span className="mt-3 text-xs font-medium text-primary opacity-80 transition-opacity group-hover:opacity-100">
                Try it free →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Viewer stage
// ---------------------------------------------------------------------------

function ViewerFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function NoPreviewCard({
  name,
  attachmentUrl,
}: {
  name: string;
  attachmentUrl: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <FileIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="mb-1 truncate text-sm font-semibold text-foreground">
          {name}
        </p>
        <p className="mb-6 text-sm text-muted-foreground">
          This file type has no online preview — download it to open it on
          your device.
        </p>
        <Button asChild>
          <a href={attachmentUrl}>
            <Download className="mr-1.5 h-4 w-4" />
            Download file
          </a>
        </Button>
      </div>
    </div>
  );
}

/**
 * Shared file: full-bleed viewer (canonical PDF viewer / native media) +
 * fullscreen + per-type capability CTAs. Registered full-bleed in
 * `./registry.tsx`, so this component owns the whole landing body.
 */
export function SharedFileLens({
  result,
  token,
}: {
  result: ResolvedShareToken;
  token: string;
}) {
  const name = str(result.resource, "file_name") || resourceTitle(result);
  const mime = str(result.resource, "mime_type");
  const sizeRaw = result.resource?.["size_bytes"];
  const size =
    typeof sizeRaw === "number" || typeof sizeRaw === "string"
      ? formatFileSize(Number(sizeRaw))
      : "—";
  const kind = previewKind(mime);
  const urls = shareUrls(token);

  const stageRef = React.useRef<HTMLDivElement>(null);
  const capabilitiesRef = React.useRef<HTMLElement | null>(null);
  // pdfjs cannot render on the server (no DOMMatrix) — `mounted` is false in
  // SSR/hydration output so the lazy viewer only ever renders in the browser.
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const isFullscreen = React.useSyncExternalStore(
    subscribeFullscreenChange,
    () => !!document.fullscreenElement,
    () => false,
  );
  const fullscreenSupported = mounted && !!document.fullscreenEnabled;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (stageRef.current) {
      void stageRef.current.requestFullscreen().catch(() => {
        // Some mobile browsers (iOS Safari) refuse element fullscreen —
        // the "Open in new tab" door remains beside this button.
      });
    }
  };

  const previewable = kind !== "none";

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin">
      {/* First screenful = the document. Header row + viewer fill the
          viewport exactly; the capability section sits below the fold. */}
      <div
        className={cn(
          "flex flex-col",
          previewable ? "h-full shrink-0" : "shrink-0",
        )}
      >
        {/* Compact identity + actions row */}
        <div className="flex items-center gap-2 border-b border-border bg-card/80 px-3 py-2 sm:px-4">
          <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-foreground">
              {name}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {[mime || "Shared file", size !== "—" ? size : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-muted-foreground"
              onClick={() =>
                capabilitiesRef.current?.scrollIntoView({ behavior: "smooth" })
              }
              aria-label="See what AI can do with this file"
            >
              <BrainCircuit className="h-4 w-4 text-primary" />
              <span className="ml-1.5 hidden lg:inline">What AI can do</span>
              <ArrowDown className="ml-1 hidden h-3.5 w-3.5 lg:inline" />
            </Button>
            {previewable && fullscreenSupported && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2"
                onClick={toggleFullscreen}
                aria-label={
                  isFullscreen ? "Exit full screen" : "View full screen"
                }
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
                <span className="ml-1.5 hidden md:inline">
                  {isFullscreen ? "Exit full screen" : "Full screen"}
                </span>
              </Button>
            )}
            {previewable && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 px-2"
                aria-label="Open in a new tab"
              >
                <a href={urls.public} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  <span className="ml-1.5 hidden md:inline">New tab</span>
                </a>
              </Button>
            )}
            <Button asChild size="sm" className="h-8 px-2 sm:px-3">
              <a href={urls.attachment} aria-label={`Download ${name}`}>
                <Download className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline">Download</span>
              </a>
            </Button>
          </div>
        </div>

        {/* The stage — fullscreen target, fills the rest of the viewport. */}
        <div
          ref={stageRef}
          className="relative min-h-0 flex-1 bg-background"
        >
          {kind === "pdf" &&
            (mounted ? (
              <React.Suspense fallback={<ViewerFallback />}>
                <PdfDocumentRenderer
                  remoteUrl={urls.public}
                  remoteHeaders={{}}
                  fileName={name}
                  className="h-full w-full"
                />
              </React.Suspense>
            ) : (
              <ViewerFallback />
            ))}
          {kind === "image" && (
            <div className="flex h-full items-center justify-center overflow-auto p-3 sm:p-4">
              {/* Token-backed durable public byte URL — safe for a raw tag on
                  this anonymous page where InlineMediaRef (authed re-mint)
                  does not apply. */}
              <img
                src={urls.public}
                alt={name}
                className="max-h-full max-w-full rounded-md object-contain"
              />
            </div>
          )}
          {kind === "video" && (
            <div className="flex h-full items-center justify-center p-3 sm:p-4">
              <video
                src={urls.public}
                controls
                className="max-h-full max-w-full rounded-md"
              />
            </div>
          )}
          {kind === "audio" && (
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 text-center">
                <Mic className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="mb-4 truncate text-sm font-semibold text-foreground">
                  {name}
                </p>
                <audio src={urls.public} controls className="w-full" />
              </div>
            </div>
          )}
          {kind === "none" && (
            <NoPreviewCard name={name} attachmentUrl={urls.attachment} />
          )}
        </div>
      </div>

      <div
        ref={(el) => {
          capabilitiesRef.current = el;
        }}
      >
        <CapabilitySection kind={kind} token={token} />
      </div>
    </div>
  );
}
