"use client";

// features/spaces/page/SpacePage.tsx — one open Space: top bar, cover, icon, title, editor (§A).

import { Button, EmptyState } from "@ai-matrx/design-system/controls";
import { ChevronsRight, CloudOff, FileQuestion, ImageIcon, Lock, Menu, MessageSquare, MessageSquareText, SmilePlus, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useIsMobile } from "@ai-matrx/kit/media-query";
import { Backlinks } from "./Backlinks";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserEmail, selectUserFullName } from "@/lib/redux/selectors/userSelectors";
import { useAccess } from "@/utils/permissions/access";

import { useSourcePicker } from "../data/SourcePicker";
import { AskAiMenu, type AskAiTarget } from "../ai/AskAiMenu";
import { AskPageButton } from "../ai/AskPageButton";
import { LoadAccessState } from "../workspace/LoadAccessState";
import { useSpacesAiDisclosure } from "../ai/spaces-ai";
import { currentBlockId, selectedOrCurrent } from "../editor/block-actions";
import { blocksToMarkdownLines, spaceToMarkdown, type MarkdownContext } from "../io/markdown";
import { ExportDialog } from "./ExportDialog";
import { PageHistory } from "./PageHistory";

import type { SpaceBlock, SpaceDoc } from "../contract";
import { fromEngine, plainText, toEngine, type EngineBlock } from "../editor/convert";
import type { SpacesEditor } from "../editor/schema";
import { blockIds, planStoredMerge } from "./merge-stored";
import { SpaceEditor } from "../editor/SpaceEditor";
import { useSpaces } from "../state/SpacesProvider";
import { Cover, randomCover } from "./Cover";
import { IconPicker, randomIcon } from "./IconPicker";
import { PageMenu } from "./PageMenu";
import { SpaceIcon } from "./SpaceIcon";
import { TocRail } from "./TocRail";
import { CommentMargin } from "../collab/CommentMargin";
import { CommentsPanel, PageComments } from "../collab/CommentsPanel";
import { spaceCommentSource, type SpaceCommentAnchor } from "../collab/comments";
import { PresenceAvatars, ShareMenu } from "../collab/TopBarCollab";
import { useSpaceComments } from "../collab/useSpaceComments";
import { useSpaceRoom } from "../collab/useSpaceRoom";
import { useSpaceCollab } from "../collab/useSpaceCollab";
import type { SpaceMeta } from "../collab/space-collab";
import { editedAgo } from "./time";
import { trashedByList } from "./trash-state";

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

/** A14 — Notion counts the title and every block's text. */
function pageCounts(doc: SpaceDoc): { words: number; characters: number } {
  const text = `${doc.title}\n${plainText(doc.blocks)}`;
  const words = text.split(/\s+/).filter(Boolean).length;
  return { words, characters: text.replace(/\s/g, "").length };
}

/** What a save writes, as one comparable string: a save whose content is already stored is skipped. */
const contentKey = (d: Pick<SpaceDoc, "title" | "icon" | "cover" | "settings" | "blocks">) =>
  JSON.stringify([d.title, d.icon ?? null, d.cover ?? null, d.settings, d.blocks]);

export function SpacePage({ spaceId }: { spaceId: string }) {
  const spaces = useSpaces();
  const { store, pathTo, favorites, toggleFavorite, markVisited, openQuickFind, sidebarCollapsed, setSidebarCollapsed, setMobileSidebarOpen, patchSummary } = spaces;
  const isMobile = useIsMobile();
  const [doc, setDoc] = useState<SpaceDoc | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<SaveState>("saved");
  /** Why the last save failed — handed to the error menu beside "Not saved". */
  const [saveError, setSaveError] = useState<unknown>(null);
  const [focusTitle, setFocusTitle] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState<AskAiTarget | null>(null);
  // H1 — the comments panel, a thread being started (undefined = none; null anchor = the page), and the
  // page comment being written under the title.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState<SpaceCommentAnchor | null | undefined>(undefined);
  const [addingPageComment, setAddingPageComment] = useState(false);
  /** Bumped on every edit, so the comment margin re-reads block positions. */
  const [contentTick, setContentTick] = useState(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const comments = useSpaceComments(spaceId, doc?.title ?? "");
  const room = useSpaceRoom(spaceId, comments.reload);
  // H5 — what this person may do here: the database decides (get_resource_access); a viewer or
  // commenter never gets editing affordances, never writes, and sees the room read-only.
  const access = useAccess("document", spaceId);
  const canEdit = access.level === "edit" || access.level === "admin";
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  useSpacesAiDisclosure();
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
  /** `contentKey` of the newest stored version this member knows of (its own save or the host's). */
  const savedKey = useRef<string | null>(null);
  /** When the first unsaved change since the last save happened (the cadence's max wait runs from it). */
  const dirtySince = useRef<number | null>(null);
  /** Every block id of that stored version — the merge base for a version written outside the room. */
  const savedIds = useRef<Set<string>>(new Set());

  const adopt = (d: SpaceDoc) => {
    docRef.current = d;
    baseVersion.current = d.version;
    savedKey.current = contentKey(d);
    savedIds.current = blockIds(d.blocks);
    setDoc(d);
  };

  // H3 — live co-editing. The room (Yjs over broadcast) is the page's truth while it is open; exactly one
  // member (the host) writes it to the store.
  const fullName = useAppSelector(selectUserFullName);
  const email = useAppSelector(selectUserEmail);
  const applyMeta = (meta: Partial<SpaceMeta>) => {
    if (!docRef.current) return;
    const patch = meta as Partial<Editable>;
    docRef.current = { ...docRef.current, ...patch };
    setDoc((d) => (d ? { ...d, ...patch } : d));
    if ("title" in patch || "icon" in patch) patchSummary(spaceId, { ...("title" in patch ? { title: patch.title } : {}), ...("icon" in patch ? { icon: patch.icon } : {}) });
    schedule();
  };
  const hostAtLastRender = useRef(false);
  const collab = useSpaceCollab({
    spaceId,
    snapshot: doc,
    userId: room.me,
    name: fullName || email || "Someone",
    canEdit,
    room,
    onMeta: applyMeta,
    // Only real edits the room holds (pending) are saved on handover — opening a page never writes one.
    onBecameHost: () => {
      if (pending.current) schedule();
    },
  });
  hostAtLastRender.current = collab.isHost;
  // Built from the stored snapshot: the body the editor will hold (BlockNote's normalisation of the stored
  // blocks) IS the stored version, so it is the save baseline — opening a page never writes a version.
  useEffect(() => {
    const s = collab.session;
    const d = docRef.current;
    if (!s || !d || !s.seededBlocks) return;
    docRef.current = { ...d, blocks: fromEngine(s.seededBlocks as EngineBlock[]) };
    savedKey.current = contentKey(docRef.current);
    savedIds.current = blockIds(docRef.current.blocks);
  }, [collab.session]);

  // Another Space opened in this same page: drop the last one's state while rendering (React's
  // "reset state when a prop changes"), so nothing of it paints under the new id.
  const [shownId, setShownId] = useState(spaceId);
  if (shownId !== spaceId) {
    setShownId(spaceId);
    setDoc(undefined);
    setSaveState("saved");
    setDraft(undefined);
    setAddingPageComment(false);
  }

  useEffect(() => {
    let live = true;
    docRef.current = null;
    pending.current = false;
    // A page made a moment ago arrives in hand; any other is read. Both settle in a callback, so the
    // page's state is set by the answer, never synchronously by the effect.
    const made = spaces.takeFresh(spaceId);
    void (made ? Promise.resolve(made) : store.get(spaceId)).then(
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
  }, [store, spaceId]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const refused = useRef<string | null>(null);
  /**
   * A stored version the room did not write (a block moved here from another page while it is open): the
   * host takes what that writer added or removed into the room (merge-stored.ts), so its next save carries
   * it instead of overwriting it. Answers the room's page after the merge (null: not the host / no editor).
   */
  const mergeStored = (incoming: SpaceDoc): SpaceBlock[] | null => {
    const editor = editorRef.current;
    if (!editor || !collab.hostRef.current) return null;
    const plan = planStoredMerge(savedIds.current, editor.document as unknown as EngineBlock[], incoming.blocks);
    for (const id of plan.remove) {
      if (editor.getBlock(id)) editor.removeBlocks([id]);
    }
    for (const { block, after } of plan.insert) {
      const anchor = after && editor.getBlock(after) ? after : null;
      const first = editor.document[0];
      const engine = toEngine([block]) as never;
      if (anchor) editor.insertBlocks(engine, anchor, "after");
      else if (first) editor.insertBlocks(engine, first.id, "before");
    }
    return fromEngine(editor.document as unknown as EngineBlock[]);
  };
  const [sourcePicker, pickSource] = useSourcePicker(spaceId);
  /**
   * Write the page to the store — the host only (a member that is not host never writes; the host saves
   * what the room holds). A save whose content is already the stored content is skipped, so an idle room,
   * a cursor move or a peer's echo writes nothing.
   */
  const flush = async (leaving = false): Promise<void> => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    refused.current = null;
    if (inFlight.current || !pending.current || !docRef.current) return;
    // Leaving: the session is already torn down, so the host status of the last render decides.
    if (!(leaving ? hostAtLastRender.current : collab.hostRef.current)) return;
    const sent = docRef.current;
    const key = contentKey(sent);
    pending.current = false;
    // The cadence's max wait runs from the first change AFTER what this save carries.
    dirtySince.current = null;
    if (key === savedKey.current) {
      dirtySince.current = null;
      setSaveState("saved");
      return;
    }
    inFlight.current = true;
    setSaveState("saving");
    try {
      let saved: SpaceDoc;
      let wrote = sent;
      try {
        saved = await store.saveFrom(origin, sent, baseVersion.current);
      } catch (err) {
        // A version this member had not heard of yet (the last host's final save, a rename from the
        // sidebar, blocks moved here from another page): take what it added or removed into the room,
        // then save the room's copy over the newest version.
        const latest = await store.get(spaceId).catch(() => null);
        if (!latest || latest.version === baseVersion.current) throw err;
        const merged = mergeStored(latest);
        if (merged) wrote = { ...(docRef.current ?? sent), blocks: merged };
        baseVersion.current = latest.version;
        saved = await store.saveFrom(origin, wrote, latest.version);
      }
      baseVersion.current = saved.version;
      savedKey.current = wrote === sent ? key : contentKey(wrote);
      savedIds.current = blockIds(wrote.blocks);
      if (docRef.current) docRef.current = { ...docRef.current, version: saved.version, updatedAt: saved.updatedAt };
      setDoc((d) => (d ? { ...d, version: saved.version, updatedAt: saved.updatedAt } : d));
      setNow(Date.now());
      setSaveState("saved");
    } catch (err) {
      pending.current = true;
      setSaveError(err);
      setSaveState("failed");
      // The database's refusal (22023 "not a valid snapshot: …") can arrive as a plain error object.
      const raw = err instanceof Error ? err.message : err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
      const message = raw || "We couldn't save this page.";
      // A snapshot the database refuses (22023) will be refused again: say it once, retry on the next edit.
      refused.current = /not a valid snapshot/i.test(message) ? message : null;
      toast.error(message);
    } finally {
      inFlight.current = false;
      // Changes made while this save was in flight wait for the cadence like any other (never a fixed retry).
      if (pending.current && !refused.current && !timer.current) schedule();
    }
  };
  /**
   * Something changed (here or from a peer): every editor marks it, the host saves it on the cadence —
   * `debounceMs` after the last change, and at least every `maxWaitMs` while changes keep coming.
   */
  const schedule = () => {
    if (!docRef.current || !canEditRef.current) return;
    pending.current = true;
    const now = Date.now();
    dirtySince.current ??= now;
    // The cadence is a knob; until it is read nothing is timed (its arrival schedules what is pending).
    const cadence = collab.cadence;
    if (!collab.hostRef.current || !cadence) return;
    // "Saving…" is the write in flight only (Notion): changes waiting for the cadence read as edited.
    const wait = Math.max(0, Math.min(cadence.debounceMs, dirtySince.current + cadence.maxWaitMs - now));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), wait);
  };
  const update = (patch: Partial<Editable>) => {
    if (!docRef.current) return;
    docRef.current = { ...docRef.current, ...patch };
    setDoc((d) => (d ? { ...d, ...patch } : d));
    if ("blocks" in patch) setContentTick((t) => t + 1);
    if ("title" in patch || "icon" in patch) patchSummary(spaceId, { ...("title" in patch ? { title: patch.title } : {}), ...("icon" in patch ? { icon: patch.icon } : {}) });
    // Title, icon, cover and settings travel through the room's meta map; the body through the fragment.
    const { blocks: _blocks, ...meta } = patch;
    if (Object.keys(meta).length) collab.session?.setMeta(meta);
    schedule();
  };

  // A stored version newer than this member knows: the host's save (or this tab's sidebar rename / icon
  // change, which is not in the room yet). The room stays the page's truth — nothing here replaces the
  // editor; this member only learns the version and what is now stored, so its next save (if it becomes
  // host) compares against it.
  useEffect(() => {
    const learn = (incoming: SpaceDoc) => {
      if (incoming.id !== spaceId || incoming.version <= baseVersion.current) return;
      // A save in flight settles it: its compare-and-swap either wrote this version or is refused, and
      // the refusal merges the newer version into the room before saving again.
      if (inFlight.current) return;
      // Written outside the room (Move to from another page): the host merges it in; the editor's change
      // then schedules the save that carries it. A version the room wrote merges as a no-op.
      mergeStored(incoming);
      baseVersion.current = incoming.version;
      savedKey.current = contentKey(incoming);
      savedIds.current = blockIds(incoming.blocks);
      if (docRef.current) docRef.current = { ...docRef.current, version: incoming.version, updatedAt: incoming.updatedAt };
      setDoc((d) => (d ? { ...d, version: incoming.version, updatedAt: incoming.updatedAt } : d));
    };
    const off = store.onChange((change) => {
      if (change.kind !== "saved" || change.origin === origin || change.doc.id !== spaceId) return;
      // Saved from elsewhere in this tab (sidebar rename, icon): carry the change into the room.
      const cur = docRef.current;
      const d = change.doc;
      if (cur && (cur.title !== d.title || JSON.stringify(cur.icon) !== JSON.stringify(d.icon))) {
        learn(d);
        update({ title: d.title, icon: d.icon });
        return;
      }
      learn(d);
    });
    const unsubscribe = store.subscribe(spaceId, learn);
    return () => {
      off();
      unsubscribe();
    };
    // learn / update only touch refs, setters and the session.
  }, [store, spaceId, origin]);

  // The cadence knobs arrived, or this member just became host: time whatever is pending.
  useEffect(() => {
    if (collab.isHost && collab.cadence && pending.current) schedule();
  }, [collab.isHost, collab.cadence]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      // Only the host holds unsaved work for everyone; any other member's edits are already in the room.
      if (!hostAtLastRender.current || ((!pending.current || (docRef.current && contentKey(docRef.current) === savedKey.current)) && !inFlight.current)) return;
      void flush(true);
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      // Leaving this Space: write what is pending now.
      if (timer.current) window.clearTimeout(timer.current);
      void flush(true);
    };
    // Flush on leaving this Space only.
  }, [spaceId]);

  if (doc === undefined) return <div className="spaces-page" aria-busy="true" />;
  if (doc === null) {
    // The tree read was refused or failed: say that (sign in / no access / try again), not "No Space here".
    if (spaces.access || spaces.loadError) return <LoadAccessState access={spaces.access ?? "fault"} onRetry={spaces.retryLoad} />;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState icon={<FileQuestion />} title="No Space here" action={<Button asChild variant="primary"><Link href="/spaces">Open Spaces</Link></Button>} />
      </div>
    );
  }

  const locked = doc.settings.locked;
  // A person without edit (viewer, commenter) reads the live page; nothing editable is drawn for them.
  // In Trash by the store's read, or by the list (trashed from the sidebar while open, or an ancestor).
  const inTrash = doc.isArchived || trashedByList(doc.id, doc.parentId, spaces.archived, spaces.byId);
  const editable = canEdit && !locked && !inTrash;
  const path = inTrash ? [] : pathTo(doc.id);
  const isFavorite = favorites.includes(doc.id);
  const setSettings = (patch: Partial<SpaceDoc["settings"]>) => update({ settings: { ...doc.settings, ...patch } });

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

  // B9 "Turn into page in": the first block's text names a new page inside the picked page; its
  // children and the other picked blocks become that page's content. Picking this page leaves a
  // page block where the blocks were (Notion); another page takes them away from here.
  const turnIntoPageIn = (ids: string[]) => {
    openQuickFind("pick", (targetId) => {
      const editor = editorRef.current;
      if (!editor) return;
      const engine = ids.map((id) => editor.getBlock(id)).filter(Boolean) as unknown as EngineBlock[];
      const [first, ...rest] = fromEngine(engine);
      if (!first) return;
      const title = (first.text ?? []).map((s) => s.text).join("").trim();
      const blocks: SpaceBlock[] = [...(first.text ? (first.children ?? []) : [first]), ...rest];
      void (async () => {
        const made = await store.create({ parentId: targetId, title, blocks });
        if (targetId === doc.id) {
          editor.replaceBlocks(ids, [{ type: "page", props: { spaceId: made.id } } as never]);
        } else {
          editor.removeBlocks(ids);
        }
        toast.success(`Turned into ${title || "Untitled"}`);
      })().catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not turn this into a page"));
    });
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(`${window.location.origin}/spaces/${doc.id}`).then(
      () => toast.success("Copied link"),
      () => toast.error("Could not copy the link"),
    );
  };

  const jumpToBlock = (anchor: SpaceCommentAnchor) => {
    window.location.hash = `block-${anchor.blockId}`;
  };
  const openThread = (threadId: string) => {
    setCommentsOpen(true);
    window.setTimeout(() => document.querySelector(`.spaces-comments-panel [data-thread-id="${CSS.escape(threadId)}"]`)?.scrollIntoView({ block: "nearest" }), 60);
  };
  const startComment = (anchor: SpaceCommentAnchor) => {
    setDraft(anchor);
    setCommentsOpen(true);
  };
  const commentSource = spaceCommentSource(doc.id, doc.title);

  // The page as Markdown — what the AI reads as named variables (never as the person's typed input).
  const mdContext: MarkdownContext = {
    titleOf: (id) => spaces.byId.get(id)?.title ?? "Untitled",
    hrefOf: (id) => `${window.location.origin}/spaces/${id}`,
  };
  const pageForAi = () => {
    const d = docRef.current ?? doc;
    return { title: d.title, markdown: spaceToMarkdown(d.title, d.blocks, mdContext) };
  };

  // M1 / M2 — the Ask AI box under the selection (or the empty line the caret is on).
  const openAskAi = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const id = currentBlockId(editor);
    if (!id) return;
    const blockIds = selectedOrCurrent(editor, id);
    const picked = blockIds.map((b) => editor.getBlock(b)).filter(Boolean) as unknown as EngineBlock[];
    const selectedText = editor.getSelectedText() || plainText(fromEngine(picked));
    const top = editor.document.findIndex((b) => b.id === blockIds[0]);
    const before = top > 0 ? fromEngine(editor.document.slice(0, top) as unknown as EngineBlock[]) : [];
    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).getBoundingClientRect() : null;
    const el = document.querySelector(`.spaces-editor .bn-block-outer[data-id="${CSS.escape(blockIds[blockIds.length - 1])}"]`);
    const box = range && range.height ? range : el?.getBoundingClientRect();
    setAiTarget({
      at: { left: box?.left ?? 0, top: (box?.bottom ?? 0) + 4 },
      mode: selectedText.trim() ? "selection" : "empty-line",
      blockIds,
      selectedText,
      precedingMarkdown: blocksToMarkdownLines(before, mdContext).join("\n"),
    });
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
          <button type="button" className="spaces-locked-pill" onClick={() => canEdit && setSettings({ locked: false })} disabled={!canEdit} title={canEdit ? "Unlock page" : "Locked"}>
            <Lock size={13} />
            Locked
          </button>
        ) : null}
        {collab.offline ? (
          // Notion's Offline marker: edits stay on this screen and reach the others when the connection is back.
          <span className="spaces-locked-pill" title="Changes will sync when you're back online" aria-live="polite">
            <CloudOff size={13} />
            Offline
          </span>
        ) : null}
        <PresenceAvatars viewers={room.viewers} me={room.me} />
        {!inTrash ? <AskPageButton page={pageForAi} /> : null}
        <span className="spaces-edited hidden sm:inline" data-state={saveState} aria-live="polite">
          {collab.isHost && saveState === "saving" ? "Saving…" : collab.isHost && saveState === "failed" ? "Not saved — retrying" : editedAgo(doc.updatedAt, now)}
          {collab.isHost && saveState === "failed" ? <ErrorAlchemyMenu error={saveError} /> : null}
        </span>
        <ShareMenu spaceId={doc.id} title={doc.title} onCopyLink={copyLink} />
        <button
          type="button"
          className="spaces-topbar-button"
          aria-label={commentsOpen ? "Close comments" : "View all comments"}
          aria-pressed={commentsOpen}
          title="View all comments"
          onClick={() => setCommentsOpen((o) => !o)}
        >
          <MessageSquareText size={17} />
        </button>
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
          onExport={() => setExportOpen(true)}
          isTemplate={spaces.templates.ids ? spaces.templates.ids.includes(doc.id) : null}
          onTemplate={(on) =>
            void spaces.templates
              .setTemplate(doc.id, on)
              .then(() => toast.success(on ? "Saved as a template" : "No longer a template"))
              .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "We couldn't change the template label."))
          }
          updatedLabel={editedAgo(doc.updatedAt, now)}
          counts={pageCounts(doc)}
        />
      </header>

      <div className="spaces-body">
      <div className="spaces-scroll" data-matrx-page-scroll="" ref={scrollRef}>
        <TocRail blocks={doc.blocks} scrollerRef={scrollRef} anchorRef={headerRef} />
        {inTrash ? (
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

        {doc.cover ? <Cover cover={doc.cover} editable={editable} onChange={(cover) => update({ cover })} /> : null}

        <div className={`spaces-content ${fontClass}`} ref={contentRef}>
          <div className="spaces-header" ref={headerRef} data-has-cover={doc.cover ? "true" : undefined} data-has-icon={doc.icon ? "true" : undefined}>
            {doc.icon ? (
              <IconPicker value={doc.icon} onChange={(icon) => update({ icon })} disabled={!editable}>
                <button type="button" className="spaces-page-icon" data-image={doc.icon && !("icon" in doc.icon) ? "true" : undefined} aria-label="Change icon">
                  <SpaceIcon media={doc.icon} size={doc.icon && !("icon" in doc.icon) ? 136 : 78} />
                </button>
              </IconPicker>
            ) : null}
            {!inTrash ? (
              <div className="spaces-header-controls">
                {editable && !doc.icon ? (
                  <button type="button" className="spaces-header-control" onClick={() => update({ icon: randomIcon() })}>
                    <SmilePlus size={15} />
                    Add icon
                  </button>
                ) : null}
                {editable && !doc.cover ? (
                  <button type="button" className="spaces-header-control" onClick={() => update({ cover: randomCover() })}>
                    <ImageIcon size={15} />
                    Add cover
                  </button>
                ) : null}
                <button type="button" className="spaces-header-control" onClick={() => setAddingPageComment(true)}>
                  <MessageSquare size={15} />
                  Add comment
                </button>
              </div>
            ) : null}
            <Title value={doc.title} editable={editable} autoFocus={focusTitle} onChange={(title) => update({ title })} onEnter={focusFirstBlock} />
            <Backlinks key={doc.id} spaceId={doc.id} />
            <PageComments source={commentSource} comments={comments} adding={addingPageComment} onAddingDone={() => setAddingPageComment(false)} />
          </div>
          <CommentMargin threads={comments.threads} containerRef={contentRef} tick={String(contentTick)} onOpen={openThread} />
          {collab.session ? (
          <SpaceEditor
            key={doc.id}
            spaceId={doc.id}
            initialBlocks={doc.blocks}
            editable={editable}
            collab={{ fragment: collab.session.fragment, provider: collab.session.providerRef, user: collab.session.user }}
            onChange={(blocks) => update({ blocks })}
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
            menu={{ moveBlocksTo, turnIntoPageIn, askAi: openAskAi }}
            onComment={startComment}
          />
          ) : (
            <div className="spaces-editor-pending" aria-busy="true" />
          )}
          {sourcePicker}
          {aiTarget && editorRef.current ? <AskAiMenu editor={editorRef.current} target={aiTarget} page={pageForAi} onClose={() => setAiTarget(null)} /> : null}
          <ExportDialog open={exportOpen} onOpenChange={setExportOpen} spaceId={doc.id} beforeExport={flush} />
          <PageHistory
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            spaceId={doc.id}
            editable={editable}
            onRestore={(entry) => {
              // A restore is a new version with that version's content; the editor remounts on it.
              // Through the room, so everyone on the page sees the restored version at once.
              const { blocks, settings, icon, cover } = entry.snapshot;
              const editor = editorRef.current;
              if (editor) editor.replaceBlocks(editor.document, toEngine(blocks) as never);
              update({ settings, icon, cover });
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
      {commentsOpen ? (
        <CommentsPanel
          source={commentSource}
          comments={comments}
          draft={draft}
          onDraftDone={() => setDraft(undefined)}
          onClose={() => {
            setCommentsOpen(false);
            setDraft(undefined);
          }}
          onQuoteClick={jumpToBlock}
        />
      ) : null}
      </div>
    </div>
  );
}
