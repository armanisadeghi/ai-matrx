"use client";

/**
 * ContentActionBar — generic inline action bar for any markdown string.
 *
 * Mirrors the look/feel of the assistant action bar from the conversation
 * UI, but is fully decoupled from `cx_message`/`cx_conversation` and the
 * message-edit thunks. Use it on research syntheses, scraped pages,
 * documents, exports, or any place where you have a markdown body and
 * want the standard set of cross-feature actions (copy, TTS, full-screen
 * editor, save to notes/code/tasks, HTML preview, email, print).
 *
 * Anything message-specific (edit & resubmit, fork, delete, like/dislike,
 * creator analytics) is intentionally not exposed here — that lives on
 * `AssistantActionBar` / `UserActionBar`.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  lazy,
} from "react";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import {
  CopyTapButton,
  CheckTapButton,
  PencilTapButton,
  MoreHorizontalTapButton,
  TrashTapButton,
} from "@/components/icons/tap-buttons";
import { StreamingSpeakerButton } from "@/features/tts/components/StreamingSpeakerButton";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";
import {
  closeOverlay,
  openOverlay,
} from "@/lib/redux/slices/overlaySlice";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getContentActions,
  resumePendingContentAuthAction,
  type ContentActionsOptions,
} from "./contentActionRegistry";

const AdvancedMenu = lazy(() => import("@/components/official/AdvancedMenu"));

export interface ContentActionBarProps {
  /** Markdown body the actions operate on. */
  content: string;
  /**
   * Short label for this content (e.g. "Project Report"). Used as the
   * default title in the full-screen editor and to seed task / note /
   * download names.
   */
  title?: string;
  /** Arbitrary metadata included in saves and exports. */
  metadata?: Record<string, unknown> | null;
  /**
   * When provided, the pencil button opens the full-screen editor in
   * **edit** mode with a Save button that calls back. When omitted, it
   * opens in **view** mode (no save button).
   */
  onSave?: (newContent: string) => void | Promise<void>;
  /**
   * Stable id for scoping overlay instances (full-screen editor, html
   * preview). Same input → same overlay instance, so reopening from the
   * same source restores prior state. Defaults to a random per-mount id.
   */
  instanceKey?: string;
  /** Optional wrapper className. */
  className?: string;
  /**
   * When true, hide the bar by default and reveal it on hover/focus of an
   * ancestor with the `group/content-actions` class. Useful for cards
   * where the bar should not visually compete until interaction.
   */
  hoverOnly?: boolean;
  /** Hide overflow App items (feedback / announcements / preferences). */
  hideAppItems?: boolean;
  /** Hide the pencil icon entirely (use only the overflow menu). */
  hidePencil?: boolean;
  /** Hide the TTS button. */
  hideSpeaker?: boolean;
  /** Hide the inline Copy button (still available in the overflow menu). */
  hideCopy?: boolean;
  /**
   * When provided, renders a trash icon in the bar that calls this handler.
   * Hidden when omitted — keeps the bar non-breaking for callers that don't
   * want a delete affordance. The caller is responsible for any confirmation
   * UX (use `<ConfirmDialog />` or the imperative `confirm()` helper).
   */
  onDelete?: () => void;
  /** Override the delete button's aria-label / tooltip. Defaults to "Delete". */
  deleteAriaLabel?: string;
  /**
   * Slot for caller-provided action buttons rendered alongside the built-ins,
   * after the pencil and before the trash / overflow menu. To keep the bar
   * visually consistent, callers MUST pass `*TapButton` components from
   * `@/components/icons/tap-buttons` (use `variant="group"`).
   */
  extras?: React.ReactNode;
}

export function ContentActionBar({
  content,
  title,
  metadata = null,
  onSave,
  instanceKey,
  className,
  hoverOnly = false,
  hideAppItems = false,
  hidePencil = false,
  hideSpeaker = false,
  hideCopy = false,
  onDelete,
  deleteAriaLabel = "Delete",
  extras,
}: ContentActionBarProps) {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const isAuthenticated = !!user?.email;

  const [isCopied, setIsCopied] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const moreOptionsButtonRef = useRef<HTMLDivElement>(null);

  // Per-mount fallback id keeps overlay instances scoped when the caller
  // doesn't supply one. Stable across renders of the same component.
  const fallbackInstanceIdRef = useRef<string | null>(null);
  if (fallbackInstanceIdRef.current === null) {
    fallbackInstanceIdRef.current = `content-bar-${Math.random().toString(36).slice(2, 10)}`;
  }
  const resolvedInstanceKey = instanceKey ?? fallbackInstanceIdRef.current;

  const handleCopy = useCallback(async () => {
    await copyToClipboard(content, {
      onSuccess: () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      },
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.error("[ContentActionBar] Failed to copy:", err);
      },
    });
  }, [content]);

  const handleOpenEditor = useCallback(() => {
    const editorInstanceId = `content-editor-${resolvedInstanceKey}`;
    dispatch(
      openOverlay({
        overlayId: "fullScreenEditor",
        instanceId: editorInstanceId,
        data: {
          content,
          mode: "free",
          conversationId: undefined,
          messageId: undefined,
          onSave: onSave
            ? async (newContent: string) => {
                try {
                  await onSave(newContent);
                } catch (err) {
                  // eslint-disable-next-line no-console
                  console.error("[ContentActionBar] onSave failed", err);
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Failed to save changes",
                  );
                  return;
                }
                dispatch(
                  closeOverlay({
                    overlayId: "fullScreenEditor",
                    instanceId: editorInstanceId,
                  }),
                );
              }
            : undefined,
          tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
          initialTab: "matrx_split",
          analysisData:
            (metadata as Record<string, unknown> | undefined) ?? undefined,
          title,
          showSaveButton: !!onSave,
          showCopyButton: true,
        },
      }),
    );
  }, [content, title, metadata, onSave, dispatch, resolvedInstanceKey]);

  // Replay any post-auth action the user kicked off while signed-out.
  useEffect(() => {
    resumePendingContentAuthAction(isAuthenticated, content, dispatch);
  }, [isAuthenticated, content, dispatch]);

  const menuOptions: ContentActionsOptions = useMemo(
    () => ({ hideAppItems }),
    [hideAppItems],
  );

  const menuItems = useMemo(
    () =>
      getContentActions(
        {
          content,
          title,
          metadata,
          onSave,
          instanceKey: resolvedInstanceKey,
          isAuthenticated,
          dispatch,
          onClose: () => setShowOptionsMenu(false),
        },
        menuOptions,
      ),
    [
      content,
      title,
      metadata,
      onSave,
      resolvedInstanceKey,
      isAuthenticated,
      dispatch,
      menuOptions,
    ],
  );

  return (
    <>
      <div
        className={cn(
          "transition-opacity",
          hoverOnly &&
            "opacity-0 group-hover/content-actions:opacity-100 focus-within:opacity-100",
          className,
        )}
      >
        <TapTargetButtonGroup>
          {!hideCopy &&
            (isCopied ? (
              <CheckTapButton
                variant="group"
                onClick={handleCopy}
                ariaLabel="Copied"
                className="text-blue-500 dark:text-blue-400"
              />
            ) : (
              <CopyTapButton
                variant="group"
                onClick={handleCopy}
                ariaLabel="Copy content"
                className="text-muted-foreground"
              />
            ))}

          {!hideSpeaker && (
            <StreamingSpeakerButton text={content} variant="group" />
          )}

          {!hidePencil && (
            <PencilTapButton
              variant="group"
              onClick={handleOpenEditor}
              ariaLabel={onSave ? "Edit content" : "Open in viewer"}
              className="text-muted-foreground"
            />
          )}

          {extras}

          {onDelete && (
            <TrashTapButton
              variant="group"
              onClick={onDelete}
              ariaLabel={deleteAriaLabel}
              className="text-muted-foreground hover:text-destructive"
            />
          )}

          <div ref={moreOptionsButtonRef}>
            <MoreHorizontalTapButton
              variant="group"
              onClick={() => setShowOptionsMenu(true)}
              ariaLabel="More options"
              className="text-muted-foreground"
            />
          </div>
        </TapTargetButtonGroup>
      </div>

      {showOptionsMenu && (
        <Suspense fallback={null}>
          <AdvancedMenu
            isOpen={showOptionsMenu}
            onClose={() => setShowOptionsMenu(false)}
            items={menuItems}
            title={title ?? "Content options"}
            position="bottom-left"
            anchorElement={moreOptionsButtonRef.current}
          />
        </Suspense>
      )}
    </>
  );
}

export default ContentActionBar;
