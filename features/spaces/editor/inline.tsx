"use client";

// features/spaces/editor/inline.tsx — inline nodes the engine lacks: mentions (@page, @person, @date)
// and inline equations. Each node holds its whole stored span (convert.ts), so marks and links survive.

import { REMIND_CHOICES, dateTimeWords, joinDayTime } from "./date-mention";
import { usePersonTimeZone } from "@/hooks/usePersonTimeZone";
import { createReactInlineContentSpec } from "@blocknote/react";
import { ArrowUpRight, Bell, FileText, Globe } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Field, Select } from "@ai-matrx/design-system/controls";
import { useEffect, useState } from "react";
import { useLinkPreview } from "@/lib/link-preview";

import type { RichSpan } from "../contract";
import type { SpaceRemindOffset } from "@/lib/spaces-blocks/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { SpaceIcon } from "../page/SpaceIcon";
import { useSeededLink } from "../page/space-links";
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
  const { byId, open, linkTarget, requestLink } = useSpaces();
  // The lazy tree may not hold the linked page: read it once by id (row security decides).
  // Round 40: the route read every linked page in one call; only a mention it did not know asks (batched).
  const seeded = useSeededLink(spaceId);
  const page = byId.get(spaceId) ?? (seeded && !seeded.isArchived ? seeded : undefined) ?? linkTarget?.(spaceId) ?? undefined;
  const known = seeded !== undefined;
  useEffect(() => {
    if (!page && !known) requestLink?.(spaceId);
  }, [page, known, requestLink, spaceId]);
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

type DateSpan = RichSpan & { mention: Extract<NonNullable<RichSpan["mention"]>, { kind: "date" }> };

/** N2 — a date mention opens Notion's date card: the day, an optional time, and Remind. */
function DateMention({ span, editable, onChange }: { span: DateSpan; editable: boolean; onChange: (next: DateSpan) => void }) {
  const me = useAppSelector(selectUserId);
  // The person's own day: "Today" / "Tomorrow" and the time read in their saved zone, never the device's.
  const zone = usePersonTimeZone();
  const m = span.mention;
  const day = m.iso.slice(0, 10);
  const time = m.iso.length > 10 ? m.iso.slice(11, 16) : "";
  const mine = m.remind && m.remind.userId === me ? m.remind.offset : null;
  const set = (patch: Partial<DateSpan["mention"]>) => {
    const mention = { ...m, ...patch };
    if (!mention.remind) delete mention.remind;
    onChange({ ...span, text: dateTimeWords(mention.iso, new Date(), zone), mention });
  };
  const chip = (
    <span className="spaces-mention spaces-mention-muted" data-date={m.iso} data-remind={m.remind ? m.remind.offset : undefined}>
      @{dateTimeWords(m.iso, new Date(), zone)}
      {m.remind ? <Bell size={11} strokeWidth={2} aria-label="Reminder set" style={{ marginLeft: 3, display: "inline", verticalAlign: "-1px" }} /> : null}
    </span>
  );
  if (!editable) return chip;
  return (
    <Popover>
      <PopoverTrigger asChild onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="spaces-mention-datebtn" contentEditable={false}>
          {chip}
        </button>
      </PopoverTrigger>
      <PopoverContent surface="solid" side="bottom" align="start" width="sm" padding="xs">
        <div className="flex flex-col gap-1.5" data-spaces-date-card>
          <Field type="date" aria-label="Date" value={day} onChange={(e) => e.target.value && set({ iso: joinDayTime(e.target.value, time) })} />
          <Field type="time" aria-label="Time" value={time} onChange={(e) => set({ iso: joinDayTime(day, e.target.value) })} />
          <Select<SpaceRemindOffset | "none">
            aria-label="Remind"
            icon={<Bell size={14} />}
            value={mine ?? "none"}
            options={REMIND_CHOICES}
            disabled={!me}
            onValueChange={(v) => set({ remind: v === "none" || !me ? undefined : { offset: v, userId: me } })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const mentionInline = createReactInlineContentSpec(
  { type: "inlineMention", propSchema: { span: { default: "{}" } }, content: "none" },
  {
    render: ({ inlineContent, updateInlineContent, editor }) => {
      const s = readSpan(inlineContent.props.span);
      const m = s.mention;
      if (m?.kind === "date")
        return (
          <DateMention
            span={{ ...s, mention: m }}
            editable={editor.isEditable}
            onChange={(next) => updateInlineContent({ type: "inlineMention", props: { span: JSON.stringify(next) } })}
          />
        );
      if (m?.kind === "space") return <PageMention spaceId={m.spaceId} fallback={s.text} />;
      if (m?.kind === "link") return <LinkMention url={m.url} title={m.title ?? s.text} icon={m.icon} />;
      if (m?.kind === "person") return <span className="spaces-mention spaces-mention-person" data-user-id={m.userId}>@{s.text.replace(/^@/, "")}</span>;
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
