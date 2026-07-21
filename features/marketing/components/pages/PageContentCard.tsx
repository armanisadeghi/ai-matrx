"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { MarketingPage } from "@/features/marketing/types";

// Heavy previewer (react-markdown + KaTeX + Prism) — always code-split.
const MarkdownPreview = dynamic(
  () =>
    import(
      "@/features/files/components/core/FilePreview/previewers/MarkdownPreview"
    ).then((module) => module.MarkdownPreview),
  { ssr: false },
);

/**
 * The page's extracted content rendered as real prose — never a bare link to
 * the .md file (the file viewer stays reachable from Content stats for the
 * raw artifact). Copy = the markdown source itself; Copy-for-AI wraps it with
 * the page identity.
 */
export function PageContentCard({
  page,
  markdownFileId,
}: {
  page: MarketingPage;
  markdownFileId: string;
}) {
  // Same module-level blob cache the previewer uses — no duplicate fetch.
  const { blob } = useFileBlob(markdownFileId);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return undefined;
    let cancelled = false;
    void blob.text().then((value) => {
      if (!cancelled) setText(value);
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  const copy = webCopy({
    kind: "web-page-content",
    label: "Page content",
    description:
      "The extracted Markdown content of this page's latest captured snapshot.",
    surface: `Page content — ${page.url}`,
    data: { url: page.url, path: page.path, markdown: text },
    lines: [
      ["URL", page.url],
      ["Content", text ? `${text.length.toLocaleString()} characters` : "loading…"],
    ],
    attributes: { page_id: page.id },
  });

  return (
    <SectionCard
      title="Page content"
      copy={{ ...copy, human: () => text ?? "Content is still loading." }}
    >
      <div className="max-h-[42rem] overflow-y-auto p-3">
        <MarkdownPreview fileId={markdownFileId} />
      </div>
    </SectionCard>
  );
}
