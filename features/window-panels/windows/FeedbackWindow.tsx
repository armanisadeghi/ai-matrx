"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/utils/supabase/client";
import {
  AlertCircle,
  Component,
  Bug,
  Camera,
  Check,
  CheckCheck,
  Clipboard,
  ExternalLink,
  HelpCircle,
  ImageIcon,
  Lightbulb,
  Loader2,
  MessageSquare,
  Monitor,
  Plus,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { submitFeedback, getUserFeedback } from "@/actions/feedback.actions";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import {
  FileUploadWithStorage,
  type UploadedFileResult,
} from "@/components/ui/file-upload/FileUploadWithStorage";
import type { FeedbackType } from "@/types/feedback.types";
import { toast } from "sonner";
import { useScreenCapture } from "@/hooks/useScreenCapture";
import { openImageViewer } from "@/features/window-panels/windows/image/ImageViewerWindow";
import { VoiceTextarea } from "@/components/official/VoiceTextarea";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttachmentSlot =
  | { status: "pending"; id: string }
  | { status: "error"; id: string; message: string }
  | { status: "ready"; id: string; url: string };

interface FeedbackStats {
  total: number;
  pending: number;
  resolved: number;
}

const FEEDBACK_TYPES: {
  value: FeedbackType;
  label: string;
  icon: typeof Bug;
}[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "feature", label: "Feature", icon: Lightbulb },
  { value: "suggestion", label: "Suggestion", icon: MessageSquare },
  { value: "other", label: "Other", icon: HelpCircle },
];

/** Active-state chip colors (inactive chips stay neutral). */
const FEEDBACK_TYPE_ACTIVE_CLASSES: Record<FeedbackType, string> = {
  bug: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 [&_svg]:text-red-600 dark:[&_svg]:text-red-400",
  feature:
    "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 [&_svg]:text-blue-600 dark:[&_svg]:text-blue-400",
  suggestion:
    "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400 [&_svg]:text-green-600 dark:[&_svg]:text-green-400",
  other:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 [&_svg]:text-amber-600 dark:[&_svg]:text-amber-400",
};

// ─── Agent prompt builder ─────────────────────────────────────────────────────

function buildAgentPrompt(
  item: import("@/types/feedback.types").UserFeedback,
): string {
  const typeLabel =
    item.feedback_type.charAt(0).toUpperCase() + item.feedback_type.slice(1);
  const date = new Date(item.created_at).toLocaleString();

  const imageSection =
    item.image_urls && item.image_urls.length > 0
      ? `\n## Screenshots\n${item.image_urls.map((url, i) => `${i + 1}. ${url}`).join("\n")}\n`
      : "";

  return `\
## Feedback Item — ${typeLabel}
**ID:** \`${item.id}\`
**Submitted:** ${date}
**Route (where user was):** \`${item.route}\`
**Status:** ${item.status}
${imageSection}
## Description
${item.description}

---
This item is in the feedback database. You can use MCP tools to look it up, triage it, and work on it:
- \`get_feedback_by_id("${item.id}")\` — fetch full details
- \`triage_feedback_item(...)\` — run triage analysis
- \`get_agent_work_queue()\` — see all approved items ready to fix
Note: \`route\` is where the user clicked Submit, not necessarily where the bug lives. Determine the real location from the description and screenshots.`;
}

// ─── FeedbackWindow ───────────────────────────────────────────────────────────

export interface FeedbackWindowProps extends Omit<
  WindowPanelProps,
  "children" | "title" | "actionsLeft" | "actionsRight"
> {
  title?: string;
}

export function FeedbackWindow({
  title = "Submit Feedback",
  id = "feedback-window",
  ...windowProps
}: FeedbackWindowProps) {
  const dispatch = useAppDispatch();

  const onClose = useCallback(() => {
    dispatch(closeOverlay({ overlayId: "feedbackDialog" }));
  }, [dispatch]);

  return (
    <WindowPanel
      id={id}
      title={title}
      onClose={onClose}
      minWidth={380}
      minHeight={320}
      width={480}
      height={580}
      urlSyncKey="feedback"
      urlSyncId="default"
      className="feedback-window-panel"
      overlayId="feedbackDialog"
      {...windowProps}
    >
      <FeedbackWindowBody onClose={onClose} />
    </WindowPanel>
  );
}

// ─── FeedbackWindowBody ───────────────────────────────────────────────────────

function FeedbackWindowBody({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const reduxUser = useAppSelector(selectUser);

  const username =
    reduxUser?.userMetadata?.name ||
    reduxUser?.email?.split("@")[0] ||
    "Anonymous";

  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<AttachmentSlot[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedItem, setSubmittedItem] = useState<
    import("@/types/feedback.types").UserFeedback | null
  >(null);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortedRef = useRef(false);

  // Derive the final URL list for submission
  const uploadedImages = attachments
    .filter(
      (a): a is Extract<AttachmentSlot, { status: "ready" }> =>
        a.status === "ready",
    )
    .map((a) => a.url);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    return () => {
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
      if (slowHintTimeoutRef.current) clearTimeout(slowHintTimeoutRef.current);
    };
  }, []);

  // ── Image upload ─────────────────────────────────────────────────────────
  const { upload: handlerUpload } = useFileUpload();

  const { captureTab, captureScreen, isCapturing } = useScreenCapture({
    hideSelectors: [".feedback-window-panel"],
  });

  // Add a pending slot and return its id
  const addPendingSlot = useCallback((): string => {
    const id = `capture-${Date.now()}`;
    setAttachments((prev) => [...prev, { status: "pending", id }]);
    return id;
  }, []);

  const resolveSlot = useCallback((id: string, url: string) => {
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { status: "ready", id, url } : a)),
    );
  }, []);

  const errorSlot = useCallback((id: string, message: string) => {
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { status: "error", id, message } : a)),
    );
  }, []);

  const uploadFile = useCallback(
    async (file: File, slotId: string) => {
      try {
        const normalized = await handlerUpload(
          { kind: "file", file },
          {
            folderPath: "Shared Assets/feedback-images",
            visibility: "public",
            createShareLink: true,
            shareLinkPermissionLevel: "read",
          },
        );
        if (normalized.url) {
          resolveSlot(slotId, normalized.url);
          toast.success("Screenshot attached!");
        } else {
          errorSlot(slotId, "no URL returned");
          toast.error("Upload failed: no URL returned");
        }
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : "Failed to upload screenshot";
        errorSlot(slotId, reason);
        toast.error(`Upload failed: ${reason}`);
      }
    },
    [handlerUpload, resolveSlot, errorSlot],
  );

  const handleTabCapture = useCallback(async () => {
    const slotId = addPendingSlot();
    try {
      const { file } = await captureTab({
        ignoreSelector: ".feedback-window-panel",
      });
      await uploadFile(file, slotId);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "AbortError") {
        // User cancelled — remove the pending slot silently
        setAttachments((prev) => prev.filter((a) => a.id !== slotId));
      } else {
        errorSlot(slotId, "Capture failed");
        toast.error("Tab capture failed — try Screen Capture instead");
      }
    }
  }, [addPendingSlot, captureTab, uploadFile, errorSlot]);

  const handleScreenCapture = useCallback(async () => {
    const slotId = addPendingSlot();
    try {
      const { file } = await captureScreen();
      await uploadFile(file, slotId);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "AbortError") {
        setAttachments((prev) => prev.filter((a) => a.id !== slotId));
      } else {
        errorSlot(slotId, "Capture failed");
        toast.error("Screen capture failed");
      }
    }
  }, [addPendingSlot, captureScreen, uploadFile, errorSlot]);

  const uploadPastedImage = useCallback(
    async (file: File) => {
      const slotId = addPendingSlot();
      try {
        const normalized = await handlerUpload(
          { kind: "file", file },
          {
            folderPath: "Shared Assets/feedback-images",
            visibility: "public",
            createShareLink: true,
            shareLinkPermissionLevel: "read",
          },
        );
        if (normalized.url) {
          resolveSlot(slotId, normalized.url);
          toast.success("Image pasted and uploaded");
        } else {
          errorSlot(slotId, "no URL returned");
          toast.error("Paste upload failed: no URL returned");
        }
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : "Failed to upload pasted image";
        errorSlot(slotId, reason);
        toast.error(`Paste upload failed: ${reason}`);
      }
    },
    [addPendingSlot, handlerUpload, resolveSlot, errorSlot],
  );

  // Ctrl+V paste handler
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const ext = file.type.split("/")[1] || "png";
            const named = new File([file], `pasted-${Date.now()}.${ext}`, {
              type: file.type,
            });
            await uploadPastedImage(named);
          }
          break;
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [uploadPastedImage]);

  const handleUploadComplete = useCallback((results: UploadedFileResult[]) => {
    setAttachments((prev) => [
      ...prev,
      ...results.map((r) => ({
        status: "ready" as const,
        id: `upload-${Date.now()}-${Math.random()}`,
        url: r.url,
      })),
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handlePasteButton = useCallback(async () => {
    try {
      if (!navigator.clipboard?.read) {
        toast.info("Use Ctrl+V to paste clipboard images");
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split("/")[1] || "png";
          const file = new File([blob], `pasted-${Date.now()}.${ext}`, {
            type: imageType,
          });
          await uploadPastedImage(file);
          return;
        }
      }
      toast.info("No image found in clipboard");
    } catch {
      toast.info("Copy an image first, then click Paste or press Ctrl+V");
    }
  }, [uploadPastedImage]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const cancelSubmit = useCallback(() => {
    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
    if (slowHintTimeoutRef.current) clearTimeout(slowHintTimeoutRef.current);
    abortedRef.current = true;
    setIsSubmitting(false);
    setIsSlowConnection(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!description.trim() || isSubmitting) return;

    // Pre-flight: check that the client-side session is still valid before
    // hitting the server. This catches the "tab left open overnight" case
    // where the refresh token has expired and the server action would either
    // hang or return "not authenticated" with no useful feedback to the user.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setError(
        "Your session has expired. Please refresh the page or sign in again — your text is still here.",
      );
      return;
    }

    abortedRef.current = false;
    setIsSubmitting(true);
    setIsSlowConnection(false);
    setError(null);

    // Show a slow-connection hint after 5 s so the user knows it's still working.
    slowHintTimeoutRef.current = setTimeout(() => {
      if (!abortedRef.current) setIsSlowConnection(true);
    }, 5000);

    // Hard timeout after 15 s — reset state and preserve the draft.
    const timeoutPromise = new Promise<{ success: false; error: string }>(
      (resolve) =>
        (submitTimeoutRef.current = setTimeout(
          () =>
            resolve({
              success: false,
              error:
                "Request timed out. Your text is preserved — check your connection and try again.",
            }),
          15000,
        )),
    );

    const result = await Promise.race([
      submitFeedback({
        feedback_type: feedbackType,
        route: pathname,
        description: description.trim(),
        image_urls: uploadedImages.length > 0 ? uploadedImages : undefined,
      }),
      timeoutPromise,
    ]);

    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
    if (slowHintTimeoutRef.current) clearTimeout(slowHintTimeoutRef.current);

    // If the user clicked Cancel while we were waiting, ignore the result.
    if (abortedRef.current) return;

    setIsSubmitting(false);
    setIsSlowConnection(false);

    if (result.success) {
      setSubmitted(true);
      if (result.data) setSubmittedItem(result.data);
      setDescription("");
      setAttachments([]);
      // Fetch stats (non-blocking)
      getUserFeedback()
        .then((res) => {
          if (res.success && res.data) {
            const items = res.data;
            const pending = items.filter((i) =>
              ["new", "in_progress"].includes(i.status),
            ).length;
            const resolved = items.filter((i) =>
              ["resolved", "closed"].includes(i.status),
            ).length;
            setStats({ total: items.length, pending, resolved });
          }
        })
        .catch(() => {});
    } else {
      setError(result.error ?? "Failed to submit feedback");
    }
  }, [description, feedbackType, pathname, isSubmitting, uploadedImages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleCopyForAgent = useCallback(async () => {
    if (!submittedItem) return;
    const prompt = buildAgentPrompt(submittedItem);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Clipboard unavailable — copy manually from the console.");
      console.log("=== Copy for Agent ===\n", prompt);
    }
  }, [submittedItem]);

  const handleReset = useCallback(() => {
    abortedRef.current = false;
    setSubmitted(false);
    setSubmittedItem(null);
    setStats(null);
    setFeedbackType("bug");
    setDescription("");
    setAttachments([]);
    setError(null);
    setIsSlowConnection(false);
    setCopied(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  // ── Submitted state ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-5">
        {/* Success icon */}
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10 ring-4 ring-green-500/20">
          <Check className="w-7 h-7 text-green-500" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">
            Feedback Submitted!
          </h3>
          <p className="text-xs text-muted-foreground max-w-[280px]">
            Thank you — we&apos;ll review your report and get on it.
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex items-center gap-6 rounded-xl border border-border bg-muted/30 px-6 py-3">
            <StatPill label="Submitted" value={stats.total} />
            <div className="w-px h-8 bg-border" />
            <StatPill
              label="Pending"
              value={stats.pending}
              valueClassName="text-amber-500"
            />
            <div className="w-px h-8 bg-border" />
            <StatPill
              label="Resolved"
              value={stats.resolved}
              valueClassName="text-green-500"
            />
          </div>
        )}

        {/* Copy for Agent — prominent single button */}
        {submittedItem && (
          <button
            type="button"
            onClick={handleCopyForAgent}
            className={cn(
              "flex items-center justify-center gap-2 w-full max-w-[340px] px-4 py-2.5 rounded-xl border text-xs font-medium transition-all",
              copied
                ? "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400"
                : "border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground",
            )}
          >
            {copied ? (
              <>
                <CheckCheck className="w-3.5 h-3.5" />
                Copied — paste into your agent chat
              </>
            ) : (
              <>
                <Component className="w-3.5 h-3.5" />
                Copy for Coding Agent
              </>
            )}
          </button>
        )}

        {/* Action tiles */}
        <div className="grid grid-cols-3 gap-2 w-full max-w-[340px]">
          <ActionTile
            icon={<Plus className="w-4 h-4" />}
            label="Submit Another"
            onClick={handleReset}
          />
          <Link
            href="/settings/feedback"
            onClick={onClose}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card hover:bg-accent transition-colors p-3 text-center cursor-pointer group"
          >
            <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
              View All
            </span>
          </Link>
          <ActionTile
            icon={<X className="w-4 h-4" />}
            label="Close"
            onClick={onClose}
          />
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Scrollable body */}
      <div className="flex-1 overflow-auto min-h-0 px-4 py-3 space-y-3">
        {/* Type selector */}
        <div className="flex gap-1.5 flex-wrap">
          {FEEDBACK_TYPES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg cursor-pointer transition-colors border",
                "[&_svg]:w-3.5 [&_svg]:h-3.5",
                feedbackType === value
                  ? FEEDBACK_TYPE_ACTIVE_CLASSES[value]
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              onClick={() => setFeedbackType(value)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>

        {/* Route + User info */}
        <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground font-mono">
          <span>
            Route: <span className="text-foreground/70">{pathname}</span>
          </span>
          <span>
            User: <span className="text-foreground/70">{username}</span>
          </span>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <VoiceTextarea
            ref={textareaRef}
            className="w-full h-28 px-3 py-2 text-xs leading-relaxed text-foreground bg-muted/40 border border-border rounded-lg outline-none resize-none transition-colors placeholder:text-xs placeholder:text-muted-foreground/50 focus:border-ring focus:bg-background"
            style={{ fontSize: "16px" }}
            placeholder="Describe the issue, feature request, or suggestion..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
          />
          <p className="text-[10px] text-muted-foreground">
            Ctrl+Enter to submit · Ctrl+V to paste screenshots
          </p>
        </div>

        {/* Screenshots */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Screenshots{" "}
            <span className="font-normal opacity-60">(optional)</span>
          </p>

          <FileUploadWithStorage
            bucket="userContent"
            path="feedback-images"
            saveTo="public"
            onUploadComplete={handleUploadComplete}
            multiple
            useMiniUploader
            maxHeight="120px"
          />

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePasteButton}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent text-foreground transition-colors disabled:opacity-50"
            >
              <Clipboard className="w-3 h-3" />
              Paste Image
            </button>
            <button
              type="button"
              onClick={handleTabCapture}
              disabled={isSubmitting || isCapturing}
              title="Capture this tab's content instantly (no picker)"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent text-foreground transition-colors disabled:opacity-50"
            >
              <Camera className="w-3 h-3" />
              Tab Capture
            </button>
            <button
              type="button"
              onClick={handleScreenCapture}
              disabled={isSubmitting || isCapturing}
              title="Select any window or screen to capture (browser picker)"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent text-foreground transition-colors disabled:opacity-50"
            >
              <Monitor className="w-3 h-3" />
              Screen Capture
            </button>
          </div>

          {/* Attachment thumbnails — pending / error / ready */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {attachments.map((slot) => (
                <AttachmentThumbnail
                  key={slot.id}
                  slot={slot}
                  readyImages={uploadedImages}
                  onView={(idx) =>
                    openImageViewer(dispatch, {
                      images: uploadedImages,
                      initialIndex: idx,
                      title: "Feedback Attachments",
                      instanceId: "feedback",
                    })
                  }
                  onRemove={() => removeAttachment(slot.id)}
                />
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-destructive leading-snug">{error}</p>
        )}
      </div>

      {/* Sticky footer */}
      <div
        data-feedback-overlay
        className="shrink-0 flex flex-col gap-1 px-4 py-2.5 border-t border-border bg-muted/20"
      >
        {isSlowConnection && (
          <p className="text-[10px] text-amber-500 text-center">
            Still trying… slow connection detected. You can cancel and your text
            will be preserved.
          </p>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={isSubmitting ? cancelSubmit : onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
              "[&_svg]:w-3.5 [&_svg]:h-3.5",
              description.trim() && !isSubmitting
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
            onClick={handleSubmit}
            disabled={!description.trim() || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={cn(
          "text-xl font-bold tabular-nums",
          valueClassName ?? "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function AttachmentThumbnail({
  slot,
  readyImages,
  onView,
  onRemove,
}: {
  slot: AttachmentSlot;
  /** All currently ready URLs (used to compute the correct viewer index). */
  readyImages: string[];
  onView: (readyIndex: number) => void;
  onRemove: () => void;
}) {
  const isReady = slot.status === "ready";
  const isPending = slot.status === "pending";
  const isError = slot.status === "error";

  // Index within the ready-only list so the viewer opens the right image
  const readyIndex = isReady ? readyImages.indexOf(slot.url) : -1;

  return (
    <div className="relative group w-14 h-14 rounded-md overflow-hidden border border-border bg-muted shrink-0">
      {isPending && (
        <div className="flex flex-col items-center justify-center w-full h-full gap-1 bg-muted animate-pulse">
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          <span className="text-[9px] text-muted-foreground leading-none">
            saving…
          </span>
        </div>
      )}

      {isError && (
        <div
          className="flex flex-col items-center justify-center w-full h-full gap-1 bg-destructive/10 cursor-default"
          title={slot.message}
        >
          <AlertCircle className="w-4 h-4 text-destructive" />
          <span className="text-[9px] text-destructive leading-none">
            failed
          </span>
        </div>
      )}

      {isReady && (
        <button
          type="button"
          onClick={() => onView(readyIndex)}
          className="block w-full h-full"
          aria-label="View image fullsize"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.url}
            alt="Attachment"
            className="w-full h-full object-cover group-hover:brightness-90 transition-[filter]"
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
            <ImageIcon className="w-4 h-4 text-white drop-shadow" />
          </div>
        </button>
      )}

      {/* Remove button — always shown on hover */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl-md opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label="Remove attachment"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function ActionTile({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card hover:bg-accent transition-colors p-3 text-center cursor-pointer group"
    >
      <span className="text-muted-foreground group-hover:text-foreground transition-colors">
        {icon}
      </span>
      <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
        {label}
      </span>
    </button>
  );
}
