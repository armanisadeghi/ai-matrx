// features/rich-document/actions/handlers/save.ts
//
// Save / capture actions: Scratch, Notes, Code Scratch, Code, File, Task.
// All source-agnostic. The `save-to-task` action used to be chat-only
// because it hard-coded `entity_type: "cx_message"`; we generalize via
// a source → entity_type map so any source can produce a task.

import { FileText, Save, FileCode, FileDown, CheckSquare, BookText } from "lucide-react";
import { toast } from "sonner";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { CodeFilesAPI } from "@/features/code-files/service/codeFilesApi";
import { setPendingSource } from "@/features/tasks/redux/taskUiSlice";
import { registerAction } from "../registry";
import {
  extractFirstCodeBlock,
  getErrorMessage,
  requireAuth,
  buildTaskTitle,
} from "../utils";
import type { ContentSource } from "../../types";

/**
 * Map a ContentSource to the `entity_type` used by save-to-task. Centralized
 * so adding a new source means one change here rather than hunting through
 * handlers. Returns null when the source has no natural entity link
 * (raw content gets no parent association).
 */
function sourceToEntityType(source: ContentSource): {
  entity_type: string;
  entity_id: string;
  parent?: { entity_type: string; entity_id: string };
} | null {
  switch (source.type) {
    case "chat-message":
      return {
        entity_type: "cx_message",
        entity_id: source.messageId,
        parent: {
          entity_type: "cx_conversation",
          entity_id: source.conversationId,
        },
      };
    case "note":
      return { entity_type: "note", entity_id: source.noteId };
    case "prompt-result":
      return {
        entity_type: "prompt_execution",
        entity_id: source.executionId,
      };
    case "artifact":
      return { entity_type: "artifact", entity_id: source.artifactId };
    case "scraper-result":
      return { entity_type: "scraper_run", entity_id: source.runId };
    case "working-document":
      // Link to the durable backing row when one exists; otherwise hang the
      // task off the conversation so it still has a home.
      return source.documentId
        ? {
            entity_type: "cx_working_document",
            entity_id: source.documentId,
            parent: {
              entity_type: "cx_conversation",
              entity_id: source.conversationId,
            },
          }
        : {
            entity_type: "cx_conversation",
            entity_id: source.conversationId,
          };
    case "raw":
      return null;
  }
}

registerAction({
  id: "save-to-scratch",
  label: "Save to Scratch",
  icon: FileText,
  iconColor: "text-cyan-500 dark:text-cyan-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 0,
  run: async (ctx) => {
    if (
      !requireAuth(
        ctx,
        "save-to-scratch",
        "Save to Scratch",
        "Sign in to save notes to your Scratch folder.",
      )
    )
      return;
    try {
      await NotesAPI.create({
        label: "New Note",
        content: ctx.content,
        folder_name: "Scratch",
        tags: [],
      });
      toast.success("Saved to Scratch!");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save"));
    }
  },
});

registerAction({
  id: "save-to-notes",
  label: "Save to Notes",
  icon: Save,
  iconColor: "text-violet-500 dark:text-violet-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 1,
  run: (ctx) => {
    if (
      !requireAuth(
        ctx,
        "save-to-notes",
        "Save to Notes",
        "Sign in to save notes and organize your content.",
      )
    )
      return;
    ctx.dispatch(
      openOverlay({
        overlayId: "saveToNotes",
        instanceId: ctx.instanceKey("save-notes"),
        data: {
          initialContent: ctx.content,
          defaultFolder: undefined,
          initialEditorMode: undefined,
        },
      }),
    );
  },
});

registerAction({
  id: "save-code-to-scratch",
  label: "Save code to Scratch",
  icon: FileCode,
  iconColor: "text-amber-500 dark:text-amber-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 2,
  visible: (ctx) => {
    // Only show when the content actually has a code block. Saves users
    // from clicking a save-code action on plain prose and getting an error.
    const { code } = extractFirstCodeBlock(ctx.content);
    return code.trim().length > 0 && code !== ctx.content;
  },
  run: async (ctx) => {
    if (
      !requireAuth(
        ctx,
        "save-code-to-scratch",
        "Save code to Scratch",
        "Sign in to save code snippets to your code files.",
      )
    )
      return;
    const { code, language } = extractFirstCodeBlock(ctx.content);
    if (!code.trim()) {
      toast.error("No code to save");
      return;
    }
    try {
      await CodeFilesAPI.create({
        name: `snippet-${new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[:T]/g, "-")}.${
          language === "typescript"
            ? "ts"
            : language === "javascript"
              ? "js"
              : language === "python"
                ? "py"
                : "txt"
        }`,
        language: language ?? "plaintext",
        content: code,
        tags: [],
      });
      toast.success("Saved code to Scratch!");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save code"));
    }
  },
});

registerAction({
  id: "save-to-code",
  label: "Save to Code",
  icon: FileCode,
  iconColor: "text-rose-500 dark:text-rose-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 3,
  run: (ctx) => {
    if (
      !requireAuth(
        ctx,
        "save-to-code",
        "Save to Code",
        "Sign in to save and organize your code snippets.",
      )
    )
      return;
    const { code, language } = extractFirstCodeBlock(ctx.content);
    ctx.dispatch(
      openOverlay({
        overlayId: "saveToCode",
        instanceId: ctx.instanceKey("save-code"),
        data: {
          initialContent: code.trim() ? code : ctx.content,
          initialLanguage: language ?? "plaintext",
          suggestedName: undefined,
          defaultFolderId: null,
        },
      }),
    );
  },
});

registerAction({
  id: "save-as-file",
  label: "Download as Markdown",
  icon: FileDown,
  iconColor: "text-rose-500 dark:text-rose-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 4,
  run: (ctx) => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const blob = new Blob([ctx.content], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ctx.source.type}-${ts}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Downloaded as Markdown");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to download file"));
    }
  },
});

registerAction({
  id: "add-to-docs",
  label: "Save to Document",
  icon: BookText,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 6,
  run: async (ctx) => {
    if (
      !requireAuth(
        ctx,
        "add-to-docs",
        "Save to Document",
        "Sign in to save this content as a document.",
      )
    )
      return;
    try {
      // Lazy-import so Univer (heavy) stays out of the bundle until used.
      const { pushMarkdownToDocument } =
        await import("@/features/data-tables/export-targets");
      const res = await pushMarkdownToDocument(ctx.content);
      if (!res.ok || !res.href) {
        toast.error(res.error || "Failed to create document");
        return;
      }
      const href = res.href;
      toast.success("Saved to Document", {
        description: "Your content is ready as a normal document.",
        action: {
          label: "Open",
          onClick: () => window.open(href, "_blank", "noopener,noreferrer"),
        },
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create document"));
    }
  },
});

registerAction({
  id: "save-to-task",
  label: "Create task from content",
  icon: CheckSquare,
  iconColor: "text-blue-500 dark:text-blue-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 5,
  run: (ctx) => {
    if (
      !requireAuth(
        ctx,
        "save-to-task",
        "Create task",
        "Sign in to create and track tasks from your content.",
      )
    )
      return;
    const preview = ctx.content.slice(0, 400);
    const seedTitle = buildTaskTitle(ctx.content);
    const entityLink = sourceToEntityType(ctx.source);

    ctx.dispatch(
      setPendingSource({
        entity_type: entityLink?.entity_type ?? "raw_content",
        entity_id: entityLink?.entity_id ?? "",
        label: preview,
        metadata: {
          ...(entityLink?.parent
            ? { parent: { ...entityLink.parent, label: preview.slice(0, 120) } }
            : {}),
          ...(ctx.metadata ?? {}),
        },
        prePopulate: {
          title: seedTitle,
          description: ctx.content,
        },
      }),
    );
  },
});
