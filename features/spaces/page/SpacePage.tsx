"use client";

// features/spaces/page/SpacePage.tsx — one open Space: top bar, cover, icon, title, editor (§A).

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, EmptyState } from "@ai-matrx/design-system/controls";
import { ChevronsRight, FileQuestion, ImageIcon, Lock, Menu, SmilePlus, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useIsMobile } from "@ai-matrx/kit/media-query";
import { toast } from "@/lib/toast";

import { useSourcePicker } from "../data/SourcePicker";
import { PageHistory } from "./PageHistory";

import type { SpaceBlock, SpaceDoc } from "../contract";
import { fromEngine, type EngineBlock } from "../editor/convert";
import type { SpacesEditor } from "../editor/schema";
import { SpaceEditor } from "../editor/SpaceEditor";
import { useSpaces } from "../state/SpacesProvider";
import { Cover, randomCover } from "./Cover";
import { IconPicker, randomIcon } from "./IconPicker";
import { PageMenu } from "./PageMenu";
import { SpaceIcon } from "./SpaceIcon";
import { TocRail } from "./TocRail";
import { editedAgo } from "./time";

type Editable = Pick<SpaceDoc, "title" | "icon" | "cover" | "settings" | "blocks">;

function Title({
  value,
  editable,
  autoFocus,
  onChange,
  onEnter,
}: {
  value: string;
  editable: boolean;
  autoFocus: boolean;
  onChange: (title: string) => void;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== value) el.textContent = value;
  }, [value]);
  useEffect(() => {
    // A page the person just made opens with its title ready to type in (Notion).
    if (autoFocus && editable) ref.current?.focus();
  }, [autoFocus, editable]);
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

type SaveState = "saved" | "saving" | "failed";

const sameBlocks = (a: SpaceDoc["blocks"], b: SpaceDoc["blocks"]) => JSON.stringify(a) === JSON.stringify(b);

export function SpacePage({ spaceId }: { spaceId: string }) {
  const spaces = useSpaces();
  const { store, pathTo, favorites, toggleFavorite, markVisited, openQuickFind, sidebarCollapsed, setSidebarCollapsed, setMobileSidebarOpen, patchSummary } = spaces;
  const isMobile = useIsMobile();
  const [doc, setDoc] = useState<SpaceDoc | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<SaveState>("saved");
  /** Bumped when the page is replaced by a newer stored copy: the editor remounts on it. */
  const [editorRound, setEditorRound] = useState(0);
  const [focusTitle, setFocusTitle] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const editorRef = useRef<SpacesEditor | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  /** The page as the person sees it, edits included — what the next save writes. */
  const docRef = useRef<SpaceDoc | null>(null);
  /** The stored version the local copy is based on: every save is a compare-and-swap against it. */
  const baseVersion = useRef(0);
  const pending = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);
  const [origin] = useState(() => crypto.randomUUID());

  const adopt = (d: SpaceDoc) => {
    docRef.current = d;
    baseVersion.current = d.version;
    setDoc(d);
  };

  useEffect(() => {
    let live = true;
    setDoc(undefined);
    docRef.current = null;
    pending.current = false;
    setSaveState("saved");
    const made = spaces.takeFresh(spaceId);
    if (made) {
      adopt(made);
      setFocusTitle(spaces.takeFocusTitle(spaceId));
      markVisited(spaceId);
      return;
    }
    void store.get(spaceId).then(
      (d) => {
        if (!live) return;
        if (d) adopt(d);
        else setDoc(null);
        setFocusTitle(Boolean(d) && spaces.takeFocusTitle(spaceId));
        if (d && !d.isArchived) markVisited(spaceId);
      },
      () => live && setDoc(null),
    );
    return () => {
      live = false;
    };
    // markVisited / takeFocusTitle are fresh functions each render; loading is keyed on the id alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, spaceId]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const refused = useRef<string | null>(null);
  const [sourcePicker, pickSource] = useSourcePicker();
  const flush = async (): Promise<void> => {
    timer.current = null;
    refused.current = null;
    if (inFlight.current || !pending.current || !docRef.current) return;
    pending.current = false;
    inFlight.current = true;
    setSaveState("saving");
    const sent = docRef.current;
    try {
      const saved = await store.saveFrom(origin, sent, baseVersion.current);
      baseVersion.current = saved.version;
      if (docRef.current) docRef.current = { ...docRef.current, version: saved.version, updatedAt: saved.updatedAt };
      setDoc((d) => (d ? { ...d, version: saved.version, updatedAt: saved.updatedAt } : d));
      setNow(Date.now());
      setSaveState(pending.current ? "saving" : "saved");
    } catch (err) {
      const latest = await store.get(spaceId).catch(() => null);
      if (latest && latest.version !== baseVersion.current) {
        // Someone else saved first: never write over them. Show their copy and say so.
        pending.current = false;
        adopt(latest);
        setEditorRound((r) => r + 1);
        setSaveState("saved");
        toast.warning("This page was changed somewhere else. Showing the latest version; your last edit was not saved.");
      } else {
        pending.current = true;
        setSaveState("failed");
        // The database's refusal (22023 "not a valid snapshot: …") can arrive as a plain error object.
        const raw = err instanceof Error ? err.message : err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
        const message = raw || "We couldn't save this page.";
        // A snapshot the database refuses (22023) will be refused again: say it once, retry on the next edit.
        refused.current = /not a valid snapshot/i.test(message) ? message : null;
        toast.error(message);
      }
    } finally {
      inFlight.current = false;
      if (pending.current && !refused.current && !timer.current) timer.current = window.setTimeout(() => void flush(), 1000);
    }
  };
  const update = (patch: Partial<Editable>, delay = 300) => {
    if (!docRef.current) return;
    docRef.current = { ...docRef.current, ...patch };
    pending.current = true;
    setSaveState("saving");
    setDoc((d) => (d ? { ...d, ...patch } : d));
    if ("title" in patch || "icon" in patch) patchSummary(spaceId, { ...("title" in patch ? { title: patch.title } : {}), ...("icon" in patch ? { icon: patch.icon } : {}) });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), delay);
  };

  // A save of this page from elsewhere (sidebar rename, another tab): take it when nothing local is pending.
  useEffect(() => {
    const take = (incoming: SpaceDoc) => {
      if (incoming.id !== spaceId || incoming.version <= baseVersion.current) return;
      if (pending.current || inFlight.current) return; // the next save will meet it as a conflict
      const before = docRef.current;
      adopt(incoming);
      if (!before || !sameBlocks(before.blocks, incoming.blocks)) setEditorRound((r) => r + 1);
    };
    const off = store.onChange((change) => {
      if (change.kind === "saved" && change.origin !== origin) take(change.doc);
    });
    const unsubscribe = store.subscribe(spaceId, take);
    return () => {
      off();
      unsubscribe();
    };
    // adopt only touches refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, spaceId, origin]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!pending.current && !inFlight.current) return;
      void flush();
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      // Leaving this Space: write what is pending now.
      if (timer.current) window.clearTimeout(timer.current);
      void flush();
    };
    // Flush on leaving this Space only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  if (doc === undefined) return <div className="spaces-page" aria-busy="true" />;
  if (doc === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState icon={<FileQuestion />} title="No Space here" action={<Button asChild variant="primary"><Link href="/spaces">Open Spaces</Link></Button>} />
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
    const first = editor?.document[0];
    if (!editor || !first) return;
    editor.focus();
    try {
      editor.setTextCursorPosition(first.id, "start");
    } catch {
      // A block with no text (a divider, a page link): the caret goes to the next block that has text.
      const firstText = editor.document.find((b) => Array.isArray(b.content));
      if (firstText) editor.setTextCursorPosition(firstText.id, "start");
    }
  };

  const appendLine = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const all = editor.document;
    const last = all[all.length - 1];
    const empty = last && last.type === "paragraph" && Array.isArray(last.content) && last.content.length === 0;
    if (empty) {
      editor.setTextCursorPosition(last.id, "end");
    } else if (last) {
      const [made] = editor.insertBlocks([{ type: "paragraph" }], last.id, "after");
      if (made) editor.setTextCursorPosition(made.id, "end");
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
        <span className="spaces-edited hidden sm:inline" data-state={saveState} aria-live="polite">
          {saveState === "saving" ? "Saving…" : saveState === "failed" ? "Not saved — retrying" : editedAgo(doc.updatedAt, now)}
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="spaces-topbar-text-button">
              Share
            </button>
          </PopoverTrigger>
          <PopoverContent surface="solid" align="end" className="w-[320px] p-2">
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
            // Notion stays on the page and shows the Trash banner; the page turns read-only.
            void (async () => {
              await flush();
              await spaces.archiveSpace(doc.id);
              const latest = await store.get(doc.id);
              if (latest) adopt(latest);
              else setDoc((d) => (d ? { ...d, isArchived: true } : d));
            })().catch((e: unknown) => toast.error(e instanceof Error ? e.message : "We couldn't move this page to Trash."));
          }}
          onUndo={() => editorRef.current?.undo()}
          onHistory={() => setHistoryOpen(true)}
          updatedLabel={editedAgo(doc.updatedAt, now)}
        />
      </header>

      <div className="spaces-scroll" data-matrx-page-scroll="" ref={scrollRef}>
        <TocRail blocks={doc.blocks} scrollerRef={scrollRef} anchorRef={headerRef} />
        {doc.isArchived ? (
          <div className="spaces-trash-banner">
            <span>This page is in Trash.</span>
            <button
              type="button"
              className="spaces-trash-banner-button"
              onClick={() =>
                void spaces
                  .restoreSpace(doc.id)
                  .then(async () => {
                    const latest = await store.get(doc.id);
                    if (latest) adopt(latest);
                  })
                  .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "We couldn't restore this page."))
              }>
              Restore page
            </button>
          </div>
        ) : null}

        {doc.cover ? <Cover cover={doc.cover} editable={editable} onChange={(cover) => update({ cover }, 0)} /> : null}

        <div className={`spaces-content ${fontClass}`}>
          <div className="spaces-header" ref={headerRef} data-has-cover={doc.cover ? "true" : undefined} data-has-icon={doc.icon ? "true" : undefined}>
            {doc.icon ? (
              <IconPicker value={doc.icon} onChange={(icon) => update({ icon }, 0)} disabled={!editable}>
                <button type="button" className="spaces-page-icon" data-image={doc.icon && !("icon" in doc.icon) ? "true" : undefined} aria-label="Change icon">
                  <SpaceIcon media={doc.icon} size={doc.icon && !("icon" in doc.icon) ? 136 : 78} />
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
            <Title value={doc.title} editable={editable} autoFocus={focusTitle} onChange={(title) => update({ title })} onEnter={focusFirstBlock} />
          </div>
          <SpaceEditor
            key={`${doc.id}:${editorRound}`}
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
              pickSource,
            }}
            menu={{ moveBlocksTo, askAi: () => toast.info("AI is not connected yet") }}
          />
          {sourcePicker}
          <PageHistory
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            spaceId={doc.id}
            editable={editable}
            onRestore={(entry) => {
              // A restore is a new version with that version's content; the editor remounts on it.
              const { blocks, settings, icon, cover } = entry.snapshot;
              update({ blocks, settings, icon, cover }, 0);
              setEditorRound((r) => r + 1);
              toast.success("Version restored");
            }}
          />
          {editable ? (
            // Notion's page end: the room under the last block is a click target that puts the caret
            // in an empty line at the end (making one when the last block is not an empty line).
            <button type="button" tabIndex={-1} className="spaces-page-end" aria-label="Add a block at the end" onClick={appendLine} />
          ) : (
            <div className="spaces-page-end" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
