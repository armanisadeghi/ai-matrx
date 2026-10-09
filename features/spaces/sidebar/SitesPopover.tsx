"use client";

// features/spaces/sidebar/SitesPopover.tsx — Notion's Settings > Sites: every page published to the web.
// One read (`content.space_published`), opened with the popover like Trash; never filtered by the active org.

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { Copy, ExternalLink, FileText, Globe } from "lucide-react";
import { useState } from "react";

import { toast } from "@/lib/toast";

import { SpaceIcon } from "../page/SpaceIcon";
import { publicPageUrl, readPublishedPages, type PublishedPage } from "../publish/publish-doors";
import { useSpaces } from "../state/SpacesProvider";

const DATE = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export function SitesPopover() {
  const { open } = useSpaces();
  const { copyText } = useClipboard({
    notify: (m, kind) => (kind === "error" ? toast.error(m) : toast.success(m)),
  });
  const [pages, setPages] = useState<PublishedPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const load = () => {
    setError(null);
    readPublishedPages().then(setPages, (e: unknown) => setError(e instanceof Error ? e.message : "We couldn't read your published pages."));
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={(o) => {
        setIsOpen(o);
        if (o) load();
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="spaces-nav-row" data-testid="spaces-sites">
          <Globe size={17} />
          Sites
        </button>
      </PopoverTrigger>
      <PopoverContent surface="solid" side="right" align="end" width="xl" padding="sm">
        <div className="max-h-[360px] overflow-y-auto" data-testid="spaces-sites-list">
          {pages?.map((p) => {
            const url = publicPageUrl(p.key);
            return (
              <div key={p.id} className="spaces-trash-row h-auto min-h-[44px] py-1" data-testid="spaces-site-row">
                <SpaceIcon media={p.icon} size={17} />
                <div className="min-w-0 flex-1">
                  <div className="truncate type-body">{p.title}</div>
                  <div className="truncate type-secondary text-muted-foreground">
                    {DATE.format(new Date(p.publishedAt))} · {p.indexed ? "Indexed" : "Not indexed"}
                  </div>
                  <a className="block truncate type-secondary text-muted-foreground hover:underline" href={url} target="_blank" rel="noopener noreferrer" data-testid="spaces-site-link">
                    /site/{p.key}
                  </a>
                </div>
                <Button variant="quiet" aria-label="Copy link" title="Copy link" icon={<Copy size={15} />} onClick={() => void copyText(url, "Link copied")} />
                <Button variant="quiet" aria-label="Open public link" title="Open public link" icon={<ExternalLink size={15} />} onClick={() => window.open(url, "_blank", "noopener,noreferrer")} />
                <Button
                  variant="quiet"
                  aria-label="Open in Spaces"
                  title="Open in Spaces"
                  icon={<FileText size={15} />}
                  onClick={() => {
                    setIsOpen(false);
                    open(p.id);
                  }}
                />
              </div>
            );
          })}
          {!pages && !error ? <RegionSkeleton shape="rows" count={3} aria-label="Reading published pages" /> : null}
          {error ? (
            <button type="button" className="spaces-row-empty spaces-row-error" onClick={load}>
              {error} Try again
            </button>
          ) : null}
          {pages && pages.length === 0 ? <p className="py-6 text-center type-body text-muted-foreground">Nothing published yet</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
