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
import { projectSource, projectionIsCurrent, rangeToSource, sourceOffsetAtPoint, unmappedSelectedChars, type SourceProjection } from "./projection";
import { paintCss, paintScopeClass, useSidecarPaint } from "./useSidecarPaint";
import { useAnnotationSidecar, type AnnotationSidecarApi } from "./useAnnotationSidecar";
import { MentionComposer } from "./MentionComposer";
import { LinkRecordSheet } from "./LinkRecordSheet";
import { PassageQuote } from "./PassageQuote";
import { stageRecordComment, useWithNextMessage, WithNextMessageSwitch } from "./comment-remarks";
import type { AnnotationSource } from "./types";
import { useSelectionZone, type SelectionToolbarUi } from "@ai-matrx/rich-content/selection-toolbar/selection-zones";
import {
  COMMENT_SENDS_WITH_NEXT_MESSAGE_DEFAULT,
  COMMENT_SENDS_WITH_NEXT_MESSAGE_KNOB,
  PASSAGE_ACTIONS_HOST_KEY,
} from "@ai-matrx/rich-content/selection-toolbar/selection-actions";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import { stageRemark } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import {
  ANNOTATION_HOST_KEY,
  ANNOTATION_PANELS,
  SWATCH,
  type AnnotationSelectionHost,
  type CapturedSelection,
} from "./annotation-actions";
import { HIGHLIGHT_COLORS } from "./constants";

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

/** The sidecar when one is installed above, else null (a host that mounts one only where none exists). */
export function useOptionalSidecar(): SidecarContextValue | null {
  return useContext(SidecarContext);
}

export function AnnotationSidecarProvider({
  source,
  children,
  live = true,
  onActivity,
}: {
  source: AnnotationSource;
  children: ReactNode;
  /**
   * False = hold the reads and the live channel (a chat answer scrolled far out of view):
   * the content renders unchanged and nothing is fetched until it turns true.
   */
  live?: boolean;
  /** The person just made or focused an item here (a host opens its Notes & comments dock). */
  onActivity?: () => void;
}) {
  const raw = useAnnotationSidecar(source, { live });
  const api: AnnotationSidecarApi = onActivity
    ? {
        ...raw,
        addHighlight: (...args) => {
          onActivity();
          return raw.addHighlight(...args);
        },
        postComment: (...args) => {
          onActivity();
          return raw.postComment(...args);
        },
        link: (...args) => {
          onActivity();
          return raw.link(...args);
        },
      }
    : raw;
  const instance = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [activeKey, setActiveKeyState] = useState<string | null>(null);
  const setActiveKey = (key: string | null) => {
    setActiveKeyState(key);
    if (key) onActivity?.();
  };
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
      {/* Only a document with something to paint carries highlight rules —
          most rendered documents (chat messages) have none. */}
      {api.state.items.length > 0 && <style>{paintCss(instance)}</style>}
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
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useAnnotatedRoot(root, passageActions);
  return (
    <div className={cn("relative", className)}>
      <div ref={setRoot} data-annotation-root="">
        {children}
      </div>
    </div>
  );
}

/**
 * The same wiring as <AnnotatedContent>, attached to an element a host already rendered — so a
 * host can add the reading set to content it owns without re-parenting (and remounting) it.
 */
export function AnnotatedElement({ root, passageActions }: { root: HTMLElement; passageActions?: readonly Action[] }) {
  useAnnotatedRoot(root, passageActions);
  return null;
}

function useAnnotatedRoot(root: HTMLElement | null, passageActions?: readonly Action[]) {
  const ctx = useSidecar();
  const { source, api, instance, activeKey, setActiveKey, pendingReattach, setPendingReattach } = ctx;
  const projection = useRef<SourceProjection | null>(null);
  useSidecarPaint(root, source.body, api.state.items, instance, activeKey, (p) => {
    projection.current = p;
  });
  /** The map of the DOM as it is now (the observer re-projects only after a debounce). */
  const liveProjection = (): SourceProjection | null => {
    if (!root) return null;
    if (!projection.current || !projectionIsCurrent(projection.current, root)) {
      projection.current = projectSource(root, source.body);
    }
    return projection.current;
  };
  // The instance's highlight rules apply only inside this root (paintScopeClass).
  useEffect(() => {
    if (!root) return;
    const cls = paintScopeClass(instance);
    root.classList.add(cls);
    return () => root.classList.remove(cls);
  }, [root, instance]);

  // Reveal: scroll a resolved item's first painted range into view.
  useEffect(() => {
    ctx.registerReveal((key) => {
      const item = api.state.items.find((i) => i.key === key);
      const res = item?.resolution;
      const current = liveProjection();
      if (!current || !res || res.start16 == null) return;
      const node = current.nodes.find(
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
    let current = liveProjection();
    if (!current) return null;
    // The quote must be what the person selected, never a clipped part of it: text
    // the map does not hold (a node added since it was taken, or prose that is not
    // in the source) would snap the boundary onto the next mapped line. Re-map once,
    // then refuse rather than store a shorter quote.
    if (unmappedSelectedChars(current, root, range) > 0) {
      projection.current = projectSource(root, source.body);
      current = projection.current;
      if (unmappedSelectedChars(current, root, range) > 0) {
        if (!silent) toast.error("Part of that passage cannot be matched to the saved text yet, so it cannot be pinned. Select it again in a moment.", { id: `annotation-capture-${instance}` });
        return null;
      }
    }
    const mapped = rangeToSource(current, range);
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
    source,
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
  const onClick = useRef<(e: MouseEvent) => void>(() => {});
  useEffect(() => {
    onClick.current = (e: MouseEvent) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const current = liveProjection();
      if (!current) return;
      const at = sourceOffsetAtPoint(current, document, e.clientX, e.clientY);
      if (at == null) return;
      const hit = api.state.items.find(
        (i) => i.resolution?.start16 != null && i.resolution.start16 <= at && at < (i.resolution.end16 ?? 0),
      );
      if (hit) setActiveKey(hit.key);
    };
  });
  useEffect(() => {
    if (!root) return;
    const listener = (e: MouseEvent) => onClick.current(e);
    root.addEventListener("click", listener);
    return () => root.removeEventListener("click", listener);
  }, [root]);
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

  if (panel === ANNOTATION_PANELS.highlight) {
    // The ONE Highlight button's colour choice (2026-10-07: one button, not five on the strip).
    return (
      <div role="group" aria-label="Highlight colour" className="flex items-center gap-1 p-0.5">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Highlight ${color}`}
            title={color}
            onMouseDown={(event) => event.preventDefault()}
            onClick={async () => {
              done();
              await api.addHighlight(selection.anchor, color);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <span aria-hidden className={cn("h-4 w-4 rounded-full border border-border", SWATCH[color])} />
          </button>
        ))}
      </div>
    );
  }

  if (panel === ANNOTATION_PANELS.reattach) {
    const item = pendingReattach ? api.state.items.find((i) => i.key === pendingReattach) : null;
    if (!item) return null;
    return (
      <div className="grid gap-1 p-1">
        <p className="text-xs text-muted-foreground">Move this {item.kind} to the selected text?</p>
        <div className="flex gap-1">
          <Button
            variant="primary"
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
            variant="quiet"
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
    <CommentComposerPanel
      // One composer per passage: the "With next message" flip belongs to THAT comment, so a
      // new passage always starts at the knob's default (never the last comment's flip).
      key={`${selection.anchor.content_version}:${selection.anchor.start}:${selection.anchor.end}:${suggest ? "suggest" : "comment"}`}
      api={api}
      source={source}
      selection={selection}
      suggest={suggest}
      onCancel={() => ui.closePanel()}
      done={done}
    />
  );
}

/**
 * The Comment / Suggest composer. On a chat answer a comment also offers
 * "With next message" (Turn References, ruling 5): when on, the saved comment
 * is staged as a remark chip in that conversation's composer and rides along
 * with the person's next message. Its starting position is the
 * `selection_toolbar.comment_sends_with_next_message` knob (default on).
 */
function CommentComposerPanel({
  api,
  source,
  selection,
  suggest,
  onCancel,
  done,
}: {
  api: AnnotationSidecarApi;
  source: AnnotationSource;
  selection: CapturedSelection;
  suggest: boolean;
  onCancel: () => void;
  done: () => void;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const orgId = useAppSelector(selectOrganizationId);
  const knob = useEffectiveKnob(orgId, userId, COMMENT_SENDS_WITH_NEXT_MESSAGE_KNOB);
  const knobDefault = typeof knob === "boolean" ? knob : COMMENT_SENDS_WITH_NEXT_MESSAGE_DEFAULT;
  // The person's own flip wins over the knob for this comment.
  const [flipped, setFlipped] = useState<boolean | null>(null);
  const sendWithNext = flipped ?? knobDefault;
  const conversationId = !suggest && source.token === "message" ? source.conversationId : undefined;
  // Any other record (a note or document tile on a board, a record page with a chat beside it):
  // the comment rides along to the page's own chat when there is one.
  const toPageChat = useWithNextMessage();
  const recordRemark = !suggest && source.token !== "message" && toPageChat.available;
  const switchId = useId();
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
        onCancel={onCancel}
        leading={
          conversationId ? (
            <label htmlFor={switchId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch id={switchId} checked={sendWithNext} onCheckedChange={(on) => setFlipped(on)} />
              With next message
            </label>
          ) : recordRemark ? (
            <WithNextMessageSwitch state={toPageChat} />
          ) : undefined
        }
        onSubmit={async (text, why) => {
          done();
          const stageInto = conversationId && sendWithNext ? conversationId : null;
          const stageToPage = recordRemark && toPageChat.on;
          const notice = await api.postComment(
            suggest
              ? { body: why ?? "", anchor: selection.anchor, suggestedText: text }
              : {
                  body: text,
                  anchor: selection.anchor,
                  ...(stageToPage
                    ? {
                        onWritten: (commentId: string) => {
                          stageRecordComment(
                            { token: source.token, id: source.id, title: source.title || null },
                            { id: commentId, body: text },
                            selection.anchor.exact,
                          );
                        },
                      }
                    : {}),
                  ...(stageInto
                    ? {
                        onWritten: (commentId: string) => {
                          dispatch(
                            stageRemark(
                              stageInto,
                              {
                                kind: "comment",
                                target: { conversationId: stageInto, messageId: source.id },
                                commentId,
                                quote: selection.anchor.exact,
                                body: text,
                              },
                              { coalesceKey: `comment:${commentId}` },
                            ),
                          );
                        },
                      }
                    : {}),
                },
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
