import React, { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { siteConfig } from "@/config/extras/site";
import {
  getCanvasBlockMeta,
  buildCanvasDescription,
} from "@/features/canvas/canvas-block-meta";
import { resolveSharedCanvas } from "@/features/canvas/shared/resolveSharedCanvas";
import { markdownToPlainText } from "@/lib/markdown/plain-text";
import { RichContentServer } from "@/components/rich-content/server/RichContentServer";
import { SharedCanvasViewClient } from "./SharedCanvasViewClient";

/** One read per request: generateMetadata and the page share it. */
const loadSharedCanvas = cache(async (token: string) =>
  resolveSharedCanvas(token, await createClient()),
);

interface PageProps {
  params: Promise<{
    token: string;
  }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const canvas = await loadSharedCanvas(token);

  if (!canvas) {
    return {
      title: "Shared Canvas | AI Matrx",
      description: "View and interact with shared canvas content on AI Matrx.",
    };
  }

  const meta = getCanvasBlockMeta(canvas.canvas_type ?? "canvas");
  const creator =
    canvas.creator_display_name ?? canvas.creator_username ?? null;
  const pageTitle = `${canvas.title} | ${meta.label} on AI Matrx`;
  // Meta descriptions are WORDS: a markdown description would show its
  // asterisks and `\(…\)` in search results and link previews.
  const description =
    markdownToPlainText(canvas.description) ||
    buildCanvasDescription(
      canvas.canvas_type ?? "canvas",
      canvas.title,
      creator,
    );

  const url = `${siteConfig.url}/canvas/shared/${token}`;

  // Merge block-type keywords with any canvas tags
  const keywords = [
    ...meta.keywords,
    ...(canvas.tags ?? []),
    "AI Matrx",
    "interactive",
    "shared canvas",
  ];

  // Image resolution rules:
  //  1. If the creator picked / uploaded a custom `thumbnail_url`, use it as
  //     the Open Graph image so their chosen artwork appears on social
  //     previews.
  //  2. Otherwise omit `images` entirely and let Next.js fall back to the
  //     dynamically-generated, brand-consistent `opengraph-image.tsx` in
  //     this route (which renders title, badge, creator and block color).
  const customImages = canvas.thumbnail_url
    ? [
        {
          url: canvas.thumbnail_url,
          width: 1200,
          height: 630,
          alt: `${canvas.title} — ${meta.label} on AI Matrx`,
        },
      ]
    : undefined;

  return {
    title: pageTitle,
    description,
    keywords,
    authors: creator ? [{ name: creator }] : undefined,
    openGraph: {
      title: canvas.title,
      description,
      type: "website",
      url,
      siteName: "AI Matrx",
      ...(customImages ? { images: customImages } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: canvas.title,
      description,
      ...(canvas.thumbnail_url ? { images: [canvas.thumbnail_url] } : {}),
      creator: "@aimatrx",
    },
    // Per-route favicon via icon.tsx (Next.js file convention)
    // No need to specify here — icon.tsx at this route level overrides automatically.
    alternates: {
      canonical: url,
    },
  };
}

export default async function SharedCanvasPage({ params }: PageProps) {
  const { token } = await params;
  // The canvas itself is interactive and client-rendered; its title and
  // description are rendered HERE, on the server, through the one
  // rich-content core, so they are in the HTML a crawler (or a reader
  // without JavaScript) receives. The client view replaces this summary once
  // it mounts. resolveSharedCanvas is the same read generateMetadata makes.
  const canvas = await loadSharedCanvas(token);
  const summary = canvas ? (
    <header className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">{canvas.title}</h1>
      {canvas.description ? (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          <RichContentServer level="inline" source={canvas.description} />
        </p>
      ) : null}
    </header>
  ) : null;
  return <SharedCanvasViewClient shareToken={token} serverSummary={summary} />;
}
