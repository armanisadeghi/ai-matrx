"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  selectAllFilesArray,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import { loadUserFileTree } from "@/features/files/redux/thunks";
import type { CloudFileRecord } from "@/features/files/types";
import { getMockMedia } from "../mock-data/media";
import { getMockLinks } from "../mock-data/links";
import { getMockDocs } from "../mock-data/docs";
import type { WADocItem, WALinkItem, WAMediaItem } from "../types";
import { useWhatsAppDataMode } from "./WhatsAppDataModeProvider";

export interface UseWhatsAppMediaReturn {
  media: WAMediaItem[];
  links: WALinkItem[];
  docs: WADocItem[];
  isLoading: boolean;
  error: string | null;
}

const DOC_MIME_PREFIXES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats",
  "application/vnd.ms-",
  "text/csv",
  "text/plain",
  "application/json",
  "application/zip",
];

function isImage(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}
function isVideo(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("video/");
}
function isDoc(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return DOC_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

function adaptMedia(f: CloudFileRecord): WAMediaItem {
  return {
    id: f.id,
    kind: isImage(f.mimeType) ? "image" : "video",
    url: f.publicUrl ?? "",
    thumbnailUrl: f.publicUrl ?? undefined,
    caption: f.fileName,
    conversationName: f.fileName,
    createdAt: f.createdAt,
    cloudFileId: f.id,
  };
}

function adaptDoc(f: CloudFileRecord): WADocItem {
  return {
    id: f.id,
    fileName: f.fileName,
    fileSize: f.fileSize ?? 0,
    mimeType: f.mimeType ?? "application/octet-stream",
    message: undefined,
    senderName: "You",
    senderAvatarUrl: null,
    createdAt: f.createdAt,
  };
}

export function useWhatsAppMedia(): UseWhatsAppMediaReturn {
  const { mode } = useWhatsAppDataMode();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const userId = user?.id ?? null;

  const treeStatus = useAppSelector(selectTreeStatus);
  const allFiles = useAppSelector(selectAllFilesArray);

  useEffect(() => {
    if (mode !== "live") return;
    if (!userId) return;
    if (treeStatus === "idle") {
      void dispatch(loadUserFileTree({ userId }));
    }
  }, [mode, userId, treeStatus, dispatch]);

  const liveMedia = useMemo<WAMediaItem[]>(() => {
    return allFiles
      .filter((f) => isImage(f.mimeType) || isVideo(f.mimeType))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(adaptMedia);
  }, [allFiles]);

  const liveDocs = useMemo<WADocItem[]>(() => {
    return allFiles
      .filter((f) => isDoc(f.mimeType))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(adaptDoc);
  }, [allFiles]);

  if (mode === "mock") {
    return {
      media: getMockMedia(),
      links: getMockLinks(),
      docs: getMockDocs(),
      isLoading: false,
      error: null,
    };
  }

  return {
    media: liveMedia,
    // Links require parsing message content for URLs — leaving empty until
    // a follow-up wires the URL extraction across dm_messages. Components
    // gracefully render the empty state.
    links: [],
    docs: liveDocs,
    isLoading: treeStatus === "loading",
    error: null,
  };
}
