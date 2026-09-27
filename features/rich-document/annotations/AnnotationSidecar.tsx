// features/rich-document/annotations/AnnotationSidecar.tsx
//
// THE ANNOTATION SIDECAR — one primitive any surface rendering through
// <RichContent> / <RichDocument> installs, without the renderer knowing:
//
//   <AnnotationSidecarProvider source={…}>        state + store + realtime
//     <AnnotatedContent> <RichDocument …/> </AnnotatedContent>   paint + selection zone
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
import type { Action } from "@ai-matrx/alchemy/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { AnchorBuildError, buildTextAnchor } from "./anchor";
import { projectSource, rangeToSource, sourceOffsetAtPoint, type SourceProjection } from "./projection";
import { paintCss, useSidecarPaint } from "./useSidecarPaint";
import { useAnnotationSidecar, type AnnotationSidecarApi } from "./useAnnotationSidecar";
import { MentionComposer } from "./MentionComposer";
import { LinkRecordSheet } from "./LinkRecordSheet";
import { PassageQuote } from "./PassageQuote";
import type { AnnotationSource } from "./types";
import { useSelectionZone, type SelectionToolbarUi } from "@/components/selection-toolbar/selection-zones";
import { PASSAGE_ACTIONS_HOST_KEY } from "@/components/selection-toolbar/selection-actions";
import {
  ANNOTATION_HOST_KEY,
  ANNOTATION_PANELS,
  type AnnotationSelectionHost,
  type CapturedSelection,
} from "./annotation-actions";

interface SidecarContextValue {
  source: AnnotationSource;
  api: AnnotationSidecarApi;
  instance: string;
  activeKey: string | null;
  setActiveKey: (key: string | null) => void;
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
 * Wraps the rendered content: paints every resolved item and makes the text a
 * zone of the ONE selection toolbar (components/selection-toolbar). The
 * passage actions — highlight, comment, suggest, link — are registry actions
 * (./annotation-actions); a surface adds its own (the study guide's tutor and
 * report) as `passageActions`, never as rendered buttons.
 */
export function AnnotatedContent({
  children,
  className,
  passageActions,
}: {
  children: ReactNode;
  className?: string;
  passageActions?: readonly Action[];
}) {
  const ctx = useSidecar();
  const { source, api, instance, activeKey, setActiveKey, pendingReattach, setPendingReattach } = ctx;
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const projection = useRef<SourceProjection | null>(null);
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

  /** Pin the current selection to the source text (null when it cannot be pinned). */
  const capture = ({ silent = false }: { silent?: boolean } = {}): CapturedSelection | null => {
    if (!root) return null;
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    if (!projection.current) projection.current = projectSource(root, source.body);
    const mapped = rangeToSource(projection.current, range);
    // A selection that cannot be pinned is said through the app's ONE toast
    // (which carries the error menu itself) — never a private floating notice.
    const refuse = (message: string) => {
      if (!silent) toast.error(message, { id: `annotation-capture-${instance}` });
      return null;
    };
    if (!mapped) {
      return refuse("That selection is not part of the document's own text (for example a formula or a label), so it cannot be pinned. Select the words around it instead.");
    }
    try {
      // Trim whitespace at the edges so the quote is the words the person meant.
      let { start, end } = mapped;
      while (start < end && /\s/.test(source.body[start])) start += 1;
      while (end > start && /\s/.test(source.body[end - 1])) end -= 1;
      const anchor = buildTextAnchor(source.body, start, end, source.contentVersion);
      const measured = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
      const r = measured && (measured.width || measured.height) ? measured : root.getBoundingClientRect();
      return { anchor, rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width } };
    } catch (e) {
      return refuse(e instanceof AnchorBuildError ? e.message : String(e));
    }
  };

  const host: AnnotationSelectionHost = {
    kind: "annotation",
    api,
    capture,
    report: (selection) => ({
        title: `Report an issue with ${source.title || "this document"}`,
        subject: {
          kind: "text_passage",
          sourceToken: source.token,
          sourceId: source.id,
          sourceTitle: source.title || "Document",
          quote: selection.anchor.exact,
          anchor: { ...selection.anchor },
          ...(source.href ? { href: source.href } : {}),
        },
      }),
  };

  useSelectionZone(root, {
    host: {
      [ANNOTATION_HOST_KEY]: host,
      ...(passageActions?.length ? { [PASSAGE_ACTIONS_HOST_KEY]: passageActions } : {}),
    },
    // A panel action waiting for new text (reattach) opens straight into its question.
    initialPanel: () => {
      if (!pendingReattach) return null;
      const selection = capture({ silent: true });
      if (!selection) return null;
      return { panel: ANNOTATION_PANELS.reattach, payload: selection };
    },
    renderPanel: (panel, ui, payload) => {
      // The payload is the selection the action pinned when it ran.
      const selection = payload as CapturedSelection | null;
      if (!selection?.anchor || !Object.values(ANNOTATION_PANELS).includes(panel as never)) return null;
      // The toolbar draws panels in its own portal, outside this provider:
      // re-provide the sidecar so the composer and the record sheet read it.
      return (
        <SidecarContext.Provider value={ctx}>
          <AnnotationPanelBody
            api={api}
            source={source}
            panel={panel}
            selection={selection}
            ui={ui}
            pendingReattach={pendingReattach}
            setPendingReattach={setPendingReattach}
          />
        </SidecarContext.Provider>
      );
    },
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
      <div ref={setRoot} data-annotation-root="" onClick={onClick}>
        {children}
      </div>
    </div>
  );
}

/**
 * What the toolbar frame shows after Comment / Suggest / Link / a pending
 * reattach. It renders in the toolbar's portal; AnnotatedContent re-provides
 * the sidecar around it.
 */
function AnnotationPanelBody({
  api,
  source,
  panel,
  selection,
  ui,
  pendingReattach,
  setPendingReattach,
}: {
  api: AnnotationSidecarApi;
  source: AnnotationSource;
  panel: string;
  selection: CapturedSelection;
  ui: SelectionToolbarUi;
  pendingReattach: string | null;
  setPendingReattach: (key: string | null) => void;
}) {
  const done = () => ui.close({ clearSelection: true });

  if (panel === ANNOTATION_PANELS.reattach) {
    const item = pendingReattach ? api.state.items.find((i) => i.key === pendingReattach) : null;
    if (!item) return null;
    return (
      <div className="grid gap-1 p-1">
        <p className="text-xs text-muted-foreground">Move this {item.kind} to the selected text?</p>
        <div className="flex gap-1">
          <Button
            size="sm"
            onClick={async () => {
              const err = await api.reattach(item, selection.anchor);
              setPendingReattach(null);
              done();
              if (err) toast.error(err);
              else toast.success("Reattached to the new passage.");
            }}
          >
            Reattach here
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPendingReattach(null);
              ui.closePanel();
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (panel === ANNOTATION_PANELS.link) {
    return (
      <LinkRecordSheet
        open
        onOpenChange={(o) => {
          if (!o) done();
        }}
        passage={selection.anchor}
        onLink={(token, id, title) => api.link(token, id, title, selection.anchor)}
      />
    );
  }

  const suggest = panel === ANNOTATION_PANELS.suggest;
  return (
    <div className="grid gap-1 p-1">
      <blockquote className="line-clamp-2 border-l-2 border-primary/50 pl-2 text-xs text-muted-foreground">
        <PassageQuote exact={selection.anchor.exact} />
      </blockquote>
      <MentionComposer
        source={source}
        autoFocus
        mentions={api.state.capabilities.collaborationDoors}
        initialValue={suggest ? selection.anchor.exact : ""}
        placeholder={suggest ? "Replace with…" : "Comment — type @ to mention someone, a record or a date"}
        submitLabel={suggest ? "Suggest" : "Comment"}
        secondary={suggest ? { placeholder: "Why? (optional)" } : undefined}
        onCancel={() => ui.closePanel()}
        onSubmit={async (text, why) => {
          done();
          const notice = await api.postComment(
            suggest
              ? { body: why ?? "", anchor: selection.anchor, suggestedText: text }
              : { body: text, anchor: selection.anchor },
          );
          announceMentions(notice);
        }}
      />
    </div>
  );
}

export function announceMentions(notice: { told: string[]; skipped: { user_id: string; why: string }[] } | null) {
  if (!notice) return;
  if (notice.told.length) toast.success(`Told ${notice.told.length} ${notice.told.length === 1 ? "person" : "people"} you mentioned.`);
  const cannot = notice.skipped.filter((s) => s.why === "cannot_view").length;
  const off = notice.skipped.filter((s) => s.why === "switched_off").length;
  if (cannot) toast.warning(`${cannot} ${cannot === 1 ? "person" : "people"} you mentioned cannot open this document, so they were not told. Share it with them first.`);
  if (off) toast.info(`${off} ${off === 1 ? "person has" : "people have"} mention notices switched off.`);
}
