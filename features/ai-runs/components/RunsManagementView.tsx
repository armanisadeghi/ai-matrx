// @ts-nocheck

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  History,
  Search,
  Filter,
  Star,
  Archive,
  Trash2,
  MoreVertical,
  MessageSquare,
  DollarSign,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RunsList } from "./RunsList";
import { aiRunsService } from "../services/ai-runs-service";
import type { SourceType, RunStatus } from "../types/aiRunTypes";
import { formatCost } from "../utils/cost-calculator";
import { useAiRunsList } from "../hooks/useAiRunsList";

export function RunsManagementView() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<RunStatus | "all">("all");
  const [starredOnly, setStarredOnly] = useState(false);

  // Build filters
  const filters = {
    ...(search && { search }),
    ...(sourceFilter !== "all" && { source_type: sourceFilter }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(starredOnly && { starred: true }),
    limit: 20,
  };

  const { runs, total } = useAiRunsList(filters);

  // Calculate summary stats
  const totalTokens = runs.reduce((sum, run) => sum + run.total_tokens, 0);
  const totalCost = runs.reduce((sum, run) => sum + run.total_cost, 0);
  const totalMessages = runs.reduce((sum, run) => sum + run.message_count, 0);

  const handleRunClick = (runId: string) => {
    const run = runs.find((r) => r.id === runId);
    if (!run) return;

    // Route based on source type
    switch (run.source_type) {
      case "prompts":
        if (run.source_id) {
          router.push(`/ai/prompts/run/${run.source_id}?runId=${runId}`);
        }
        break;
      case "chat":
        router.push(`/chat?runId=${runId}`);
        break;
      case "applet":
        if (run.source_id) {
          router.push(`/applet/${run.source_id}?runId=${runId}`);
        }
        break;
      default:
        console.warn("Unknown source type:", run.source_type);
    }
  };

  const handleRunStar = async (runId: string) => {
    try {
      await aiRunsService.toggleStar(runId);
    } catch (error) {
      console.error("Error toggling star:", error);
    }
  };

  const handleRunArchive = async (runId: string) => {
    try {
      await aiRunsService.archive(runId);
    } catch (error) {
      console.error("Error archiving run:", error);
    }
  };

  const handleRunDelete = async (runId: string) => {
    if (!confirm("Are you sure you want to delete this run?")) return;

    try {
      await aiRunsService.delete(runId);
    } catch (error) {
      console.error("Error deleting run:", error);
    }
  };

  return (
    <div className="h-[calc(100dvh-3rem)] lg:h-[calc(100dvh-2.5rem)] flex flex-col bg-textured">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-white dark:bg-zinc-900">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  AI Runs
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  View and manage your conversation history
                </p>
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <MessageSquare className="w-4 h-4" />
                <span className="text-xs font-medium">Messages</span>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {totalMessages.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium">Tokens</span>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {totalTokens.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-medium">Cost</span>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {formatCost(totalCost)}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search runs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Source filter */}
            <Select
              value={sourceFilter}
              onValueChange={(value) =>
                setSourceFilter(value as SourceType | "all")
              }
            >
              <SelectTrigger className="w-[150px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="prompts">Prompts</SelectItem>
                <SelectItem value="prompt_builtins">Prompt Builtins</SelectItem>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="applet">Applets</SelectItem>
                <SelectItem value="cockpit">Cockpit</SelectItem>
                <SelectItem value="workflow">Workflows</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as RunStatus | "all")
              }
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            {/* Starred filter */}
            <Button
              variant={starredOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setStarredOnly(!starredOnly)}
            >
              <Star
                className={`w-4 h-4 ${starredOnly ? "fill-current" : ""}`}
              />
            </Button>
          </div>
        </div>
      </div>

      {/* Runs list */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-5xl mx-auto p-6">
          <RunsList
            filters={filters}
            onRunClick={handleRunClick}
            onRunStar={handleRunStar}
            emptyMessage="No runs found"
            emptySubmessage="Try adjusting your filters or start a new conversation"
          />
        </div>
      </div>
    </div>
  );
}
