"use client";

import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  RotateCcw,
  Bug,
  Code,
  Globe,
  Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import type { ToolUiIncidentRow } from "@/features/tool-call-visualization/admin/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolUiIncidentViewerProps {
  toolName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const errorTypeColors: Record<string, string> = {
  compilation:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  runtime: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  fetch: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  timeout:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  unknown: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

const componentTypeIcons: Record<string, React.ReactNode> = {
  inline: <Code className="w-3.5 h-3.5" />,
  overlay: <Layers className="w-3.5 h-3.5" />,
  header_extras: <Globe className="w-3.5 h-3.5" />,
  header_subtitle: <Globe className="w-3.5 h-3.5" />,
  utility: <Code className="w-3.5 h-3.5" />,
  fetch: <Globe className="w-3.5 h-3.5" />,
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ToolUiIncidentViewer({ toolName }: ToolUiIncidentViewerProps) {
  const { toast } = useToast();
  const [incidents, setIncidents] = useState<ToolUiIncidentRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showResolved, setShowResolved] = useState(false);

  const fetchIncidents = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (toolName) params.set("tool_name", toolName);
      if (!showResolved) params.set("unresolved_only", "true");

      const res = await fetch(`/api/admin/tool-ui-incidents?${params}`);
      const data = await res.json();
      setIncidents(data.incidents || []);
      setTotalCount(data.count || 0);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load incidents",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [toolName, showResolved]);

  const handleResolve = async (
    id: string,
    resolved: boolean,
    notes?: string,
  ) => {
    try {
      const res = await fetch(`/api/admin/tool-ui-incidents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved, resolution_notes: notes }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({
        title: "Success",
        description: resolved ? "Incident resolved" : "Incident reopened",
      });
      fetchIncidents();
    } catch {
      toast({
        title: "Error",
        description: "Failed to update incident",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/tool-ui-incidents/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Success", description: "Incident deleted" });
      fetchIncidents();
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete incident",
        variant: "destructive",
      });
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const unresolvedCount = incidents.filter((i) => !i.resolved).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bug className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Incidents
          </span>
          {unresolvedCount > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {unresolvedCount} open
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => setShowResolved(!showResolved)}
          >
            {showResolved ? "Hide Resolved" : "Show Resolved"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={fetchIncidents}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Incidents list */}
      {incidents.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
          No {showResolved ? "" : "open "}incidents
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              isExpanded={expandedIds.has(incident.id)}
              onToggleExpanded={() => toggleExpanded(incident.id)}
              onResolve={(notes) =>
                handleResolve(incident.id, !incident.resolved, notes)
              }
              onDelete={() => handleDelete(incident.id)}
            />
          ))}
        </div>
      )}

      {totalCount > incidents.length && (
        <p className="text-xs text-center text-slate-500">
          Showing {incidents.length} of {totalCount} incidents
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Incident Card
// ---------------------------------------------------------------------------

interface IncidentCardProps {
  incident: ToolUiIncidentRow;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onResolve: (notes?: string) => void;
  onDelete: () => void;
}

function IncidentCard({
  incident,
  isExpanded,
  onToggleExpanded,
  onResolve,
  onDelete,
}: IncidentCardProps) {
  const [resolutionNotes, setResolutionNotes] = useState(
    incident.resolution_notes || "",
  );

  return (
    <Card className={`${incident.resolved ? "opacity-60" : ""}`}>
      <CardContent className="pt-3 pb-3 px-4">
        {/* Summary row */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {incident.resolved ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300">
                {incident.tool_name}
              </span>
              <Badge
                className={`text-[10px] px-1.5 py-0 ${errorTypeColors[incident.error_type] || ""}`}
              >
                {incident.error_type}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 gap-1"
              >
                {componentTypeIcons[incident.component_type]}
                {incident.component_type}
              </Badge>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-1">
              {incident.error_message}
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(incident.created_at)}
              </span>
              {incident.browser_info && <span>{incident.browser_info}</span>}
              {incident.component_version && (
                <span>v{incident.component_version}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onToggleExpanded}
            >
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
            {/* Full error message */}
            <div>
              <Label className="text-[11px] font-medium text-slate-500 mb-1 block">
                Error Message
              </Label>
              <pre className="text-[11px] bg-red-50 dark:bg-red-950/20 p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap text-red-800 dark:text-red-300">
                {incident.error_message}
              </pre>
            </div>

            {/* Stack trace */}
            {incident.error_stack && (
              <div>
                <Label className="text-[11px] font-medium text-slate-500 mb-1 block">
                  Stack Trace
                </Label>
                <pre className="text-[10px] bg-slate-100 dark:bg-slate-900 p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap text-slate-600 dark:text-slate-400">
                  {incident.error_stack}
                </pre>
              </div>
            )}

            {/* Data snapshot */}
            {incident.tool_update_snapshot != null && (
              <div>
                <Label className="text-[11px] font-medium text-slate-500 mb-1 block">
                  Tool Update Snapshot
                </Label>
                <pre className="text-[10px] bg-slate-100 dark:bg-slate-900 p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap text-slate-600 dark:text-slate-400">
                  {JSON.stringify(incident.tool_update_snapshot, null, 2)}
                </pre>
              </div>
            )}

            {/* Resolution notes */}
            <div>
              <Label className="text-[11px] font-medium text-slate-500 mb-1 block">
                Resolution Notes
              </Label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="text-xs min-h-[60px]"
                placeholder="Add notes about how this was resolved..."
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={incident.resolved ? "outline" : "default"}
                className="text-xs h-7"
                onClick={() => onResolve(resolutionNotes)}
              >
                {incident.resolved ? (
                  <>
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reopen
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Resolve
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 text-red-600"
                onClick={onDelete}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Used internally by IncidentCard
function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={className}>{children}</span>;
}
