"use client";

// features/spaces/editor/inline.tsx — inline nodes the engine lacks: mentions (@page, @person, @date)
// and inline equations. Each node holds its whole stored span (convert.ts), so marks and links survive.

import { dateWords } from "./date-mention";
import { createReactInlineContentSpec } from "@blocknote/react";
import { ArrowUpRight, FileText, Globe } from "lucide-react";
import { useState } from "react";
import { useLinkPreview } from "@/lib/link-preview";

import type { RichSpan } from "../contract";
import { SpaceIcon } from "../page/SpaceIcon";
import { useSpaces } from "../state/SpacesProvider";
import { InlineMath } from "./stored-blocks";

function readSpan(raw: unknown): RichSpan {
  try {
    const s = JSON.parse(String(raw || "{}")) as RichSpan;
    return typeof s.text === "string" ? s : { text: "" };
  } catch {
    return { text: "" };
  }
}

function PageMention({ spaceId, fallback }: { spaceId: string; fallback: string }) {
  const { byId, open } = useSpaces();
  const page = byId.get(spaceId);
  return (
    <button
      type="button"
      className="spaces-mention spaces-mention-page"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        open(spaceId);
      }}
    >
      <span className="spaces-mention-icon">
        {page?.icon ? <SpaceIcon media={page.icon} size={14} /> : <FileText size={14} strokeWidth={1.6} />}
        <ArrowUpRight className="spaces-page-link-arrow" size={8} strokeWidth={2.5} />
      </span>
      <span className="spaces-mention-title">{page ? page.title || "Untitled" : fallback}</span>
    </button>
  );
}

function LinkMention({ url, title: storedTitle, icon: storedIcon }: { url: string; title: string; icon?: string }) {
  // B12 — the mention shows the linked page's own title and favicon once the preview answers; until
  // then (or when it has none) what was stored: the host/path title and its icon.
  const { status, preview } = useLinkPreview(url);
  const live = status === "ready" ? preview : null;
  const title = live?.title || storedTitle;
  const icon = live?.favicon_url || storedIcon;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  // A favicon that fails to load (blocked, 404) leaves no gap: the globe stands in, as in Notion.
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const isImage = !!icon && /^(https?:|data:|\/)/.test(icon) && failedIcon !== icon;
  return (
    <span className="spaces-mention-linkwrap">
      <a
        className="spaces-mention spaces-mention-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="spaces-mention-icon">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- a site's favicon, any host
            <img src={icon} alt="" width={14} height={14} style={{ width: 14, height: 14, borderRadius: 3 }} onError={() => setFailedIcon(icon ?? null)} />
          ) : (
            <Globe size={14} strokeWidth={1.6} />
          )}
        </span>
        <span className="spaces-mention-title">{title || host}</span>
      </a>
      <span className="spaces-mention-card" role="tooltip" contentEditable={false}>
        <span className="spaces-mention-card-title">{title || host}</span>
        {live?.description ? <span className="spaces-mention-card-desc">{live.description}</span> : null}
        <span className="spaces-mention-card-url">{url}</span>
      </span>
    </span>
  );
}

export const mentionInline = createReactInlineContentSpec(
  { type: "inlineMention", propSchema: { span: { default: "{}" } }, content: "none" },
  {
    render: ({ inlineContent }) => {
      const s = readSpan(inlineContent.props.span);
      const m = s.mention;
      if (m?.kind === "space") return <PageMention spaceId={m.spaceId} fallback={s.text} />;
      if (m?.kind === "link") return <LinkMention url={m.url} title={m.title ?? s.text} icon={m.icon} />;
      if (m?.kind === "person") return <span className="spaces-mention spaces-mention-person" data-user-id={m.userId}>@{s.text.replace(/^@/, "")}</span>;
      if (m?.kind === "date") return <span className="spaces-mention spaces-mention-muted" data-date={m.iso}>@{dateWords(m.iso)}</span>;
      return <span className="spaces-mention spaces-mention-muted">@{s.text.replace(/^@/, "")}</span>;
    },
  },
);

export const equationInline = createReactInlineContentSpec(
  { type: "inlineEquation", propSchema: { span: { default: "{}" } }, content: "none" },
  {
    render: ({ inlineContent }) => {
      const s = readSpan(inlineContent.props.span);
      return <InlineMath expression={s.equation ?? s.text} />;
    },
  },
);
