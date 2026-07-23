"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
// The v3 shell is the sanctioned static import (lightweight — only MenuContent
// lazy-loads behind it; see contextMenuV3StaticImportBan in eslint.config.mjs).
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { useFileBlob } from "@/features/files";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { MARKETING_PAGE_SURFACE_NAME } from "@/features/marketing/lib/marketing-page-scope";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { MarketingPage } from "@/features/marketing/types";

// Heavy previewer (react-markdown + KaTeX + Prism) — always code-split.
const MarkdownPreview = dynamic(
  () =>
    import("@/features/files/components/core/FilePreview/previewers/MarkdownPreview").then(
      (module) => module.MarkdownPreview,
    ),
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
  getPageScope,
}: {
  page: MarketingPage;
  markdownFileId: string;
  /** Live `matrx-user/marketing-page` scope builder from the workspace. */
  getPageScope: () => SurfaceScopePayload;
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

  // Right-click menu scope: the page surface's live values + the loaded
  // markdown as `content`, with the live DOM selection captured at click time.
  // Plain fn (React Compiler memoizes) — never reads stale React state.
  const getApplicationScope = () => {
    const selectedText =
      typeof window !== "undefined"
        ? (window.getSelection()?.toString() ?? "")
        : "";
    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: null,
      contextData: { ...getPageScope(), content: text ?? undefined },
    });
  };

  const copy = webCopy({
    kind: "web-page-content",
    label: "Page content",
    description:
      "The extracted Markdown content of this page's latest captured snapshot.",
    surface: `Page content — ${page.url}`,
    data: { url: page.url, path: page.path, markdown: text },
    lines: [
      ["URL", page.url],
      [
        "Content",
        text ? `${text.length.toLocaleString()} characters` : "loading…",
      ],
    ],
    attributes: { page_id: page.id },
  });

  return (
    <SectionCard
      title="Page content"
      copy={{ ...copy, human: () => text ?? "Content is still loading." }}
      collapsible
    >
      {/* Read-only rendered markdown → NonEditableContextMenu. No ContentSource
          variant or EntityType token exists for `web.page`, so contentSource
          stays `raw` (Copy-as/Export/Download still work off `content`) and
          `entity` is omitted (Attach/Share correctly don't render). */}
      <NonEditableContextMenu
        sourceFeature="marketing"
        surfaceName={MARKETING_PAGE_SURFACE_NAME}
        getApplicationScope={getApplicationScope}
        contextData={{ content: text ?? undefined }}
        contentSource={{ type: "raw" }}
      >
        <div className="p-3">
          <MarkdownPreview fileId={markdownFileId} />
        </div>
      </NonEditableContextMenu>
    </SectionCard>
  );
}
