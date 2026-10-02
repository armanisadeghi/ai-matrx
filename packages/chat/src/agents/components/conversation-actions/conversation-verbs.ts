/**
 * conversation-verbs — THE ONE implementation of each whole-conversation verb.
 *
 * Every door that acts on a whole conversation calls these: the list/header
 * menu (`buildConversationMenu` → `ConversationPageMenu`, the sidebars) and the
 * answer menu's "Conversation" section (rich-document registry,
 * `features/rich-document/actions/handlers/conversation-section.ts`). One
 * thunk and one toast per verb, so the two menus can never drift apart.
 *
 * Pure TS (no React): statically importable from registry handlers.
 */

import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  duplicateConversation,
  renameConversation,
} from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { conversationRenameOpener } from "./rename/conversationRenameOpener";

export function displayConversationTitle(title: string | null | undefined): string {
  if (!title) return "Untitled conversation";
  return title.trim().length > 0 ? title : "Untitled conversation";
}

/** The conversation's title from whichever store already holds it — never fetched. */
export function conversationTitleFromState(
  state: RootState,
  conversationId: string,
): string | null {
  return (
    state.conversationList?.byConversationId?.[conversationId]?.title ??
    state.conversations?.byConversationId?.[conversationId]?.title ??
    null
  );
}

/** The canonical, surface-independent address of a conversation. */
export function canonicalConversationHref(conversationId: string): string {
  return `/chat/${conversationId}`;
}

function resolveAbsoluteHref(href: string): string {
  if (typeof window === "undefined") return href;
  if (/^https?:\/\//i.test(href)) return href;
  return `${window.location.origin}${href.startsWith("/") ? href : `/${href}`}`;
}

/** Copy link — the absolute form of `href`, with an honest toast either way. */
export async function copyConversationLink(href: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(resolveAbsoluteHref(href));
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy — your browser blocked clipboard access");
  }
}

/** Share… — the canonical ShareModal for resourceType "conversation". */
export function shareConversation(
  dispatch: AppDispatch,
  conversationId: string,
  title: string | null,
): void {
  dispatch(
    openOverlay({
      overlayId: "shareModal",
      data: {
        resourceType: "conversation",
        resourceId: conversationId,
        resourceName: displayConversationTitle(title),
      },
    }),
  );
}

/** Duplicate — a full copy, with a toast door to the copy. */
export async function duplicateConversationVerb(
  dispatch: AppDispatch,
  conversationId: string,
  options: { surfaceKey?: string; onSuccess?: () => void } = {},
): Promise<void> {
  // With no workspace selected, the fork write asks for one at the shared
  // transport (callApi: a write the person just pressed opens the picker);
  // dismissing it rejects with empty text, which the toast layer drops.
  const result = await dispatch(
    duplicateConversation({ conversationId, surfaceKey: options.surfaceKey }),
  );
  if (duplicateConversation.rejected.match(result)) {
    toast.error(result.payload?.message ?? "Duplicate failed");
    return;
  }
  // The thunk returns `newConversationId`; the toast carries the door to it.
  toast.success("Conversation duplicated", {
    action: toastDoor("conversation", result.payload.newConversationId),
  });
  options.onSuccess?.();
}

/** Rename — the one write. Resolves true when the title landed. */
export async function renameConversationTitle(
  dispatch: AppDispatch,
  conversationId: string,
  title: string,
): Promise<boolean> {
  const result = await dispatch(renameConversation({ conversationId, title }));
  if (renameConversation.rejected.match(result)) {
    toast.error(result.payload?.message ?? "Rename failed");
    return false;
  }
  toast.success("Conversation renamed");
  return true;
}

/**
 * Rename… for a host with no inline row editor: opens the ONE rename dialog
 * (`<ConversationRenameDialogHost />`, mounted once in app/Providers.tsx),
 * which writes through `renameConversationTitle`.
 */
export function openConversationRename(conversationId: string, title: string | null): void {
  void conversationRenameOpener.open({ conversationId, title });
}
