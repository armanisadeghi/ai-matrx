"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/utils/supabase/client";
import {
  Component,
  Bug,
  Camera,
  Check,
  CheckCheck,
  Clipboard,
  List,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageSquare,
  Monitor,
  PenLine,
  Plus,
  Send,
  Settings2,
  X,
    KeyRound,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { submitFeedback, getUserFeedback } from "@/actions/feedback.actions";
import { MediaAttachmentThumbnail } from "@/features/files/components/inline/MediaAttachmentThumbnail";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import {
  FileUploadWithStorage,
  type UploadedFileResult,
} from "@/components/ui/file-upload/FileUploadWithStorage";
import {
  FEEDBACK_TYPES,
  type FeedbackType,
  type FeedbackCategory,
  type FeedbackAssignableAdmin,
} from "@/types/feedback.types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  FEEDBACK_SURFACE_NAME,
  createFeedbackScope,
} from "@/features/surfaces/manifests/feedback.manifest";
import { parseFeedbackDraft } from "@/features/feedback/feedbackDraftWrite";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { useTextDraft } from "@/lib/drafts/useTextDraft";
import {
  ensureOrganizationForWrite,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import { useIsMobile } from "@/hooks/use-mobile";
import { useScreenCapture } from "@/hooks/useScreenCapture";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { useOpenImageAnnotationWindow } from "@/features/overlays/openers/imageAnnotationWindow";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import type { FeedbackSubject } from "@/features/overlays/openers/feedbackDialog";
import { describeSubject, subjectMetadata } from "./feedback-subject";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttachmentSlot =
  | { status: "pending"; id: string }
  | { status: "error"; id: string; message: string }
  | {
      status: "ready";
      id: string;
      url: string;
      fileId: string;
      filename?: string;
    };

interface FeedbackStats {
  total: number;
  pending: number;
  resolved: number;
}

/**
 * Chip presentation per type. A `Record` keyed by `FeedbackType` (rather than
 * a hand-ordered array) so it cannot drift from the `FEEDBACK_TYPES`
 * vocabulary the manifest and the write handler both read — adding a type to
 * that array is a compile error here until this gets an entry.
 */
const FEEDBACK_TYPE_CHIPS: Record<
  FeedbackType,
  { label: string; icon: typeof Bug }
> = {
  bug: { label: "Bug", icon: Bug },
  feature: { label: "Feature", icon: Lightbulb },
  suggestion: { label: "Suggestion", icon: MessageSquare },
  other: { label: "Other", icon: HelpCircle },
  request: { label: "Access", icon: KeyRound },
};

// ─── Agent prompt builder ─────────────────────────────────────────────────────

function buildAgentPrompt(
  item: import("@/types/feedback.types").UserFeedback,
): string {
  const typeLabel =
    item.feedback_type.charAt(0).toUpperCase() + item.feedback_type.slice(1);
  const date = new Date(item.created_at).toLocaleString();

  const imageSection =
    item.image_file_ids && item.image_file_ids.length > 0
      ? `\n## Screenshots (file IDs)\n${item.image_file_ids.map((fileId, i) => `${i + 1}. ${fileId}`).join("\n")}\n`
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
//
// Thin COMPOSITION ROOT (mirrors NotesWindow / AgentShortcutQuickCreateWindow):
// it owns the feedback form state via `useFeedbackForm` and maps the units onto
// WindowPanel's slots. The body holds ONLY content — the Cancel/Submit bar and
// the slow-connection hint are footer slots, not hand-rolled chrome inside the
// body. Because the footer slot is a sibling of the body, the shared state must
// live here (the root), not inside `FeedbackWindowBody`.

export interface FeedbackWindowProps extends Omit<
  WindowPanelProps,
  | "children"
  | "title"
  | "actionsLeft"
  | "actionsRight"
  | "footer"
  | "footerLeft"
  | "footerRight"
> {
  title?: string;
  /** What the report is about (a selected passage) — shown and filed with it. */
  subject?: FeedbackSubject;
}

export function FeedbackWindow({
  title = "Submit Feedback",
  id = "feedback-window",
  subject,
  ...windowProps
}: FeedbackWindowProps) {
  const dispatch = useAppDispatch();

  const onClose = useCallback(() => {
    dispatch(closeOverlay({ overlayId: "feedbackDialog" }));
  }, [dispatch]);

  const form = useFeedbackForm({ onClose, subject });

  // Surface provider wraps the panel so `matrx-user/feedback` is live for
  // exactly as long as the window is open. Nested here, it out-depths the
  // hosting page's surface while open (deepest wins) — an agent run started
  // from the header while the feedback window is up is talking to the form.
  return (
    <SurfaceRuntimeProvider
      surfaceName={FEEDBACK_SURFACE_NAME}
      getScope={form.getScope}
      getWriteHandlers={form.getWriteHandlers}
    >
      <WindowPanel
        id={id}
        title={title}
        onClose={onClose}
        minWidth={380}
        minHeight={320}
        width={480}
        height={500}
        urlSyncKey="feedback"
        urlSyncId="default"
        className="feedback-window-panel"
        overlayId="feedbackDialog"
        surfaceLayer={FEEDBACK_SURFACE_NAME}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        // Footer only exists for the form view — the success view replaces the
        // whole body and carries its own action tiles.
        footerLeft={
          !form.submitted ? <FeedbackFooterLeft form={form} /> : undefined
        }
        footerRight={
          !form.submitted ? <FeedbackFooterRight form={form} /> : undefined
        }
        {...windowProps}
      >
        <FeedbackWindowBody form={form} />
      </WindowPanel>
    </SurfaceRuntimeProvider>
  );
}

// ─── Footer slots ─────────────────────────────────────────────────────────────

function FeedbackFooterLeft({ form }: { form: FeedbackFormState }) {
  if (!form.isSlowConnection) return null;
  return (
    <span className="text-amber-500 leading-snug">
      Still trying… slow connection. Cancel to keep your text.
    </span>
  );
}

function FeedbackFooterRight({ form }: { form: FeedbackFormState }) {
  const { isSubmitting, description, cancelSubmit, onClose, handleSubmit } =
    form;
  return (
    <div className="matrx-touch-targets flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={isSubmitting ? cancelSubmit : onClose}
      >
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={handleSubmit}
        disabled={!description.trim() || isSubmitting}
      >
        {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
        {isSubmitting ? "Submitting…" : "Submit"}
      </Button>
    </div>
  );
}

// ─── useFeedbackForm — hoisted shared state ───────────────────────────────────
// Owns ALL feedback form state + handlers so the WindowPanel root can feed both
// the body content and the footer slots. Mirrors `useShortcutQuickCreate`.

type FeedbackFormState = ReturnType<typeof useFeedbackForm>;

function useFeedbackForm({ onClose, subject }: { onClose: () => void; subject?: FeedbackSubject }) {
  const pathname = usePathname();
  const reduxUser = useAppSelector(selectUser);
  const isAdmin = useAppSelector(selectIsAdmin);
  // The organization the report is filed in — a Server Action carries no
  // `X-Organization-Id` header, so the selection travels as an argument.
  const selectedOrganizationId = useAppSelector(selectOrganizationId);

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

  // ── Admin-only extras: category + assignee ──
  // Use "none" as the sentinel for "unset" because Radix Select cannot use "".
  const [adminOptionsOpen, setAdminOptionsOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("none");
  const [assigneeId, setAssigneeId] = useState<string>("none");
  const [categories, setCategories] = useState<FeedbackCategory[]>([]);
  const [assignableAdmins, setAssignableAdmins] = useState<
    FeedbackAssignableAdmin[]
  >([]);
  const [isLoadingAdminOptions, setIsLoadingAdminOptions] = useState(true);

  // Fetch the admin-only dropdown data once when the window opens for an admin.
  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/feedback/categories", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { categories: [] }))
        .catch(() => ({ categories: [] })),
      fetch("/api/admin/feedback/assignable-admins", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { admins: [] }))
        .catch(() => ({ admins: [] })),
    ])
      .then(([catRes, adminRes]) => {
        if (cancelled) return;
        setCategories(catRes?.categories ?? []);
        setAssignableAdmins(adminRes?.admins ?? []);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAdminOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // Persist owned identity. URLs are derived views and never cross this
  // storage boundary for newly uploaded feedback.
  const uploadedImageFileIds = attachments
    .filter(
      (a): a is Extract<AttachmentSlot, { status: "ready" }> =>
        a.status === "ready",
    )
    .map((a) => a.fileId);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isMobile = useIsMobile();

  // Typed text survives closing the window (Cancel, the close button, a
  // reload): the shared draft keeper restores it on the next open and says so;
  // only a successful submit forgets it.
  const draft = useTextDraft(
    subject ? `feedback:${subject.sourceToken}:${subject.sourceId}` : "feedback",
    description,
    setDescription,
    true,
  );

  // The window body mounts through a portal AFTER this hook's first effect,
  // so an effect saw no textarea and nothing was focused. Focus when the
  // field itself attaches — on desktop only: on a phone it would throw the
  // keyboard over the sheet before the person chose to type.
  const focusedOnceRef = useRef(false);
  const attachTextarea = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      if (el && !focusedOnceRef.current && !isMobile) {
        focusedOnceRef.current = true;
        el.focus({ preventScroll: true });
      }
    },
    [isMobile],
  );

  // Screen Capture needs the Screen Capture API, which phones do not have.
  const canCaptureScreen =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
      if (slowHintTimeoutRef.current) clearTimeout(slowHintTimeoutRef.current);
    };
  }, []);

  // ── Image upload ─────────────────────────────────────────────────────────
  const { upload: handlerUpload } = useFileUpload();
  const openImageAnnotation = useOpenImageAnnotationWindow();

  const { captureTab, captureScreen, isCapturing } = useScreenCapture({
    hideSelectors: [".feedback-window-panel"],
  });

  // Add a pending slot and return its id
  const addPendingSlot = useCallback((): string => {
    const id = `capture-${Date.now()}`;
    setAttachments((prev) => [...prev, { status: "pending", id }]);
    return id;
  }, []);

  const resolveSlot = useCallback(
    (
      id: string,
      result: { url: string; fileId: string; filename?: string },
    ) => {
      setAttachments((prev) =>
        prev.map((attachment) =>
          attachment.id === id
            ? {
                status: "ready",
                id,
                url: result.url,
                fileId: result.fileId,
                filename: result.filename,
              }
            : attachment,
        ),
      );
    },
    [],
  );

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
            folderPath: CloudFolders.FEEDBACK_IMAGES,
            visibility: "public",
            createShareLink: true,
            shareLinkPermissionLevel: "viewer",
          },
        );
        if (normalized.url) {
          resolveSlot(slotId, {
            url: normalized.url,
            fileId: normalized.fileId,
            filename: file.name,
          });
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
            folderPath: CloudFolders.FEEDBACK_IMAGES,
            visibility: "public",
            createShareLink: true,
            shareLinkPermissionLevel: "viewer",
          },
        );
        if (normalized.url) {
          resolveSlot(slotId, {
            url: normalized.url,
            fileId: normalized.fileId,
            filename: file.name,
          });
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
        fileId: r.fileId,
        filename: r.details?.filename,
      })),
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const annotateAttachment = useCallback(
    (slot: Extract<AttachmentSlot, { status: "ready" }>) => {
      openImageAnnotation({
        sourceFileId: slot.fileId,
        sourceUrl: null,
        sourceFilename: slot.filename ?? null,
        defaultFolder: CloudFolders.FEEDBACK_IMAGES,
        title: "Mark up feedback screenshot",
        overwriteSource: true,
        onSaved: ({ result }) => {
          resolveSlot(slot.id, {
            url: result.shareUrl,
            fileId: result.fileId,
            filename: result.filename,
          });
          toast.success("Feedback screenshot updated");
        },
      });
    },
    [openImageAnnotation, resolveSlot],
  );

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

    // Every report is filed under one organization. With none selected the
    // submit is HELD: the canonical workspace picker asks, and the report
    // continues with the pick (never an error box, never a guess).
    let organizationId: string;
    try {
      organizationId = await ensureOrganizationForWrite(selectedOrganizationId, {
        interactive: true,
      });
    } catch (err) {
      if (isOrganizationSelectionCancelled(err)) return;
      setError(
        "Choose a workspace to send feedback — your text is still here.",
      );
      return;
    }

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
        // The organization the person is acting in — a Server Action carries
        // no header, so the selection travels as an argument.
        organization_id: organizationId,
        // A report about a passage carries it twice: readable at the top of the
        // description for whoever triages it, and structured for tools.
        description: subject ? `${describeSubject(subject)}\n\n${description.trim()}` : description.trim(),
        ...(subject ? { metadata: { report_subject: subjectMetadata(subject) } } : {}),
        image_file_ids:
          uploadedImageFileIds.length > 0 ? uploadedImageFileIds : undefined,
        // Admin-only fields. Server silently drops these for non-admins, but we
        // also skip sending them entirely when the caller isn't an admin so
        // the wire payload stays clean.
        category_id: isAdmin && categoryId !== "none" ? categoryId : undefined,
        assigned_to: isAdmin && assigneeId !== "none" ? assigneeId : undefined,
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
      draft.forget();
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
  }, [
    description,
    feedbackType,
    pathname,
    isSubmitting,
    uploadedImageFileIds,
    isAdmin,
    categoryId,
    assigneeId,
    selectedOrganizationId,
    draft,
  ]);

  // ── Surface seam (`matrx-user/feedback`) ─────────────────────────────────
  // This window mounts the surface's FIRST provider: the manifest existed from
  // a window-component audit with no emitter at all, so nothing registered and
  // no write target could ever have resolved. Both halves live here in the
  // hook because the hook owns the form state.
  //
  // Refs, not the render closure, for the two gates. The writeback seam
  // resolves handlers BEFORE the user confirms the ask dialog, so a handler
  // that judged "is this form still writable?" from its render snapshot could
  // stage text into a form the user had already submitted in the meantime.
  const submittedRef = useRef(submitted);
  const isSubmittingRef = useRef(isSubmitting);
  useEffect(() => {
    submittedRef.current = submitted;
    isSubmittingRef.current = isSubmitting;
  });

  const getScope = useCallback(
    () =>
      createFeedbackScope({
        feedback_type: feedbackType,
        route: pathname,
        content: description,
        attachment_count: attachments.length,
        submitted,
        submitted_item_id: submittedItem?.id,
        error_message: error ?? undefined,
        // Mirrors the submit payload: the sentinel "none" means unset, and
        // these only exist for admins in the first place.
        category_id: isAdmin && categoryId !== "none" ? categoryId : undefined,
        assignee_id: isAdmin && assigneeId !== "none" ? assigneeId : undefined,
      }),
    [
      feedbackType,
      pathname,
      description,
      attachments.length,
      submitted,
      submittedItem,
      error,
      isAdmin,
      categoryId,
      assigneeId,
    ],
  );

  // The same live values, for the menus and the field's agent actions.
  const getApplicationScope = () => getScope() as ApplicationScope;

  // Write half: ONE composite draft target. Validation happens in the pure
  // `parseFeedbackDraft` BEFORE any setter runs, so a bad shape throws
  // synchronously inside `applySurfaceWrite` and comes back to the agent as a
  // readable error instead of blowing up in a React updater. Accepted keys
  // land through the very setters the textarea's onChange and the type chips'
  // onClick call — no parallel write path — and the user still presses Submit.
  const getWriteHandlers = useCallback(
    () => ({
      feedback_draft: (value: unknown) => {
        if (submittedRef.current)
          throw new Error(
            "This feedback has already been submitted — the form is gone and there is nothing left to stage. Use New report to start a fresh one.",
          );
        if (isSubmittingRef.current)
          throw new Error(
            "This feedback is being submitted right now — refused rather than editing a report that is already on its way.",
          );

        const patch = parseFeedbackDraft(value);
        if (patch.feedbackType !== undefined)
          setFeedbackType(patch.feedbackType);
        if (patch.description !== undefined) setDescription(patch.description);
      },
    }),
    [],
  );

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
    setCategoryId("none");
    setAssigneeId("none");
    setAdminOptionsOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  return {
    // what the report is about (a selected passage), when opened from one
    subject,
    // routing / identity
    pathname,
    reduxUser,
    isAdmin,
    onClose,
    // core form state
    feedbackType,
    setFeedbackType,
    description,
    setDescription,
    attachments,
    isSubmitting,
    isSlowConnection,
    submitted,
    submittedItem,
    stats,
    error,
    copied,
    // admin extras
    adminOptionsOpen,
    setAdminOptionsOpen,
    categoryId,
    setCategoryId,
    assigneeId,
    setAssigneeId,
    categories,
    assignableAdmins,
    isLoadingAdminOptions,
    // derived
    uploadedImageFileIds,
    textareaRef,
    attachTextarea,
    draft,
    canCaptureScreen,
    isCapturing,
    // surface seam
    getScope,
    getApplicationScope,
    getWriteHandlers,
    // handlers
    handlePasteButton,
    handleTabCapture,
    handleScreenCapture,
    handleUploadComplete,
    annotateAttachment,
    removeAttachment,
    cancelSubmit,
    handleSubmit,
    handleKeyDown,
    handleCopyForAgent,
    handleReset,
  };
}

// ─── FeedbackWindowBody — content only ────────────────────────────────────────
// Renders ONLY the body content (success view OR the form). The Cancel/Submit
// bar and slow-connection hint live in the WindowPanel footer slots, not here.

function FeedbackWindowBody({ form }: { form: FeedbackFormState }) {
  const {
    pathname,
    reduxUser,
    isAdmin,
    onClose,
    feedbackType,
    setFeedbackType,
    description,
    setDescription,
    attachments,
    isSubmitting,
    submitted,
    submittedItem,
    stats,
    error,
    copied,
    adminOptionsOpen,
    setAdminOptionsOpen,
    categoryId,
    setCategoryId,
    assigneeId,
    setAssigneeId,
    categories,
    assignableAdmins,
    isLoadingAdminOptions,
    textareaRef,
    attachTextarea,
    draft,
    canCaptureScreen,
    isCapturing,
    getApplicationScope,
    handlePasteButton,
    handleTabCapture,
    handleScreenCapture,
    handleUploadComplete,
    annotateAttachment,
    removeAttachment,
    handleSubmit,
    handleKeyDown,
    handleCopyForAgent,
    handleReset,
  } = form;

  // ── Submitted state ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="matrx-touch-targets flex flex-col items-center justify-center h-full p-6 text-center gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-success/10">
          <Check className="w-6 h-6 text-success" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          Feedback submitted
        </h3>

        {/* Your reports — each count opens the list behind it. */}
        {stats && (
          <div className="flex items-center gap-6 rounded-lg border border-border px-6 py-2">
            <StatPill label="Submitted" value={stats.total} />
            <StatPill label="Pending" value={stats.pending} />
            <StatPill label="Resolved" value={stats.resolved} />
          </div>
        )}

        {submittedItem && (
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyForAgent}
            className="w-full max-w-[340px]"
          >
            {copied ? <CheckCheck /> : <Component />}
            {copied
              ? "Copied — paste into your agent chat"
              : "Copy for Coding Agent"}
          </Button>
        )}

        <div className="grid grid-cols-3 gap-2 w-full max-w-[340px]">
          <Button type="button" variant="outline" onClick={handleReset}>
            <Plus />
            New report
          </Button>
          <Button asChild variant="outline">
            <Link href="/settings/feedback" onClick={onClose}>
              <List />
              View all
            </Link>
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            <X />
            Close
          </Button>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  // Content only — the Cancel/Submit bar and slow-connection hint are footer
  // slots owned by the WindowPanel root (see FeedbackFooterLeft/Right).
  return (
    <div className="matrx-touch-targets flex-1 overflow-auto min-h-0 px-4 py-3 space-y-3">
      {/* Type selector — one standard single-choice group. */}
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={feedbackType}
        onValueChange={(value) => {
          // A single-choice group reports "" when the active item is pressed
          // again; a report always has a type, so that press changes nothing.
          if (value) setFeedbackType(value as FeedbackType);
        }}
        className="flex-wrap justify-start"
        aria-label="Feedback type"
      >
        {FEEDBACK_TYPES.map((value) => {
          const { label, icon: Icon } = FEEDBACK_TYPE_CHIPS[value];
          return (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              className="gap-1.5 px-2.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
            >
              <Icon />
              {label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      {/* Where the report is filed from — sent with it. */}
      <p className="text-xs text-muted-foreground">
        Filed from <span className="text-foreground">{pathname}</span>
      </p>

      {form.subject ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs" data-feedback-subject="">
          <p className="font-medium text-foreground">About this passage in “{form.subject.sourceTitle}”</p>
          <blockquote className="mt-1 line-clamp-4 border-l-2 border-primary/50 pl-2 text-muted-foreground">
            {form.subject.quote}
          </blockquote>
          <p className="mt-1 text-xs text-muted-foreground">The passage and its exact position are sent with your report.</p>
        </div>
      ) : null}

      {/* Description */}
      <div className="space-y-1">
        {/* 🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). Without
            this, a right-click here is answered by whatever page sits
            underneath. Editable — this textarea is the feedback description
            itself, so it gets `EditableContextMenu` (auto-registers the
            WidgetHandle too). */}
        <EditableContextMenu
          sourceFeature="system"
          surfaceName={FEEDBACK_SURFACE_NAME}
          getApplicationScope={getApplicationScope}
          contentSource={{ type: "raw" }}
          getTextarea={() => textareaRef.current}
          onTextReplace={setDescription}
          onTextInsertBefore={(text) => setDescription(text + description)}
          onTextInsertAfter={(text) => setDescription(description + text)}
        >
          <ProTextarea
            ref={attachTextarea}
            surfaceName={FEEDBACK_SURFACE_NAME}
            getApplicationScope={getApplicationScope}
            className="w-full h-28 px-3 py-2 text-base leading-relaxed text-foreground bg-muted/40 border border-border rounded-lg outline-none resize-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:bg-background"
            placeholder="Describe the issue, feature request, or suggestion…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
          />
        </EditableContextMenu>
        {draft.restored ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            Your unsent text was restored.
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={draft.acknowledge}
            >
              OK
            </Button>
          </p>
        ) : null}
        {!draft.available ? (
          <p className="text-xs text-muted-foreground">
            This browser is not keeping drafts — your text is lost if the window closes.
          </p>
        ) : null}
        <p className="text-[10px] text-muted-foreground pointer-coarse:hidden">
          Ctrl+Enter to submit · Ctrl+V to paste screenshots
        </p>
      </div>

      {/* Admin-only: Category + Assignee */}
      {isAdmin && (
        <div className="rounded-lg border border-border bg-muted/30">
          <button
            type="button"
            onClick={() => setAdminOptionsOpen((v) => !v)}
            className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={adminOptionsOpen}
            aria-controls="feedback-admin-options"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Admin Options</span>
            {(categoryId !== "none" || assigneeId !== "none") && (
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
                {(categoryId !== "none" ? 1 : 0) +
                  (assigneeId !== "none" ? 1 : 0)}{" "}
                set
              </span>
            )}
            <span className="ml-auto text-xs opacity-60">
              {adminOptionsOpen ? "Hide" : "Show"}
            </span>
          </button>
          {adminOptionsOpen && (
            <div
              id="feedback-admin-options"
              className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-border/60"
            >
              {/* Category */}
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Category
                </label>
                <Select
                  value={categoryId}
                  onValueChange={setCategoryId}
                  disabled={isSubmitting || isLoadingAdminOptions}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assignee */}
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Assign to
                </label>
                <Select
                  value={assigneeId}
                  onValueChange={setAssigneeId}
                  disabled={isSubmitting || isLoadingAdminOptions}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {assignableAdmins.map((a) => (
                      <SelectItem key={a.user_id} value={a.user_id}>
                        {a.display_name || a.email || a.user_id.slice(0, 8)}
                        {reduxUser?.id === a.user_id ? " (you)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assigneeId !== "none" && reduxUser?.id !== assigneeId && (
                  <p className="text-xs text-muted-foreground leading-snug">
                    The assignee will get an in-app message and an email.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Screenshots */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Screenshots <span className="font-normal opacity-60">(optional)</span>
        </p>

        <FileUploadWithStorage
          folderRoot="userContent"
          path="feedback-images"
          saveTo="public"
          onUploadComplete={handleUploadComplete}
          multiple
          useMiniUploader
          maxHeight="120px"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePasteButton}
            disabled={isSubmitting}
          >
            <Clipboard />
            Paste Image
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTabCapture}
            disabled={isSubmitting || isCapturing}
            title="Capture this tab's content instantly (no picker)"
          >
            <Camera />
            Tab Capture
          </Button>
          {canCaptureScreen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleScreenCapture}
              disabled={isSubmitting || isCapturing}
              title="Select any window or screen to capture (browser picker)"
            >
              <Monitor />
              Screen Capture
            </Button>
          ) : null}
        </div>

        {/* Attachment thumbnails — pending / error / ready */}
        {attachments.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Click a thumbnail to draw, circle, or write on it.
          </p>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {attachments.map((slot) => (
              <MediaAttachmentThumbnail
                key={slot.id}
                mediaRef={slot.status === "ready" ? slot.fileId : null}
                status={slot.status}
                title={
                  slot.status === "ready"
                    ? (slot.filename ?? "Feedback screenshot")
                    : "Feedback screenshot"
                }
                openLabel="Mark up attachment"
                removeLabel="Remove attachment"
                readyIcon={
                  <PenLine className="h-4 w-4 text-white drop-shadow" />
                }
                errorMessage={
                  slot.status === "error" ? slot.message : undefined
                }
                onOpen={() => {
                  if (slot.status === "ready") annotateAttachment(slot);
                }}
                onRemove={() => removeAttachment(slot.id)}
              />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive leading-snug">{error} <ErrorAlchemyMenu error={error} /></p>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <Link
      href="/settings/feedback"
      className="flex flex-col items-center gap-0.5 rounded-md px-2 py-1 hover:bg-accent transition-colors"
    >
      <span className="text-xl font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </Link>
  );
}
