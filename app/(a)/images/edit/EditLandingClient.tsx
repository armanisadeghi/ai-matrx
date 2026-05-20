"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  File,
  FileImage,
  FolderClosed,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  ImageAssetUploader,
  type ImageUploaderResult,
} from "@/components/official/ImageAssetUploader";
import { CloudFolders } from "@/features/files";
import { fileHandler } from "@/features/files/handler/handler";
import { isImageMime, resolveMime } from "@/features/files";
import type { CloudFileRecord, CloudFolderRecord } from "@/features/files";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectAllFoldersMap,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import { loadUserFileTree } from "@/features/files/redux/thunks";
import { useFolderContents } from "@/features/files/hooks/useFolderContents";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "heic"];

interface Props {
  folder?: string;
}

export default function EditLandingClient({ folder }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "myfiles">("upload");

  const goToEditor = useCallback(
    (fileId: string) => {
      const qs = folder ? `?folder=${encodeURIComponent(folder)}` : "";
      router.replace(`/images/edit/${fileId}${qs}`);
    },
    [folder, router],
  );

  const handleUploaderResult = useCallback(
    (result: ImageUploaderResult | null) => {
      if (!result?.file_id) return;
      goToEditor(result.file_id);
    },
    [goToEditor],
  );

  // Ctrl/Cmd+V — intercepts binary clipboard images, uploads, routes to editor.
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      if (busy) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (!blob) continue;
          e.preventDefault();
          setBusy(true);
          try {
            const ext = item.type.split("/")[1]?.split("+")[0] ?? "png";
            const file = new File([blob], `pasted-${Date.now()}.${ext}`, {
              type: item.type,
            });
            const normalized = await fileHandler.upload(
              { kind: "file", file },
              {
                folderPath: CloudFolders.IMAGES_EDITED_SOURCES,
                visibility: "private",
                metadata: { kind: "edit-source", origin: "paste" },
              },
            );
            if (normalized.fileId) {
              goToEditor(normalized.fileId);
            } else {
              toast.error("Pasted image upload returned no file id.");
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Paste upload failed");
          } finally {
            setBusy(false);
          }
          return;
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [busy, goToEditor]);

  return (
    <div className="h-full w-full flex flex-col bg-background overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        <TabButton
          active={activeTab === "upload"}
          onClick={() => setActiveTab("upload")}
          icon={<Upload className="h-3.5 w-3.5" />}
          label="Upload"
        />
        <TabButton
          active={activeTab === "myfiles"}
          onClick={() => setActiveTab("myfiles")}
          label="My Files"
        />
      </div>

      {activeTab === "upload" ? (
        <div className="flex-1 overflow-y-auto overscroll-contain flex items-start md:items-center justify-center p-3 md:p-6">
          <div className="w-full max-w-xl flex flex-col gap-4 md:gap-5">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold">Pick an image to edit</h2>
              <p className="text-xs text-muted-foreground">
                Upload, paste a URL or image, or drag a file in.
              </p>
            </div>
            <ImageAssetUploader
              onComplete={handleUploaderResult}
              preset="raw"
              folder={CloudFolders.IMAGES_EDITED_SOURCES}
              visibility="private"
              label="Edit source"
              allowUrlPaste
              compact={false}
              hideVariantBadges
              disabled={busy}
            />
            <p className="text-center text-[11px] text-muted-foreground">
              Tip: paste an image with{" "}
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
                ⌘V
              </kbd>{" "}
              /{" "}
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
                Ctrl+V
              </kbd>
              .
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <FileTreePicker onSelect={goToEditor} busy={busy} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors shrink-0",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline file tree picker
// ---------------------------------------------------------------------------

interface FileTreePickerProps {
  onSelect: (fileId: string) => void;
  busy: boolean;
}

function FileTreePicker({ onSelect, busy }: FileTreePickerProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectActiveUserId);
  const treeStatus = useAppSelector(selectTreeStatus);
  const foldersById = useAppSelector(selectAllFoldersMap);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!userId) return;
    if (treeStatus === "idle" || treeStatus === "error") {
      void dispatch(loadUserFileTree({ userId }));
    }
  }, [userId, treeStatus, dispatch]);

  const { files, folders, loading } = useFolderContents(currentFolderId);

  const currentFolder = currentFolderId
    ? (foldersById[currentFolderId] ?? null)
    : null;

  const { visibleFolders, visibleFiles } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { visibleFolders: folders, visibleFiles: files };
    return {
      visibleFolders: folders.filter((f) =>
        f.folderName.toLowerCase().includes(q),
      ),
      visibleFiles: files.filter((f) =>
        f.fileName.toLowerCase().includes(q),
      ),
    };
  }, [folders, files, query]);

  const isInitialLoading =
    (treeStatus === "idle" || treeStatus === "loading") &&
    visibleFolders.length === 0 &&
    visibleFiles.length === 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header: back + current folder name + search */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
        {currentFolderId ? (
          <button
            onClick={() =>
              setCurrentFolderId(currentFolder?.parentId ?? null)
            }
            className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to parent folder"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : null}
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {currentFolder ? currentFolder.folderName : "My Files"}
        </span>
        <div className="relative shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="h-7 w-36 pl-7 pr-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {isInitialLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading your files…</span>
          </div>
        ) : visibleFolders.length === 0 && visibleFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6 gap-3">
            <FolderClosed className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {query
                ? "No matches in this folder"
                : currentFolderId
                  ? "This folder is empty"
                  : "Your cloud is empty — upload something first"}
            </p>
            {currentFolderId ? (
              <button
                onClick={() =>
                  setCurrentFolderId(currentFolder?.parentId ?? null)
                }
                className="text-xs text-primary hover:underline"
              >
                Go back
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="py-1">
            {visibleFolders.map((f) => (
              <FolderRow
                key={f.id}
                folder={f}
                onOpen={setCurrentFolderId}
              />
            ))}
            {visibleFiles.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                onSelect={onSelect}
                disabled={busy || loading}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

function FolderRow({
  folder,
  onOpen,
}: {
  folder: CloudFolderRecord;
  onOpen: (id: string) => void;
}) {
  return (
    <li>
      <button
        onClick={() => onOpen(folder.id)}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left"
      >
        <FolderClosed className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{folder.folderName}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

function FileRow({
  file,
  onSelect,
  disabled,
}: {
  file: CloudFileRecord;
  onSelect: (fileId: string) => void;
  disabled: boolean;
}) {
  const mime = resolveMime(file.mimeType, file.fileName);
  const isImage = isImageMime(mime);
  const ext = (file.fileName.split(".").pop() ?? "").toLowerCase();
  const isEditable = isImage && IMAGE_EXTS.includes(ext);

  return (
    <li>
      <button
        onClick={() => {
          if (isEditable && !disabled) onSelect(file.id);
        }}
        disabled={!isEditable || disabled}
        title={
          isEditable
            ? file.fileName
            : `${file.fileName} — not a supported image type`
        }
        className={[
          "w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors",
          isEditable && !disabled
            ? "hover:bg-accent cursor-pointer"
            : "opacity-40 cursor-not-allowed",
        ].join(" ")}
      >
        {/* Thumbnail */}
        {isImage && file.publicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.publicUrl}
            alt=""
            className="h-7 w-7 shrink-0 rounded object-cover bg-muted"
          />
        ) : (
          <div className="h-7 w-7 shrink-0 rounded bg-muted flex items-center justify-center">
            {isImage ? (
              <FileImage className="h-4 w-4 text-muted-foreground" />
            ) : (
              <File className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        )}
        <span className="flex-1 truncate">{file.fileName}</span>
      </button>
    </li>
  );
}
