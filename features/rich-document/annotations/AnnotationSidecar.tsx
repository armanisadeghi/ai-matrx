// features/rich-document/annotations/AnnotationSidecar.tsx
//
// THE ANNOTATION SIDECAR — one primitive any surface rendering through
// <RichContent> / <RichDocument> installs, without the renderer knowing:
//
//   <AnnotationSidecarProvider source={…}>        state + store + realtime
//     <AnnotatedContent> <RichDocument …/> </AnnotatedContent>   capture + paint + toolbar
//     <AnnotationPanel />                          the right-side list, anywhere
//   </AnnotationSidecarProvider>
//
// A surface that does not install it renders the same bytes and behaves
// exactly as before. Nothing here wraps, splits or mutates rendered text.

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Highlighter, Link2, MessageSquarePlus, PencilLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { AnchorBuildError, buildTextAnchor, type TextAnchor } from "./anchor";
import { HIGHLIGHT_COLORS, type HighlightColor } from "./constants";
import { projectSource, rangeToSource, sourceOffsetAtPoint, type SourceProjection } from "./projection";
import { paintCss, useSidecarPaint } from "./useSidecarPaint";
import { useAnnotationSidecar, type AnnotationSidecarApi } from "./useAnnotationSidecar";
import { MentionComposer } from "./MentionComposer";
import { LinkRecordSheet } from "./LinkRecordSheet";
import type { AnnotationSource } from "./types";
import { useIsMobile } from "@/hooks/use-mobile";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface CapturedSelection {
  anchor: TextAnchor;
  rect: { left: number; top: number; bottom: number; width: number };
  /** Opened from the keyboard: focus moves into the toolbar. */
  focusToolbar?: boolean;
}

interface SidecarContextValue {
  source: AnnotationSource;
  api: AnnotationSidecarApi;
  instance: string;
  activeKey: string | null;
  setActiveKey: (key: string | null) => void;
  selection: CapturedSelection | null;
  setSelection: (s: CapturedSelection | null) => void;
  /** A panel action waiting for the person to select new text (reattach). */
  pendingReattach: string | null;
  setPendingReattach: (key: string | null) => void;
  /** Scroll the rendered passage of an item into view. */
  reveal: (key: string) => void;
  registerReveal: (fn: (key: string) => void) => void;
}

const SidecarContext = createContext<SidecarContextValue | null>(null);

export function useSidecar(): SidecarContextValue {
  const ctx = useContext(SidecarContext);
  if (!ctx) throw new Error("useSidecar must be used inside <AnnotationSidecarProvider>.");
  return ctx;
}

export function AnnotationSidecarProvider({ source, children }: { source: AnnotationSource; children: ReactNode }) {
  const api = useAnnotationSidecar(source);
  const instance = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [selection, setSelection] = useState<CapturedSelection | null>(null);
  const [pendingReattach, setPendingReattach] = useState<string | null>(null);
  const revealRef = useRef<(key: string) => void>(() => {});
  return (
    <SidecarContext.Provider
      value={{
        source,
        api,
        instance,
        activeKey,
        setActiveKey,
        selection,
        setSelection,
        pendingReattach,
        setPendingReattach,
        reveal: (key) => revealRef.current(key),
        registerReveal: (fn) => {
          revealRef.current = fn;
        },
      }}
    >
      <style>{paintCss(instance)}</style>
      {children}
    </SidecarContext.Provider>
  );
}

/**
 * Wraps the rendered content: captures selections into anchors, paints every
 * resolved item, and shows the selection toolbar. `extraActions` lets a
 * surface add its own passage actions (the study guide's tutor / report).
 */
export function AnnotatedContent({
  children,
  className,
  extraActions,
}: {
  children: ReactNode;
  className?: string;
  extraActions?: (selection: CapturedSelection, close: () => void) => ReactNode;
}) {
  const ctx = useSidecar();
  const { source, api, instance, activeKey, setActiveKey, selection, setSelection } = ctx;
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const projection = useRef<SourceProjection | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  useSidecarPaint(root, source.body, api.state.items, instance, activeKey, (p) => {
    projection.current = p;
  });

  // Reveal: scroll a resolved item's first painted range into view.
  useEffect(() => {
    ctx.registerReveal((key) => {
      const item = api.state.items.find((i) => i.key === key);
      const res = item?.resolution;
      if (!root || !projection.current || !res || res.start16 == null) return;
      const node = projection.current.nodes.find(
        (m) => m.sourceStart + m.length > res.start16! && m.sourceStart < (res.end16 ?? res.start16! + 1),
      );
      node?.node.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
      setActiveKey(key);
    });
  });

  const capture = (focusToolbar = false) => {
    if (!root) return;
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    if (!projection.current) projection.current = projectSource(root, source.body);
    const mapped = rangeToSource(projection.current, range);
    if (!mapped) {
      setCaptureError("That selection is not part of the document's own text (for example a formula or a label), so it cannot be pinned. Select the words around it instead.");
      setSelection(null);
      return;
    }
    try {
      // Trim whitespace at the edges so the quote is the words the person meant.
      let { start, end } = mapped;
      while (start < end && /\s/.test(source.body[start])) start += 1;
      while (end > start && /\s/.test(source.body[end - 1])) end -= 1;
      const anchor = buildTextAnchor(source.body, start, end, source.contentVersion);
      // A collapsed-rect or unsupported range (some engines, keyboard-made selections) anchors
      // the toolbar to the content box instead of failing the capture.
      const measured = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
      const r = measured && (measured.width || measured.height) ? measured : root.getBoundingClientRect();
      setCaptureError(null);
      setSelection({ anchor, rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width }, focusToolbar });
    } catch (e) {
      setSelection(null);
      setCaptureError(e instanceof AnchorBuildError ? e.message : String(e));
    }
  };

  // KEYBOARD PATH (verify-RC-B11 F7): after selecting text (Shift+arrows with caret browsing,
  // or any selection), Ctrl/Cmd+Alt+M — the Google Docs comment chord — opens the toolbar with
  // focus on its first control; arrows move through it; Escape returns to the text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.altKey && (e.ctrlKey || e.metaKey) && (e.code === "KeyM" || e.key.toLowerCase() === "m"))) return;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      if (!root.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
      e.preventDefault();
      capture(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // A click on painted text (no selection) focuses its item in the panel.
  const onClick = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    if (!projection.current) return;
    const at = sourceOffsetAtPoint(projection.current, document, e.clientX, e.clientY);
    if (at == null) return;
    const hit = api.state.items.find(
      (i) => i.resolution?.start16 != null && i.resolution.start16 <= at && at < (i.resolution.end16 ?? 0),
    );
    if (hit) setActiveKey(hit.key);
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={setRoot}
        data-annotation-root=""
        onPointerUp={() => capture()}
        onKeyUp={(e) => {
          if (e.shiftKey || e.key === "Shift") capture();
        }}
        onClick={onClick}
      >
        {children}
      </div>
      {captureError && (
        <div role="status" className="fixed bottom-4 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-start gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-lg">
          <span className="flex-1">{captureError} <ErrorAlchemyMenu /></span>
          <button type="button" aria-label="Dismiss" onClick={() => setCaptureError(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      {selection && <SelectionToolbar selection={selection} extraActions={extraActions} />}
    </div>
  );
}

type ToolbarMode = "menu" | "comment" | "suggest";

function SelectionToolbar({
  selection,
  extraActions,
}: {
  selection: CapturedSelection;
  extraActions?: (selection: CapturedSelection, close: () => void) => ReactNode;
}) {
  const { api, setSelection, pendingReattach, setPendingReattach, source } = useSidecar();
  const [mode, setMode] = useState<ToolbarMode>("menu");
  const [linkOpen, setLinkOpen] = useState(false);
  const close = () => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const controls = () =>
    [...(toolbarRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
  useEffect(() => {
    if (selection.focusToolbar) controls()[0]?.focus();
  }, [selection]);
  const onToolbarKey = (e: React.KeyboardEvent) => {
    if (mode !== "menu") return; // the comment/suggest composer owns its keys
    const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const list = controls();
    if (list.length === 0) return;
    e.preventDefault();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? list.length - 1
      : e.key === "ArrowDown" || e.key === "ArrowRight" ? (at + 1) % list.length
      : (at - 1 + list.length) % list.length;
    list[next].focus();
  };
  // PHONE WIDTH (verify RC-B11 round 2, finding 3): a floating box beside the selection wrapped its
  // labels a letter per line and ran off-screen. On a phone the toolbar is a bottom sheet — full
  // width, above the home indicator (pb-safe), scrolling inside itself — never a positioned popover.
  const isMobile = useIsMobile();
  const width = mode === "menu" ? 260 : 340;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, selection.rect.left));
  const top = Math.max(12, Math.min(window.innerHeight - 300, selection.rect.bottom + 8));

  const reattachItem = pendingReattach ? api.state.items.find((i) => i.key === pendingReattach) : null;

  const highlight = async (color: HighlightColor) => {
    close();
    await api.addHighlight(selection.anchor, color);
  };

  return (
    <div
      data-annotation-toolbar={isMobile ? "sheet" : "popover"}
      className={
        isMobile
          ? "fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-xl border-t border-border bg-popover p-2 pb-safe text-popover-foreground shadow-lg"
          : "fixed z-50 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      }
      style={isMobile ? undefined : { left, top, width }}
      ref={toolbarRef}
      role="toolbar"
      aria-label="Annotate the selected passage"
      aria-orientation="vertical"
      aria-keyshortcuts="Control+Alt+M Meta+Alt+M"
      onKeyDown={onToolbarKey}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {reattachItem ? (
        <div className="grid gap-1 p-1">
          <p className="text-xs text-muted-foreground">Move this {reattachItem.kind} to the selected text?</p>
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={async () => {
                const err = await api.reattach(reattachItem, selection.anchor);
                setPendingReattach(null);
                close();
                if (err) toast.error(err);
                else toast.success("Reattached to the new passage.");
              }}
            >
              Reattach here
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingReattach(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : mode === "menu" ? (
        <div className="grid gap-0.5">
          <div className="flex items-center gap-1 px-1 py-1">
            <Highlighter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="mr-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground">Highlight</span>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Highlight ${c}`}
                title={`Highlight ${c}`}
                onClick={() => void highlight(c)}
                className={cn("h-6 w-6 rounded-full border border-border", SWATCH[c])}
              />
            ))}
          </div>
          <Button size="sm" variant="ghost" className="justify-start" onClick={() => setMode("comment")}>
            <MessageSquarePlus className="mr-2 h-3.5 w-3.5" aria-hidden />
            Comment
          </Button>
          <Button size="sm" variant="ghost" className="justify-start" onClick={() => setMode("suggest")}>
            <PencilLine className="mr-2 h-3.5 w-3.5" aria-hidden />
            Suggest an edit
          </Button>
          {api.state.capabilities.links && <Button size="sm" variant="ghost" className="justify-start" onClick={() => setLinkOpen(true)}>
            <Link2 className="mr-2 h-3.5 w-3.5" aria-hidden />
            Link a record…
          </Button>}
          {extraActions && (
            <>
              <div className="my-0.5 h-px bg-border" />
              {extraActions(selection, close)}
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-1 p-1">
          <blockquote className="line-clamp-2 border-l-2 border-primary/50 pl-2 text-xs text-muted-foreground">
            {selection.anchor.exact}
          </blockquote>
          <MentionComposer
            source={source}
            autoFocus
            mentions={api.state.capabilities.collaborationDoors}
            initialValue={mode === "suggest" ? selection.anchor.exact : ""}
            placeholder={mode === "suggest" ? "Replace with…" : "Comment — type @ to mention someone, a record or a date"}
            submitLabel={mode === "suggest" ? "Suggest" : "Comment"}
            secondary={mode === "suggest" ? { placeholder: "Why? (optional)" } : undefined}
            onCancel={() => setMode("menu")}
            onSubmit={async (text, why) => {
              close();
              const notice = await api.postComment(
                mode === "suggest"
                  ? { body: why ?? "", anchor: selection.anchor, suggestedText: text }
                  : { body: text, anchor: selection.anchor },
              );
              announceMentions(notice);
            }}
          />
        </div>
      )}
      <LinkRecordSheet
        open={linkOpen}
        onOpenChange={(o) => {
          setLinkOpen(o);
          if (!o) close();
        }}
        passage={selection.anchor}
        onLink={(token, id, title) => api.link(token, id, title, selection.anchor)}
      />
    </div>
  );
}

export const SWATCH: Record<HighlightColor, string> = {
  yellow: "bg-yellow-300",
  green: "bg-green-300",
  blue: "bg-sky-300",
  pink: "bg-pink-300",
  purple: "bg-violet-300",
};

export function announceMentions(notice: { told: string[]; skipped: { user_id: string; why: string }[] } | null) {
  if (!notice) return;
  if (notice.told.length) toast.success(`Told ${notice.told.length} ${notice.told.length === 1 ? "person" : "people"} you mentioned.`);
  const cannot = notice.skipped.filter((s) => s.why === "cannot_view").length;
  const off = notice.skipped.filter((s) => s.why === "switched_off").length;
  if (cannot) toast.warning(`${cannot} ${cannot === 1 ? "person" : "people"} you mentioned cannot open this document, so they were not told. Share it with them first.`);
  if (off) toast.info(`${off} ${off === 1 ? "person has" : "people have"} mention notices switched off.`);
}
