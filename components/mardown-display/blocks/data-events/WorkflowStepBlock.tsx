"use client";
import React, { useState } from "react";
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ToggledDataBody } from "./ToggledDataBody";

export interface WorkflowStepBlockProps {
  stepName: string;
  status: string;
  data?: Record<string, unknown>;
}

const STATUS_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  complete: {
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
    color: "text-success",
    label: "Complete",
  },
  completed: {
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
    color: "text-success",
    label: "Completed",
  },
  success: {
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
    color: "text-success",
    label: "Success",
  },
  failed: {
    icon: <XCircle className="w-3.5 h-3.5 text-destructive" />,
    color: "text-destructive",
    label: "Failed",
  },
  error: {
    icon: <XCircle className="w-3.5 h-3.5 text-destructive" />,
    color: "text-destructive",
    label: "Error",
  },
  running: {
    icon: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />,
    color: "text-primary",
    label: "Running",
  },
  pending: {
    icon: <Circle className="w-3.5 h-3.5 text-muted-foreground" />,
    color: "text-muted-foreground",
    label: "Pending",
  },
};

const WorkflowStepBlock: React.FC<WorkflowStepBlockProps> = ({
  stepName,
  status,
  data,
}) => {
  const [showData, setShowData] = useState(false);
  const cfg = STATUS_CONFIG[status?.toLowerCase()] ?? {
    icon: <Circle className="w-3.5 h-3.5 text-muted-foreground" />,
    color: "text-muted-foreground",
    label: status,
  };
  const hasData = data && Object.keys(data).length > 0;

  return (
    <div className="rounded-lg border bg-card my-2 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <GitBranch className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="flex-shrink-0">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground font-mono">
            {stepName}
          </span>
        </div>
        <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
        {hasData && (
          <button
            onClick={() => setShowData((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            {showData ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
      {showData && data && (
        <div className="border-t border-border/40 px-3 py-2">
          <ToggledDataBody
            value={data}
            className="text-xs text-muted-foreground overflow-auto max-h-40 leading-relaxed"
          />
        </div>
      )}
    </div>
  );
};

export default WorkflowStepBlock;
