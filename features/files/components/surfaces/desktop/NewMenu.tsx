/**
 * features/files/components/surfaces/dropbox/NewMenu.tsx
 *
 * Dropdown opened by the "+ New" button in the top bar. Upload files, upload
 * folder, create folder — all wired to existing thunks.
 */

"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { extractErrorMessage } from "@/utils/errors";
import {
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderPlus,
  FolderUp,
  Plus,
  Presentation,
  Webhook,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { stashChatDraftTransfer } from "@/features/agents/components/chat/chat-draft-transfer";
import { DEFAULT_NEW_CHAT_SLOT_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { resolveAgentSlot } from "@/features/agents/slots/service";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createFolder } from "@/features/files/redux/thunks";
import { setFocusedId } from "@/features/files/redux/slice";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useRagUploadPreference } from "@/features/files/handler/hooks/useRagUploadPreference";
import { TooltipIcon } from "@/features/files/components/core/Tooltip/TooltipIcon";

export interface NewMenuProps {
  parentFolderId: string | null;
  className?: string;
}

// "New → AI document" prefills — the user lands on /chat/new with an editable
// prompt aimed at the `office` tool (generate action). The agent produces a
// real .docx/.pptx/.xlsx FileRef that shows up right back here in Files.
const AI_DOCUMENT_PROMPTS: ReadonlyArray<{
  key: string;
  label: string;
  icon: typeof FileText;
  prompt: string;
}> = [
  {
    key: "docx",
    label: "Word document",
    icon: FileText,
    prompt:
      "Create a Word document (.docx) for me.\n\nWhat it should cover: ",
  },
  {
    key: "pptx",
    label: "PowerPoint deck",
    icon: Presentation,
    prompt:
      "Create a PowerPoint deck (.pptx) for me.\n\nTopic, audience, and roughly how many slides: ",
  },
  {
    key: "xlsx",
    label: "Excel workbook",
    icon: FileSpreadsheet,
    prompt:
      "Create an Excel workbook (.xlsx) for me.\n\nWhat data and columns it should contain: ",
  },
];

export function NewMenu({ parentFolderId, className }: NewMenuProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const handleAiDocument = useCallback(
    (prompt: string) => {
      // `/chat/new` mounts the `chat.default_new_chat` SLOT's agent — resolve
      // the same slot here so the stashed draft targets exactly what the
      // landing will mount (shared 5-min cache; the user's binding wins).
      void resolveAgentSlot(DEFAULT_NEW_CHAT_SLOT_KEY)
        .then((resolved) => {
          stashChatDraftTransfer({
            text: prompt,
            targetAgentId: resolved.agentId,
          });
          startTransition(() => router.push("/chat/new"));
        })
        .catch((error: unknown) => {
          console.error(
            `[NewMenu] slot "${DEFAULT_NEW_CHAT_SLOT_KEY}" failed to resolve:`,
            error,
          );
          toast.error("Chat is unavailable right now", {
            description:
              error instanceof Error ? error.message : String(error),
          });
        });
    },
    [router],
  );
  const { uploadMany: upload } = useFileUpload();
  const { triggerNow, setTriggerNow } = useRagUploadPreference();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const folderNameInputRef = useRef<HTMLInputElement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Menu uploads opt into instant RAG when the preference is on. Drag-drop
  // never sets this — the scheduled auto-RAG sweep still covers those.
  const uploadOptions = triggerNow
    ? { rag: { trigger_now: true } }
    : undefined;

  const handleUploadFiles = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length) {
        void (async () => {
          const result = await upload(files, {
            parentFolderId,
            options: uploadOptions,
          });
          // Focus the last successfully uploaded file so it's highlighted
          if (result?.uploaded?.length) {
            dispatch(setFocusedId(result.uploaded[result.uploaded.length - 1]));
          }
        })();
      }
      event.target.value = "";
    },
    [dispatch, upload, parentFolderId, uploadOptions],
  );

  const handleUploadFolder = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length) {
        void (async () => {
          const result = await upload(files, {
            parentFolderId,
            options: uploadOptions,
          });
          if (result?.uploaded?.length) {
            dispatch(setFocusedId(result.uploaded[result.uploaded.length - 1]));
          }
        })();
      }
      event.target.value = "";
    },
    [dispatch, upload, parentFolderId, uploadOptions],
  );

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreateError("Enter a folder name.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const folderId = await dispatch(
        createFolder({ folderName: name, parentId: parentFolderId }),
      ).unwrap();
      // Move focus to the newly created folder so it's highlighted and scrolled
      // into view immediately.
      dispatch(setFocusedId(folderId));
      setNewFolderName("");
      setCreateOpen(false);
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }, [dispatch, newFolderName, parentFolderId]);

  return (
    <>
      <DropdownMenu>
        <TooltipIcon label="Upload files or create a folder">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm",
                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                className,
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New
            </button>
          </DropdownMenuTrigger>
        </TooltipIcon>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
            <FileUp className="mr-2 h-4 w-4" />
            Upload files
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => folderInputRef.current?.click()}>
            <FolderUp className="mr-2 h-4 w-4" />
            Upload folder
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            New folder
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {/* Webhook mirrors the app's Agents nav glyph (Sparkles/Bot/Wand
                  are banned as AI-cliché icons by matrx/no-banned-lucide-icons). */}
              <Webhook className="mr-2 h-4 w-4" />
              AI document
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {AI_DOCUMENT_PROMPTS.map(({ key, label, icon: Icon, prompt }) => (
                <DropdownMenuItem
                  key={key}
                  onSelect={() => handleAiDocument(prompt)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={triggerNow}
            onCheckedChange={setTriggerNow}
            // Keep the menu open so toggling doesn't dismiss the dropdown.
            onSelect={(e) => e.preventDefault()}
          >
            Process for RAG immediately
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={handleUploadFiles}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        onChange={handleUploadFolder}
        // @ts-expect-error — non-standard but widely supported. MATRX-EXCEPTION: webkitdirectory isn't in React's InputHTMLAttributes typing; a global JSX augmentation is out of this feature's scope.
        webkitdirectory="true"
        directory=""
      />

      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent
          onOpenAutoFocus={(e) => {
            // Radix moves focus to the cancel button by default; override to focus
            // the name input so the user can immediately type.
            e.preventDefault();
            folderNameInputRef.current?.focus();
            folderNameInputRef.current?.select();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>New folder</AlertDialogTitle>
            <AlertDialogDescription>
              Name it something memorable — you can rename it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            ref={folderNameInputRef}
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Untitled folder"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            style={{ fontSize: "16px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreateFolder();
              }
            }}
          />
          {createError ? (
            <p className="text-xs text-destructive">{createError}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCreateError(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCreateFolder();
              }}
              disabled={creating}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
