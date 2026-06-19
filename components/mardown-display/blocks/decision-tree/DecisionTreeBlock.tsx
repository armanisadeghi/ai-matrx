"use client";
import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  GitBranch,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Maximize2,
  Minimize2,
  RotateCcw,
  Home,
  HelpCircle,
  Target,
  Info,
  ChevronRight,
  ChevronDown,
  Clock,
  ExternalLink,
  Printer,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import IconButton from "@/components/official/IconButton";

interface DecisionNode {
  id: string;
  question?: string;
  action?: string;
  description?: string;
  yes?: DecisionNode;
  no?: DecisionNode;
  type?: "question" | "action" | "info";
  priority?: "low" | "medium" | "high";
  category?: string;
  estimatedTime?: string;
}

interface DecisionTreeData {
  title: string;
  description?: string;
  root: DecisionNode;
}

interface DecisionTreeBlockProps {
  decisionTree: DecisionTreeData;
  taskId?: string; // Task ID for canvas deduplication
}

interface NavigationStep {
  nodeId: string;
  choice?: "yes" | "no";
  question?: string;
  timestamp: number;
}

const STAT_ITEMS = [
  { key: "totalNodes", label: "Nodes", icon: GitBranch },
  { key: "questionNodes", label: "Questions", icon: HelpCircle },
  { key: "actionNodes", label: "Actions", icon: Target },
  { key: "completedPaths", label: "Completed", icon: CheckCircle2 },
] as const;

const navBtnClass =
  "inline-flex items-center justify-center gap-1 p-1.5 md:px-2 md:py-1.5 rounded-md text-xs font-medium border transition-colors";

const DecisionTreeBlock: React.FC<DecisionTreeBlockProps> = ({
  decisionTree,
  taskId,
}) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const blockContentRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const handlePrint = useCallback(async () => {
    if (!blockContentRef.current || isPrinting) return;
    setIsPrinting(true);
    try {
      const { captureBlockElement } =
        await import("@/features/chat/utils/dom-capture-block-printer");
      await captureBlockElement(
        blockContentRef.current,
        decisionTree.title.replace(/\s+/g, "-").toLowerCase() ||
          "decision-tree",
      );
    } catch (err) {
      console.error("[DecisionTreeBlock] Print failed:", err);
    } finally {
      setIsPrinting(false);
    }
  }, [decisionTree.title, isPrinting]);
  const [currentNode, setCurrentNode] = useState<DecisionNode>(
    decisionTree.root,
  );
  const [navigationHistory, setNavigationHistory] = useState<NavigationStep[]>(
    [],
  );
  const [completedPaths, setCompletedPaths] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(["root"]),
  );
  const [showFullTree, setShowFullTree] = useState(false);
  const { open: openCanvas } = useCanvas();

  // Calculate tree statistics
  const treeStats = useMemo(() => {
    const stats = {
      totalNodes: 0,
      questionNodes: 0,
      actionNodes: 0,
      maxDepth: 0,
      completedPaths: completedPaths.size,
    };

    const traverse = (node: DecisionNode, depth = 0) => {
      if (!node) return;

      stats.totalNodes++;
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      if (node.question) stats.questionNodes++;
      if (node.action) stats.actionNodes++;

      if (node.yes) traverse(node.yes, depth + 1);
      if (node.no) traverse(node.no, depth + 1);
    };

    traverse(decisionTree.root);
    return stats;
  }, [decisionTree.root, completedPaths]);

  const handleChoice = (choice: "yes" | "no") => {
    const nextNode = choice === "yes" ? currentNode.yes : currentNode.no;

    if (nextNode) {
      // Add to navigation history
      const step: NavigationStep = {
        nodeId: currentNode.id,
        choice,
        question: currentNode.question,
        timestamp: Date.now(),
      };

      setNavigationHistory((prev) => [...prev, step]);
      setCurrentNode(nextNode);

      // Mark path as completed if we reach an action node
      if (nextNode.action) {
        setCompletedPaths((prev) => new Set([...prev, nextNode.id]));
      }
    }
  };

  const goBack = () => {
    if (navigationHistory.length > 0) {
      const newHistory = [...navigationHistory];
      newHistory.pop();
      setNavigationHistory(newHistory);

      // Navigate back to previous node
      let node = decisionTree.root;
      for (const step of newHistory) {
        node = step.choice === "yes" ? node.yes || node : node.no || node;
      }
      setCurrentNode(node);
    }
  };

  const resetTree = () => {
    setCurrentNode(decisionTree.root);
    setNavigationHistory([]);
    setCompletedPaths(new Set());
  };

  const goToRoot = () => {
    setCurrentNode(decisionTree.root);
    setNavigationHistory([]);
  };

  const toggleNodeExpansion = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const getNodeIcon = (node: DecisionNode) => {
    if (node.question) return HelpCircle;
    if (node.action) return Target;
    return Info;
  };

  const getNodeColor = (node: DecisionNode, isActive = false) => {
    if (isActive) {
      return "bg-blue-500 dark:bg-blue-600 text-white border-blue-500 dark:border-blue-600";
    }

    if (node.question) {
      return "bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700";
    }

    if (node.action) {
      const isCompleted = completedPaths.has(node.id);
      return isCompleted
        ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700"
        : "bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700";
    }

    return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700";
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

  const getFullTreeNodeColor = (node: DecisionNode) => {
    if (node.question) {
      return "bg-card border border-border border-l-[3px] border-l-orange-400 text-foreground";
    }
    if (node.action) {
      const isCompleted = completedPaths.has(node.id);
      return isCompleted
        ? "bg-card border border-border border-l-[3px] border-l-green-500 text-foreground"
        : "bg-card border border-border border-l-[3px] border-l-purple-400 text-foreground";
    }
    return "bg-card border border-border text-foreground";
  };

  const branchLabelClass = (choice: "yes" | "no") =>
    choice === "yes"
      ? "text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 bg-green-50/90 dark:bg-green-950/50"
      : "text-red-700 dark:text-red-400 border-red-300 dark:border-red-700 bg-red-50/90 dark:bg-red-950/50";

  const renderTreeNode = (node: DecisionNode, depth = 0) => {
    if (!node) return null;

    const isExpanded = expandedNodes.has(node.id);
    const isActive = currentNode.id === node.id;
    const isCompleted = completedPaths.has(node.id);
    const hasChildren = !!(node.yes || node.no);
    const IconComponent = getNodeIcon(node);

    const cardColor =
      isActive || !showFullTree
        ? getNodeColor(node, isActive)
        : getFullTreeNodeColor(node);

    return (
      <div key={node.id} className="min-w-0">
        <div
          className={`rounded-md transition-all ${cardColor} ${
            isActive && node.question ? "p-3 shadow-md" : "p-2 hover:shadow-sm"
          }`}
        >
          {isActive && node.question ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div
                  className={`relative flex-shrink-0 p-1.5 rounded-md ${isActive ? "bg-white/20" : "bg-textured"}`}
                >
                  <IconComponent
                    className={`h-3.5 w-3.5 ${isActive ? "text-white" : ""}`}
                  />
                  {isCompleted && (
                    <CheckCircle2 className="h-2.5 w-2.5 text-green-500 absolute -top-0.5 -right-0.5" />
                  )}
                </div>
                <p className="text-sm font-semibold leading-snug flex-1 min-w-0">
                  {node.question}
                </p>
                {hasChildren && showFullTree && (
                  <button
                    type="button"
                    onClick={() => toggleNodeExpansion(node.id)}
                    className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>

              {node.description && (
                <p className="text-xs opacity-90 leading-relaxed">
                  {node.description}
                </p>
              )}

              {(node.priority || node.category || node.estimatedTime) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {node.priority && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${getPriorityColor(node.priority)}`}
                    >
                      {node.priority}
                    </span>
                  )}
                  {node.category && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-full">
                      {node.category}
                    </span>
                  )}
                  {node.estimatedTime && (
                    <div className="flex items-center gap-1 text-[10px] opacity-75">
                      <Clock className="h-3 w-3" />
                      {node.estimatedTime}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleChoice("yes")}
                  disabled={!node.yes}
                  title="Yes"
                  className="flex-1 inline-flex items-center justify-center gap-1 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-md text-xs font-medium transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => handleChoice("no")}
                  disabled={!node.no}
                  title="No"
                  className="flex-1 inline-flex items-center justify-center gap-1 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-md text-xs font-medium transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  No
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 min-w-0">
              <span className="relative flex-shrink-0 mt-0.5">
                <IconComponent className="h-3.5 w-3.5 opacity-70" />
                {isCompleted && (
                  <CheckCircle2 className="h-2.5 w-2.5 text-green-500 absolute -top-0.5 -right-0.5" />
                )}
              </span>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-snug">
                  {node.question || node.action || "Decision Point"}
                </div>
                {node.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {node.description}
                  </p>
                )}

                {(node.priority || node.category || node.estimatedTime) && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {node.priority && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${getPriorityColor(node.priority)}`}
                      >
                        {node.priority}
                      </span>
                    )}
                    {node.category && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded-full">
                        {node.category}
                      </span>
                    )}
                    {node.estimatedTime && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {node.estimatedTime}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {hasChildren && showFullTree && (
                <button
                  type="button"
                  onClick={() => toggleNodeExpansion(node.id)}
                  className="p-1 hover:bg-muted rounded transition-colors flex-shrink-0"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {hasChildren && (showFullTree ? isExpanded : isActive) && (
          <div className="mt-1.5 space-y-2">
            {showFullTree ? (
              <>
                {node.yes && (
                  <div className="pl-2 border-l-2 border-green-500/60 dark:border-green-600/60">
                    <span
                      className={`inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border mb-1 ${branchLabelClass("yes")}`}
                    >
                      Yes
                    </span>
                    <div>{renderTreeNode(node.yes, depth + 1)}</div>
                  </div>
                )}
                {node.no && (
                  <div className="pl-2 border-l-2 border-red-500/60 dark:border-red-600/60">
                    <span
                      className={`inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border mb-1 ${branchLabelClass("no")}`}
                    >
                      No
                    </span>
                    <div>{renderTreeNode(node.no, depth + 1)}</div>
                  </div>
                )}
              </>
            ) : (
              <>
                {node.yes && renderTreeNode(node.yes, depth + 1)}
                {node.no && renderTreeNode(node.no, depth + 1)}
              </>
            )}
          </div>
        )}
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
        className={`w-full border border-border rounded-xl ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-2" : "py-2"}`}
      >
        <div
          className={`max-w-6xl mx-auto ${isFullScreen ? "bg-textured rounded-2xl shadow-2xl h-full max-h-[95dvh] w-full flex flex-col overflow-hidden" : ""}`}
        >
          {/* Fullscreen Header */}
          {isFullScreen && (
            <div className="flex-shrink-0 px-3 py-2 border-b border-border flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch className="h-4 w-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {decisionTree.title}
                </h3>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <IconButton
                  icon={Printer}
                  tooltip={isPrinting ? "Saving…" : "Print / Save as PDF"}
                  onClick={handlePrint}
                  disabled={isPrinting}
                  size="sm"
                  className="bg-slate-500 dark:bg-slate-600 text-white hover:bg-slate-600 dark:hover:bg-slate-700"
                />
                <IconButton
                  icon={Minimize2}
                  tooltip="Exit full screen"
                  onClick={() => setIsFullScreen(false)}
                  size="sm"
                  variant="outline"
                />
              </div>
            </div>
          )}

          {/* Scrollable Content */}
          <div className={isFullScreen ? "flex-1 overflow-y-auto" : ""}>
            <div ref={blockContentRef} className="p-2 space-y-3">
              {/* Header Section */}
              <div className="bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-pink-950/40 rounded-xl p-2 border border-indigo-200 dark:border-indigo-800/50">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className="p-2 bg-indigo-500 dark:bg-indigo-600 rounded-lg flex-shrink-0">
                      <GitBranch className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-sm font-bold text-foreground leading-tight line-clamp-2">
                        {decisionTree.title}
                      </h1>
                      {decisionTree.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {decisionTree.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isFullScreen && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <IconButton
                        icon={Printer}
                        tooltip={isPrinting ? "Saving…" : "Print / Save as PDF"}
                        onClick={handlePrint}
                        disabled={isPrinting}
                        size="sm"
                        className="bg-slate-500 dark:bg-slate-600 text-white hover:bg-slate-600 dark:hover:bg-slate-700"
                      />
                      <IconButton
                        icon={ExternalLink}
                        tooltip="Open Canvas"
                        onClick={() =>
                          openCanvas({
                            type: "decision-tree",
                            data: decisionTree,
                            metadata: {
                              title: decisionTree.title,
                              sourceTaskId: taskId,
                            },
                          })
                        }
                        size="sm"
                        className="bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700"
                      />
                      <IconButton
                        icon={Maximize2}
                        tooltip="Expand to full screen"
                        onClick={() => setIsFullScreen(true)}
                        size="sm"
                        className="bg-indigo-500 dark:bg-indigo-600 text-white hover:bg-indigo-600 dark:hover:bg-indigo-700"
                      />
                    </div>
                  )}
                </div>

                {/* Navigation Controls — first row to wrap on narrow widths */}
                <div className="flex items-center gap-1 flex-wrap mb-2">
                  <button
                    type="button"
                    onClick={goToRoot}
                    title="Start Over"
                    className={`${navBtnClass} bg-background/60 hover:bg-background text-foreground border-border`}
                  >
                    <Home className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="hidden md:inline">Start</span>
                  </button>

                  <button
                    type="button"
                    onClick={goBack}
                    disabled={navigationHistory.length === 0}
                    title="Back"
                    className={`${navBtnClass} bg-background/60 hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed text-foreground border-border`}
                  >
                    <ArrowLeft className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="hidden md:inline">Back</span>
                  </button>

                  <button
                    type="button"
                    onClick={resetTree}
                    title="Reset"
                    className={`${navBtnClass} bg-background/60 hover:bg-background text-foreground border-border`}
                  >
                    <RotateCcw className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="hidden md:inline">Reset</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowFullTree(!showFullTree)}
                    title={showFullTree ? "Hide full tree" : "Show full tree"}
                    className={`${navBtnClass} border ${
                      showFullTree
                        ? "bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700"
                        : "bg-background/60 hover:bg-background text-foreground border-border"
                    }`}
                  >
                    <GitBranch className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="hidden md:inline">Full</span>
                  </button>

                  <div
                    className={`${navBtnClass} bg-background/60 text-muted-foreground border-border tabular-nums`}
                    title={`Step ${navigationHistory.length + 1}`}
                  >
                    <span className="hidden md:inline">Step</span>
                    {navigationHistory.length + 1}
                  </div>
                </div>

                {/* Progress Stats */}
                <div className="grid grid-cols-4 gap-1.5">
                  {STAT_ITEMS.map(({ key, label, icon: StatIcon }) => (
                    <div
                      key={key}
                      className="rounded-md border border-border bg-background/50 px-1.5 py-1.5 text-center"
                    >
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <StatIcon className="h-3 w-3 flex-shrink-0" />
                        <span className="text-[10px] font-medium truncate hidden md:inline">
                          {label}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-foreground tabular-nums">
                        {treeStats[key]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Navigation Breadcrumbs */}
              {navigationHistory.length > 0 && (
                <div className="bg-background/50 rounded-lg p-2 border border-border">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <ArrowRight className="h-3.5 w-3.5" />
                    Decision Path
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                      Start
                    </span>
                    {navigationHistory.map((step, index) => (
                      <React.Fragment key={index}>
                        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs text-muted-foreground max-w-[8rem] sm:max-w-xs truncate">
                            {step.question}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                              step.choice === "yes"
                                ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                                : "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                            }`}
                          >
                            {step.choice?.toUpperCase()}
                          </span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {/* Decision Tree Visualization */}
              <div className="bg-background/50 rounded-lg border border-border overflow-hidden">
                <div className="p-2">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5 min-w-0">
                      <GitBranch className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                      <span className="truncate">
                        {showFullTree
                          ? "Full Decision Tree"
                          : "Current Decision Point"}
                      </span>
                    </h2>

                    {currentNode.action && (
                      <div
                        className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded-md flex-shrink-0"
                        title="Decision Complete"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium hidden sm:inline">
                          Decision Complete
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="decision-tree-container">
                    {renderTreeNode(
                      showFullTree ? decisionTree.root : currentNode,
                    )}
                  </div>
                </div>
              </div>

              {/* Final Action Display */}
              {currentNode.action && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg p-3 border border-green-300 dark:border-green-700">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-500 dark:bg-green-600 rounded-full flex-shrink-0">
                      <Target className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
                        Recommended Action
                      </h3>
                      <p className="text-green-800 dark:text-green-200 text-sm mb-2">
                        {currentNode.action}
                      </p>
                      {currentNode.description && (
                        <p className="text-green-700 dark:text-green-300 text-xs mb-2">
                          {currentNode.description}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() =>
                            setCompletedPaths(
                              (prev) => new Set([...prev, currentNode.id]),
                            )
                          }
                          title="Mark as Completed"
                          className="inline-flex items-center gap-1 px-2 py-1.5 bg-green-600 dark:bg-green-700 text-white rounded-md text-xs font-medium hover:bg-green-700 dark:hover:bg-green-800 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">
                            Mark as Completed
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={goToRoot}
                          title="Start New Decision"
                          className="inline-flex items-center gap-1 px-2 py-1.5 bg-background text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700 rounded-md text-xs font-medium hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">
                            Start New Decision
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default DecisionTreeBlock;
