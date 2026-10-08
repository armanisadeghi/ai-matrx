"use client";

// features/spaces/page/SpacePage.tsx — one open Space: top bar, cover, icon, title, editor (§A).

import { Button, EmptyState } from "@ai-matrx/design-system/controls";
import { ChevronsRight, CloudOff, FileInput, FileQuestion, ImageIcon, Lock, Menu, MessageSquare, MessageSquareText, SmilePlus, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useIsMobile } from "@ai-matrx/kit/media-query";
import { Backlinks } from "./Backlinks";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserEmail, selectUserFullName, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useAccess } from "@/utils/permissions/access";

import { useSourcePicker, type PickedSource } from "../data/SourcePicker";
import { FindInPage } from "./FindInPage";
import { withPaintedSizes } from "../editor/database-host";
import { useDatabaseDesigner } from "../ai/DatabaseDesigner";
import { useMoveIn } from "../ai/MoveIn";
import { adoptPageDatabase, createPageDatabase } from "../data/new-database";
import { newViewId } from "../data/sources";
import { AskAiMenu, type AskAiTarget } from "../ai/AskAiMenu";
import { AskPageButton } from "../ai/AskPageButton";
import { LoadAccessState } from "../workspace/LoadAccessState";
import { useSpacesAiDisclosure } from "../ai/spaces-ai";
import { useSpaceBuilder } from "../ai/SpaceBuilder";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { currentBlockId, selectedOrCurrent } from "../editor/block-actions";
import { blocksToMarkdownLines, spaceToMarkdown, type MarkdownContext } from "../io/markdown";
import { RichCopySplit } from "@ai-matrx/chat/agent-copy/RichCopySplit";
import { PlainTextView } from "@ai-matrx/rich-content/copy/ContentActions";
import { usePlainView } from "@ai-matrx/rich-content/copy/content-view-store";
import { ExportDialog } from "./ExportDialog";
import { PageHistory } from "./PageHistory";

import type { SpaceBlock, SpaceDoc } from "../contract";
import { fromEngine, plainText, toEngine, type EngineBlock } from "../editor/convert";
import type { SpacesEditor } from "../editor/schema";
import { blockIds, planStoredMerge } from "./merge-stored";
import { SpaceEditor } from "../editor/SpaceEditor";
import { useSpaces } from "../state/SpacesProvider";
import { Cover, CoverPicker } from "./Cover";
import { IconPicker } from "./IconPicker";
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
import { trace, type SpaceMeta } from "../collab/space-collab";
import { editedAgo } from "./time";
import { mayWrite, roomCanEdit, trashedByList } from "./trash-state";
import { attemptSave, deviceStorage, forgetUnsaved, keepsChange, keepUnsaved, noteWritten } from "./unsaved";
import { useRestoreKept } from "./useRestoreKept";
import { SpaceSeedProvider, useSpaceSeedSettled, type SpaceBlockSeeds } from "./space-seed-context";
import { SpaceLinksProvider, type SeededBacklink, type SpaceLinks } from "./space-links";
import { StaticSpaceBody } from "../editor/static-body";
import { sendOnLeave, trackAccessToken } from "./leave-save";
import { contentKey } from "./content-key";
import { usePageReminders } from "../editor/reminders";
import { markNewSource, useSyncedEdges } from "../state/synced-sources";
import { setSuggestAuthor, setSuggestName, setSuggestPage } from "../editor/suggest";
import { useContentEditOnly } from "./content-edit";
import { StructureProvider } from "./structure";
import { copyToClipboard } from "@/lib/clipboard/copy";

/** The longest the static first paint stays once the editor is built behind it. */
const REVEAL_CAP_MS = 2500;

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
  // The title is in the first paint (server HTML, round 34); React never rewrites it after — later
  // values (typing here, the room) are written by the effect so the caret is never disturbed.
  const [first] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== value) el.textContent = value;
  }, [value]);
  // A page the person just made opens with its title ready to type in (Notion) — once. Edit access that
  // settles (or is re-read) later must never pull the caret back here from the line being typed.
  const focused = useRef(false);
  useEffect(() => {
    if (!autoFocus || !editable || focused.current) return;
    focused.current = true;
    ref.current?.focus();
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
    >
      {first}
    </h1>
  );
}

/** failed = will retry on the cadence; refused = the page as it is cannot be stored (retried on the next edit). */
type SaveState = "saved" | "saving" | "failed" | "refused";

/** A14 — Notion counts the title and every block's text. */
function pageCounts(doc: SpaceDoc): { words: number; characters: number } {
  const text = `${doc.title}\n${plainText(doc.blocks)}`;
  const words = text.split(/\s+/).filter(Boolean).length;
  return { words, characters: text.replace(/\s/g, "").length };
}

/** One screen per page and content epoch: a page rewritten outside its screen (the sample filled while it
 *  was open) opens again on what is stored. */
/** Nothing written yet: no blocks, or one empty line (Notion's blank page). */
function isBlankPage(blocks: readonly SpaceBlock[]): boolean {
  if (blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const [only] = blocks;
  return only.type === "paragraph" && !(only.text ?? []).some((t) => (t as { text?: string }).text) && !only.children?.length;
}

export function SpacePage({
  spaceId,
  initialDoc,
  seeds,
  links,
  backlinks,
}: {
  spaceId: string;
  initialDoc?: SpaceDoc;
  seeds?: SpaceBlockSeeds;
  links?: SpaceLinks;
  backlinks?: { spaceId: string; rows: SeededBacklink[] };
}) {
  const { pageEpoch } = useSpaces();
  const key = `${spaceId}:${pageEpoch(spaceId)}`;
  // Round 34: the page as the server read it (its text is in the HTML) opens the FIRST screen only — a
  // page rewritten outside its screen (a new epoch) opens again on what is stored.
  const [servedKey] = useState(key);
  const served = key === servedKey && initialDoc?.id === spaceId ? initialDoc : undefined;
  return (
    <SpaceSeedProvider seeds={key === servedKey ? seeds : undefined}>
      <SpaceLinksProvider links={key === servedKey ? links : undefined} backlinks={key === servedKey ? backlinks : undefined}>
        <SpacePageScreen key={key} spaceId={spaceId} initialDoc={served} />
      </SpaceLinksProvider>
    </SpaceSeedProvider>
  );
}

function SpacePageScreen({ spaceId, initialDoc }: { spaceId: string; initialDoc?: SpaceDoc }) {
  const spaces = useSpaces();
  const { store, pathTo, favorites, toggleFavorite, markVisited, openQuickFind, sidebarCollapsed, setSidebarCollapsed, setMobileSidebarOpen, patchSummary } = spaces;
  const isMobile = useIsMobile();
  const [doc, setDoc] = useState<SpaceDoc | null | undefined>(initialDoc);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<SaveState>("saved");
  /** Why the last save failed — handed to the error menu beside "Not saved". */
  const [saveError, setSaveError] = useState<unknown>(null);
  const [focusTitle, setFocusTitle] = useState(false);
  /** The editor once built with the room's body in it (null until then; reset with the page). */
  const [readyEditor, setReadyEditor] = useState<SpacesEditor | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState<AskAiTarget | null>(null);
  // H1 — the comments panel, a thread being started (undefined = none; null anchor = the page), and the
  // page comment being written under the title.
  const [commentsOpen, setCommentsOpen] = useState(false);
  // The bar's Plain switch: the page's exact markdown in place of the editor (which stays mounted).
  const plainView = usePlainView(`space-page-${spaceId}`);
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
  // Full editing (structure, sharing, settings) vs "Can edit content" (edit_content: the page's text and rows only);
  // the database refuses the rest, so the page only stops offering it.
  const fullEdit = access.level === "edit" || access.level === "admin";
  const contentOnly = useContentEditOnly(spaceId, access.level === "view");
  const canEdit = fullEdit || contentOnly;
  // A page in Trash (its own row or an ancestor's, by the store's read or the list) takes no edits and no
  // saves, and this member gives up the room's host role at once; Restore brings both back.
  const trashedNow = !!doc && (doc.isArchived || trashedByList(doc.id, doc.parentId, spaces.archived, spaces.byId));
  const trashedRef = useRef(trashedNow);
  trashedRef.current = trashedNow;
  const canEditRef = useRef(canEdit);
  canEditRef.current = roomCanEdit(canEdit, trashedNow);
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
  /** This member changed the page since the last save that landed (set before the room is joined too). */
  const localEdits = useRef(false);
  /** Title / icon / cover / settings changed before the room was joined: the room takes them on join. */
  const preRoomMeta = useRef<Partial<SpaceMeta> | null>(null);

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
  const userId = useAppSelector(selectUserId);
  // org-filter: write-target a new database on a page not saved yet goes to the active organization
  const activeOrg = useAppSelector(selectActiveOrganizationId);
  const applyMeta = (meta: Partial<SpaceMeta>) => {
    if (!docRef.current) return;
    // A field this member changed before joining keeps this member's value (it goes into the room on join).
    const held = preRoomMeta.current;
    const incoming = held ? Object.fromEntries(Object.entries(meta).filter(([k]) => !(k in held))) : meta;
    if (!Object.keys(incoming).length) return;
    const patch = incoming as Partial<Editable>;
    docRef.current = { ...docRef.current, ...patch };
    setDoc((d) => (d ? { ...d, ...patch } : d));
    if ("title" in patch || "icon" in patch) patchSummary(spaceId, { ...("title" in patch ? { title: patch.title } : {}), ...("icon" in patch ? { icon: patch.icon } : {}) });
    schedule();
  };
  const hostAtLastRender = useRef(false);
  const hostKnown = useRef(false);
  /** The page was made by this tab a moment ago (its room cannot hold anything yet). */
  const [madeHere, setMadeHere] = useState(false);
  const collab = useSpaceCollab({
    spaceId,
    snapshot: doc,
    made: madeHere,
    userId: room.me,
    name: fullName || email || "Someone",
    room,
    canEdit: roomCanEdit(canEdit, trashedNow),
    onMeta: applyMeta,
    // Only real edits the room holds (pending) are saved on handover — opening a page never writes one.
    onBecameHost: () => {
      if (pending.current) schedule();
    },
  });
  hostAtLastRender.current = collab.isHost;
  /** The room is joined: its host (this member or another) writes the page. */
  hostKnown.current = collab.session !== null;
  // Built from the stored snapshot: the body the editor will hold (BlockNote's normalisation of the stored
  // blocks) IS the stored version, so it is the save baseline — opening a page never writes a version.
  useEffect(() => {
    const s = collab.session;
    // Fields changed before the room was joined go into it now (everyone sees them; the save carries them).
    if (s && preRoomMeta.current) {
      s.setMeta(preRoomMeta.current);
      preRoomMeta.current = null;
    }
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
    setReadyEditor(null);
  }

  useEffect(() => {
    let live = true;
    docRef.current = null;
    pending.current = false;
    // A page made a moment ago arrives in hand; any other is read. Both settle in a callback, so the
    // page's state is set by the answer, never synchronously by the effect.
    const made = spaces.takeFresh(spaceId);
    // The server's read of this page (round 34) is the stored page: adopted as if just read.
    const read = made ?? (initialDoc?.id === spaceId ? initialDoc : null);
    void (read ? Promise.resolve(read) : store.get(spaceId)).then(
      (d) => {
        if (!live) return;
        setMadeHere(Boolean(made));
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
  /** A copy of the page is kept on this device (a save did not land): every change refreshes it. */
  const keptLocally = useRef(false);
  /** The last save error toasted — a refusal repeating on every edit is said once. */
  const lastToast = useRef<string | null>(null);
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
  /**
   * A copy of this page kept on the device by a save that did not land (page/unsaved.ts): put back once
   * the page is ready for it — editor built, stored version known, edit access answered — in whatever
   * order those arrive (page/useRestoreKept.ts). Newer than what is stored: back without a word; someone
   * saved a newer version meanwhile: offered (Restore / Discard). It saves like any edit.
   */
  const restore = useRestoreKept({
    spaceId,
    editor: readyEditor,
    canEdit: roomCanEdit(canEdit, trashedNow),
    stored: () => (docRef.current && savedKey.current !== null ? { key: savedKey.current, version: docRef.current.version, archived: docRef.current.isArchived } : null),
    apply: (copy) => {
      const editor = editorRef.current;
      if (!editor) return;
      // A copy that is what the page already shows (the stored body as this editor normalises it, kept
      // by a host on open) changes nothing: cleared, never re-drawn. Only a body that differs is put
      // back — replacing every block re-draws the whole page (a late layout shift, D2).
      const shown = { ...(docRef.current ?? copy.doc), blocks: fromEngine(editor.document as unknown as EngineBlock[]) };
      if (contentKey(shown) === contentKey(copy.doc)) {
        forgetUnsaved(deviceStorage(), spaceId);
        return;
      }
      if (JSON.stringify(shown.blocks) !== JSON.stringify(copy.doc.blocks)) {
        editor.replaceBlocks(editor.document, toEngine(copy.doc.blocks) as never);
      }
      keptLocally.current = true;
      update({ title: copy.doc.title, icon: copy.doc.icon, cover: copy.doc.cover, settings: copy.doc.settings, blocks: fromEngine(editor.document as unknown as EngineBlock[]) });
    },
    offer: (_copy, { restore, discard }) =>
      toast.warning("Unsaved changes from this device", {
        duration: Infinity,
        action: { label: "Restore", onClick: () => { restore(); toast.info("Unsaved changes restored"); } },
        cancel: { label: "Discard", onClick: discard },
      }),
    // Edits made while the kept copy waited (held, never saved over it) save now.
    onDecided: () => {
      if (pending.current) schedule();
    },
  });
  /** Keep the page on this device — never over a kept copy still waiting for its decision. */
  const keep = (d: SpaceDoc, base: number) => {
    if (restore.awaiting()) return;
    // What is stored needs no copy (a host keeps every change, a peer's echo and its own seed included).
    if (contentKey(d) === savedKey.current) forgetUnsaved(deviceStorage(), spaceId);
    else keepUnsaved(deviceStorage(), spaceId, d, base);
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
    // In Trash nothing is written; what is pending saves after Restore. Leaving: the session is already
    // torn down, so the host status of the last render decides.
    const host = leaving ? hostAtLastRender.current : collab.hostRef.current;
    if (!docRef.current || !mayWrite({ trashed: trashedRef.current, host, pending: pending.current, inFlight: inFlight.current })) return;
    // A copy kept on this device still waits for its decision: a save now would store the page without
    // it and clear it. Held; the decision schedules it (useRestoreKept onDecided).
    if (restore.awaiting()) return;
    // Each database block carries the size it is painted at (the next visit holds it from its first frame).
    const sent = { ...docRef.current, blocks: withPaintedSizes(docRef.current.blocks) };
    const key = contentKey(sent);
    pending.current = false;
    // The cadence's max wait runs from the first change AFTER what this save carries.
    dirtySince.current = null;
    // Same content: skipped. A database block's painted size is never content (content-key.ts) and never
    // makes a version on its own — opening a page writes nothing; this device keeps the size it painted
    // (database-host.tsx, localStorage) and the next real save carries it to the store.
    if (key === savedKey.current) {
      dirtySince.current = null;
      setSaveState("saved");
      return;
    }
    inFlight.current = true;
    urgentUntil.current = 0;
    trace({ ev: "save", base: baseVersion.current });
    setSaveState("saving");
    const storage = deviceStorage();
    const attempt = (d: SpaceDoc, base: number) => attemptSave({ spaceId, doc: d, baseVersion: base, storage, save: (x, b) => store.saveFrom(origin, x, b) });
    try {
      let wrote = sent;
      let r = await attempt(sent, baseVersion.current);
      if (!r.ok && !r.refused) {
        // A version this member had not heard of yet (the last host's final save, a rename from the
        // sidebar, blocks moved here from another page): take what it added or removed into the room,
        // then save the room's copy over the newest version.
        const latest = await store.get(spaceId).catch(() => null);
        if (latest && latest.version !== baseVersion.current) {
          const merged = mergeStored(latest);
          if (merged) wrote = { ...(docRef.current ?? sent), blocks: merged };
          baseVersion.current = latest.version;
          r = await attempt(wrote, latest.version);
        }
      }
      if (!r.ok) {
        // Refused or failed: the edits stay in the editor and on this device (page/unsaved.ts).
        keptLocally.current = true;
        pending.current = true;
        setSaveError(r.error);
        setSaveState(r.refused ? "refused" : "failed");
        // A refusal is refused again until the page changes: say it once, retry on the next edit.
        refused.current = r.refused ? r.message : null;
        if (lastToast.current !== r.message) toast.error(r.message);
        lastToast.current = r.message;
        return;
      }
      const saved = r.saved;
      noteWritten(storage, spaceId, saved.version);
      keptLocally.current = false;
      lastToast.current = null;
      baseVersion.current = saved.version;
      savedKey.current = wrote === sent ? key : contentKey(wrote);
      savedIds.current = blockIds(wrote.blocks);
      if (docRef.current) docRef.current = { ...docRef.current, version: saved.version, updatedAt: saved.updatedAt };
      setDoc((d) => (d ? { ...d, version: saved.version, updatedAt: saved.updatedAt } : d));
      setNow(Date.now());
      setSaveState("saved");
      // Edits made while this save was in flight are not in it: the save cleared the device copy, so
      // keep them again now (a reload before their own save must still find them).
      if (pending.current && docRef.current && contentKey(docRef.current) !== savedKey.current) keep(docRef.current, baseVersion.current);
      else localEdits.current = false;
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
  const schedule = (local = false) => {
    if (!docRef.current || !canEditRef.current) return;
    pending.current = true;
    if (local) localEdits.current = true;
    // Every change this member makes (and, as host, everyone's) is kept on this device the moment it is
    // made — before the room is joined or the host elected too: a tab that closes or crashes before the
    // save lands loses nothing.
    if (keepsChange({ local, host: collab.hostRef.current, keptLocally: keptLocally.current })) keep(docRef.current, baseVersion.current);
    const now = Date.now();
    dirtySince.current ??= now;
    // The cadence is a knob; until it is read nothing is timed (its arrival schedules what is pending).
    const cadence = collab.cadence;
    trace({ ev: "schedule", local, host: collab.hostRef.current, cadence: !!cadence });
    if (!collab.hostRef.current || !cadence) return;
    // "Saving…" is the write in flight only (Notion): changes waiting for the cadence read as edited.
    // An insert that points at something just made elsewhere (a database designed or created from "/") saves
    // at once: the table already exists, and a tab closed inside the debounce would leave it with no page.
    const urgent = urgentUntil.current > now;
    const wait = urgent ? 0 : Math.max(0, Math.min(cadence.debounceMs, dirtySince.current + cadence.maxWaitMs - now));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), wait);
  };
  /** Until this time the next change saves without the debounce (saveSoon). */
  const urgentUntil = useRef(0);
  /**
   * `made` resolved with something that already exists in the store (a new table): the block the caller
   * inserts for it saves at once — whatever is pending flushes on the next tick, and the change event still
   * on its way (if any) is timed at zero.
   */
  const saveSoon = <T,>(made: Promise<T>): Promise<T> =>
    made.then((value) => {
      if (value) {
        urgentUntil.current = Date.now() + 1500;
        window.setTimeout(() => {
          if (pending.current && collab.hostRef.current && collab.cadence) schedule();
        }, 0);
      }
      return value;
    });
  const warnNotAdopted = (err: unknown) => toast.warning("Not shared with the page", { description: err instanceof Error ? err.message : undefined });
  /** "/" → Database (inline or full page): a new table in this page's organization, as a sub-page when asked. */
  const newDatabase = async (fullPage: boolean): Promise<{ table: PickedSource; pageId?: string } | null> => {
    try {
      const table = await createPageDatabase(spaceId, activeOrg, userId);
      // The page that holds the database owns it (sharing the page shares it): this page inline, else the new sub-page.
      if (!fullPage) {
        await adoptPageDatabase(spaceId, table.tableId).catch(warnNotAdopted);
        return { table };
      }
      const view = { id: newViewId(), name: "Table", layout: "grid" as const };
      const sub = await spaces.createSpace(spaceId, {
        open: false,
        title: table.name,
        blocks: [{ id: crypto.randomUUID(), type: "database", props: { source: { kind: "table", tableId: table.tableId }, inline: false, title: table.name, linked: false, views: [view], activeViewId: view.id } }],
      });
      await adoptPageDatabase(sub.id, table.tableId).catch(warnNotAdopted);
      window.setTimeout(() => spaces.open(sub.id), 60);
      return { table, pageId: sub.id };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The database could not be made.");
      return null;
    }
  };
  const update = (patch: Partial<Editable>) => {
    if (!docRef.current) return;
    docRef.current = { ...docRef.current, ...patch };
    setDoc((d) => (d ? { ...d, ...patch } : d));
    if ("blocks" in patch) setContentTick((t) => t + 1);
    if ("title" in patch || "icon" in patch) patchSummary(spaceId, { ...("title" in patch ? { title: patch.title } : {}), ...("icon" in patch ? { icon: patch.icon } : {}) });
    // Title, icon, cover and settings travel through the room's meta map; the body through the fragment.
    const { blocks: _blocks, ...meta } = patch;
    if (Object.keys(meta).length) {
      if (collab.session) collab.session.setMeta(meta);
      // Before the room is joined: held, and written into the room when it is (never overwritten by it).
      else preRoomMeta.current = { ...preRoomMeta.current, ...meta };
    }
    schedule(true);
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
    trackAccessToken();
    /** This member holds edits the store does not have yet (only the host writes; a peer's are in the room). */
    // Before the room is joined nobody else can hold this member's edits: they count as this member's to send.
    const leaving = () => !!docRef.current && (hostAtLastRender.current || (localEdits.current && !hostKnown.current)) && !trashedRef.current && (pending.current || inFlight.current) && contentKey(docRef.current) !== savedKey.current;
    // The tab is going (closed, reloaded, navigated away): keep the page on this device, then send it as a
    // keepalive save the browser finishes after the tab is gone (page/leave-save.ts).
    // beforeunload and pagehide both fire on a reload; the same page is sent once.
    let sentKey: string | null = null;
    const onLeave = () => {
      if (!leaving() || !docRef.current) return;
      keep(docRef.current, baseVersion.current);
      const key = contentKey(docRef.current);
      if (key === sentKey) return;
      if (sendOnLeave(docRef.current, baseVersion.current)) sentKey = key;
    };
    // Hidden (tab switched, phone locked — a phone may end the page without another word): save now.
    const onHidden = () => {
      if (document.visibilityState !== "hidden" || !leaving() || !docRef.current) return;
      keep(docRef.current, baseVersion.current);
      void flush();
    };
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onHidden);
    // No "Leave site?" prompt (Notion asks nothing): the page is on this device and on its way to the store.
    const warn = onLeave;
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onHidden);
      // Leaving this Space: write what is pending now (and keep it here until that lands).
      if (timer.current) window.clearTimeout(timer.current);
      if (leaving() && docRef.current) keep(docRef.current, baseVersion.current);
      void flush(true);
    };
    // Flush on leaving this Space only.
  }, [spaceId]);

  // Round 34 — the first paint is the page's static body (server HTML); the editor is built behind it
  // once the room is joined and takes its place when it paints the same height (so nothing moves), or
  // after REVEAL_CAP_MS whatever it draws.
  // The editor's database blocks start from the server's answers: it is built once they have landed.
  const seedSettled = useSpaceSeedSettled();
  const stackRef = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  const revealWhenPainted = () => {
    const started = performance.now();
    let same = 0;
    const tick = () => {
      const stack = stackRef.current;
      const shown = stack?.querySelector<HTMLElement>(":scope > .spaces-static-body");
      const behind = stack?.querySelector<HTMLElement>(":scope > .spaces-editor-behind");
      if (!stack || !shown || !behind) return setRevealed(true);
      // Every React block drawn (BlockNote paints them a frame after the text) and the heights agree.
      const pending = behind.querySelector(".react-renderer:empty, .spaces-db-loading");
      same = !pending && Math.abs(behind.scrollHeight - shown.getBoundingClientRect().height) <= 1 ? same + 1 : 0;
      if (same >= 2 || performance.now() - started > REVEAL_CAP_MS) return setRevealed(true);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Every hook runs before the loading / missing returns below (React's order of hooks).
  const builder = useSpaceBuilder();
  const designer = useDatabaseDesigner();
  const moveIn = useMoveIn();
  // N2 — Remind on a date mention: this person's reminders follow the page's date mentions.
  usePageReminders(spaceId, doc?.title ?? "", doc?.blocks, userId ?? null, !!doc && !trashedNow, doc?.organizationId);
  useSyncedEdges(spaceId, doc?.blocks, !!doc && !trashedNow && fullEdit);
  // N3: suggestions carry this person as their author; suggest mode is per page.
  useEffect(() => {
    setSuggestAuthor(userId ?? null);
    if (userId && fullName) setSuggestName(userId, fullName);
    setSuggestPage(spaceId);
    return () => setSuggestPage(null);
  }, [userId, fullName, spaceId]);

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
  const inTrash = trashedNow;
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
    void copyToClipboard(`${window.location.origin}/spaces/${doc.id}`, "Copied link");
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
          <button type="button" className="spaces-locked-pill" onClick={() => fullEdit && setSettings({ locked: false })} disabled={!fullEdit} title={fullEdit ? "Unlock page" : "Locked"}>
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
        <span className="spaces-edited hidden items-center gap-1 sm:inline-flex" data-state={saveState} aria-live="polite">
          {collab.isHost && saveState === "saving" ? "Saving…" : collab.isHost && saveState === "failed" ? "Not saved — retrying" : collab.isHost && saveState === "refused" ? "Not saved" : editedAgo(doc.updatedAt, now)}
          {collab.isHost && (saveState === "failed" || saveState === "refused") ? <ErrorAlchemyMenu error={saveError} /> : null}
        </span>
        {/* The content action set (Copy, Plain, Export, Print, Transform): the whole page as markdown. */}
        <RichCopySplit size="xs" label="page" exportTitle={doc.title || "Untitled"} viewKey={`space-page-${spaceId}`} human={() => pageForAi().markdown} />
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
          suggestPageId={canEdit ? doc.id : undefined}
          contentOnly={contentOnly}
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
          onAskAiChange={builder.wired && editable ? () => builder.ask({ spaceId: doc.id, ...pageForAi() }) : undefined}
          isTemplate={spaces.templates.ids ? spaces.templates.ids.includes(doc.id) : null}
          onOpen={spaces.templates.ids === null ? spaces.templates.refresh : undefined}
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
                  // Notion's picker opens; nothing is set until the person picks.
                  <IconPicker value={null} onChange={(icon) => update({ icon })}>
                    <button type="button" className="spaces-header-control">
                      <SmilePlus size={15} />
                      Add icon
                    </button>
                  </IconPicker>
                ) : null}
                {editable && !doc.cover ? (
                  <CoverPicker onPick={(cover) => update({ cover })}>
                    <button type="button" className="spaces-header-control">
                      <ImageIcon size={15} />
                      Add cover
                    </button>
                  </CoverPicker>
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
          {plainView ? <PlainTextView text={pageForAi().markdown} /> : null}
          <div className="spaces-body-stack" ref={stackRef} style={plainView ? { display: "none" } : undefined}>
          {!revealed ? <StaticSpaceBody blocks={doc.blocks} /> : null}
          {collab.session && seedSettled ? (
          <div className={revealed ? "contents" : "spaces-editor-behind"} inert={!revealed}>
          <StructureProvider value={fullEdit}>
          <SpaceEditor
            key={doc.id}
            spaceId={doc.id}
            initialBlocks={doc.blocks}
            editable={editable}
            collab={{ fragment: collab.session.fragment, provider: collab.session.providerRef, user: collab.session.user }}
            onChange={(blocks) => update({ blocks })}
            onReady={(editor) => {
              editorRef.current = editor;
              // After the room's body is in the editor: a copy kept on this device goes back on top.
              setReadyEditor(editor);
              revealWhenPainted();
            }}
            slash={{
              createSubpage: async () => {
                // Notion: the new sub-page opens at once with the caret in its title, so it is named
                // there; back / the breadcrumb return here. This page's pending edits are sent first (a
                // title typed a moment ago would otherwise read "Untitled" in the new page's breadcrumb,
                // the tree re-read on create carrying the stored title), then its block lands where "/"
                // was typed (the caller inserts it when this answers) and that save is sent before
                // leaving. Each wait is capped; the leave path covers a save slower than that.
                const settle = () => Promise.race([flush(), new Promise((r) => window.setTimeout(r, 400))]);
                await settle();
                const sub = await spaces.createSpace(doc.id, { open: false });
                window.setTimeout(() => void settle().finally(() => spaces.openToName(sub.id)), 0);
                return sub.id;
              },
              pickPage: (options) =>
                new Promise((resolve) =>
                  openQuickFind("pick", (id) => resolve({ spaceId: id, created: false }), {
                    first: options?.createFirst,
                    onCreate: (title) => {
                      void spaces.createSpace(doc.id, { open: false, title }).then(
                        (sub) => resolve({ spaceId: sub.id, created: true }),
                        () => resolve(null),
                      );
                    },
                  }),
                ),
              pickSource,
              designDatabase: designer.wired ? () => saveSoon(designer.design({ spaceId: doc.id, ...pageForAi() })) : undefined,
              newDatabase: (fullPage) => saveSoon(newDatabase(fullPage)),
              createSyncedSource: async () => {
                // C18: the synced content is its own Space under this page (inherits its access), hidden from the tree.
                const source = await spaces.createSpace(doc.id, { open: false, title: "Synced block", blocks: [{ id: crypto.randomUUID(), type: "text", text: [] }] });
                await markNewSource(source.id, doc.id).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "The synced block was not marked."));
                return source.id;
              },
            }}
            menu={{ moveBlocksTo, turnIntoPageIn, askAi: openAskAi }}
            onComment={startComment}
          />
          </StructureProvider>
          </div>
          ) : null}
          </div>
          {sourcePicker}
          <FindInPage rootSelector=".spaces-page .spaces-editor" />
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
          {editable && builder.wired && isBlankPage(doc.blocks) ? (
            // Notion's blank page offers its starters under the first line; ours is the Space Builder.
            <div className="spaces-starters">
              <Button variant="quiet" icon={<AGENT_ICON size={15} />} onClick={() => builder.ask(null)}>
                Build with AI
              </Button>
              {moveIn.wired ? (
                <Button variant="quiet" icon={<FileInput size={15} />} onClick={moveIn.ask}>
                  Import from Notion
                </Button>
              ) : null}
            </div>
          ) : null}
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
