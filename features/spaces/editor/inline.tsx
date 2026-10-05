"use client";

// features/spaces/editor/inline.tsx — inline nodes the engine lacks: mentions (@page, @person, @date)
// and inline equations. Each node holds its whole stored span (convert.ts), so marks and links survive.

import { createReactInlineContentSpec } from "@blocknote/react";
import { ArrowUpRight, FileText } from "lucide-react";

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

function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
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

export const mentionInline = createReactInlineContentSpec(
  { type: "inlineMention", propSchema: { span: { default: "{}" } }, content: "none" },
  {
    render: ({ inlineContent }) => {
      const s = readSpan(inlineContent.props.span);
      const m = s.mention;
      if (m?.kind === "space") return <PageMention spaceId={m.spaceId} fallback={s.text} />;
      if (m?.kind === "date") return <span className="spaces-mention spaces-mention-muted">@{formatDate(m.iso)}</span>;
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
