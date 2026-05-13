"use client";

import { ArrowUpRight, Link as LinkIcon, MoreHorizontal } from "lucide-react";
import { useMemo } from "react";
import { WAAvatar } from "../../shared/WAAvatar";
import { formatLinkTime } from "../../shared/relative-time";
import type { WALinkItem } from "../../types";
import { InlineMediaRef } from "@/features/files";

interface LinksTabProps {
  items: WALinkItem[];
}

interface LinkGroup {
  id: string;
  label: string;
  rangeLabel?: string;
  items: WALinkItem[];
}

function groupLinks(items: WALinkItem[]): LinkGroup[] {
  if (items.length === 0) return [];
  const dayMs = 86_400_000;
  const NOW = new Date();
  const sevenDaysAgo = new Date(NOW.getTime() - 7 * dayMs);
  const sorted = [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const recent = sorted.filter((i) => new Date(i.createdAt) >= sevenDaysAgo);
  const older = sorted.filter((i) => new Date(i.createdAt) < sevenDaysAgo);

  const groups: LinkGroup[] = [];
  if (recent.length > 0) {
    groups.push({ id: "recent", label: "", items: recent });
  }
  if (older.length > 0) {
    groups.push({
      id: "last-week",
      label: "Last week",
      rangeLabel: rangeLabel(older),
      items: older,
    });
  }
  return groups;
}

function rangeLabel(items: WALinkItem[]): string {
  const sorted = [...items].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
  const a = sorted[sorted.length - 1].createdAt;
  const b = sorted[0].createdAt;
  return `${new Date(a).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} – ${new Date(b).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export function LinksTab({ items }: LinksTabProps) {
  const groups = useMemo(() => groupLinks(items), [items]);

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[14px] text-muted-foreground">
        No links shared yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[minmax(0,1fr)_240px_220px_56px] items-center gap-3 border-b border-border px-5 py-3 text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Link</span>
        <span>Message</span>
        <span>Sent By</span>
        <span />
      </div>

      {groups.map((g) => (
        <section key={g.id}>
          {g.label ? (
            <header className="px-5 pb-2 pt-5">
              <h3 className="text-[18px] font-semibold text-foreground">
                {g.label}
              </h3>
              {g.rangeLabel ? (
                <div className="text-[12.5px] text-muted-foreground">
                  {g.rangeLabel}
                </div>
              ) : null}
            </header>
          ) : null}
          <ul className="divide-y divide-border">
            {g.items.map((item) => (
              <LinkRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LinkRow({ item }: { item: WALinkItem }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_240px_220px_56px] items-center gap-3 px-5 py-3 hover:bg-accent/40">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex min-w-0 items-center gap-3"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          <InlineMediaRef
            ref={item.previewImageUrl ?? null}
            size="fill"
            fit="cover"
            rounded="none"
            fallbackIcon={<LinkIcon className="h-4 w-4 text-muted-foreground" />}
            alt=""
          />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-foreground">
            {item.title}
          </div>
          <div className="truncate text-[12.5px] text-muted-foreground">
            {item.hostname}
          </div>
        </div>
      </a>
      <div className="line-clamp-2 text-[13px] text-muted-foreground">
        {item.message}
      </div>
      <div className="flex items-center gap-2">
        <WAAvatar name={item.senderName} src={item.senderAvatarUrl} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-[13px] text-foreground">
            {item.senderName}
          </div>
          <div className="truncate text-[12px] text-muted-foreground">
            {formatLinkTime(item.createdAt)}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Open link"
        >
          <ArrowUpRight className="h-4 w-4" />
        </a>
        <button
          type="button"
          aria-label="More"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
