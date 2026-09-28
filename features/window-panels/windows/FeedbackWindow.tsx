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
  ChevronDown,
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
  Upload,
  Settings2,
  X,
    KeyRound,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import { updateWindowRect } from "@/lib/redux/slices/windowManagerSlice";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { submitFeedback, getUserFeedback } from "@/actions/feedback.actions";
import { MediaAttachmentThumbnail } from "@/features/files/components/inline/MediaAttachmentThumbnail";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
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
import {
  parseFeedbackAttachment,
  parseFeedbackDraft,
} from "@/features/feedback/feedbackDraftWrite";
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
  withdrawOrganizationRequest,
} from "@/lib/organization/organization-gate";
import {
  feedbackListHref,
  inFeedbackGroup,
  type FeedbackCountGroup,
} from "@/features/feedback/feedback-status-groups";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { asClause } from "@/lib/text/asClause";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * An attachment is LOCAL until Submit: captures, pastes, uploads and drops are
 * held in memory (with a preview) and uploaded only when the report is filed,
 * under the SAME organization the report uses — one "Which workspace?" at
 * most, asked once, at Submit (page-pass 2026-09-27). `ready` is a file that
 * already exists (a mark-up save, or one an agent attached by id).
 */
type AttachmentSlot =
  | {
      status: "local";
      id: string;
      file: File;
      /** Object URL for an image preview; null for video/PDF. */
      previewUrl: string | null;
      filename: string;
    }
  | { status: "pending"; id: string; file: File; previewUrl: string | null; filename: string }
  | { status: "ready"; id: string; fileId: string; filename?: string };

/**
 * The unsent report outlives the window: text through the shared draft keeper,
 * and the type and attachments (live `File`s + previews) here, for the life of
 * the tab. Cancel then reopen restores all of it; only a successful submit or
 * "New report" clears it.
 */
interface FeedbackDraftStash {
  feedbackType: FeedbackType;
  attachments: AttachmentSlot[];
}
const draftStash = new Map<string, FeedbackDraftStash>();

function newSlotId(): string {
  return `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function localSlot(file: File): AttachmentSlot {
  return {
    status: "local",
    id: newSlotId(),
    file,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    filename: file.name,
  };
}

function releaseSlot(slot: AttachmentSlot): void {
  if (slot.status !== "ready" && slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
}

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
  { label: string; icon: typeof Bug; placeholder: string }
> = {
  bug: {
    label: "Bug",
    icon: Bug,
    placeholder: "What went wrong, and what did you expect to happen?",
  },
  feature: {
    label: "Feature",
    icon: Lightbulb,
    placeholder: "What should AI Matrx do that it can't today?",
  },
  suggestion: {
    label: "Suggestion",
    icon: MessageSquare,
    placeholder: "What would make this better?",
  },
  other: { label: "Other", icon: HelpCircle, placeholder: "Tell us anything." },
  request: {
    label: "Access",
    icon: KeyRound,
    placeholder:
      "Ask for access: which page, feature or record do you need, and why?",
  },
};

/**
 * Every layer the window renders — the desktop window AND the phone sheet
 * both carry the surface marker — plus the phone sheet's dimming overlay, so
 * a capture shows the page, not the feedback form over it.
 */
const FEEDBACK_CAPTURE_HIDE = `[data-surface-layer="${FEEDBACK_SURFACE_NAME}"], [data-vaul-overlay], [vaul-overlay]`;

/**
 * The address bar as the page's own URL — minus `panels=`, the window
 * manager's record of which windows are open (this one included).
 */
function addressWithoutWindowState(): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("panels");
  const query = params.toString();
  return window.location.pathname + (query ? `?${query}` : "");
}

/** ⌘ on Apple keyboards, Ctrl elsewhere. */
function modifierKeyLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
    ? "⌘"
    : "Ctrl";
}

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
        height={412}
        // Bottom-right: the corner a page's main action (a header "New …"
        // button, the first toolbar) never sits in; it grows upward.
        position="bottom-right"
        mobileSizeToContent
        // The phone sheet is dismissed by its handle or Cancel — no third ✕.
        mobileHideClose
        // The draft is kept, so Escape closing the window loses nothing.
        closeOnEscape
        urlSyncKey="feedback"
        urlSyncId="default"
        className="feedback-window-panel"
        overlayId="feedbackDialog"
        surfaceLayer={FEEDBACK_SURFACE_NAME}
        // "rich": the compact bar crushed Cancel/Submit to 20px.
        footerVariant="rich"
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
    <span className="px-3 text-xs text-amber-600 dark:text-amber-400 leading-snug">
      Still trying… slow connection. Cancel to keep your text.
    </span>
  );
}

function FeedbackFooterRight({ form }: { form: FeedbackFormState }) {
  const { isSubmitting, description, cancelSubmit, onClose, handleSubmit } =
    form;
  return (
    <div className="matrx-touch-targets flex items-center gap-2 px-3 py-2">
      <Button
        type="button"
        variant="outline"
        onClick={isSubmitting ? cancelSubmit : onClose}
      >
        Cancel
      </Button>
      <Button
        type="button"
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

function useFeedbackForm({ onClose: closeOverlayNow, subject }: { onClose: () => void; subject?: FeedbackSubject }) {
  const pathname = usePathname();
  const draftKey = subject
    ? `feedback:${subject.sourceToken}:${subject.sourceId}`
    : "feedback";
  // The workspace question this window asked, if it is still open: a window
  // that closes withdraws it, so the picker never outlives the window.
  const askingOrgRef = useRef(false);
  const onClose = useCallback(() => {
    if (askingOrgRef.current) withdrawOrganizationRequest();
    closeOverlayNow();
  }, [closeOverlayNow]);
  useEffect(
    () => () => {
      if (askingOrgRef.current) withdrawOrganizationRequest();
    },
    [],
  );
  // What the person SEES: the page's own name (its tab title, before the
  // " — AI Matrx" suffix) and the address bar — never the app-internal route
  // (`/agents` rewrites to `/agents/all`). Re-read on every navigation; the
  // title settles a moment after the route changes.
  const [where, setWhere] = useState<{ page: string; address: string }>({
    page: "",
    address: pathname ?? "",
  });
  useEffect(() => {
    const read = () => {
      const page = document.title.split(/\s+[—|-]\s+/)[0]?.trim() ?? "";
      setWhere({
        page: page && page !== "AI Matrx" ? page : "",
        address: addressWithoutWindowState(),
      });
    };
    read();
    const settle = window.setTimeout(read, 600);
    return () => window.clearTimeout(settle);
  }, [pathname]);
  const reduxUser = useAppSelector(selectUser);
  const isAdmin = useAppSelector(selectIsAdmin);
  // The organization the report is filed in — a Server Action carries no
  // `X-Organization-Id` header, so the selection travels as an argument.
  const selectedOrganizationId = useAppSelector(selectOrganizationId);

  const stashed = draftStash.get(draftKey);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(
    stashed?.feedbackType ?? "bug",
  );
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<AttachmentSlot[]>(
    // A slot caught mid-upload by a close is local again on reopen.
    () =>
      (stashed?.attachments ?? []).map((a) =>
        a.status === "pending" ? { ...a, status: "local" as const } : a,
      ),
  );
  const [restoredExtras] = useState(
    () => !!stashed && (stashed.attachments.length > 0 || stashed.feedbackType !== "bug"),
  );
  // Keep the stash current: type + attachments survive Cancel / close.
  useEffect(() => {
    if (feedbackType === "bug" && attachments.length === 0) draftStash.delete(draftKey);
    else draftStash.set(draftKey, { feedbackType, attachments });
  }, [draftKey, feedbackType, attachments]);
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
  // A failed load is SAID, with a retry — it used to become an empty list,
  // indistinguishable from "no categories exist".
  const [adminOptionsError, setAdminOptionsError] = useState<string | null>(null);
  const [adminOptionsAttempt, setAdminOptionsAttempt] = useState(0);
  const retryAdminOptions = () => setAdminOptionsAttempt((n) => n + 1);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    const load = async (url: string, what: string) => {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${what} could not load (${r.status})`);
      return r.json();
    };
    setIsLoadingAdminOptions(true);
    setAdminOptionsError(null);
    Promise.all([
      load("/api/admin/feedback/categories", "Categories"),
      load("/api/admin/feedback/assignable-admins", "Admins"),
    ])
      .then(([catRes, adminRes]) => {
        if (cancelled) return;
        setCategories(catRes?.categories ?? []);
        setAssignableAdmins(adminRes?.admins ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setAdminOptionsError(err instanceof Error ? err.message : "Could not load");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAdminOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, adminOptionsAttempt]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isMobile = useIsMobile();

  // Typed text survives closing the window (Cancel, the close button, a
  // reload): the shared draft keeper restores it on the next open and says so;
  // only a successful submit forgets it.
  const draft = useTextDraft(draftKey, description, setDescription, true);
  const [restoreNoticeDismissed, setRestoreNoticeDismissed] = useState(false);
  const draftRestored =
    !restoreNoticeDismissed && (draft.restored || restoredExtras);
  const acknowledgeRestore = () => {
    draft.acknowledge();
    setRestoreNoticeDismissed(true);
  };

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

  // ── Attachments — held locally until Submit ──────────────────────────────
  const { upload: handlerUpload } = useFileUpload();
  const openImageAnnotation = useOpenImageAnnotationWindow();

  const { captureTab, captureScreen, isCapturing } = useScreenCapture({
    hideSelectors: [FEEDBACK_CAPTURE_HIDE],
  });

  const addFiles = useCallback((files: FileList | File[] | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setAttachments((prev) => [...prev, ...list.map(localSlot)]);
  }, []);

  const replaceSlot = useCallback((id: string, next: AttachmentSlot) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? next : a)));
  }, []);

  const handleTabCapture = useCallback(async () => {
    try {
      const { file } = await captureTab({
        ignoreSelector: FEEDBACK_CAPTURE_HIDE,
      });
      addFiles([file]);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name !== "NotAllowedError" && name !== "AbortError")
        toast.error("Couldn't capture this tab — try Screen instead.");
    }
  }, [captureTab, addFiles]);

  const handleScreenCapture = useCallback(async () => {
    try {
      const { file } = await captureScreen();
      addFiles([file]);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name !== "NotAllowedError" && name !== "AbortError")
        toast.error("Screen capture failed");
    }
  }, [captureScreen, addFiles]);

  const namePasted = (file: File) => {
    const ext = file.type.split("/")[1] || "png";
    return new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
  };

  // Ctrl/⌘+V anywhere while the window is open.
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      for (const item of Array.from(e.clipboardData?.items ?? [])) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        addFiles([namePasted(file)]);
        break;
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [addFiles]);

  // Files chosen with "Upload" or dropped on the form.
  const handleFilesChosen = addFiles;

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const gone = prev.find((a) => a.id === id);
      if (gone) releaseSlot(gone);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const annotateAttachment = useCallback(
    (slot: AttachmentSlot) => {
      if (slot.status === "pending") return;
      if (slot.status === "local" && !slot.previewUrl) return; // video / PDF
      openImageAnnotation({
        sourceFileId: slot.status === "ready" ? slot.fileId : null,
        sourceUrl: slot.status === "local" ? slot.previewUrl : null,
        sourceFilename: slot.filename ?? null,
        defaultFolder: CloudFolders.FEEDBACK_IMAGES,
        title: "Mark up feedback screenshot",
        overwriteSource: slot.status === "ready",
        onSaved: ({ result }) => {
          releaseSlot(slot);
          replaceSlot(slot.id, {
            status: "ready",
            id: slot.id,
            fileId: result.fileId,
            filename: result.filename,
          });
          toast.success("Feedback screenshot updated");
        },
      });
    },
    [openImageAnnotation, replaceSlot],
  );

  const handlePasteButton = useCallback(async () => {
    try {
      if (!navigator.clipboard?.read) {
        toast.info(`Use ${modifierKeyLabel()}+V to paste an image`);
        return;
      }
      for (const item of await navigator.clipboard.read()) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        addFiles([namePasted(new File([blob], "pasted", { type: imageType }))]);
        return;
      }
      toast.info("No image found in the clipboard");
    } catch {
      toast.warning(`Couldn't read the clipboard — copy an image first, then click Paste or press ${modifierKeyLabel()}+V`);
    }
  }, [addFiles]);

  /**
   * Upload every local attachment under `organizationId` (the report's own),
   * turning each into a `ready` slot. Returns every file id, or throws with
   * the name of the file that failed (the rest stay attached).
   */
  const uploadAttachments = async (organizationId: string): Promise<string[]> => {
    const ids: string[] = [];
    for (const slot of attachments) {
      if (slot.status === "ready") {
        ids.push(slot.fileId);
        continue;
      }
      replaceSlot(slot.id, { ...slot, status: "pending" });
      try {
        const normalized = await handlerUpload(
          { kind: "file", file: slot.file },
          {
            folderPath: CloudFolders.FEEDBACK_IMAGES,
            visibility: "public",
            createShareLink: true,
            shareLinkPermissionLevel: "viewer",
            organizationId,
          },
        );
        releaseSlot(slot);
        replaceSlot(slot.id, {
          status: "ready",
          id: slot.id,
          fileId: normalized.fileId,
          filename: slot.filename,
        });
        ids.push(normalized.fileId);
      } catch (err) {
        replaceSlot(slot.id, { ...slot, status: "local" });
        const reason = err instanceof Error ? err.message : "the upload failed";
        throw new Error(`Couldn't upload ${slot.filename} (${reason}).`);
      }
    }
    return ids;
  };

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
    // submit is HELD: the canonical workspace picker asks — ONCE, here — and
    // the report AND its attachments continue with the pick. Cancelling the
    // pick is "not now": nothing happened, no error.
    let organizationId: string;
    askingOrgRef.current = true;
    try {
      organizationId = await ensureOrganizationForWrite(selectedOrganizationId, {
        interactive: true,
      });
    } catch (err) {
      if (isOrganizationSelectionCancelled(err)) return;
      setError("Choose a workspace to send feedback — your report is still here.");
      return;
    } finally {
      askingOrgRef.current = false;
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

    let imageFileIds: string[];
    try {
      imageFileIds = await uploadAttachments(organizationId);
    } catch (err) {
      setIsSubmitting(false);
      setError(
        `${err instanceof Error ? err.message : "An attachment couldn't upload."} Nothing was sent — your report is still here; try again or remove it.`,
      );
      return;
    }

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
        route: where.address,
        // The organization the person is acting in — a Server Action carries
        // no header, so the selection travels as an argument.
        organization_id: organizationId,
        // A report about a passage carries it twice: readable at the top of the
        // description for whoever triages it, and structured for tools.
        description: subject ? `${describeSubject(subject)}\n\n${description.trim()}` : description.trim(),
        ...(subject ? { metadata: { report_subject: subjectMetadata(subject) } } : {}),
        image_file_ids: imageFileIds.length > 0 ? imageFileIds : undefined,
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
      draftStash.delete(draftKey);
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
              inFeedbackGroup(i.status, "pending"),
            ).length;
            const resolved = items.filter((i) =>
              inFeedbackGroup(i.status, "resolved"),
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
    where.address,
    isSubmitting,
    attachments,
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
        route: where.address,
        content: description,
        attachments: attachments.map((a) =>
          a.status === "ready"
            ? { name: a.filename ?? "file", type: "file", state: "attached", file_id: a.fileId }
            : {
                name: a.filename,
                type: a.file.type || "file",
                state: a.status === "pending" ? "uploading" : "on this device",
              },
        ),
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
      where.address,
      description,
      attachments,
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
      // An agent attaches a file it ALREADY has, by id — staged beside the
      // person's screenshots, filed when they press Submit.
      feedback_attachment: (value: unknown) => {
        if (submittedRef.current)
          throw new Error("This feedback has already been submitted — nothing to attach to.");
        if (isSubmittingRef.current)
          throw new Error("This feedback is being submitted right now — refused.");
        const patch = parseFeedbackAttachment(value);
        setAttachments((prev) =>
          prev.some((a) => a.status === "ready" && a.fileId === patch.fileId)
            ? prev
            : [
                ...prev,
                { status: "ready", id: newSlotId(), fileId: patch.fileId, filename: patch.name },
              ],
        );
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
      toast.error("Couldn't copy — your browser blocked the clipboard. Try again, or open the report from View all and copy it there.");
    }
  }, [submittedItem]);

  const handleReset = useCallback(() => {
    abortedRef.current = false;
    setSubmitted(false);
    setSubmittedItem(null);
    setStats(null);
    setFeedbackType("bug");
    setDescription("");
    setAttachments((prev) => {
      prev.forEach(releaseSlot);
      return [];
    });
    draftStash.delete(draftKey);
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
    where,
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
    adminOptionsError,
    retryAdminOptions,
    // derived
    textareaRef,
    attachTextarea,
    draft,
    draftRestored,
    acknowledgeRestore,
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
    handleFilesChosen,
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
    where,
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
    adminOptionsError,
    retryAdminOptions,
    textareaRef,
    attachTextarea,
    draft,
    draftRestored,
    acknowledgeRestore,
    canCaptureScreen,
    isCapturing,
    getApplicationScope,
    handlePasteButton,
    handleTabCapture,
    handleScreenCapture,
    annotateAttachment,
    removeAttachment,
    handleSubmit,
    handleKeyDown,
    handleCopyForAgent,
    handleReset,
    handleFilesChosen,
  } = form;

  // A new tile is scrolled into view — it used to land under the footer.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  // (Only matters once the window has reached its maximum height — below
  // that the window grows to show it, see the fit effect.)
  useEffect(() => {
    if (attachments.length > 0)
      tilesRef.current?.scrollIntoView({ block: "nearest" });
  }, [attachments.length]);

  // The window FITS its form (capped at the viewport, body scrolls beyond):
  // a restore note or a new row of tiles grows the window instead of pushing
  // the type choice or Screen Capture out of view. A window parked at the
  // bottom stays anchored to the bottom as it grows.
  const dispatch = useAppDispatch();
  const isMobileView = useIsMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const content = contentRef.current;
    if (!content || isMobileView) return undefined;
    const scroller = content.parentElement;
    const root = content.closest<HTMLElement>("[data-window-panel]");
    const id = root?.getAttribute("data-window-id");
    if (!scroller || !root || !id) return undefined;
    const fit = () => {
      if (root.offsetHeight >= window.innerHeight - 1) return; // maximized
      const cs = getComputedStyle(scroller);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const chrome = root.offsetHeight - scroller.clientHeight;
      const TOP_CLEAR = 56;
      const maxHeight = window.innerHeight - TOP_CLEAR - 16;
      const wanted = Math.ceil(chrome + content.offsetHeight + pad);
      const height = Math.min(maxHeight, wanted);
      // Everything fits: nothing may stay scrolled out of view (a new tile's
      // scrollIntoView ran before the window grew and hid the type choice).
      if (wanted <= maxHeight)
        requestAnimationFrame(() => {
          scroller.scrollTop = 0;
        });
      const rect = root.getBoundingClientRect();
      if (Math.abs(rect.height - height) < 2) return;
      const bottom = rect.top + rect.height;
      const anchoredToBottom = bottom > window.innerHeight - 80;
      dispatch(
        updateWindowRect({
          id,
          rect: {
            height,
            ...(anchoredToBottom ? { y: Math.max(TOP_CLEAR, bottom - height) } : {}),
          },
        }),
      );
    };
    const observer = new ResizeObserver(fit);
    observer.observe(content);
    fit();
    return () => observer.disconnect();
  }, [dispatch, isMobileView, submitted]);

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
            <StatPill label="Submitted" value={stats.total} onNavigate={onClose} crossApp={isAdmin} />
            <StatPill label="Pending" value={stats.pending} group="pending" onNavigate={onClose} crossApp={isAdmin} />
            <StatPill label="Resolved" value={stats.resolved} group="resolved" onNavigate={onClose} crossApp={isAdmin} />
          </div>
        )}

        {/* An engineering hand-off, so it lives in the admin lane only (the
            admin seat on a user page is an ordinary person). */}
        {submittedItem && isAdmin && (
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
            <FeedbackListLink href={feedbackListHref()} onClick={onClose} crossApp={isAdmin}>
              <List />
              View all
            </FeedbackListLink>
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
    <div className="matrx-touch-targets flex-1 overflow-auto min-h-0 px-4 py-3">
      <div ref={contentRef} className="space-y-3">
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
              className="gap-1.5 px-2.5 text-xs pointer-coarse:min-h-11 [&_svg]:h-3.5 [&_svg]:w-3.5 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
            >
              <Icon />
              {label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      {/* Where the report is filed from — sent with it. */}
      <p className="text-xs text-muted-foreground">
        Filed from{" "}
        <span className="text-foreground" title={where.address}>
          {where.page || where.address}
        </span>
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
            placeholder={FEEDBACK_TYPE_CHIPS[feedbackType].placeholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
          />
        </EditableContextMenu>
        {draftRestored ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            Your unsent report was restored.
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={acknowledgeRestore}
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
        <p className="text-xs text-muted-foreground pointer-coarse:hidden">
          {modifierKeyLabel()}+Enter to submit · {modifierKeyLabel()}+V to paste
          a screenshot
        </p>
      </div>

      {/* Admin-only: Category + Assignee (admin lane only). */}
      {isAdmin && (
        <Collapsible
          open={adminOptionsOpen}
          onOpenChange={setAdminOptionsOpen}
          className="rounded-lg border border-border"
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-1.5 text-muted-foreground"
            >
              <Settings2 />
              Admin options
              {(categoryId !== "none" || assigneeId !== "none") && (
                <span className="ml-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {(categoryId !== "none" ? 1 : 0) + (assigneeId !== "none" ? 1 : 0)} set
                </span>
              )}
              <ChevronDown
                className={`ml-auto transition-transform ${adminOptionsOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 border-t border-border/60 px-2.5 pb-2.5 pt-2">
            {adminOptionsError ? (
              <p className="flex items-center gap-2 text-xs text-destructive">
                {asClause(adminOptionsError)}.
                <ErrorAlchemyMenu error={adminOptionsError} size="xs" />
                <Button type="button" variant="outline" size="xs" onClick={retryAdminOptions}>
                  Retry
                </Button>
              </p>
            ) : null}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Category
              </label>
              <Select
                value={categoryId}
                onValueChange={setCategoryId}
                disabled={isSubmitting || isLoadingAdminOptions || !!adminOptionsError}
              >
                <SelectTrigger className="h-8 text-xs">
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
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Assign to
              </label>
              <Select
                value={assigneeId}
                onValueChange={setAssigneeId}
                disabled={isSubmitting || isLoadingAdminOptions || !!adminOptionsError}
              >
                <SelectTrigger className="h-8 text-xs">
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
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Attachments — upload, paste, capture, or drop files here. They stay
          on this device until Submit. */}
      <div
        className="space-y-1.5"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          handleFilesChosen(e.dataTransfer.files);
        }}
      >
        <p className="text-xs font-medium text-muted-foreground">
          Attachments <span className="font-normal opacity-60">(optional)</span>
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            handleFilesChosen(e.target.files);
            e.target.value = "";
          }}
        />
        {/* One row of four on desktop, two even rows on a phone. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>button]:min-w-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
          >
            <Upload />
            Upload
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePasteButton}
            disabled={isSubmitting}
          >
            <Clipboard />
            Paste
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTabCapture}
            disabled={isSubmitting || isCapturing}
            title="Capture this tab — the page behind this window"
          >
            <Camera />
            This tab
          </Button>
          {canCaptureScreen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleScreenCapture}
              disabled={isSubmitting || isCapturing}
              title="Capture another window or screen (your browser asks which)"
            >
              <Monitor />
              Screen
            </Button>
          ) : null}
        </div>

        {attachments.some((a) => a.status === "ready" || a.previewUrl) && (
          <p className="text-xs text-muted-foreground">
            <span className="pointer-coarse:hidden">Click</span>
            <span className="hidden pointer-coarse:inline">Tap</span> an image
            to draw, circle, or write on it.
          </p>
        )}
        {attachments.length > 0 && (
          <div ref={tilesRef} className="flex flex-wrap gap-2 pt-1 scroll-mb-3">
            {attachments.map((slot) => (
              <MediaAttachmentThumbnail
                key={slot.id}
                mediaRef={slot.status === "ready" ? slot.fileId : slot.previewUrl}
                status={slot.status === "pending" ? "pending" : "ready"}
                title={slot.filename ?? "Attachment"}
                openLabel={`Mark up ${slot.filename ?? "attachment"}`}
                removeLabel={`Remove ${slot.filename ?? "attachment"}`}
                readyIcon={
                  <PenLine className="h-4 w-4 text-white drop-shadow" />
                }
                onOpen={() => annotateAttachment(slot)}
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
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * The list lives on the user site. In the admin section (manage.aimatrx.com)
 * a client-side Link prefetched it cross-host and the redirect failed CORS
 * three times in the console — there a plain full-page link is the honest
 * door (live, 2026-09-27).
 */
function FeedbackListLink({
  crossApp,
  ...props
}: React.ComponentProps<typeof Link> & { crossApp: boolean }) {
  if (!crossApp) return <Link {...props} />;
  const { href, prefetch: _prefetch, replace: _replace, scroll: _scroll, ...rest } = props;
  return <a {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)} href={String(href)} />;
}

function StatPill({
  label,
  value,
  group,
  onNavigate,
  crossApp,
}: {
  label: string;
  value: number;
  group?: FeedbackCountGroup;
  onNavigate: () => void;
  crossApp: boolean;
}) {
  return (
    <FeedbackListLink
      crossApp={crossApp}
      href={feedbackListHref(group)}
      onClick={onNavigate}
      className="flex flex-col items-center gap-0.5 rounded-md px-2 py-1 hover:bg-accent transition-colors"
    >
      <span className="text-xl font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </FeedbackListLink>
  );
}
