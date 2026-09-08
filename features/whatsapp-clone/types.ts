/**
 * WhatsApp Clone — UI types
 *
 * View-layer shapes used by the WhatsApp shell. Mock and live data are normalized
 * into these shapes by the hooks/* layer so components stay agnostic of source.
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// ============================================
// Conversation & Message
// ============================================

export type WAMessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export type WAMessageType = "text" | "image" | "video" | "audio" | "file" | "system";

export interface WAUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
  online?: boolean;
  lastSeenAt?: string | null;
}

export interface WAReplyQuote {
  authorName: string;
  preview: string;
  isOwn?: boolean;
}

export interface WAMediaPayload {
  /**
   * The DURABLE identity of the file. A signed URL is a handoff, never an
   * identity — live messages carry this and the bubble resolves a URL from it.
   */
  fileId?: string;
  url?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  durationSec?: number;
  width?: number;
  height?: number;
}

export interface WAMessage {
  id: string;
  conversationId: string;
  type: WAMessageType;
  content: string;
  authorId: string;
  isOwn: boolean;
  createdAt: string;
  editedAt?: string | null;
  status: WAMessageStatus;
  reply?: WAReplyQuote | null;
  media?: WAMediaPayload | null;
  systemKind?: "encryption" | "info";
}

export interface WAConversation {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isGroup: boolean;
  participants: WAUser[];
  lastMessagePreview?: string;
  lastMessageAt?: string | null;
  lastMessageStatus?: WAMessageStatus;
  lastMessageIsOwn?: boolean;
  unreadCount: number;
  isMuted?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  isFavorite?: boolean;
  draft?: string | null;
  online?: boolean;
  typingUserIds?: string[];
}

// ============================================
// Media gallery (Files gateway)
// ============================================

export interface WAMediaItem {
  id: string;
  kind: "image" | "video";
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  durationSec?: number;
  conversationName?: string;
  createdAt: string;
  /** Cloud file id — when set, the tile fetches a signed URL for display. */
  cloudFileId?: string;
}

export interface WALinkItem {
  id: string;
  url: string;
  hostname: string;
  title: string;
  description?: string;
  iconUrl?: string;
  previewImageUrl?: string;
  message: string;
  senderName: string;
  senderAvatarUrl?: string | null;
  createdAt: string;
}

export interface WADocItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  message?: string;
  senderName: string;
  senderAvatarUrl?: string | null;
  createdAt: string;
}

// ============================================
// Generic modal contracts (reusable)
// ============================================

export interface ModalNavContext {
  push: (id: string) => void;
  pop: () => void;
  current: string;
}

export interface ModalNavItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
  destructive?: boolean;
  panel?: ReactNode | ((ctx: ModalNavContext) => ReactNode);
  children?: ModalNavItem[];
  onSelect?: () => void;
}

export interface ModalShellFooter {
  primaryLabel: string;
  onPrimary?: () => void;
}

export interface GalleryTab {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
  toolbarSlot?: ReactNode;
  content: ReactNode | (() => ReactNode);
}
