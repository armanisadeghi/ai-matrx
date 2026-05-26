"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  updateFeedback,
  setAdminDecision,
  getFeedbackComments,
  addFeedbackComment,
  getFeedbackById,
  sendUserReviewMessage,
  getUserMessages,
  adminReplyUserReview,
  forceCloseFeedback,
} from "@/actions/feedback.actions";
import { useFileUpload } from "@/features/files";
import { imageViewUrl } from "@/features/files";
import {
  UserFeedback,
  FeedbackStatus,
  FeedbackType,
  FeedbackCategory,
  FeedbackAssignableAdmin,
  FeedbackComment,
  FeedbackUserMessage,
  AdminDecision,
  TestingResult,
  FEEDBACK_STATUS_COLORS,
  ADMIN_STATUS_LABELS,
  ADMIN_DECISION_COLORS,
  ADMIN_DECISION_LABELS,
  CATEGORY_COLORS,
} from "@/types/feedback.types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  Flame,
  Lightbulb,
  HelpCircle,
  Calendar,
  User,
  MapPin,
  MessageSquare,
  Image as ImageIcon,
  Loader2,
  Brain,
  Shield,
  TestTube,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Send,
  FileCode,
  Gauge,
  ArrowRight,
  ExternalLink,
  Clock,
  Webhook,
  UserCircle,
  Copy,
  RotateCcw,
  UserCheck,
  Users,
  AlertTriangle,
  Tag,
  GitBranch,
  Link,
  Unlink,
  CornerDownRight,
  Paperclip,
  X,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { filterAndSortBySearch } from "@/utils/search-scoring";
import { InlineMediaRef } from "@/features/files";

interface FeedbackDetailDialogProps {
  feedback: UserFeedback;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  initialTab?: string;
}

const feedbackTypeIcons: Record<FeedbackType, React.ReactNode> = {
  bug: <AlertCircle className="w-5 h-5 text-red-500" />,
  feature: <Flame className="w-5 h-5 text-purple-500" />,
  suggestion: <Lightbulb className="w-5 h-5 text-yellow-500" />,
  other: <HelpCircle className="w-5 h-5 text-gray-500" />,
};

const feedbackTypeLabels: Record<FeedbackType, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  suggestion: "Suggestion",
  other: "Other",
};

const authorTypeConfig: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  admin: {
    icon: <Shield className="w-3.5 h-3.5" />,
    label: "Admin",
    color: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
  },
  ai_agent: {
    icon: <Webhook className="w-3.5 h-3.5" />,
    label: "AI Agent",
    color: "text-purple-600 dark:text-purple-400 bg-purple-500/10",
  },
  user: {
    icon: <UserCircle className="w-3.5 h-3.5" />,
    label: "User",
    color: "text-gray-600 dark:text-gray-400 bg-gray-500/10",
  },
};

const complexityConfig: Record<string, { label: string; color: string }> = {
  simple: {
    label: "Simple",
    color: "bg-green-500/15 text-green-700 dark:text-green-400",
  },
  moderate: {
    label: "Moderate",
    color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  },
  complex: {
    label: "Complex",
    color: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
};

export default function FeedbackDetailDialog({
  feedback,
  open,
  onOpenChange,
  onUpdate,
  initialTab,
}: FeedbackDetailDialogProps) {
  // Live local copy of the feedback item — updated from server responses
  const [item, setItem] = useState<UserFeedback>(feedback);

  const [activeTab, setActiveTab] = useState(initialTab || "submission");
  const [isSaving, setIsSaving] = useState(false);

  // Admin decision form state (editable fields)
  const [decision, setDecision] = useState<AdminDecision>(
    feedback.admin_decision || "pending",
  );
  const [direction, setDirection] = useState(feedback.admin_direction || "");
  const [workPriority, setWorkPriority] = useState<string>(
    feedback.work_priority !== null ? String(feedback.work_priority) : "",
  );
  const [adminNotes, setAdminNotes] = useState(feedback.admin_notes || "");
  const [formStatus, setFormStatus] = useState<FeedbackStatus>(feedback.status);
  const [hasOpenIssues, setHasOpenIssues] = useState(
    feedback.has_open_issues ?? false,
  );
  const [categoryId, setCategoryId] = useState<string>(
    feedback.category_id ?? "none",
  );
  const [categories, setCategories] = useState<FeedbackCategory[]>([]);
  const [assigneeId, setAssigneeId] = useState<string>(
    feedback.assigned_to ?? "none",
  );
  const [assignableAdmins, setAssignableAdmins] = useState<
    FeedbackAssignableAdmin[]
  >([]);

  // Parent/child relationship state
  const [parentId, setParentId] = useState<string>(
    feedback.parent_id ?? "none",
  );
  const [allFeedbackItems, setAllFeedbackItems] = useState<
    Pick<UserFeedback, "id" | "description" | "feedback_type" | "status">[]
  >([]);
  const [parentSearchQuery, setParentSearchQuery] = useState("");
  const [showParentPicker, setShowParentPicker] = useState(false);

  // Comments state
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isSendingComment, setIsSendingComment] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Testing feedback state — shown after clicking Fail/Partial
  const [pendingTestResult, setPendingTestResult] = useState<
    "fail" | "partial" | null
  >(null);
  const [testFeedbackText, setTestFeedbackText] = useState("");
  const [isSendingTestFeedback, setIsSendingTestFeedback] = useState(false);

  // User review state
  const [showUserReviewCompose, setShowUserReviewCompose] = useState(false);
  const [userReviewMessage, setUserReviewMessage] = useState("");
  const [isSendingUserReview, setIsSendingUserReview] = useState(false);
  const [userMessages, setUserMessages] = useState<FeedbackUserMessage[]>([]);
  const [isLoadingUserMessages, setIsLoadingUserMessages] = useState(false);
  const [userReplyText, setUserReplyText] = useState("");
  const [isSendingUserReply, setIsSendingUserReply] = useState(false);
  const userMessagesEndRef = useRef<HTMLDivElement>(null);

  // Image attachment state for message inputs
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [composeImages, setComposeImages] = useState<string[]>([]);
  const [isUploadingReply, setIsUploadingReply] = useState(false);
  const [isUploadingCompose, setIsUploadingCompose] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const composeTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { upload: uploadFile } = useFileUpload();
  const uploadFeedbackImage = useCallback(
    async (file: File): Promise<{ url?: string }> => {
      const normalized = await uploadFile(
        { kind: "file", file },
        {
          folderPath: "Shared Assets/feedback-images",
          visibility: "public",
          createShareLink: true,
          shareLinkPermissionLevel: "read",
        },
      );
      return { url: normalized.url };
    },
    [uploadFile],
  );

  // Paste-to-upload handler — call with setter and loading setter
  const handleImagePaste = useCallback(
    async (
      e: ClipboardEvent,
      setImages: React.Dispatch<React.SetStateAction<string[]>>,
      setUploading: React.Dispatch<React.SetStateAction<boolean>>,
    ) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const ext = item.type.split("/")[1] || "png";
          const namedFile = new File([file], `msg-image-${Date.now()}.${ext}`, {
            type: item.type,
          });
          setUploading(true);
          try {
            const result = await uploadFeedbackImage(namedFile);
            if (result.url) {
              setImages((prev) => [...prev, result.url!]);
              toast.success("Image attached");
            } else {
              toast.error("Couldn't upload image: no URL returned");
            }
          } catch (err) {
            const reason = err instanceof Error ? err.message : "Upload failed";
            toast.error(`Couldn't upload image: ${reason}`);
          } finally {
            setUploading(false);
          }
        }
      }
    },
    [uploadFeedbackImage],
  );

  // Attach paste listeners to both textareas when they mount
  useEffect(() => {
    const el = replyTextareaRef.current;
    if (!el) return;
    const handler = (e: ClipboardEvent) =>
      handleImagePaste(e, setReplyImages, setIsUploadingReply);
    el.addEventListener("paste", handler);
    return () => el.removeEventListener("paste", handler);
  }, [handleImagePaste]);

  useEffect(() => {
    const el = composeTextareaRef.current;
    if (!el || !showUserReviewCompose) return;
    const handler = (e: ClipboardEvent) =>
      handleImagePaste(e, setComposeImages, setIsUploadingCompose);
    el.addEventListener("paste", handler);
    return () => el.removeEventListener("paste", handler);
  }, [handleImagePaste, showUserReviewCompose]);

  // File-picker upload helper
  const pickAndUploadImages = useCallback(
    async (
      setImages: React.Dispatch<React.SetStateAction<string[]>>,
      setUploading: React.Dispatch<React.SetStateAction<boolean>>,
    ) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = async () => {
        const files = Array.from(input.files ?? []);
        if (!files.length) return;
        setUploading(true);
        let attached = 0;
        let firstError: string | null = null;
        try {
          for (const file of files) {
            try {
              const result = await uploadFeedbackImage(file);
              if (result.url) {
                setImages((prev) => [...prev, result.url!]);
                attached += 1;
              }
            } catch (err) {
              if (!firstError) {
                firstError =
                  err instanceof Error ? err.message : "Upload failed";
              }
            }
          }
          if (attached > 0) {
            toast.success(
              `${attached} image${attached > 1 ? "s" : ""} attached`,
            );
          }
          if (firstError) {
            toast.error(`Some images failed: ${firstError}`);
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : "Upload failed";
          toast.error(`Couldn't upload image(s): ${reason}`);
        } finally {
          setUploading(false);
        }
      };
      input.click();
    },
    [uploadFeedbackImage],
  );

  /** Apply fresh server data to both the live item and all form fields */
  const applyFreshData = useCallback((fresh: UserFeedback) => {
    setItem(fresh);
    setDecision(fresh.admin_decision || "pending");
    setDirection(fresh.admin_direction || "");
    setWorkPriority(
      fresh.work_priority !== null ? String(fresh.work_priority) : "",
    );
    setAdminNotes(fresh.admin_notes || "");
    setFormStatus(fresh.status);
    setHasOpenIssues(fresh.has_open_issues ?? false);
    setCategoryId(fresh.category_id ?? "none");
    setAssigneeId(fresh.assigned_to ?? "none");
    setParentId(fresh.parent_id ?? "none");
  }, []);

  /** Re-fetch the item from the server and update local state */
  const refreshItem = useCallback(async () => {
    const result = await getFeedbackById(item.id);
    if (result.success && result.data) {
      applyFreshData(result.data);
    }
  }, [item.id, applyFreshData]);

  /** Copy all feedback data to clipboard as structured markdown */
  const handleCopyAll = useCallback(async () => {
    const sections: string[] = [];

    sections.push(`# Feedback: ${feedbackTypeLabels[item.feedback_type]}`);
    sections.push("");

    // Metadata
    sections.push("## Metadata");
    sections.push(`- **ID:** ${item.id}`);
    sections.push(`- **Type:** ${feedbackTypeLabels[item.feedback_type]}`);
    sections.push(`- **Status:** ${item.status}`);
    sections.push(`- **Priority:** ${item.priority}`);
    sections.push(`- **Route:** ${item.route}`);
    sections.push(`- **User:** ${item.username || "Anonymous"}`);
    sections.push(
      `- **Created:** ${format(new Date(item.created_at), "PPpp")}`,
    );
    sections.push(
      `- **Updated:** ${format(new Date(item.updated_at), "PPpp")}`,
    );
    if (item.admin_decision !== "pending")
      sections.push(`- **Admin Decision:** ${item.admin_decision}`);
    if (item.work_priority !== null)
      sections.push(`- **Work Priority:** #${item.work_priority}`);
    if (item.has_open_issues) sections.push(`- **Open Issues:** Yes`);
    if (item.parent_id) sections.push(`- **Parent ID:** ${item.parent_id}`);
    sections.push("");

    // Description
    sections.push("## Description");
    sections.push(item.description);
    sections.push("");

    // AI Analysis
    if (item.ai_assessment || item.ai_solution_proposal) {
      sections.push("## AI Analysis");
      if (item.ai_assessment) {
        sections.push("### Assessment");
        sections.push(item.ai_assessment);
      }
      if (item.ai_solution_proposal) {
        sections.push("### Solution Proposal");
        sections.push(item.ai_solution_proposal);
      }
      if (item.ai_suggested_priority)
        sections.push(
          `- **Suggested Priority:** ${item.ai_suggested_priority}`,
        );
      if (item.ai_complexity)
        sections.push(`- **Complexity:** ${item.ai_complexity}`);
      if (item.autonomy_score !== null)
        sections.push(`- **Autonomy Score:** ${item.autonomy_score}/5`);
      if (item.ai_estimated_files?.length) {
        sections.push("### Estimated Files");
        item.ai_estimated_files.forEach((f) => sections.push(`- ${f}`));
      }
      sections.push("");
    }

    // Admin Direction / Notes
    if (item.admin_direction || item.admin_notes) {
      sections.push("## Admin Input");
      if (item.admin_direction) {
        sections.push("### Direction");
        sections.push(item.admin_direction);
      }
      if (item.admin_notes) {
        sections.push("### Notes");
        sections.push(item.admin_notes);
      }
      sections.push("");
    }

    // Testing
    if (
      item.testing_instructions ||
      item.testing_url ||
      item.resolution_notes
    ) {
      sections.push("## Testing");
      if (item.resolution_notes) {
        sections.push("### Resolution Notes");
        sections.push(item.resolution_notes);
      }
      if (item.testing_instructions) {
        sections.push("### Testing Instructions");
        sections.push(item.testing_instructions);
      }
      if (item.testing_url)
        sections.push(`- **Testing URL:** ${item.testing_url}`);
      if (item.testing_result)
        sections.push(`- **Testing Result:** ${item.testing_result}`);
      sections.push("");
    }

    // Comments
    if (comments.length > 0) {
      sections.push("## Comments");
      comments.forEach((c) => {
        const time = format(new Date(c.created_at), "PPpp");
        sections.push(`### ${c.author_name} (${c.author_type}) — ${time}`);
        sections.push(c.content);
        sections.push("");
      });
    }

    // Screenshots
    if (item.image_urls?.length) {
      sections.push("## Screenshots");
      item.image_urls.forEach((url, i) =>
        sections.push(`- Screenshot ${i + 1}: ${url}`),
      );
      sections.push("");
    }

    const text = sections.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Full feedback data copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [item, comments]);

  const loadComments = useCallback(async () => {
    setIsLoadingComments(true);
    try {
      const result = await getFeedbackComments(item.id);
      if (result.success && result.data) {
        setComments(result.data);
      }
    } catch (error) {
      console.error("Error loading comments:", error);
    } finally {
      setIsLoadingComments(false);
    }
  }, [item.id]);

  const loadUserMessages = useCallback(async () => {
    setIsLoadingUserMessages(true);
    try {
      const result = await getUserMessages(item.id);
      if (result.success && result.data) {
        setUserMessages(result.data);
      }
    } catch (error) {
      console.error("Error loading user messages:", error);
    } finally {
      setIsLoadingUserMessages(false);
    }
  }, [item.id]);

  // Sync data from prop when the parent provides fresher data (same or different item)
  useEffect(() => {
    setItem(feedback);
    setDecision(feedback.admin_decision || "pending");
    setDirection(feedback.admin_direction || "");
    setWorkPriority(
      feedback.work_priority !== null ? String(feedback.work_priority) : "",
    );
    setAdminNotes(feedback.admin_notes || "");
    setFormStatus(feedback.status);
    setHasOpenIssues(feedback.has_open_issues ?? false);
    setCategoryId(feedback.category_id ?? "none");
    setAssigneeId(feedback.assigned_to ?? "none");
  }, [feedback.id, feedback.updated_at]); // Re-sync on different item OR fresher data from parent

  // Load categories, assignable admins, and parent-picker list when dialog opens
  useEffect(() => {
    if (open && categories.length === 0) {
      fetch("/api/admin/feedback/categories")
        .then((r) => r.json())
        .then((d) => setCategories(d.categories ?? []))
        .catch(() => {});
    }
    if (open && assignableAdmins.length === 0) {
      fetch("/api/admin/feedback/assignable-admins")
        .then((r) => r.json())
        .then((d) => setAssignableAdmins(d.admins ?? []))
        .catch(() => {});
    }
    if (open && allFeedbackItems.length === 0) {
      // Load light list of all feedback items for parent picker
      fetch("/api/admin/feedback/list-lite")
        .then((r) => r.json())
        .then((d) => setAllFeedbackItems(d.items ?? []))
        .catch(() => {});
    }
  }, [
    open,
    categories.length,
    assignableAdmins.length,
    allFeedbackItems.length,
  ]);

  // Reset UI interaction state only when a completely different item is opened
  useEffect(() => {
    setActiveTab(initialTab || "submission");
    setComments([]);
    setNewComment("");
    setPendingTestResult(null);
    setTestFeedbackText("");
    setShowUserReviewCompose(false);
    setUserReviewMessage("");
    setUserMessages([]);
    setUserReplyText("");
  }, [feedback.id, initialTab]);

  // Fetch comments when comments tab is selected
  useEffect(() => {
    if (open && activeTab === "comments") {
      loadComments();
    }
  }, [open, activeTab, loadComments]);

  // Fetch user messages when user-messages tab is selected
  useEffect(() => {
    if (open && activeTab === "user-messages") {
      loadUserMessages();
    }
  }, [open, activeTab, loadUserMessages]);

  // Auto-scroll comments
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  // Auto-scroll user messages
  useEffect(() => {
    userMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [userMessages]);

  const handleSaveDecision = async () => {
    setIsSaving(true);
    try {
      // Save admin decision via RPC
      const decisionResult = await setAdminDecision(
        item.id,
        decision,
        direction || undefined,
        workPriority ? parseInt(workPriority, 10) : undefined,
      );

      if (!decisionResult.success) {
        toast.error(`Failed to save decision: ${decisionResult.error}`);
        setIsSaving(false);
        return;
      }

      // Save additional fields via updateFeedback
      const updates: Record<string, unknown> = {};
      if (adminNotes !== (item.admin_notes || "")) {
        updates.admin_notes = adminNotes;
      }
      if (formStatus !== item.status) {
        updates.status = formStatus;
      }
      if (hasOpenIssues !== (item.has_open_issues ?? false)) {
        updates.has_open_issues = hasOpenIssues;
      }
      const newCategoryId = categoryId === "none" ? null : categoryId;
      if (newCategoryId !== (item.category_id ?? null)) {
        updates.category_id = newCategoryId;
      }
      const newAssigneeId = assigneeId === "none" ? null : assigneeId;
      if (newAssigneeId !== (item.assigned_to ?? null)) {
        updates.assigned_to = newAssigneeId;
      }
      const newParentId = parentId === "none" ? null : parentId;
      if (newParentId !== (item.parent_id ?? null)) {
        updates.parent_id = newParentId;
      }

      if (Object.keys(updates).length > 0) {
        const terminalStatuses = ["closed", "resolved", "wont_fix"];
        const isTerminalTransition =
          updates.status &&
          terminalStatuses.includes(updates.status as string) &&
          !terminalStatuses.includes(item.status);

        let updateResult;
        if (isTerminalTransition) {
          // Bypasses the testing_result trigger — admin force close
          updateResult = await forceCloseFeedback(
            item.id,
            updates.status as "closed" | "resolved" | "wont_fix",
          );
          // Apply any remaining non-status updates separately
          const { status: _s, ...remainingUpdates } = updates;
          if (Object.keys(remainingUpdates).length > 0) {
            await updateFeedback(item.id, remainingUpdates);
          }
        } else {
          updateResult = await updateFeedback(item.id, updates);
        }

        if (!updateResult.success) {
          toast.error(`Failed to save updates: ${updateResult.error}`);
          setIsSaving(false);
          return;
        }
      }

      // Always re-fetch to ensure modal shows true server state
      await refreshItem();
      toast.success("Changes saved successfully");
      onUpdate(); // Refresh parent table in background
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("An error occurred while saving");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    setIsSendingComment(true);
    try {
      const result = await addFeedbackComment(
        item.id,
        "admin",
        newComment.trim(),
      );
      if (result.success) {
        setNewComment("");
        await loadComments();
      } else {
        toast.error(`Failed to send comment: ${result.error}`);
      }
    } catch (error) {
      console.error("Error sending comment:", error);
      toast.error("Failed to send comment");
    } finally {
      setIsSendingComment(false);
    }
  };

  const handleTestingResult = async (result: TestingResult) => {
    if (result === "pass") {
      // Pass: save immediately and resolve
      setIsSaving(true);
      try {
        const updateResult = await updateFeedback(item.id, {
          testing_result: "pass",
          status: "resolved" as FeedbackStatus,
          admin_notes: `${adminNotes ? adminNotes + "\n" : ""}Testing passed - verified.`,
        });
        if (updateResult.success) {
          await refreshItem();
          toast.success("Marked as passed — verified");
          onUpdate();
        } else {
          toast.error(`Failed to save: ${updateResult.error}`);
        }
      } catch (error) {
        console.error("Error saving testing result:", error);
        toast.error("Failed to save testing result");
      } finally {
        setIsSaving(false);
      }
    } else {
      // Fail/Partial: save the status change immediately, then show feedback textarea
      setIsSaving(true);
      try {
        const label = result === "fail" ? "FAILED" : "PARTIAL";
        const updateResult = await updateFeedback(item.id, {
          testing_result: result,
          status: "in_progress" as FeedbackStatus,
          admin_notes: `${adminNotes ? adminNotes + "\n" : ""}Testing ${label} - sent back to agent.`,
          resolved_at: null,
          resolved_by: null,
        });
        if (updateResult.success) {
          await refreshItem();
          setPendingTestResult(result as "fail" | "partial");
          setTestFeedbackText("");
          toast.success(
            result === "fail"
              ? "Marked as failed — provide feedback below"
              : "Marked as partial — provide feedback below",
          );
          onUpdate();
        } else {
          toast.error(`Failed to save: ${updateResult.error}`);
        }
      } catch (error) {
        console.error("Error saving testing result:", error);
        toast.error("Failed to save testing result");
      } finally {
        setIsSaving(false);
      }
    }
  };

  /** Send the structured test feedback comment to the agent */
  const handleSendTestFeedback = async () => {
    if (!testFeedbackText.trim() || !pendingTestResult) return;
    setIsSendingTestFeedback(true);
    try {
      const header =
        pendingTestResult === "fail"
          ? "⛔ TEST FAILED — REQUIRES AGENT FIXES"
          : "⚠️ TEST PARTIAL — REMAINING ISSUES";

      const structuredComment = `${header}\n\n${testFeedbackText.trim()}\n\n---\nThe item has been sent back to your work queue (status: in_progress). Read the above carefully, fix the issues, and re-submit with resolve_with_testing().`;

      const result = await addFeedbackComment(
        item.id,
        "admin",
        structuredComment,
      );
      if (result.success) {
        toast.success("Feedback sent to agent");
        setPendingTestResult(null);
        setTestFeedbackText("");
      } else {
        toast.error(`Failed to send feedback: ${result.error}`);
      }
    } catch (error) {
      console.error("Error sending test feedback:", error);
      toast.error("Failed to send feedback");
    } finally {
      setIsSendingTestFeedback(false);
    }
  };

  /** Start user review flow — pre-fill with resolution notes */
  const handleStartUserReview = () => {
    setShowUserReviewCompose(true);
    setUserReviewMessage(item.resolution_notes || "");
  };

  /** Send the user review message */
  const handleSendUserReview = async () => {
    if (!userReviewMessage.trim()) return;
    setIsSendingUserReview(true);
    try {
      const result = await sendUserReviewMessage(
        item.id,
        userReviewMessage.trim(),
        undefined,
        composeImages.length > 0 ? composeImages : undefined,
      );
      if (result.success && result.data) {
        // Send email notification
        try {
          await fetch("/api/feedback/user-review-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              feedback_id: item.id,
              message_id: result.data.id,
              message_content: userReviewMessage.trim(),
              sender_type: "admin",
              sender_name: "Admin",
            }),
          });
        } catch (emailError) {
          console.error("Failed to send email notification:", emailError);
        }

        await refreshItem();
        toast.success("Sent to user for review — email notification sent");
        setShowUserReviewCompose(false);
        setUserReviewMessage("");
        setComposeImages([]);
        onUpdate();
      } else {
        toast.error(`Failed to send: ${result.error}`);
      }
    } catch (error) {
      console.error("Error sending user review:", error);
      toast.error("Failed to send user review message");
    } finally {
      setIsSendingUserReview(false);
    }
  };

  /** Admin replies in user messages thread */
  const handleAdminReplyUserMessage = async () => {
    if (!userReplyText.trim() && replyImages.length === 0) return;
    setIsSendingUserReply(true);
    try {
      const result = await adminReplyUserReview(
        item.id,
        userReplyText.trim(),
        undefined,
        replyImages.length > 0 ? replyImages : undefined,
      );
      if (result.success && result.data) {
        // Send email notification to user
        try {
          await fetch("/api/feedback/user-review-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              feedback_id: item.id,
              message_id: result.data.id,
              message_content: userReplyText.trim(),
              sender_type: "admin",
              sender_name: "Admin",
            }),
          });
        } catch (emailError) {
          console.error("Failed to send email notification:", emailError);
        }

        setUserReplyText("");
        setReplyImages([]);
        await loadUserMessages();
        await refreshItem();
        toast.success("Reply sent to user");
        onUpdate();
      } else {
        toast.error(`Failed to send: ${result.error}`);
      }
    } catch (error) {
      console.error("Error sending admin reply:", error);
      toast.error("Failed to send reply");
    } finally {
      setIsSendingUserReply(false);
    }
  };

  const statusColors = FEEDBACK_STATUS_COLORS[item.status];
  const hasAiAnalysis = !!(
    item.ai_solution_proposal ||
    item.ai_assessment ||
    item.ai_complexity
  );
  const hasTesting = !!(
    item.testing_instructions ||
    item.testing_url ||
    item.resolution_notes
  );
  const isResolved = ["resolved", "awaiting_review", "closed"].includes(
    item.status,
  );
  const isUserReview = item.status === "user_review";
  const hasUserReviewHistory = isUserReview || userMessages.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {feedbackTypeIcons[item.feedback_type]}
              <div className="flex-1">
                <DialogTitle className="flex items-center gap-2">
                  {feedbackTypeLabels[item.feedback_type]}
                  <Badge
                    className={`${statusColors.bg} ${statusColors.text} border-0 text-xs ml-2`}
                  >
                    {ADMIN_STATUS_LABELS[item.status]}
                  </Badge>
                  {item.admin_decision !== "pending" && (
                    <Badge
                      className={`${ADMIN_DECISION_COLORS[item.admin_decision].bg} ${ADMIN_DECISION_COLORS[item.admin_decision].text} border-0 text-xs`}
                    >
                      {ADMIN_DECISION_LABELS[item.admin_decision]}
                    </Badge>
                  )}
                  {item.has_open_issues && (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0 text-xs gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Open Issues
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  <span className="flex items-center gap-4 text-xs">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(item.id);
                        toast.success("ID copied to clipboard");
                      }}
                      className="flex items-center gap-1 font-mono text-muted-foreground hover:text-foreground transition-colors"
                      title={`Click to copy: ${item.id}`}
                    >
                      <Copy className="w-3 h-3" />
                      {item.id.slice(0, 8)}
                    </button>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {item.username || "Anonymous"}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {item.route}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDistanceToNow(new Date(item.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                    {item.work_priority !== null && (
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        Priority #{item.work_priority}
                      </span>
                    )}
                    {item.category_id &&
                      (() => {
                        const cat = categories.find(
                          (c) => c.id === item.category_id,
                        );
                        if (!cat) return null;
                        const colors =
                          CATEGORY_COLORS[
                            cat.color as keyof typeof CATEGORY_COLORS
                          ] ?? CATEGORY_COLORS.gray;
                        return (
                          <span
                            className={cn(
                              "flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium",
                              colors.bg,
                              colors.text,
                              colors.border,
                            )}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                colors.bg,
                                "border",
                                colors.border,
                              )}
                            />
                            {cat.name}
                          </span>
                        );
                      })()}
                  </span>
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAll}
                className="flex-shrink-0 gap-1.5 text-xs self-start mr-6"
                title="Copy all feedback data to clipboard"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy All
              </Button>
            </div>
          </DialogHeader>
        </div>

        {/* Tabbed Content */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <div className="px-6 pt-2 flex-shrink-0">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="submission" className="gap-1.5 text-xs">
                <MessageSquare className="w-3.5 h-3.5" />
                Submission
              </TabsTrigger>
              <TabsTrigger
                value="analysis"
                className="gap-1.5 text-xs"
                disabled={!hasAiAnalysis}
              >
                <Brain className="w-3.5 h-3.5" />
                AI Analysis
                {hasAiAnalysis && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 ml-1" />
                )}
              </TabsTrigger>
              <TabsTrigger value="decision" className="gap-1.5 text-xs">
                <Shield className="w-3.5 h-3.5" />
                Decision
              </TabsTrigger>
              <TabsTrigger value="comments" className="gap-1.5 text-xs">
                <MessageSquare className="w-3.5 h-3.5" />
                Comments
              </TabsTrigger>
              <TabsTrigger
                value="testing"
                className="gap-1.5 text-xs"
                disabled={!hasTesting && !isResolved}
              >
                <TestTube className="w-3.5 h-3.5" />
                Testing
                {hasTesting && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1" />
                )}
              </TabsTrigger>
              <TabsTrigger value="user-messages" className="gap-1.5 text-xs">
                <Users className="w-3.5 h-3.5" />
                User Messages
                {isUserReview && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 ml-1" />
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-6 py-4">
              {/* SECTION 1: User Submission */}
              <TabsContent value="submission" className="mt-0 space-y-4">
                {/* Description */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                    Description
                  </label>
                  <div className="p-3 rounded-lg bg-muted/50 border text-sm whitespace-pre-wrap">
                    {item.description}
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="text-xs text-muted-foreground mb-1">
                      Type
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {feedbackTypeIcons[item.feedback_type]}
                      {feedbackTypeLabels[item.feedback_type]}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="text-xs text-muted-foreground mb-1">
                      Priority
                    </div>
                    <div className="text-sm font-medium capitalize">
                      {item.priority}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="text-xs text-muted-foreground mb-1">
                      Route
                    </div>
                    <div className="text-sm font-medium font-mono">
                      {item.route}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="text-xs text-muted-foreground mb-1">
                      Submitted
                    </div>
                    <div className="text-sm font-medium">
                      {format(new Date(item.created_at), "MMM d, yyyy h:mm a")}
                    </div>
                  </div>
                </div>

                {/* Screenshots */}
                {item.image_urls && item.image_urls.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Screenshots ({item.image_urls.length})
                    </label>
                    {
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {item.image_urls.map((url, index) => {
                          // <img src> renders bytes inline regardless of
                          // Content-Disposition; the click target swaps to
                          // the FE landing page so admins land on a viewer
                          // (preview + download button + Open-in-app),
                          // not on raw bytes that some browsers/CDNs
                          // attachment-force.
                          const viewHref = imageViewUrl(url);
                          return (
                            <a
                              key={index}
                              href={viewHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative aspect-video rounded-lg overflow-hidden border border-border hover:border-primary transition-colors group"
                            >
                              <InlineMediaRef
                                ref={url}
                                size="fill"
                                fit="cover"
                                rounded="none"
                                fallback={null}
                                className="absolute inset-0 group-hover:scale-105 transition-transform"
                                alt={`Screenshot ${index + 1}`}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    }
                  </div>
                )}

                {/* Resolution Notes (if resolved) */}
                {item.resolution_notes && (
                  <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                    <div className="text-xs font-medium text-green-700 dark:text-green-400 mb-1.5 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Resolution Notes
                    </div>
                    <div className="text-sm whitespace-pre-wrap">
                      {item.resolution_notes}
                    </div>
                    {item.resolved_at && (
                      <div className="text-xs text-muted-foreground mt-2">
                        Resolved{" "}
                        {formatDistanceToNow(new Date(item.resolved_at), {
                          addSuffix: true,
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Related Items */}
                {item.parent_id ? (
                  <div className="p-3 rounded-lg bg-muted/30 border">
                    <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-primary" />
                      Related Items
                    </div>
                    {item.parent_id && (
                      <div className="mb-2">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                          Parent
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const parent = allFeedbackItems.find(
                              (f) => f.id === item.parent_id,
                            );
                            if (parent)
                              toast.info(
                                `Parent: ${parent.id.slice(0, 8)} — ${parent.description.slice(0, 60)}`,
                              );
                            navigator.clipboard.writeText(item.parent_id!);
                            toast.success("Parent ID copied");
                          }}
                          className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors w-full text-left"
                        >
                          <CornerDownRight className="w-3 h-3 text-primary flex-shrink-0 rotate-180" />
                          <span className="font-mono text-primary">
                            {item.parent_id.slice(0, 8)}
                          </span>
                          {(() => {
                            const parent = allFeedbackItems.find(
                              (f) => f.id === item.parent_id,
                            );
                            return parent ? (
                              <span className="text-muted-foreground truncate">
                                {parent.description.slice(0, 60)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">
                                Loading...
                              </span>
                            );
                          })()}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </TabsContent>

              {/* SECTION 2: AI Analysis */}
              <TabsContent value="analysis" className="mt-0 space-y-4">
                {hasAiAnalysis ? (
                  <>
                    {/* AI Assessment */}
                    {item.ai_assessment && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                          AI Assessment
                        </label>
                        <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20 text-sm whitespace-pre-wrap">
                          {item.ai_assessment}
                        </div>
                      </div>
                    )}

                    {/* Solution Proposal */}
                    {item.ai_solution_proposal && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                          Solution Proposal
                        </label>
                        <div className="p-3 rounded-lg bg-muted/50 border text-sm whitespace-pre-wrap">
                          {item.ai_solution_proposal}
                        </div>
                      </div>
                    )}

                    {/* Analysis Metadata Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {item.ai_suggested_priority && (
                        <div className="p-3 rounded-lg bg-muted/50 border">
                          <div className="text-xs text-muted-foreground mb-1">
                            Suggested Priority
                          </div>
                          <div className="text-sm font-medium capitalize">
                            {item.ai_suggested_priority}
                          </div>
                        </div>
                      )}
                      {item.ai_complexity && (
                        <div className="p-3 rounded-lg bg-muted/50 border">
                          <div className="text-xs text-muted-foreground mb-1">
                            Complexity
                          </div>
                          <Badge
                            className={`${complexityConfig[item.ai_complexity]?.color || ""} border-0`}
                          >
                            {complexityConfig[item.ai_complexity]?.label ||
                              item.ai_complexity}
                          </Badge>
                        </div>
                      )}
                      {item.autonomy_score !== null && (
                        <div className="p-3 rounded-lg bg-muted/50 border">
                          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <Gauge className="w-3 h-3" />
                            Autonomy Score
                          </div>
                          <div className="text-sm font-medium">
                            {item.autonomy_score} / 5
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Estimated Files */}
                    {item.ai_estimated_files &&
                      item.ai_estimated_files.length > 0 && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            <FileCode className="w-4 h-4" />
                            Estimated Files to Change (
                            {item.ai_estimated_files.length})
                          </label>
                          <div className="space-y-1">
                            {item.ai_estimated_files.map((file, index) => (
                              <div
                                key={index}
                                className="px-3 py-1.5 rounded bg-muted/50 border text-xs font-mono"
                              >
                                {file}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Brain className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">No AI analysis yet</p>
                    <p className="text-xs mt-1">
                      The agent will populate this after triage
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* SECTION 3: Admin Decision */}
              <TabsContent value="decision" className="mt-0 space-y-4">
                {/* Status */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Status
                  </label>
                  <Select
                    value={formStatus}
                    onValueChange={(value) =>
                      setFormStatus(value as FeedbackStatus)
                    }
                  >
                    <SelectTrigger>
                      <Badge
                        className={`${FEEDBACK_STATUS_COLORS[formStatus]?.bg || ""} ${FEEDBACK_STATUS_COLORS[formStatus]?.text || ""} border-0`}
                      >
                        {ADMIN_STATUS_LABELS[formStatus] || formStatus}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ADMIN_STATUS_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Decision */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Decision
                  </label>
                  <Select
                    value={decision}
                    onValueChange={(value) =>
                      setDecision(value as AdminDecision)
                    }
                  >
                    <SelectTrigger>
                      <Badge
                        className={`${ADMIN_DECISION_COLORS[decision]?.bg || ""} ${ADMIN_DECISION_COLORS[decision]?.text || ""} border-0`}
                      >
                        {ADMIN_DECISION_LABELS[decision] || decision}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ADMIN_DECISION_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Work Priority */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Work Priority
                  </label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 1 (highest priority)"
                    value={workPriority}
                    onChange={(e) => setWorkPriority(e.target.value)}
                    className="w-40"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Lower number = higher priority. Agent works through these in
                    order.
                  </p>
                </div>

                {/* Admin Direction */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Direction for Agent
                  </label>
                  <Textarea
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                    placeholder="Specific instructions for the AI agent before it starts working on this..."
                    className="min-h-[80px]"
                  />
                </div>

                {/* Admin Notes */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Admin Notes
                  </label>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Internal notes about this feedback..."
                    className="min-h-[80px]"
                  />
                </div>

                {/* Open Issues Flag */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setHasOpenIssues(!hasOpenIssues)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setHasOpenIssues(!hasOpenIssues);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    hasOpenIssues
                      ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15"
                      : "bg-muted/30 border-border hover:bg-muted/50",
                  )}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
                      hasOpenIssues
                        ? "bg-amber-500 border-amber-500"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {hasOpenIssues && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-sm font-medium flex items-center gap-1.5",
                        hasOpenIssues
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-foreground",
                      )}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Has Open Issues
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Mark this item as having lingering concerns, exposing
                      bigger needs, or being only partially settled.
                    </p>
                  </div>
                </div>

                {/* Parent Ticket Link */}
                <div>
                  <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5" />
                    Parent Ticket
                  </label>
                  {parentId !== "none" ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs font-mono text-primary">
                        {parentId.slice(0, 8)}…
                        {(() => {
                          const parent = allFeedbackItems.find(
                            (f) => f.id === parentId,
                          );
                          return parent ? (
                            <span className="ml-2 font-normal text-muted-foreground">
                              {parent.description.slice(0, 60)}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setParentId("none")}
                        className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Unlink parent"
                      >
                        <Unlink className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      {showParentPicker ? (
                        (() => {
                          const parentCandidates = allFeedbackItems.filter(
                            (f) => f.id !== item.id,
                          );
                          const parentResults = parentSearchQuery
                            ? filterAndSortBySearch(
                                parentCandidates,
                                parentSearchQuery,
                                [
                                  {
                                    get: (f) => f.description,
                                    weight: "title",
                                  },
                                  { get: (f) => f.id, weight: "id" },
                                ],
                              )
                            : parentCandidates;
                          return (
                            <div className="border rounded-lg p-2 bg-background shadow-md">
                              <Input
                                placeholder="Search feedback items..."
                                value={parentSearchQuery}
                                onChange={(e) =>
                                  setParentSearchQuery(e.target.value)
                                }
                                className="h-8 text-xs mb-2"
                                autoFocus
                              />
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {parentResults.slice(0, 20).map((f) => (
                                  <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => {
                                      setParentId(f.id);
                                      setShowParentPicker(false);
                                      setParentSearchQuery("");
                                    }}
                                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors"
                                  >
                                    <span className="font-mono text-muted-foreground mr-2">
                                      {f.id.slice(0, 8)}
                                    </span>
                                    {f.description.slice(0, 70)}
                                    {f.description.length > 70 ? "…" : ""}
                                  </button>
                                ))}
                                {parentResults.length === 0 && (
                                  <p className="text-xs text-muted-foreground px-2 py-2">
                                    No items found
                                  </p>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setShowParentPicker(false);
                                  setParentSearchQuery("");
                                }}
                                className="w-full mt-1 h-7 text-xs"
                              >
                                Cancel
                              </Button>
                            </div>
                          );
                        })()
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowParentPicker(true)}
                          className="h-8 text-xs gap-1.5"
                          disabled={allFeedbackItems.length === 0}
                        >
                          <Link className="w-3.5 h-3.5" />
                          Link to parent ticket
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Category */}
                {categories.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      Category
                    </label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger className="h-9">
                        <SelectValue>
                          {categoryId !== "none" ? (
                            (() => {
                              const cat = categories.find(
                                (c) => c.id === categoryId,
                              );
                              if (!cat)
                                return (
                                  <span className="text-muted-foreground">
                                    Uncategorized
                                  </span>
                                );
                              const colors =
                                CATEGORY_COLORS[
                                  cat.color as keyof typeof CATEGORY_COLORS
                                ] ?? CATEGORY_COLORS.gray;
                              return (
                                <span className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={cn(
                                      "w-2.5 h-2.5 rounded-full flex-shrink-0 border",
                                      colors.bg,
                                      colors.border,
                                    )}
                                  />
                                  <span
                                    className={cn(
                                      "text-sm font-medium truncate",
                                      colors.text,
                                    )}
                                  >
                                    {cat.name}
                                  </span>
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-muted-foreground">
                              Uncategorized
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Uncategorized</SelectItem>
                        {categories
                          .filter((c) => c.is_active)
                          .map((cat) => {
                            const colors =
                              CATEGORY_COLORS[
                                cat.color as keyof typeof CATEGORY_COLORS
                              ] ?? CATEGORY_COLORS.gray;
                            return (
                              <SelectItem key={cat.id} value={cat.id}>
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "w-2 h-2 rounded-full flex-shrink-0 border",
                                      colors.bg,
                                      colors.border,
                                    )}
                                  />
                                  {cat.name}
                                </span>
                              </SelectItem>
                            );
                          })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Assignee */}
                <div>
                  <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    Assigned to
                  </label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger className="h-9">
                      <SelectValue>
                        {(() => {
                          if (assigneeId === "none")
                            return (
                              <span className="text-muted-foreground">
                                Unassigned
                              </span>
                            );
                          const admin = assignableAdmins.find(
                            (a) => a.user_id === assigneeId,
                          );
                          if (!admin) {
                            // Fall back to short id when we have an assignment
                            // recorded but the admin list hasn't loaded (or
                            // they were since deactivated).
                            return (
                              <span className="text-muted-foreground">
                                {assigneeId.slice(0, 8)}…
                              </span>
                            );
                          }
                          return (
                            <span className="text-sm font-medium truncate">
                              {admin.display_name ||
                                admin.email ||
                                admin.user_id.slice(0, 8)}
                            </span>
                          );
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {assignableAdmins.map((a) => (
                        <SelectItem key={a.user_id} value={a.user_id}>
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {a.display_name ||
                                a.email ||
                                a.user_id.slice(0, 8)}
                            </span>
                            {a.email &&
                              a.display_name &&
                              a.email !== a.display_name && (
                                <span className="text-[11px] text-muted-foreground">
                                  {a.email}
                                </span>
                              )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assigneeId !== "none" &&
                    assigneeId !== (item.assigned_to ?? "none") && (
                      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                        On save: the assignee will get an in-app DM and an email
                        notification.
                      </p>
                    )}
                </div>

                <Separator />

                {/* Quick Actions */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Quick Actions
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {/* Approve — show when pending decision */}
                    {(item.admin_decision === "pending" ||
                      !item.admin_decision) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDecision("approved");
                          setFormStatus(
                            item.status === "triaged"
                              ? "in_progress"
                              : item.status,
                          );
                        }}
                        className="gap-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve
                      </Button>
                    )}
                    {/* Send to Testing — show when item is resolved/closed/in_progress without proper testing */}
                    {["resolved", "closed", "in_progress"].includes(
                      item.status,
                    ) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFormStatus("awaiting_review");
                        }}
                        className="gap-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                      >
                        <TestTube className="w-4 h-4" />
                        Send to Testing
                      </Button>
                    )}
                    {/* Reopen — show when item is in done states */}
                    {["resolved", "closed", "wont_fix", "deferred"].includes(
                      item.status,
                    ) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDecision("approved");
                          setFormStatus("in_progress");
                        }}
                        className="gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reopen
                      </Button>
                    )}
                    {/* Reject */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDecision("rejected");
                        setFormStatus("wont_fix");
                      }}
                      className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </Button>
                    {/* Defer */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDecision("deferred");
                        setFormStatus("deferred");
                      }}
                      className="gap-1.5 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-950/30"
                    >
                      <Clock className="w-4 h-4" />
                      Defer
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Click a quick action to pre-fill, then hit Save Changes to
                    apply.
                  </p>
                </div>

                {/* Save */}
                <div className="flex gap-3 justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveDecision} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </TabsContent>

              {/* SECTION 4: Comments */}
              <TabsContent value="comments" className="mt-0 flex flex-col">
                {isLoadingComments ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading comments...
                  </div>
                ) : comments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">No comments yet</p>
                    <p className="text-xs mt-1">
                      Start a conversation about this feedback item
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    {comments.map((comment) => {
                      const config =
                        authorTypeConfig[comment.author_type] ||
                        authorTypeConfig.user;
                      return (
                        <div key={comment.id} className="flex gap-3">
                          <div
                            className={cn(
                              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                              config.color,
                            )}
                          >
                            {config.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium">
                                {comment.author_name || config.label}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {config.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(
                                  new Date(comment.created_at),
                                  { addSuffix: true },
                                )}
                              </span>
                            </div>
                            <div className="text-sm whitespace-pre-wrap text-foreground/90">
                              {comment.content}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={commentsEndRef} />
                  </div>
                )}

                {/* Comment Input */}
                <div className="relative pt-3 border-t mt-auto">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="min-h-[60px] w-full pr-12"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        handleSendComment();
                      }
                    }}
                  />
                  <Button
                    onClick={handleSendComment}
                    disabled={!newComment.trim() || isSendingComment}
                    size="sm"
                    className="absolute right-2 bottom-2 h-8 w-8 p-0"
                  >
                    {isSendingComment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </TabsContent>

              {/* SECTION 5: Testing */}
              <TabsContent value="testing" className="mt-0 space-y-4">
                {hasTesting || isResolved ? (
                  <>
                    {/* Original Description — quick context for the reviewer */}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                        Original Issue
                      </label>
                      <div className="p-3 rounded-lg bg-muted/50 border text-sm whitespace-pre-wrap text-muted-foreground">
                        {item.description}
                      </div>
                    </div>

                    {/* Testing URL */}
                    {item.testing_url && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                          Testing URL
                        </label>
                        <a
                          href={item.testing_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 transition-colors text-sm font-mono"
                        >
                          <ExternalLink className="w-4 h-4" />
                          {item.testing_url}
                        </a>
                      </div>
                    )}

                    {/* Testing Instructions */}
                    {item.testing_instructions && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                          Testing Instructions
                        </label>
                        <div className="p-3 rounded-lg bg-muted/50 border text-sm whitespace-pre-wrap">
                          {item.testing_instructions}
                        </div>
                      </div>
                    )}

                    {/* Resolution Notes */}
                    {item.resolution_notes && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                          Resolution Notes
                        </label>
                        <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-sm whitespace-pre-wrap">
                          {item.resolution_notes}
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* Testing Result Buttons */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium mb-2 block">
                        Testing Result
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant={
                            item.testing_result === "pass"
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => handleTestingResult("pass")}
                          disabled={
                            isSaving ||
                            !!pendingTestResult ||
                            showUserReviewCompose
                          }
                          className={cn(
                            "gap-1.5",
                            item.testing_result === "pass" &&
                              "bg-green-600 hover:bg-green-700",
                          )}
                        >
                          {isSaving && !pendingTestResult ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          Pass
                        </Button>
                        <Button
                          variant={
                            pendingTestResult === "fail" ||
                            item.testing_result === "fail"
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => handleTestingResult("fail")}
                          disabled={
                            isSaving ||
                            !!pendingTestResult ||
                            showUserReviewCompose
                          }
                          className={cn(
                            "gap-1.5",
                            (pendingTestResult === "fail" ||
                              item.testing_result === "fail") &&
                              "bg-red-600 hover:bg-red-700",
                          )}
                        >
                          {isSaving && !pendingTestResult ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                          Fail
                        </Button>
                        <Button
                          variant={
                            pendingTestResult === "partial" ||
                            item.testing_result === "partial"
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => handleTestingResult("partial")}
                          disabled={
                            isSaving ||
                            !!pendingTestResult ||
                            showUserReviewCompose
                          }
                          className={cn(
                            "gap-1.5",
                            (pendingTestResult === "partial" ||
                              item.testing_result === "partial") &&
                              "bg-yellow-600 hover:bg-yellow-700",
                          )}
                        >
                          {isSaving && !pendingTestResult ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <MinusCircle className="w-4 h-4" />
                          )}
                          Partial
                        </Button>

                        {/* User Review button */}
                        <Button
                          variant={
                            showUserReviewCompose ? "default" : "outline"
                          }
                          size="sm"
                          onClick={handleStartUserReview}
                          disabled={
                            isSaving ||
                            !!pendingTestResult ||
                            showUserReviewCompose
                          }
                          className={cn(
                            "gap-1.5",
                            showUserReviewCompose &&
                              "bg-cyan-600 hover:bg-cyan-700",
                          )}
                        >
                          <UserCheck className="w-4 h-4" />
                          User Review
                        </Button>
                      </div>

                      {/* Status confirmation (shown after result saved, no pending feedback) */}
                      {item.testing_result && !pendingTestResult && (
                        <p className="text-xs text-muted-foreground">
                          {item.testing_result === "pass" &&
                            "Verified — moved to Done."}
                          {item.testing_result === "fail" &&
                            "Sent back to agent for fixes."}
                          {item.testing_result === "partial" &&
                            "Sent back to agent for remaining fixes."}
                        </p>
                      )}

                      {/* Open Issues flag — quick toggle right from testing */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={async () => {
                          const newValue = !hasOpenIssues;
                          setHasOpenIssues(newValue);
                          // Auto-save immediately so you don't have to go to Decision tab
                          try {
                            const result = await updateFeedback(item.id, {
                              has_open_issues: newValue,
                            });
                            if (result.success) {
                              setItem((prev) => ({
                                ...prev,
                                has_open_issues: newValue,
                              }));
                              onUpdate();
                            }
                          } catch {
                            /* silent — will still be in local state */
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setHasOpenIssues(!hasOpenIssues);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                          hasOpenIssues
                            ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15"
                            : "bg-muted/30 border-transparent hover:bg-muted/50",
                        )}
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
                            hasOpenIssues
                              ? "bg-amber-500 border-amber-500"
                              : "border-muted-foreground/30",
                          )}
                        >
                          {hasOpenIssues && (
                            <CheckCircle2 className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-xs font-medium flex items-center gap-1",
                            hasOpenIssues
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground",
                          )}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Has Open Issues
                        </span>
                      </div>

                      {/* Feedback textarea — appears after clicking Fail or Partial */}
                      {pendingTestResult && (
                        <div
                          className={cn(
                            "rounded-lg border p-4 space-y-3",
                            pendingTestResult === "fail"
                              ? "bg-red-500/5 border-red-500/20"
                              : "bg-yellow-500/5 border-yellow-500/20",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {pendingTestResult === "fail" ? (
                              <XCircle className="w-4 h-4 text-red-500" />
                            ) : (
                              <MinusCircle className="w-4 h-4 text-yellow-500" />
                            )}
                            <span
                              className={cn(
                                "text-sm font-semibold",
                                pendingTestResult === "fail"
                                  ? "text-red-700 dark:text-red-400"
                                  : "text-yellow-700 dark:text-yellow-400",
                              )}
                            >
                              {pendingTestResult === "fail"
                                ? "What failed? Describe what the agent needs to fix."
                                : "What still needs work? Describe the remaining issues."}
                            </span>
                          </div>
                          <Textarea
                            value={testFeedbackText}
                            onChange={(e) =>
                              setTestFeedbackText(e.target.value)
                            }
                            placeholder={
                              pendingTestResult === "fail"
                                ? "e.g. The fix didn't work — the button still doesn't respond when clicked. Also, the loading state is missing..."
                                : "e.g. The main issue is fixed, but there's still a layout shift when the modal opens. Also need to handle the empty state..."
                            }
                            className="min-h-[100px] text-sm"
                          />
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              This will be posted as a structured comment the
                              agent sees first.
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setPendingTestResult(null);
                                  setTestFeedbackText("");
                                }}
                                disabled={isSendingTestFeedback}
                              >
                                Skip
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSendTestFeedback}
                                disabled={
                                  !testFeedbackText.trim() ||
                                  isSendingTestFeedback
                                }
                                className={cn(
                                  "gap-1.5",
                                  pendingTestResult === "fail"
                                    ? "bg-red-600 hover:bg-red-700"
                                    : "bg-yellow-600 hover:bg-yellow-700",
                                )}
                              >
                                {isSendingTestFeedback ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                                Send Feedback to Agent
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* User Review compose area */}
                      {showUserReviewCompose && (
                        <div className="rounded-lg border p-4 space-y-3 bg-cyan-500/5 border-cyan-500/20">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-cyan-500" />
                            <span className="text-sm font-semibold text-cyan-700 dark:text-cyan-400">
                              Send to user for review
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            This message will be sent to{" "}
                            <strong>{item.username || "the user"}</strong> via
                            email. The item will move to the User Review stage
                            until they respond.
                          </p>
                          <Textarea
                            ref={composeTextareaRef}
                            value={userReviewMessage}
                            onChange={(e) =>
                              setUserReviewMessage(e.target.value)
                            }
                            placeholder="Describe what the user should test and verify... (Ctrl+V to paste images)"
                            className="min-h-[120px] text-sm"
                          />
                          {/* Compose attached images */}
                          {composeImages.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {composeImages.map((url, idx) => (
                                <div key={idx} className="relative group">
                                  <InlineMediaRef
                                    ref={url}
                                    size={{ width: 64, height: 64 }}
                                    fit="cover"
                                    rounded="sm"
                                    border="subtle"
                                    fallback={null}
                                    alt={`Attachment ${idx + 1}`}
                                  />
                                  <button
                                    onClick={() =>
                                      setComposeImages((prev) =>
                                        prev.filter((_, i) => i !== idx),
                                      )
                                    }
                                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                Pre-filled with resolution notes. Edit as
                                needed.
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  pickAndUploadImages(
                                    setComposeImages,
                                    setIsUploadingCompose,
                                  )
                                }
                                disabled={
                                  isSendingUserReview || isUploadingCompose
                                }
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                                title="Attach image"
                              >
                                {isUploadingCompose ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Paperclip className="w-3 h-3" />
                                )}
                                Attach
                              </Button>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setShowUserReviewCompose(false);
                                  setUserReviewMessage("");
                                  setComposeImages([]);
                                }}
                                disabled={isSendingUserReview}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSendUserReview}
                                disabled={
                                  (!userReviewMessage.trim() &&
                                    composeImages.length === 0) ||
                                  isSendingUserReview ||
                                  isUploadingCompose
                                }
                                className="gap-1.5 bg-cyan-600 hover:bg-cyan-700"
                              >
                                {isSendingUserReview ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                                Send to User
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <TestTube className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">No testing information yet</p>
                    <p className="text-xs mt-1">
                      Testing data will appear after the agent resolves this
                      item
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* SECTION 6: User Messages */}
              <TabsContent value="user-messages" className="mt-0 flex flex-col">
                {isLoadingUserMessages ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading user messages...
                  </div>
                ) : userMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">No user messages yet</p>
                    <p className="text-xs mt-1">
                      Send a message to the user from the Testing tab using the
                      User Review button
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    {userMessages.map((msg) => {
                      const isAdmin = msg.sender_type === "admin";
                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex gap-3",
                            isAdmin ? "" : "flex-row-reverse",
                          )}
                        >
                          <div
                            className={cn(
                              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                              isAdmin
                                ? "text-blue-600 dark:text-blue-400 bg-blue-500/10"
                                : "text-gray-600 dark:text-gray-400 bg-gray-500/10",
                            )}
                          >
                            {isAdmin ? (
                              <Shield className="w-3.5 h-3.5" />
                            ) : (
                              <UserCircle className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div
                            className={cn(
                              "flex-1 min-w-0",
                              !isAdmin && "text-right",
                            )}
                          >
                            <div
                              className={cn(
                                "flex items-center gap-2 mb-0.5",
                                !isAdmin && "justify-end",
                              )}
                            >
                              <span className="text-sm font-medium">
                                {msg.sender_name ||
                                  (isAdmin ? "Admin" : "User")}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {isAdmin ? "Admin" : "User"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(msg.created_at), {
                                  addSuffix: true,
                                })}
                              </span>
                              {msg.email_sent && (
                                <span
                                  className="text-[10px] text-muted-foreground"
                                  title="Email sent"
                                >
                                  sent
                                </span>
                              )}
                            </div>
                            <div
                              className={cn(
                                "rounded-lg p-3 inline-block max-w-[85%]",
                                isAdmin
                                  ? "bg-blue-500/5 border border-blue-500/20 text-left"
                                  : "bg-muted/50 border text-left",
                              )}
                            >
                              {msg.content && (
                                <p className="text-sm whitespace-pre-wrap">
                                  {msg.content}
                                </p>
                              )}
                              {msg.image_urls && msg.image_urls.length > 0 && (
                                <div
                                  className={cn(
                                    "flex flex-wrap gap-2",
                                    msg.content && "mt-2",
                                  )}
                                >
                                  {msg.image_urls.map((url, idx) => (
                                    <a
                                      key={idx}
                                      href={imageViewUrl(url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <InlineMediaRef
                                        ref={url}
                                        size={{ width: 320, height: 192 }}
                                        fit="contain"
                                        rounded="sm"
                                        border="subtle"
                                        fallback={null}
                                        className="cursor-pointer hover:opacity-90 transition-opacity max-h-48 max-w-xs"
                                        alt={`Attachment ${idx + 1}`}
                                      />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={userMessagesEndRef} />
                  </div>
                )}

                {/* Admin reply input */}
                <div className="pt-3 border-t mt-auto space-y-2">
                  {/* Attached images preview */}
                  {replyImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-1">
                      {replyImages.map((url, idx) => (
                        <div key={idx} className="relative group">
                          <InlineMediaRef
                            ref={url}
                            size={{ width: 64, height: 64 }}
                            fit="cover"
                            rounded="sm"
                            border="subtle"
                            fallback={null}
                            alt={`Attachment ${idx + 1}`}
                          />
                          <button
                            onClick={() =>
                              setReplyImages((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <Textarea
                      ref={replyTextareaRef}
                      value={userReplyText}
                      onChange={(e) => setUserReplyText(e.target.value)}
                      placeholder="Reply to user... (Ctrl+V to paste images, this will send them an email)"
                      className="min-h-[60px] w-full pr-20"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          handleAdminReplyUserMessage();
                        }
                      }}
                    />
                    <div className="absolute right-2 bottom-2 flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          pickAndUploadImages(
                            setReplyImages,
                            setIsUploadingReply,
                          )
                        }
                        disabled={isSendingUserReply || isUploadingReply}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        title="Attach image"
                      >
                        {isUploadingReply ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Paperclip className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        onClick={handleAdminReplyUserMessage}
                        disabled={
                          (!userReplyText.trim() && replyImages.length === 0) ||
                          isSendingUserReply ||
                          isUploadingReply
                        }
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        {isSendingUserReply ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
