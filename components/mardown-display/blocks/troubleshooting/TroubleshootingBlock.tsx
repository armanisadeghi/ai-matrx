"use client";
import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  HelpCircle,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Search,
  Filter,
  Lightbulb,
  ExternalLink,
  Bug,
  Wrench,
  Zap,
  Clock,
  Star,
  Copy,
  Check,
  ArrowRight,
  AlertCircle,
  Info,
  Target,
  BookOpen,
  Users,
  MessageSquare,
  Upload,
  Printer,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import ImportTasksModal from "@/features/tasks/components/ImportTasksModal";
import { convertTroubleshootingToTasks } from "@/features/tasks/utils/importConverters";

interface TroubleshootingStep {
  id: string;
  title: string;
  description: string;
  commands?: string[];
  links?: { title: string; url: string }[];
  difficulty?: "easy" | "medium" | "hard";
  estimatedTime?: string;
}

interface TroubleshootingSolution {
  id: string;
  title: string;
  description?: string;
  steps: TroubleshootingStep[];
  priority?: "low" | "medium" | "high";
  successRate?: number;
  tags?: string[];
}

interface TroubleshootingIssue {
  id: string;
  symptom: string;
  description?: string;
  causes: string[];
  solutions: TroubleshootingSolution[];
  relatedIssues?: string[];
  severity?: "low" | "medium" | "high" | "critical";
}

interface TroubleshootingData {
  title: string;
  description?: string;
  issues: TroubleshootingIssue[];
}

export interface TroubleshootingState {
  completedSteps: string[];
  expandedIssues: string[];
  expandedSolutions: string[];
}

interface TroubleshootingBlockProps {
  troubleshooting: TroubleshootingData;
  taskId?: string; // Task ID for canvas deduplication
  /** Seed interaction state from persisted storage (optional). */
  initialState?: TroubleshootingState;
  /** Called whenever the user changes interaction state (optional). */
  onStateChange?: (state: TroubleshootingState) => void;
}

const TroubleshootingBlock: React.FC<TroubleshootingBlockProps> = ({
  troubleshooting,
  taskId,
  initialState,
  onStateChange,
}) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const blockContentRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const handlePrint = useCallback(async () => {
    if (!blockContentRef.current || isPrinting) return;
    setIsPrinting(true);
    try {
      const { captureBlockElement } =
        await import("@/lib/block-print/dom-capture-block-printer");
      await captureBlockElement(
        blockContentRef.current,
        troubleshooting.title.replace(/\s+/g, "-").toLowerCase() ||
          "troubleshooting",
        "portrait",
      );
    } catch (err) {
      console.error("[TroubleshootingBlock] Print failed:", err);
    } finally {
      setIsPrinting(false);
    }
  }, [troubleshooting.title, isPrinting]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(
    () => initialState ? new Set(initialState.expandedIssues) : new Set(["issue-0"]),
  );
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(
    () => initialState ? new Set(initialState.expandedSolutions) : new Set(),
  );
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all");
  const [copiedCommands, setCopiedCommands] = useState<Set<string>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(
    () => initialState ? new Set(initialState.completedSteps) : new Set(),
  );
  const { open: openCanvas } = useCanvas();

  // Keep a stable ref to onStateChange so closures don't go stale.
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  // Convert troubleshooting to tasks format
  const convertedTasks = useMemo(() => {
    return convertTroubleshootingToTasks(
      troubleshooting.title,
      troubleshooting.issues,
    );
  }, [troubleshooting]);

  // Build checkbox state from completed steps
  const checkboxState = useMemo(() => {
    const state: Record<string, boolean> = {};
    convertedTasks.forEach((task) => {
      state[task.id] = task.checked || false;
      if (task.children) {
        task.children.forEach((child) => {
          state[child.id] = child.checked || false;
        });
      }
    });
    return state;
  }, [convertedTasks]);

  // Filter issues based on search and severity
  const filteredIssues = useMemo(() => {
    return troubleshooting.issues.filter((issue) => {
      const matchesSearch =
        searchQuery === "" ||
        issue.symptom.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.causes.some((cause) =>
          cause.toLowerCase().includes(searchQuery.toLowerCase()),
        ) ||
        issue.solutions.some(
          (solution) =>
            solution.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            solution.description
              ?.toLowerCase()
              .includes(searchQuery.toLowerCase()),
        );

      const matchesSeverity =
        selectedSeverity === "all" || issue.severity === selectedSeverity;

      return matchesSearch && matchesSeverity;
    });
  }, [troubleshooting.issues, searchQuery, selectedSeverity]);

  /** Emit the current interaction state to the persistence layer. */
  const emitState = useCallback(
    (
      steps: Set<string>,
      issues: Set<string>,
      solutions: Set<string>,
    ) => {
      onStateChangeRef.current?.({
        completedSteps: Array.from(steps),
        expandedIssues: Array.from(issues),
        expandedSolutions: Array.from(solutions),
      });
    },
    [],
  );

  const toggleIssue = (issueId: string) => {
    const newExpanded = new Set(expandedIssues);
    if (newExpanded.has(issueId)) {
      newExpanded.delete(issueId);
    } else {
      newExpanded.add(issueId);
    }
    setExpandedIssues(newExpanded);
    emitState(completedSteps, newExpanded, expandedSolutions);
  };

  const toggleSolution = (solutionId: string) => {
    const newExpanded = new Set(expandedSolutions);
    if (newExpanded.has(solutionId)) {
      newExpanded.delete(solutionId);
    } else {
      newExpanded.add(solutionId);
    }
    setExpandedSolutions(newExpanded);
    emitState(completedSteps, expandedIssues, newExpanded);
  };

  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const toggleStepCompletion = (stepId: string) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(stepId)) {
      newCompleted.delete(stepId);
    } else {
      newCompleted.add(stepId);
    }
    setCompletedSteps(newCompleted);
    emitState(newCompleted, expandedIssues, expandedSolutions);
  };

  const copyCommand = async (command: string, commandId: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommands(new Set([...copiedCommands, commandId]));
      setTimeout(() => {
        setCopiedCommands((prev) => {
          const newSet = new Set(prev);
          newSet.delete(commandId);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      console.error("Failed to copy command:", err);
    }
  };

  const getSeverityColor = (severity: string | undefined) => {
    switch (severity) {
      case "critical":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
      case "high":
        return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800";
      case "low":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-700";
    }
  };

  const getSeverityIcon = (severity: string | undefined) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="h-4 w-4" />;
      case "high":
        return <AlertCircle className="h-4 w-4" />;
      case "medium":
        return <Info className="h-4 w-4" />;
      case "low":
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return <HelpCircle className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string | undefined) => {
    switch (priority) {
      case "high":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30";
      case "low":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/30";
    }
  };

  const getDifficultyColor = (difficulty: string | undefined) => {
    switch (difficulty) {
      case "hard":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30";
      case "easy":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/30";
    }
  };

  const renderSuccessRate = (rate: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3 w-3 ${
              star <= Math.round(rate / 20)
                ? "text-yellow-500 fill-yellow-500"
                : "text-gray-300 dark:text-gray-600"
            }`}
          />
        ))}
        <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">
          {rate}%
        </span>
      </div>
    );
  };

  return (
    <>
      {/* Fullscreen Backdrop */}
      {isFullScreen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsFullScreen(false)}
        />
      )}

      <div
        className={`w-full ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-4" : "py-6"}`}
      >
        <div
          className={`max-w-6xl mx-auto ${isFullScreen ? "bg-textured rounded-2xl shadow-2xl h-full max-h-[95dvh] w-full flex flex-col overflow-hidden" : ""}`}
        >
          {/* Fullscreen Header */}
          {isFullScreen && (
            <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30">
              <div className="flex items-center gap-3">
                <HelpCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  Troubleshooting Guide
                </h3>
              </div>
              <button
                onClick={() => setIsFullScreen(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-all shadow-sm"
              >
                <Minimize2 className="h-4 w-4" />
                <span>Exit</span>
              </button>
            </div>
          )}

          {/* Scrollable Content */}
          <div className={isFullScreen ? "flex-1 overflow-y-auto" : ""}>
            <div className="p-6 space-y-6">
              {/* Header Section */}
              <div className="bg-gradient-to-br from-red-100 via-orange-50 to-yellow-100 dark:from-red-950/40 dark:via-orange-950/30 dark:to-yellow-950/40 rounded-2xl p-6 shadow-lg border-2 border-red-200 dark:border-red-800/50">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-red-500 dark:bg-red-600 rounded-xl shadow-md">
                      <HelpCircle className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        {troubleshooting.title}
                      </h1>
                      {troubleshooting.description && (
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                          {troubleshooting.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isFullScreen && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-500 dark:bg-green-600 text-white text-sm font-semibold shadow-md hover:bg-green-600 dark:hover:bg-green-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <Upload className="h-4 w-4" />
                        <span>Import to Tasks</span>
                      </button>
                      <button
                        onClick={() =>
                          openCanvas({
                            type: "troubleshooting",
                            data: troubleshooting,
                            metadata: {
                              title: troubleshooting.title,
                              sourceTaskId: taskId,
                            },
                          })
                        }
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 dark:bg-purple-600 text-white text-sm font-semibold shadow-md hover:bg-purple-600 dark:hover:bg-purple-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>Canvas</span>
                      </button>
                      <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-500 dark:bg-slate-600 text-white text-sm font-semibold shadow-md hover:bg-slate-600 dark:hover:bg-slate-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <Printer className="h-4 w-4" />
                        <span>Print</span>
                      </button>
                      <button
                        onClick={() => setIsFullScreen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500 dark:bg-red-600 text-white text-sm font-semibold shadow-md hover:bg-red-600 dark:hover:bg-red-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <Maximize2 className="h-4 w-4" />
                        <span>Debug Mode</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search issues or solutions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 rounded-lg border-border bg-textured text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                      />
                    </div>

                    <select
                      value={selectedSeverity}
                      onChange={(e) => setSelectedSeverity(e.target.value)}
                      className="px-3 py-2 rounded-lg border-border bg-textured text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="all">All Severities</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {filteredIssues.length} issue
                      {filteredIssues.length !== 1 ? "s" : ""} found
                    </span>
                  </div>
                </div>
              </div>

              {/* Issues List */}
              <div ref={blockContentRef} className="space-y-4">
                {filteredIssues.map((issue) => {
                  const isExpanded = expandedIssues.has(issue.id);
                  const severityColor = getSeverityColor(issue.severity);
                  const severityIcon = getSeverityIcon(issue.severity);

                  return (
                    <div
                      key={issue.id}
                      className={`bg-textured rounded-xl shadow-lg border-2 ${severityColor.split(" ").slice(2).join(" ")} overflow-hidden`}
                    >
                      {/* Issue Header */}
                      <button
                        onClick={() => toggleIssue(issue.id)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                      >
                        <div className="flex items-start gap-4 flex-1">
                          <div
                            className={`p-2 rounded-lg border ${severityColor}`}
                          >
                            {severityIcon}
                          </div>
                          <div className="flex-1">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                              {issue.symptom}
                            </h2>
                            {issue.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {issue.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded-full ${severityColor}`}
                              >
                                {issue.severity || "unknown"}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {issue.solutions.length} solution
                                {issue.solutions.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {/* Issue Content */}
                      {isExpanded && (
                        <div className="border-t border-border p-6 space-y-6">
                          {/* Possible Causes */}
                          {issue.causes.length > 0 && (
                            <div>
                              <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                                <Bug className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                Possible Causes
                              </h3>
                              <ul className="space-y-2">
                                {issue.causes.map((cause, index) => (
                                  <li
                                    key={index}
                                    className="flex items-start gap-2"
                                  >
                                    <ArrowRight className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {cause}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Solutions */}
                          <div>
                            <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                              <Wrench className="h-4 w-4 text-green-600 dark:text-green-400" />
                              Solutions
                            </h3>
                            <div className="space-y-4">
                              {issue.solutions.map((solution) => {
                                const isSolutionExpanded =
                                  expandedSolutions.has(solution.id);
                                const priorityColor = getPriorityColor(
                                  solution.priority,
                                );

                                return (
                                  <div
                                    key={solution.id}
                                    className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border-border"
                                  >
                                    <button
                                      onClick={() =>
                                        toggleSolution(solution.id)
                                      }
                                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors text-left rounded-t-lg"
                                    >
                                      <div className="flex items-center gap-3 flex-1">
                                        <Lightbulb className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                            {solution.title}
                                          </h4>
                                          {solution.description && (
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                              {solution.description}
                                            </p>
                                          )}
                                          <div className="flex items-center gap-2 mt-2">
                                            {solution.priority && (
                                              <span
                                                className={`px-2 py-0.5 text-xs font-medium rounded-full ${priorityColor}`}
                                              >
                                                {solution.priority} priority
                                              </span>
                                            )}
                                            {solution.successRate && (
                                              <div className="flex items-center gap-1">
                                                {renderSuccessRate(
                                                  solution.successRate,
                                                )}
                                              </div>
                                            )}
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                              {solution.steps.length} step
                                              {solution.steps.length !== 1
                                                ? "s"
                                                : ""}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {isSolutionExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-gray-400" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-gray-400" />
                                      )}
                                    </button>

                                    {/* Solution Steps */}
                                    {isSolutionExpanded && (
                                      <div className="border-t border-border p-4">
                                        <div className="space-y-3">
                                          {solution.steps.map(
                                            (step, stepIndex) => {
                                              const isStepExpanded =
                                                expandedSteps.has(step.id);
                                              const isStepCompleted =
                                                completedSteps.has(step.id);
                                              const difficultyColor =
                                                getDifficultyColor(
                                                  step.difficulty,
                                                );

                                              return (
                                                <div
                                                  key={step.id}
                                                  className={`border rounded-lg ${
                                                    isStepCompleted
                                                      ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20"
                                                      : "border-gray-200 dark:border-gray-700 bg-textured"
                                                  }`}
                                                >
                                                  <div className="flex items-start gap-3 p-3">
                                                    <button
                                                      onClick={() =>
                                                        toggleStepCompletion(
                                                          step.id,
                                                        )
                                                      }
                                                      className="flex-shrink-0 mt-0.5"
                                                    >
                                                      {isStepCompleted ? (
                                                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                      ) : (
                                                        <div className="h-5 w-5 border-2 border-gray-300 dark:border-gray-600 rounded-full hover:border-green-500 dark:hover:border-green-400 transition-colors" />
                                                      )}
                                                    </button>

                                                    <div className="flex-1 min-w-0">
                                                      <div className="flex items-center justify-between">
                                                        <h5
                                                          className={`font-medium ${
                                                            isStepCompleted
                                                              ? "line-through text-green-700 dark:text-green-300"
                                                              : "text-gray-900 dark:text-gray-100"
                                                          }`}
                                                        >
                                                          {stepIndex + 1}.{" "}
                                                          {step.title}
                                                        </h5>
                                                        <button
                                                          onClick={() =>
                                                            toggleStep(step.id)
                                                          }
                                                          className="ml-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                                        >
                                                          {isStepExpanded ? (
                                                            <ChevronDown className="h-4 w-4 text-gray-400" />
                                                          ) : (
                                                            <ChevronRight className="h-4 w-4 text-gray-400" />
                                                          )}
                                                        </button>
                                                      </div>

                                                      <p
                                                        className={`text-sm mt-1 ${
                                                          isStepCompleted
                                                            ? "line-through text-green-600 dark:text-green-400"
                                                            : "text-gray-600 dark:text-gray-400"
                                                        }`}
                                                      >
                                                        {step.description}
                                                      </p>

                                                      <div className="flex items-center gap-2 mt-2">
                                                        {step.difficulty && (
                                                          <span
                                                            className={`px-2 py-0.5 text-xs font-medium rounded-full ${difficultyColor}`}
                                                          >
                                                            {step.difficulty}
                                                          </span>
                                                        )}
                                                        {step.estimatedTime && (
                                                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                                            <Clock className="h-3 w-3" />
                                                            {step.estimatedTime}
                                                          </div>
                                                        )}
                                                      </div>

                                                      {/* Step Details */}
                                                      {isStepExpanded && (
                                                        <div className="mt-3 space-y-3">
                                                          {/* Commands */}
                                                          {step.commands &&
                                                            step.commands
                                                              .length > 0 && (
                                                              <div>
                                                                <h6 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                                  Commands:
                                                                </h6>
                                                                <div className="space-y-2">
                                                                  {step.commands.map(
                                                                    (
                                                                      command,
                                                                      cmdIndex,
                                                                    ) => {
                                                                      const commandId = `${step.id}-cmd-${cmdIndex}`;
                                                                      const isCopied =
                                                                        copiedCommands.has(
                                                                          commandId,
                                                                        );

                                                                      return (
                                                                        <div
                                                                          key={
                                                                            cmdIndex
                                                                          }
                                                                          className="relative"
                                                                        >
                                                                          <pre className="bg-gray-900 dark:bg-gray-950 text-green-400 dark:text-green-300 p-3 rounded-lg text-xs overflow-x-auto">
                                                                            <code>
                                                                              {
                                                                                command
                                                                              }
                                                                            </code>
                                                                          </pre>
                                                                          <button
                                                                            onClick={() =>
                                                                              copyCommand(
                                                                                command,
                                                                                commandId,
                                                                              )
                                                                            }
                                                                            className="absolute top-2 right-2 p-1 bg-gray-800 dark:bg-gray-900 hover:bg-gray-700 dark:hover:bg-gray-800 rounded transition-colors"
                                                                          >
                                                                            {isCopied ? (
                                                                              <Check className="h-3 w-3 text-green-400" />
                                                                            ) : (
                                                                              <Copy className="h-3 w-3 text-gray-400" />
                                                                            )}
                                                                          </button>
                                                                        </div>
                                                                      );
                                                                    },
                                                                  )}
                                                                </div>
                                                              </div>
                                                            )}

                                                          {/* Links */}
                                                          {step.links &&
                                                            step.links.length >
                                                              0 && (
                                                              <div>
                                                                <h6 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                                  References:
                                                                </h6>
                                                                <div className="space-y-1">
                                                                  {step.links.map(
                                                                    (
                                                                      link,
                                                                      linkIndex,
                                                                    ) => (
                                                                      <a
                                                                        key={
                                                                          linkIndex
                                                                        }
                                                                        href={
                                                                          link.url
                                                                        }
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                                                                      >
                                                                        <ExternalLink className="h-3 w-3" />
                                                                        {
                                                                          link.title
                                                                        }
                                                                      </a>
                                                                    ),
                                                                  )}
                                                                </div>
                                                              </div>
                                                            )}
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            },
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Related Issues */}
                          {issue.relatedIssues &&
                            issue.relatedIssues.length > 0 && (
                              <div>
                                <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                                  <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  Related Issues
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                  {issue.relatedIssues.map(
                                    (relatedIssue, index) => (
                                      <span
                                        key={index}
                                        className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full"
                                      >
                                        {relatedIssue}
                                      </span>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Summary Stats */}
              <div className="grid md:grid-cols-4 gap-4">
                <div className="bg-textured rounded-lg p-4 border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <Target className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Total Issues
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {troubleshooting.issues.length}
                  </div>
                </div>

                <div className="bg-textured rounded-lg p-4 border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <Wrench className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Solutions
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {troubleshooting.issues.reduce(
                      (sum, issue) => sum + issue.solutions.length,
                      0,
                    )}
                  </div>
                </div>

                <div className="bg-textured rounded-lg p-4 border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Completed
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {completedSteps.size}
                  </div>
                </div>

                <div className="bg-textured rounded-lg p-4 border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <BookOpen className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Total Steps
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {troubleshooting.issues.reduce(
                      (sum, issue) =>
                        sum +
                        issue.solutions.reduce(
                          (sSum, solution) => sSum + solution.steps.length,
                          0,
                        ),
                      0,
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      <ImportTasksModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        tasks={convertedTasks}
        checkboxState={checkboxState}
      />
    </>
  );
};

export default TroubleshootingBlock;
