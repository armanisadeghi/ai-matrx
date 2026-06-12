"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  getAllFeedback,
  updateFeedback,
  setAdminDecision,
  forceCloseFeedback,
} from "@/actions/feedback.actions";
import {
  UserFeedback,
  FeedbackStatus,
  FeedbackType,
  FeedbackCategory,
  FeedbackAssignableAdmin,
  AdminDecision,
  TestingResult,
  ADMIN_DECISION_COLORS,
  ADMIN_DECISION_LABELS,
  ADMIN_STATUS_LABELS,
  CATEGORY_COLORS,
} from "@/types/feedback.types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineMediaRef } from "@/features/files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  Zap,
  Lightbulb,
  HelpCircle,
  Search,
  ArrowUpDown,
  Eye,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Brain,
  CheckCircle2,
  Hash,
  ArrowRight,
  User,
  Component,
  ClipboardCheck,
  Archive,
  ChevronDown,
  Copy,
  UserCheck,
  XCircle,
  MinusCircle,
  TestTube,
  AlertTriangle,
  Tag,
  GitBranch,
  CornerDownRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import FeedbackDetailDialog from "./FeedbackDetailDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { idMatchesQuery } from "@/utils/search-scoring";

const statusOptions: { value: FeedbackStatus; label: string; color: string }[] =
  [
    {
      value: "new",
      label: "New",
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    },
    {
      value: "triaged",
      label: "Triaged",
      color:
        "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
    },
    {
      value: "in_progress",
      label: "In Progress",
      color:
        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    },
    {
      value: "awaiting_review",
      label: "Ready for Testing",
      color:
        "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    },
    {
      value: "user_review",
      label: "User Review",
      color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
    },
    {
      value: "resolved",
      label: "Verified",
      color:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    },
    {
      value: "closed",
      label: "Closed",
      color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    },
    {
      value: "wont_fix",
      label: "Won't Fix",
      color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    },
    {
      value: "deferred",
      label: "Deferred",
      color: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
    },
  ];

const feedbackTypeIcons: Record<FeedbackType, React.ReactNode> = {
  bug: <AlertCircle className="w-4 h-4 text-red-500" />,
  feature: <Zap className="w-4 h-4 text-purple-500" />,
  suggestion: <Lightbulb className="w-4 h-4 text-yellow-500" />,
  other: <HelpCircle className="w-4 h-4 text-gray-500" />,
};

type SortField =
  | "created_at"
  | "status"
  | "feedback_type"
  | "username"
  | "work_priority";
type SortDirection = "asc" | "desc";

// Mutually exclusive pipeline stages
type PipelineStage =
  | "untriaged"
  | "your_decision"
  | "agent_working"
  | "test_results"
  | "user_review"
  | "done"
  | "all";

interface StageConfig {
  key: PipelineStage;
  label: string;
  shortLabel: string;
  owner: "agent" | "admin" | "none";
  icon: React.ReactNode;
  color: string;
  activeColor: string;
  borderColor: string;
  match: (item: UserFeedback) => boolean;
}

const DONE_STATUSES: FeedbackStatus[] = [
  "resolved",
  "closed",
  "wont_fix",
  "deferred",
];

const pipelineStages: StageConfig[] = [
  {
    key: "untriaged",
    label: "Untriaged",
    shortLabel: "New",
    owner: "agent",
    icon: <Component className="w-3.5 h-3.5" />,
    color: "text-blue-700 dark:text-blue-400",
    activeColor: "bg-blue-600 dark:bg-blue-600 text-white",
    borderColor: "border-blue-300 dark:border-blue-700",
    match: (item) => item.status === "new",
  },
  {
    key: "your_decision",
    label: "Your Decision",
    shortLabel: "Decide",
    owner: "admin",
    icon: <User className="w-3.5 h-3.5" />,
    color: "text-amber-700 dark:text-amber-400",
    activeColor: "bg-amber-600 dark:bg-amber-600 text-white",
    borderColor: "border-amber-300 dark:border-amber-700",
    match: (item) =>
      item.status === "triaged" &&
      (item.admin_decision === "pending" || !item.admin_decision),
  },
  {
    key: "agent_working",
    label: "Agent Working",
    shortLabel: "Fixing",
    owner: "agent",
    icon: <Component className="w-3.5 h-3.5" />,
    color: "text-purple-700 dark:text-purple-400",
    activeColor: "bg-purple-600 dark:bg-purple-600 text-white",
    borderColor: "border-purple-300 dark:border-purple-700",
    match: (item) =>
      item.admin_decision === "approved" &&
      ["triaged", "in_progress"].includes(item.status) &&
      !DONE_STATUSES.includes(item.status),
  },
  {
    key: "test_results",
    label: "Ready for Testing",
    shortLabel: "Test",
    owner: "admin",
    icon: <ClipboardCheck className="w-3.5 h-3.5" />,
    color: "text-orange-700 dark:text-orange-400",
    activeColor: "bg-orange-600 dark:bg-orange-600 text-white",
    borderColor: "border-orange-300 dark:border-orange-700",
    match: (item) => item.status === "awaiting_review",
  },
  {
    key: "user_review",
    label: "User Review",
    shortLabel: "User",
    owner: "none",
    icon: <UserCheck className="w-3.5 h-3.5" />,
    color: "text-cyan-700 dark:text-cyan-400",
    activeColor: "bg-cyan-600 dark:bg-cyan-600 text-white",
    borderColor: "border-cyan-300 dark:border-cyan-700",
    match: (item) => item.status === "user_review",
  },
  {
    key: "done",
    label: "Done",
    shortLabel: "Done",
    owner: "none",
    icon: <Archive className="w-3.5 h-3.5" />,
    color: "text-gray-500 dark:text-gray-500",
    activeColor: "bg-gray-600 dark:bg-gray-600 text-white",
    borderColor: "border-gray-300 dark:border-gray-700",
    match: (item) => DONE_STATUSES.includes(item.status),
  },
];

function getItemStage(item: UserFeedback): PipelineStage {
  for (const stage of pipelineStages) {
    if (stage.match(item)) return stage.key;
  }
  // Fallback for edge cases (e.g. split items, rejected but not wont_fix)
  return "done";
}

// Maps each pipeline stage to the dialog tab that should open by default
const stageToDialogTab: Record<PipelineStage, string> = {
  untriaged: "submission",
  your_decision: "decision",
  agent_working: "comments",
  test_results: "testing",
  user_review: "user-messages",
  done: "submission",
  all: "submission",
};

// ---------- Image Preview Modal (unchanged) ----------

function ImagePreviewModal({
  open,
  onOpenChange,
  imageUrls,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrls: string[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (open) setCurrentIndex(0);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden bg-black/95">
        {imageUrls.length === 0 ? (
          <div className="flex items-center justify-center h-96 text-white/60">
            No images found
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center justify-center min-h-[400px] max-h-[80vh]">
              <InlineMediaRef
                ref={imageUrls[currentIndex] ?? null}
                size="fill"
                fit="contain"
                rounded="none"
                fallback={null}
                className="max-w-full max-h-[80vh]"
                alt={`Screenshot ${currentIndex + 1}`}
              />
            </div>
            {imageUrls.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setCurrentIndex((i) =>
                      i === 0 ? imageUrls.length - 1 : i - 1,
                    )
                  }
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() =>
                    setCurrentIndex((i) =>
                      i === imageUrls.length - 1 ? 0 : i + 1,
                    )
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                  {currentIndex + 1} / {imageUrls.length}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main Component ----------

export default function FeedbackTable() {
  const [feedback, setFeedback] = useState<UserFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<UserFeedback | null>(
    null,
  );
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);

  // Pipeline stage (primary filter) — initial value overridden by useEffect below
  const [activeStage, setActiveStage] = useState<PipelineStage>("untriaged");
  const initialStageSet = useRef(false);

  // Secondary filters (work alongside or override pipeline)
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<FeedbackStatus | "all">(
    "all",
  );
  const [filterType, setFilterType] = useState<FeedbackType | "all">("all");
  const [filterDecision, setFilterDecision] = useState<AdminDecision | "all">(
    "all",
  );
  const [filterTestResult, setFilterTestResult] = useState<
    TestingResult | "all"
  >("all");
  const [filterOpenIssues, setFilterOpenIssues] = useState<
    "all" | "yes" | "no"
  >("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [categories, setCategories] = useState<FeedbackCategory[]>([]);
  const [assignableAdmins, setAssignableAdmins] = useState<
    FeedbackAssignableAdmin[]
  >([]);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    new Set(),
  );

  // Build lookup maps for parent/child relationships
  const childrenMap = useMemo(() => {
    const map = new Map<string, UserFeedback[]>();
    for (const item of feedback) {
      if (item.parent_id) {
        const siblings = map.get(item.parent_id) ?? [];
        siblings.push(item);
        map.set(item.parent_id, siblings);
      }
    }
    return map;
  }, [feedback]);

  const toggleParentExpanded = useCallback(
    (parentId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedParents((prev) => {
        const next = new Set(prev);
        if (next.has(parentId)) next.delete(parentId);
        else next.add(parentId);
        return next;
      });
    },
    [],
  );

  // Sorting
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    loadFeedback();
    fetch("/api/admin/feedback/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
    fetch("/api/admin/feedback/assignable-admins")
      .then((r) => r.json())
      .then((d) => setAssignableAdmins(d.admins ?? []))
      .catch(() => {});
  }, []);

  // Lookup: user_id → admin display name
  const adminById = useMemo(() => {
    const map = new Map<string, FeedbackAssignableAdmin>();
    for (const a of assignableAdmins) map.set(a.user_id, a);
    return map;
  }, [assignableAdmins]);

  const loadFeedback = async () => {
    setLoading(true);
    const result = await getAllFeedback();
    if (result.success && result.data) {
      setFeedback(result.data);
      // Keep selectedFeedback fresh from the reloaded list
      setSelectedFeedback((prev) => {
        if (!prev) return prev;
        const fresh = result.data!.find((f) => f.id === prev.id);
        return fresh ?? prev;
      });
    }
    setLoading(false);
  };

  const handleStatusChange = async (
    feedbackId: string,
    newStatus: FeedbackStatus,
  ) => {
    const terminalStatuses: FeedbackStatus[] = [
      "closed",
      "resolved",
      "wont_fix",
    ];
    const result = terminalStatuses.includes(newStatus)
      ? await forceCloseFeedback(
          feedbackId,
          newStatus as "closed" | "resolved" | "wont_fix",
        )
      : await updateFeedback(feedbackId, { status: newStatus });
    if (result.success) {
      toast.success("Status updated successfully");
      await loadFeedback();
      if (selectedFeedback?.id === feedbackId && result.data) {
        setSelectedFeedback(result.data);
      }
    } else {
      toast.error(`Failed to update status: ${result.error}`);
    }
  };

  const handleQuickApprove = useCallback(
    async (feedbackId: string) => {
      const maxPriority = feedback
        .filter((f) => f.work_priority !== null)
        .reduce((max, f) => Math.max(max, f.work_priority || 0), 0);
      const newPriority = maxPriority + 1;

      const result = await setAdminDecision(
        feedbackId,
        "approved",
        undefined,
        newPriority,
      );
      if (result.success) {
        toast.success("Approved and added to work queue");
        await loadFeedback();
        if (selectedFeedback?.id === feedbackId && result.data) {
          setSelectedFeedback(result.data);
        }
      } else {
        toast.error(`Failed to approve: ${result.error}`);
      }
    },
    [feedback, selectedFeedback],
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "work_priority" ? "asc" : "desc");
    }
  };

  const handleViewDetails = (item: UserFeedback) => {
    setSelectedFeedback(item);
    setDetailDialogOpen(true);
  };

  const handleViewImages = (
    e: React.MouseEvent,
    urls: string[] | null | undefined,
  ) => {
    e.stopPropagation();
    setImagePreviewUrls(urls ?? []);
    setImagePreviewOpen(true);
  };

  // Count items per pipeline stage
  const stageCounts = useMemo(() => {
    const counts: Record<PipelineStage, number> = {
      untriaged: 0,
      your_decision: 0,
      agent_working: 0,
      test_results: 0,
      user_review: 0,
      done: 0,
      all: feedback.length,
    };
    for (const item of feedback) {
      const stage = getItemStage(item);
      counts[stage]++;
    }
    return counts;
  }, [feedback]);

  // Auto-select the first non-empty pipeline stage on initial load
  useEffect(() => {
    if (!initialStageSet.current && feedback.length > 0) {
      initialStageSet.current = true;
      const stageOrder: PipelineStage[] = [
        "untriaged",
        "your_decision",
        "agent_working",
        "test_results",
        "user_review",
        "done",
      ];
      const firstNonEmpty = stageOrder.find((key) => stageCounts[key] > 0);
      if (firstNonEmpty) {
        setActiveStage(firstNonEmpty);
      }
    }
  }, [feedback, stageCounts]);

  const filteredAndSortedFeedback = useMemo(() => {
    let filtered = feedback.filter((item) => {
      // Pipeline stage filter
      if (activeStage !== "all") {
        const stage = pipelineStages.find((s) => s.key === activeStage);
        if (stage && !stage.match(item)) return false;
      }

      // Secondary filters
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (filterType !== "all" && item.feedback_type !== filterType)
        return false;
      if (filterDecision !== "all" && item.admin_decision !== filterDecision)
        return false;
      if (
        filterTestResult !== "all" &&
        (item.testing_result || null) !== filterTestResult
      )
        return false;
      if (filterOpenIssues === "yes" && !item.has_open_issues) return false;
      if (filterOpenIssues === "no" && item.has_open_issues) return false;
      if (
        filterCategory !== "all" &&
        (item.category_id ?? "none") !== filterCategory
      )
        return false;
      if (
        filterAssignee !== "all" &&
        (item.assigned_to ?? "none") !== filterAssignee
      )
        return false;

      // Search
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          item.description.toLowerCase().includes(search) ||
          item.username?.toLowerCase().includes(search) ||
          item.route.toLowerCase().includes(search) ||
          idMatchesQuery(item, search)
        );
      }

      return true;
    });

    // Smart default sort per stage
    filtered.sort((a, b) => {
      let aVal: string | number, bVal: string | number;

      switch (sortField) {
        case "created_at":
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "feedback_type":
          aVal = a.feedback_type;
          bVal = b.feedback_type;
          break;
        case "username":
          aVal = a.username || "";
          bVal = b.username || "";
          break;
        case "work_priority":
          if (a.work_priority === null && b.work_priority === null) return 0;
          if (a.work_priority === null) return 1;
          if (b.work_priority === null) return -1;
          aVal = a.work_priority;
          bVal = b.work_priority;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    // Build visible list: parents first, with their children interleaved when expanded
    // Children whose parent is NOT in the filtered list appear as normal rows
    const filteredIds = new Set(filtered.map((f) => f.id));
    const result: (UserFeedback & { isChild?: boolean })[] = [];
    for (const item of filtered) {
      // Skip children here if their parent is visible (they'll be injected after parent)
      if (item.parent_id && filteredIds.has(item.parent_id)) continue;
      result.push(item);
      // If this item has visible children, inject them when expanded
      if (expandedParents.has(item.id)) {
        const children = childrenMap.get(item.id) ?? [];
        const visibleChildren = children.filter((c) => filteredIds.has(c.id));
        for (const child of visibleChildren) {
          result.push({ ...child, isChild: true });
        }
      }
    }
    return result;
  }, [
    feedback,
    activeStage,
    searchTerm,
    filterStatus,
    filterType,
    filterDecision,
    filterTestResult,
    filterOpenIssues,
    filterCategory,
    filterAssignee,
    sortField,
    sortDirection,
    expandedParents,
    childrenMap,
  ]);

  const getStatusOption = (status: FeedbackStatus) => {
    return statusOptions.find((s) => s.value === status);
  };

  const hasActiveFilters =
    filterStatus !== "all" ||
    filterType !== "all" ||
    filterDecision !== "all" ||
    filterTestResult !== "all" ||
    filterOpenIssues !== "all" ||
    filterCategory !== "all" ||
    filterAssignee !== "all" ||
    searchTerm !== "";

  // Initial load: show skeleton but still render dialogs below so they don't unmount
  const isInitialLoad = loading && feedback.length === 0;

  return (
    <>
      {isInitialLoad ? (
        <Card className="p-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading feedback...</p>
        </Card>
      ) : (
        <Card className="p-4 relative">
          {/* Subtle loading overlay for refreshes (not initial load) */}
          {loading && (
            <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center rounded-lg">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {/* Pipeline Stage Selector */}
          <div className="mb-4">
            <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
              {pipelineStages.map((stage, index) => {
                const count = stageCounts[stage.key];
                const isActive = activeStage === stage.key;
                const isAdminTurn = stage.owner === "admin";

                return (
                  <React.Fragment key={stage.key}>
                    {index > 0 && (
                      <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0 hidden sm:block" />
                    )}
                    <button
                      onClick={() => {
                        setActiveStage(stage.key);
                        // Reset secondary filters when changing stage
                        setFilterStatus("all");
                        setFilterType("all");
                        setFilterDecision("all");
                        setFilterTestResult("all");
                        setFilterCategory("all");
                        setFilterAssignee("all");
                        // Smart sort defaults
                        if (stage.key === "agent_working") {
                          setSortField("work_priority");
                          setSortDirection("asc");
                        } else {
                          setSortField("created_at");
                          setSortDirection("desc");
                        }
                      }}
                      className={cn(
                        "relative flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all flex-1 justify-center",
                        isActive
                          ? stage.activeColor
                          : "hover:bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {stage.icon}
                      <span className="hidden sm:inline">{stage.label}</span>
                      <span className="sm:hidden">{stage.shortLabel}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            "min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold leading-none px-1",
                            isActive
                              ? "bg-white/25 text-white"
                              : isAdminTurn && count > 0
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                : "bg-muted-foreground/10 text-muted-foreground",
                          )}
                        >
                          {count}
                        </span>
                      )}
                      {/* "Your turn" indicator for admin stages with items */}
                      {!isActive && isAdminTurn && count > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                    </button>
                  </React.Fragment>
                );
              })}
              {/* All items button */}
              <div className="w-px h-6 bg-border mx-1 flex-shrink-0" />
              <button
                onClick={() => {
                  setActiveStage("all");
                  setSortField("created_at");
                  setSortDirection("desc");
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all",
                  activeStage === "all"
                    ? "bg-foreground text-background"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                All
                <span
                  className={cn(
                    "min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold leading-none px-1",
                    activeStage === "all"
                      ? "bg-white/25 text-white dark:bg-black/25 dark:text-black"
                      : "bg-muted-foreground/10 text-muted-foreground",
                  )}
                >
                  {feedback.length}
                </span>
              </button>
            </div>
          </div>

          {/* Search + Filter Toggle */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search description, user, or route..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            {categories.length > 0 && (
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <SelectValue>
                    {filterCategory === "all" ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Tag className="w-3 h-3" />
                        All Categories
                      </span>
                    ) : filterCategory === "none" ? (
                      <span className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3" />
                        Uncategorized
                      </span>
                    ) : (
                      (() => {
                        const cat = categories.find(
                          (c) => c.id === filterCategory,
                        );
                        if (!cat)
                          return (
                            <span className="text-muted-foreground">
                              Category
                            </span>
                          );
                        const colors =
                          CATEGORY_COLORS[
                            cat.color as keyof typeof CATEGORY_COLORS
                          ] ?? CATEGORY_COLORS.gray;
                        return (
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={cn(
                                "w-2 h-2 rounded-full flex-shrink-0 border",
                                colors.bg,
                                colors.border,
                              )}
                            />
                            <span
                              className={cn(
                                "truncate font-medium",
                                colors.text,
                              )}
                            >
                              {cat.name}
                            </span>
                          </span>
                        );
                      })()
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
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
                            <span className={colors.text}>{cat.name}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            )}
            {assignableAdmins.length > 0 && (
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <SelectValue>
                    {filterAssignee === "all" ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <UserCheck className="w-3 h-3" />
                        All Assignees
                      </span>
                    ) : filterAssignee === "none" ? (
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="w-3 h-3" />
                        Unassigned
                      </span>
                    ) : (
                      (() => {
                        const admin = adminById.get(filterAssignee);
                        return (
                          <span className="flex items-center gap-1.5 min-w-0">
                            <UserCheck className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate font-medium">
                              {admin?.display_name ||
                                admin?.email ||
                                filterAssignee.slice(0, 8)}
                            </span>
                          </span>
                        );
                      })()
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {assignableAdmins.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>
                      {a.display_name || a.email || a.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant={
                showFilters || hasActiveFilters ? "secondary" : "outline"
              }
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5 h-9"
            >
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 transition-transform",
                  showFilters && "rotate-180",
                )}
              />
              Filters
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadFeedback}
              className="h-9"
            >
              Refresh
            </Button>
          </div>

          {/* Collapsible Filters */}
          {showFilters && (
            <div className="flex flex-col md:flex-row gap-3 mb-3 p-3 bg-muted/30 rounded-lg border">
              <Select
                value={filterStatus}
                onValueChange={(value) =>
                  setFilterStatus(value as FeedbackStatus | "all")
                }
              >
                <SelectTrigger className="w-full md:w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterType}
                onValueChange={(value) =>
                  setFilterType(value as FeedbackType | "all")
                }
              >
                <SelectTrigger className="w-full md:w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="bug">Bug Report</SelectItem>
                  <SelectItem value="feature">Feature Request</SelectItem>
                  <SelectItem value="suggestion">Suggestion</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filterDecision}
                onValueChange={(value) =>
                  setFilterDecision(value as AdminDecision | "all")
                }
              >
                <SelectTrigger className="w-full md:w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Decision" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Decisions</SelectItem>
                  {Object.entries(ADMIN_DECISION_LABELS).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <Select
                value={filterTestResult}
                onValueChange={(value) =>
                  setFilterTestResult(value as TestingResult | "all")
                }
              >
                <SelectTrigger className="w-full md:w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Test Result" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Test Results</SelectItem>
                  <SelectItem value="pass">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-green-500" /> Pass
                    </span>
                  </SelectItem>
                  <SelectItem value="fail">
                    <span className="flex items-center gap-1.5">
                      <XCircle className="w-3 h-3 text-red-500" /> Fail
                    </span>
                  </SelectItem>
                  <SelectItem value="partial">
                    <span className="flex items-center gap-1.5">
                      <MinusCircle className="w-3 h-3 text-yellow-500" />{" "}
                      Partial
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filterOpenIssues}
                onValueChange={(value) =>
                  setFilterOpenIssues(value as "all" | "yes" | "no")
                }
              >
                <SelectTrigger className="w-full md:w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Open Issues" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  <SelectItem value="yes">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-500" /> Has
                      Open Issues
                    </span>
                  </SelectItem>
                  <SelectItem value="no">No Open Issues</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setFilterStatus("all");
                    setFilterType("all");
                    setFilterDecision("all");
                    setFilterTestResult("all");
                    setFilterOpenIssues("all");
                    setFilterCategory("all");
                    setFilterAssignee("all");
                    setSearchTerm("");
                  }}
                >
                  Clear all
                </Button>
              )}
            </div>
          )}

          {/* Results count */}
          <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">
                {filteredAndSortedFeedback.length}
              </strong>{" "}
              item{filteredAndSortedFeedback.length !== 1 ? "s" : ""}
              {activeStage !== "all" && (
                <>
                  {" "}
                  in{" "}
                  <strong className="text-foreground">
                    {pipelineStages.find((s) => s.key === activeStage)?.label ||
                      "All"}
                  </strong>
                </>
              )}
            </span>
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[90px]">
                    <span className="font-semibold text-xs">ID</span>
                  </TableHead>
                  <TableHead className="w-[50px]">
                    <button
                      onClick={() => handleSort("work_priority")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground"
                    >
                      <Hash className="w-3 h-3" />
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[90px]">
                    <button
                      onClick={() => handleSort("feedback_type")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground"
                    >
                      Type
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[170px]">
                    <button
                      onClick={() => handleSort("status")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground"
                    >
                      Status
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[120px]">Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[150px]">Decision</TableHead>
                  <TableHead className="w-[130px]">
                    <button
                      onClick={() => handleSort("username")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground"
                    >
                      User
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[130px]">
                    <span className="flex items-center gap-1 font-semibold text-xs">
                      <UserCheck className="w-3 h-3" />
                      Assignee
                    </span>
                  </TableHead>
                  <TableHead className="w-[100px]">
                    <button
                      onClick={() => handleSort("created_at")}
                      className="flex items-center gap-1 font-semibold hover:text-foreground"
                    >
                      Created
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedFeedback.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="text-center py-12 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-1">
                        {activeStage === "untriaged" && (
                          <>
                            <Component className="w-6 h-6 opacity-30 mb-1" />
                            <span className="text-sm">No untriaged items</span>
                            <span className="text-xs">
                              All feedback has been analyzed
                            </span>
                          </>
                        )}
                        {activeStage === "your_decision" && (
                          <>
                            <CheckCircle2 className="w-6 h-6 opacity-30 mb-1" />
                            <span className="text-sm">
                              Nothing needs your decision
                            </span>
                            <span className="text-xs">
                              All triaged items have been reviewed
                            </span>
                          </>
                        )}
                        {activeStage === "agent_working" && (
                          <>
                            <Component className="w-6 h-6 opacity-30 mb-1" />
                            <span className="text-sm">
                              No items in the work queue
                            </span>
                            <span className="text-xs">
                              Approve items to add them here
                            </span>
                          </>
                        )}
                        {activeStage === "test_results" && (
                          <>
                            <ClipboardCheck className="w-6 h-6 opacity-30 mb-1" />
                            <span className="text-sm">Nothing to test</span>
                            <span className="text-xs">
                              Completed fixes will appear here for testing
                            </span>
                          </>
                        )}
                        {activeStage === "user_review" && (
                          <>
                            <UserCheck className="w-6 h-6 opacity-30 mb-1" />
                            <span className="text-sm">
                              No items pending user review
                            </span>
                            <span className="text-xs">
                              Items sent to users for testing will appear here
                            </span>
                          </>
                        )}
                        {(activeStage === "done" || activeStage === "all") && (
                          <span className="text-sm">No items found</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedFeedback.map((item) => {
                    const statusOption = getStatusOption(item.status);
                    const decisionColors =
                      ADMIN_DECISION_COLORS[item.admin_decision] ||
                      ADMIN_DECISION_COLORS.pending;
                    const decisionLabel =
                      ADMIN_DECISION_LABELS[item.admin_decision] ||
                      ADMIN_DECISION_LABELS.pending;
                    const isTriaged = item.status === "triaged";
                    const needsDecision =
                      (item.status === "triaged" || item.status === "new") &&
                      (item.admin_decision === "pending" ||
                        !item.admin_decision);
                    const isApproved = item.admin_decision === "approved";
                    const isClosed = DONE_STATUSES.includes(item.status);
                    const isDeferred = item.admin_decision === "deferred";
                    const isChildRow = (
                      item as UserFeedback & { isChild?: boolean }
                    ).isChild;
                    const childCount = childrenMap.get(item.id)?.length ?? 0;
                    const isExpanded = expandedParents.has(item.id);

                    return (
                      <TableRow
                        key={item.id}
                        className={cn(
                          "hover:bg-muted/50 cursor-pointer",
                          isApproved && !isClosed && "bg-green-500/5",
                          isDeferred && "opacity-60",
                          isChildRow &&
                            "bg-muted/20 border-l-2 border-l-primary/20",
                        )}
                        onClick={() => handleViewDetails(item)}
                      >
                        <TableCell>
                          <div
                            className={cn(
                              "flex flex-col gap-0.5",
                              isChildRow && "pl-3",
                            )}
                          >
                            {isChildRow && (
                              <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground mb-0.5">
                                <CornerDownRight className="w-2.5 h-2.5" />
                                child
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(item.id);
                                toast.success("ID copied to clipboard");
                              }}
                              className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors group"
                              title={`Click to copy full ID: ${item.id}`}
                            >
                              <span>{item.id.slice(0, 8)}</span>
                              <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                            {childCount > 0 && (
                              <button
                                onClick={(e) =>
                                  toggleParentExpanded(item.id, e)
                                }
                                className="flex items-center gap-0.5 text-[9px] text-primary/70 hover:text-primary transition-colors mt-0.5"
                                title={
                                  isExpanded
                                    ? "Collapse children"
                                    : `Show ${childCount} child item${childCount > 1 ? "s" : ""}`
                                }
                              >
                                <GitBranch className="w-2.5 h-2.5" />
                                <span>{childCount}</span>
                                <ChevronRight
                                  className={cn(
                                    "w-2.5 h-2.5 transition-transform",
                                    isExpanded && "rotate-90",
                                  )}
                                />
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">
                            {item.work_priority !== null ? (
                              <span className="text-foreground/80">
                                #{item.work_priority}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {feedbackTypeIcons[item.feedback_type]}
                            <span className="text-xs font-medium capitalize">
                              {item.feedback_type}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={item.status}
                              onValueChange={(value) =>
                                handleStatusChange(
                                  item.id,
                                  value as FeedbackStatus,
                                )
                              }
                            >
                              <SelectTrigger
                                className="h-7 text-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Badge
                                  className={`${statusOption?.color} border-0`}
                                >
                                  {statusOption?.label}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {item.testing_result &&
                              item.testing_result !== "pending" && (
                                <span
                                  className={cn(
                                    "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0",
                                    item.testing_result === "pass" &&
                                      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                                    item.testing_result === "fail" &&
                                      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                                    item.testing_result === "partial" &&
                                      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                                  )}
                                  title={`Testing: ${item.testing_result}`}
                                >
                                  {item.testing_result === "pass" && (
                                    <CheckCircle2 className="w-3 h-3" />
                                  )}
                                  {item.testing_result === "fail" && (
                                    <XCircle className="w-3 h-3" />
                                  )}
                                  {item.testing_result === "partial" && (
                                    <MinusCircle className="w-3 h-3" />
                                  )}
                                  {item.testing_result === "pass"
                                    ? "Pass"
                                    : item.testing_result === "fail"
                                      ? "Fail"
                                      : "Partial"}
                                </span>
                              )}
                            {item.has_open_issues && (
                              <span
                                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                title="Has open issues"
                              >
                                <AlertTriangle className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {item.category_id ? (
                            (() => {
                              const cat = categories.find(
                                (c) => c.id === item.category_id,
                              );
                              if (!cat)
                                return (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                );
                              const colors =
                                CATEGORY_COLORS[
                                  cat.color as keyof typeof CATEGORY_COLORS
                                ] ?? CATEGORY_COLORS.gray;
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFilterCategory(item.category_id!);
                                  }}
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border hover:opacity-80 transition-opacity",
                                    colors.bg,
                                    colors.text,
                                    colors.border,
                                  )}
                                  title={`Filter by ${cat.name}`}
                                >
                                  <span
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                    )}
                                    style={{
                                      background: "currentColor",
                                      opacity: 0.6,
                                    }}
                                  />
                                  {cat.name}
                                </button>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="line-clamp-2 text-sm">
                                {item.description}
                              </p>
                            </div>
                            {isTriaged && item.ai_solution_proposal && (
                              <Badge
                                variant="outline"
                                className="flex-shrink-0 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800"
                                title="AI triaged with solution proposal"
                              >
                                <Brain className="w-3 h-3 mr-1 text-indigo-600 dark:text-indigo-400" />
                              </Badge>
                            )}
                            {item.image_urls && item.image_urls.length > 0 && (
                              <button
                                onClick={(e) =>
                                  handleViewImages(e, item.image_urls)
                                }
                                className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors text-xs"
                                title="View screenshots"
                              >
                                <ImageIcon className="h-3 w-3" />
                                {item.image_urls.length}
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={`${decisionColors.bg} ${decisionColors.text} border-0 text-xs`}
                            >
                              {decisionLabel}
                            </Badge>
                            {needsDecision && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickApprove(item.id);
                                }}
                                title="Quick approve"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.username || "Anonymous"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {item.assigned_to ? (
                            (() => {
                              const admin = adminById.get(item.assigned_to);
                              const label =
                                admin?.display_name ||
                                admin?.email ||
                                item.assigned_to.slice(0, 8);
                              return (
                                <button
                                  onClick={() =>
                                    setFilterAssignee(item.assigned_to!)
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 transition-colors max-w-[120px]"
                                  title={`Filter by ${label}`}
                                >
                                  <UserCheck className="w-2.5 h-2.5 flex-shrink-0" />
                                  <span className="truncate">{label}</span>
                                </button>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetails(item);
                            }}
                            className="h-7 px-2"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {selectedFeedback && (
        <FeedbackDetailDialog
          feedback={selectedFeedback}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onUpdate={loadFeedback}
          initialTab={stageToDialogTab[activeStage]}
        />
      )}

      <ImagePreviewModal
        open={imagePreviewOpen}
        onOpenChange={setImagePreviewOpen}
        imageUrls={imagePreviewUrls}
      />
    </>
  );
}
