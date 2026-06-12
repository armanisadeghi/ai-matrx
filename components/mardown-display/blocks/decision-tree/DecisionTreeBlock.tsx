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
  Lightbulb,
  AlertCircle,
  Info,
  Zap,
  Star,
  ChevronRight,
  ChevronDown,
  PlayCircle,
  StopCircle,
  Clock,
  ExternalLink,
  Printer,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";

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

  const renderTreeNode = (
    node: DecisionNode,
    depth = 0,
    parentChoice?: "yes" | "no",
  ) => {
    if (!node) return null;

    const isExpanded = expandedNodes.has(node.id);
    const isActive = currentNode.id === node.id;
    const isCompleted = completedPaths.has(node.id);
    const hasChildren = !!(node.yes || node.no);
    const IconComponent = getNodeIcon(node);

    return (
      <div key={node.id} className="relative">
        {/* Connection Line */}
        {depth > 0 && (
          <div className="absolute -left-4 top-6 w-4 h-px bg-gray-300 dark:bg-gray-600" />
        )}

        {/* Node */}
        <div
          className={`flex items-start gap-3 mb-4 ${depth > 0 ? "ml-8" : ""}`}
        >
          {/* Choice Indicator */}
          {parentChoice && (
            <div
              className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-bold ${
                parentChoice === "yes"
                  ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                  : "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300"
              }`}
            >
              {parentChoice === "yes" ? "YES" : "NO"}
            </div>
          )}

          {/* Node Content */}
          <div
            className={`flex-1 p-4 rounded-lg border-2 transition-all ${getNodeColor(node, isActive)} ${
              isActive ? "shadow-lg scale-105" : "hover:shadow-md"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div
                  className={`p-2 rounded-lg ${isActive ? "bg-white/20" : "bg-textured"}`}
                >
                  <IconComponent
                    className={`h-4 w-4 ${isActive ? "text-white" : ""}`}
                  />
                  {isCompleted && (
                    <CheckCircle2 className="h-3 w-3 text-green-500 absolute -mt-1 -ml-1" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="font-semibold mb-1">
                    {node.question || node.action || "Decision Point"}
                  </div>
                  {node.description && (
                    <p className="text-sm opacity-90 mb-2">
                      {node.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {node.priority && (
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(node.priority)}`}
                      >
                        {node.priority} priority
                      </span>
                    )}
                    {node.category && (
                      <span className="px-2 py-1 text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-full">
                        {node.category}
                      </span>
                    )}
                    {node.estimatedTime && (
                      <div className="flex items-center gap-1 text-xs opacity-75">
                        <Clock className="h-3 w-3" />
                        {node.estimatedTime}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Interactive Buttons */}
              {isActive && node.question && (
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleChoice("yes")}
                    disabled={!node.yes}
                    className="flex items-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Yes
                  </button>
                  <button
                    onClick={() => handleChoice("no")}
                    disabled={!node.no}
                    className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <XCircle className="h-4 w-4" />
                    No
                  </button>
                </div>
              )}

              {/* Tree Expansion Toggle */}
              {hasChildren && showFullTree && (
                <button
                  onClick={() => toggleNodeExpansion(node.id)}
                  className="p-1 hover:bg-white/20 rounded transition-colors ml-2"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Child Nodes */}
        {hasChildren && (showFullTree ? isExpanded : isActive) && (
          <div className="relative">
            {/* Vertical Connection Line */}
            <div className="absolute left-4 top-0 w-px h-full bg-gray-300 dark:bg-gray-600" />

            <div className="space-y-2">
              {node.yes && renderTreeNode(node.yes, depth + 1, "yes")}
              {node.no && renderTreeNode(node.no, depth + 1, "no")}
            </div>
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
        className={`w-full ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-4" : "py-6"}`}
      >
        <div
          className={`max-w-6xl mx-auto ${isFullScreen ? "bg-textured rounded-2xl shadow-2xl h-full max-h-[95dvh] w-full flex flex-col overflow-hidden" : ""}`}
        >
          {/* Fullscreen Header */}
          {isFullScreen && (
            <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
              <div className="flex items-center gap-3">
                <GitBranch className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  Decision Tree
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-500 dark:bg-slate-600 text-white text-sm font-medium transition-all shadow-sm hover:bg-slate-600 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" />
                  <span>{isPrinting ? "Saving…" : "Print"}</span>
                </button>
                <button
                  onClick={() => setIsFullScreen(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-all shadow-sm"
                >
                  <Minimize2 className="h-4 w-4" />
                  <span>Exit</span>
                </button>
              </div>
            </div>
          )}

          {/* Scrollable Content */}
          <div className={isFullScreen ? "flex-1 overflow-y-auto" : ""}>
            <div ref={blockContentRef} className="p-6 space-y-6">
              {/* Header Section */}
              <div className="bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-pink-950/40 rounded-2xl p-6 shadow-lg border-2 border-indigo-200 dark:border-indigo-800/50">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-500 dark:bg-indigo-600 rounded-xl shadow-md">
                      <GitBranch className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        {decisionTree.title}
                      </h1>
                      {decisionTree.description && (
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                          {decisionTree.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!isFullScreen && (
                      <>
                        <button
                          onClick={handlePrint}
                          disabled={isPrinting}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-500 dark:bg-slate-600 text-white text-sm font-semibold shadow-md hover:bg-slate-600 dark:hover:bg-slate-700 hover:shadow-lg transform hover:scale-105 transition-all disabled:opacity-50"
                        >
                          <Printer className="h-4 w-4" />
                          <span>{isPrinting ? "Saving…" : "Print"}</span>
                        </button>
                        <button
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
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 dark:bg-purple-600 text-white text-sm font-semibold shadow-md hover:bg-purple-600 dark:hover:bg-purple-700 hover:shadow-lg transform hover:scale-105 transition-all"
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span>Canvas</span>
                        </button>
                        <button
                          onClick={() => setIsFullScreen(true)}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-500 dark:bg-indigo-600 text-white text-sm font-semibold shadow-md hover:bg-indigo-600 dark:hover:bg-indigo-700 hover:shadow-lg transform hover:scale-105 transition-all"
                        >
                          <Maximize2 className="h-4 w-4" />
                          <span>Focus</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Navigation Controls */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={goToRoot}
                      className="flex items-center gap-2 px-3 py-2 bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium border-border transition-colors"
                    >
                      <Home className="h-4 w-4" />
                      Start Over
                    </button>

                    <button
                      onClick={goBack}
                      disabled={navigationHistory.length === 0}
                      className="flex items-center gap-2 px-3 py-2 bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium border-border transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>

                    <button
                      onClick={resetTree}
                      className="flex items-center gap-2 px-3 py-2 bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium border-border transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </button>

                    <button
                      onClick={() => setShowFullTree(!showFullTree)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        showFullTree
                          ? "bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700"
                          : "bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border-border"
                      }`}
                    >
                      <GitBranch className="h-4 w-4" />
                      {showFullTree ? "Hide Tree" : "Show Full Tree"}
                    </button>
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Step {navigationHistory.length + 1}
                  </div>
                </div>

                {/* Progress Stats */}
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="bg-textured/50 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800/50">
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
                      <GitBranch className="h-4 w-4" />
                      <span className="text-xs font-medium">Total Nodes</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {treeStats.totalNodes}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-3 border border-orange-200 dark:border-orange-800/50">
                    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-1">
                      <HelpCircle className="h-4 w-4" />
                      <span className="text-xs font-medium">Questions</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {treeStats.questionNodes}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-3 border border-purple-200 dark:border-purple-800/50">
                    <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
                      <Target className="h-4 w-4" />
                      <span className="text-xs font-medium">Actions</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {treeStats.actionNodes}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-3 border border-green-200 dark:border-green-800/50">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-medium">Completed</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {treeStats.completedPaths}
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Breadcrumbs */}
              {navigationHistory.length > 0 && (
                <div className="bg-textured rounded-lg p-4 border-border">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    Decision Path
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium">
                      Start
                    </span>
                    {navigationHistory.map((step, index) => (
                      <React.Fragment key={index}>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                            {step.question}
                          </span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold ${
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
              <div className="bg-textured rounded-xl shadow-lg border-border overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      {showFullTree
                        ? "Full Decision Tree"
                        : "Current Decision Point"}
                    </h2>

                    {currentNode.action && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded-lg">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-medium">
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
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl p-6 border-2 border-green-300 dark:border-green-700 shadow-lg">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-green-500 dark:bg-green-600 rounded-full">
                      <Target className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-green-900 dark:text-green-100 mb-2">
                        Recommended Action
                      </h3>
                      <p className="text-green-800 dark:text-green-200 text-lg mb-4">
                        {currentNode.action}
                      </p>
                      {currentNode.description && (
                        <p className="text-green-700 dark:text-green-300 text-sm">
                          {currentNode.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-4">
                        <button
                          onClick={() =>
                            setCompletedPaths(
                              (prev) => new Set([...prev, currentNode.id]),
                            )
                          }
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-700 dark:hover:bg-green-800 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Mark as Completed
                        </button>
                        <button
                          onClick={goToRoot}
                          className="flex items-center gap-2 px-4 py-2 bg-textured text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700 rounded-lg text-sm font-medium hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Start New Decision
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
