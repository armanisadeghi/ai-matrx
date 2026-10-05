"use client";

// features/spaces/page/SpacePage.tsx — one open Space: top bar, cover, icon, title, editor (§A).

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, EmptyState } from "@ai-matrx/design-system/controls";
import { ChevronsRight, ImageIcon, Lock, Menu, SmilePlus, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useIsMobile } from "@ai-matrx/kit/media-query";
import { toast } from "@/lib/toast";

import type { SpaceBlock, SpaceDoc } from "../contract";
import { fromEngine, type EngineBlock } from "../editor/convert";
import type { SpacesEditor } from "../editor/schema";
import { SpaceEditor } from "../editor/SpaceEditor";
import { useSpaces } from "../state/SpacesProvider";
import { Cover, randomCover } from "./Cover";
import { IconPicker, randomIcon } from "./IconPicker";
import { PageMenu } from "./PageMenu";
import { SpaceIcon } from "./SpaceIcon";
import { editedAgo } from "./time";

type Editable = Pick<SpaceDoc, "title" | "icon" | "cover" | "settings" | "blocks">;

function Title({ value, editable, onChange, onEnter }: { value: string; editable: boolean; onChange: (title: string) => void; onEnter: () => void }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== value) el.textContent = value;
  }, [value]);
  return (
    <h1
      ref={ref}
      className="spaces-title"
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck
      data-empty={value ? undefined : "true"}
      data-placeholder="Untitled"
      role="textbox"
      aria-label="Page title"
      onInput={(e) => onChange((e.currentTarget.textContent ?? "").replace(/\n/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || (e.key === "ArrowDown" && !e.shiftKey)) {
          e.preventDefault();
          onEnter();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " "));
      }}
    />
  );
}

export function SpacePage({ spaceId }: { spaceId: string }) {
  const spaces = useSpaces();
  const { store, pathTo, favorites, toggleFavorite, markVisited, openQuickFind, sidebarCollapsed, setSidebarCollapsed, setMobileSidebarOpen } = spaces;
  const isMobile = useIsMobile();
  const [doc, setDoc] = useState<SpaceDoc | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const editorRef = useRef<SpacesEditor | null>(null);
  const pending = useRef<Partial<Editable>>({});
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    setDoc(undefined);
    void store.get(spaceId).then((d) => {
      if (!live) return;
      setDoc(d);
      if (d && !d.isArchived) markVisited(spaceId);
    });
    return () => {
      live = false;
    };
    // markVisited is a fresh function each render; visiting is keyed on the id alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, spaceId]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const flush = async () => {
    timer.current = null;
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    // Read the latest stored copy so a move or rename from the sidebar is never overwritten.
    const latest = await store.get(spaceId);
    if (!latest) return;
    try {
      const saved = await store.save({ ...latest, ...patch }, latest.version);
      setDoc((d) => (d ? { ...d, updatedAt: saved.updatedAt, version: saved.version } : d));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this page");
    }
  };
  const update = (patch: Partial<Editable>, delay = 300) => {
    pending.current = { ...pending.current, ...patch };
    setDoc((d) => (d ? { ...d, ...patch } : d));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), delay);
  };
  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        void flush();
      }
    },
    // Flush on leaving this Space only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spaceId],
  );

  if (doc === undefined) return <div className="spaces-page" aria-busy="true" />;
  if (doc === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState title="No Space here" action={<Button asChild variant="primary"><Link href="/spaces">Open Spaces</Link></Button>} />
      </div>
    );
  }

  const locked = doc.settings.locked;
  const editable = !locked && !doc.isArchived;
  const path = doc.isArchived ? [] : pathTo(doc.id);
  const isFavorite = favorites.includes(doc.id);
  const setSettings = (patch: Partial<SpaceDoc["settings"]>) => update({ settings: { ...doc.settings, ...patch } }, 0);

  const focusFirstBlock = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const first = editor.document[0];
    if (first && first.type === "paragraph" && Array.isArray(first.content) && first.content.length === 0) {
      editor.setTextCursorPosition(first.id, "start");
    } else if (first) {
      const [inserted] = editor.insertBlocks([{ type: "paragraph" }], first.id, "before");
      editor.setTextCursorPosition(inserted.id, "start");
    }
    editor.focus();
  };

  const moveBlocksTo = (ids: string[]) => {
    openQuickFind("pick", (targetId) => {
      const editor = editorRef.current;
      if (!editor || targetId === doc.id) return;
      const blocks = ids.map((id) => editor.getBlock(id)).filter(Boolean) as unknown as EngineBlock[];
      const moved: SpaceBlock[] = fromEngine(blocks);
      void (async () => {
        const target = await store.get(targetId);
        if (!target) return;
        await store.save({ ...target, blocks: [...target.blocks, ...moved] }, target.version);
        editor.removeBlocks(ids);
        toast.success(`Moved to ${target.title || "Untitled"}`);
      })();
    });
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(`${window.location.origin}/spaces/${doc.id}`).then(
      () => toast.success("Copied link"),
      () => toast.error("Could not copy the link"),
    );
  };

  const fontClass = doc.settings.font === "serif" ? "spaces-font-serif" : doc.settings.font === "mono" ? "spaces-font-mono" : "";

  return (
    <div className="spaces-page" data-full-width={doc.settings.fullWidth ? "true" : undefined} data-small-text={doc.settings.smallText ? "true" : undefined}>
      <header className="spaces-topbar">
        {isMobile ? (
          <button type="button" className="spaces-topbar-button" aria-label="Open sidebar" onClick={() => setMobileSidebarOpen(true)}>
            <Menu size={18} />
          </button>
        ) : sidebarCollapsed ? (
          <button type="button" className="spaces-topbar-button" aria-label="Open sidebar" onClick={() => setSidebarCollapsed(false)}>
            <ChevronsRight size={18} />
          </button>
        ) : null}
        <nav className="spaces-breadcrumb" aria-label="Breadcrumb">
          {(path.length ? path : [doc]).map((p, i, arr) => (
            <span key={p.id} className="flex min-w-0 items-center">
              {i > 0 ? <span className="spaces-breadcrumb-sep">/</span> : null}
              <Link href={`/spaces/${p.id}`} className="spaces-breadcrumb-item" data-current={i === arr.length - 1 ? "true" : undefined}>
                {p.icon ? <SpaceIcon media={p.icon} size={16} /> : null}
                <span className="truncate">{p.title || "Untitled"}</span>
              </Link>
            </span>
          ))}
        </nav>
        <span className="flex-1" />
        {locked ? (
          <button type="button" className="spaces-locked-pill" onClick={() => setSettings({ locked: false })} title="Unlock page">
            <Lock size={13} />
            Locked
          </button>
        ) : null}
        <span className="spaces-edited hidden sm:inline">{editedAgo(doc.updatedAt, now)}</span>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="spaces-topbar-text-button">
              Share
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[320px] p-2">
            <Button variant="outline" className="w-full" onClick={copyLink}>
              Copy link
            </Button>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          className="spaces-topbar-button"
          aria-label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          aria-pressed={isFavorite}
          onClick={() => toggleFavorite(doc.id)}
        >
          <Star size={17} className={isFavorite ? "fill-[var(--spaces-star)] text-[var(--spaces-star)]" : undefined} />
        </button>
        <PageMenu
          settings={doc.settings}
          onSettings={setSettings}
          onCopyLink={copyLink}
          onDuplicate={() => void spaces.duplicateSpace(doc.id).then((copy) => spaces.open(copy.id))}
          onMove={() =>
            openQuickFind("pick", (targetId) => {
              void spaces.moveSpace(doc.id, targetId, "inside").catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not move this page"));
            })
          }
          onDelete={() => {
            const parent = doc.parentId;
            void spaces.archiveSpace(doc.id).then(() => {
              toast.success("Moved to Trash");
              if (parent) spaces.open(parent);
              else window.location.assign("/spaces");
            });
          }}
          onUndo={() => editorRef.current?.undo()}
          updatedLabel={editedAgo(doc.updatedAt, now)}
        />
      </header>

      <div className="spaces-scroll" data-matrx-page-scroll="">
        {doc.isArchived ? (
          <div className="spaces-trash-banner">
            <span>This page is in Trash.</span>
            <button
              type="button"
              className="spaces-trash-banner-button"
              onClick={() =>
                void spaces.restoreSpace(doc.id).then(async () => {
                  setDoc(await store.get(doc.id));
                  toast.success("Page restored");
                })
              }
            >
              Restore page
            </button>
          </div>
        ) : null}

        {doc.cover ? <Cover cover={doc.cover} editable={editable} onChange={(cover) => update({ cover }, 0)} /> : null}

        <div className={`spaces-content ${fontClass}`}>
          <div className="spaces-header" data-has-cover={doc.cover ? "true" : undefined} data-has-icon={doc.icon ? "true" : undefined}>
            {doc.icon ? (
              <IconPicker value={doc.icon} onChange={(icon) => update({ icon }, 0)} disabled={!editable}>
                <button type="button" className="spaces-page-icon" aria-label="Change icon">
                  <SpaceIcon media={doc.icon} size={78} />
                </button>
              </IconPicker>
            ) : null}
            {editable ? (
              <div className="spaces-header-controls">
                {!doc.icon ? (
                  <button type="button" className="spaces-header-control" onClick={() => update({ icon: randomIcon() }, 0)}>
                    <SmilePlus size={15} />
                    Add icon
                  </button>
                ) : null}
                {!doc.cover ? (
                  <button type="button" className="spaces-header-control" onClick={() => update({ cover: randomCover() }, 0)}>
                    <ImageIcon size={15} />
                    Add cover
                  </button>
                ) : null}
              </div>
            ) : null}
            <Title value={doc.title} editable={editable} onChange={(title) => update({ title })} onEnter={focusFirstBlock} />
          </div>
          <SpaceEditor
            key={doc.id}
            spaceId={doc.id}
            initialBlocks={doc.blocks}
            editable={editable}
            onChange={(blocks) => update({ blocks }, 400)}
            onReady={(editor) => {
              editorRef.current = editor;
            }}
            slash={{
              createSubpage: async () => {
                const sub = await spaces.createSpace(doc.id, { open: false });
                // Notion opens the new sub-page at once; the parent's pending save flushes on leave.
                window.setTimeout(() => spaces.open(sub.id), 60);
                return sub.id;
              },
              pickPage: () => new Promise((resolve) => openQuickFind("pick", (id) => resolve(id))),
            }}
            menu={{ moveBlocksTo, askAi: () => toast.info("AI is not connected yet") }}
          />
        </div>
      </div>
    </div>
  );
}
