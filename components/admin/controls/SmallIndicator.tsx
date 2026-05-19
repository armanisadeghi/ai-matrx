// components/admin/controls/SmallIndicator.tsx
import React from "react";
import { ChevronRight, AlertCircle, Loader, Bug } from "lucide-react";
import StateViewerButton from "@/components/admin/state-analyzer/components/StateViewerButton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectResolvedBaseUrl,
  selectActiveServerHealth,
  selectActiveServer,
} from "@/lib/redux/slices/apiConfigSlice";
import {
  toggleDebugMode,
  selectIsDebugMode,
} from "@/lib/redux/preferences/adminDebugSlice";

interface SmallIndicatorProps {
  onDragStart: (e: React.MouseEvent) => void;
  onSizeChange: () => void;
}

const SmallIndicator: React.FC<SmallIndicatorProps> = ({
  onDragStart,
  onSizeChange,
}) => {
  const dispatch = useAppDispatch();
  const activeServer = useAppSelector(selectActiveServer);
  const resolvedUrl = useAppSelector(selectResolvedBaseUrl);
  const health = useAppSelector(selectActiveServerHealth);
  const isDebugMode = useAppSelector(selectIsDebugMode);

  const isLocalhost =
    resolvedUrl?.includes("localhost") || resolvedUrl?.includes("127.0.0.1");
  const isChecking = health.status === "checking";
  const isHealthy = health.status === "healthy";
  const isUnhealthy = health.status === "unhealthy";

  const getServerDotColor = () => {
    if (isChecking) return "bg-yellow-400 animate-pulse";
    if (isHealthy && isLocalhost) return "bg-green-400";
    if (isHealthy) return "bg-blue-400";
    if (isUnhealthy) return "bg-red-500";
    return "bg-gray-500";
  };

  const getHealthDotColor = () => {
    if (isChecking) return "bg-yellow-400 animate-pulse";
    if (isHealthy) return "bg-green-500";
    if (isUnhealthy) return "bg-red-500";
    return "bg-gray-500";
  };

  const handleElementMouseDown = (e: React.MouseEvent) => {
    let currentElement = e.target as HTMLElement;
    while (currentElement) {
      if (currentElement.tagName === "BUTTON") return;
      currentElement = currentElement.parentElement as HTMLElement;
    }
    onDragStart(e);
  };

  const tooltipText = resolvedUrl
    ? `${activeServer} → ${resolvedUrl} (${health.status}${health.latencyMs != null ? ` ${health.latencyMs}ms` : ""})`
    : `${activeServer} — not configured`;

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800 text-white shadow-lg cursor-move"
      onMouseDown={handleElementMouseDown}
      title={tooltipText}
    >
      {/* Server environment dot */}
      <div
        className="flex items-center gap-1"
        title={`Server: ${activeServer} — ${resolvedUrl ?? "not configured"}`}
      >
        <div className={`w-2 h-2 rounded-full ${getServerDotColor()}`} />
      </div>

      {/* Health dot */}
      <div
        className="flex items-center gap-1"
        title={`Health: ${health.status}${health.latencyMs != null ? ` (${health.latencyMs}ms)` : ""}`}
      >
        <div className={`w-2 h-2 rounded-full ${getHealthDotColor()}`} />
      </div>

      {/* Checking spinner */}
      {isChecking && (
        <Loader size={12} className="text-yellow-400 animate-spin" />
      )}

      {/* Error indicator */}
      {isUnhealthy && health.error && (
        <div title={health.error}>
          <AlertCircle size={14} className="text-red-400" />
        </div>
      )}

      <StateViewerButton />

      <button
        onClick={(e) => {
          e.stopPropagation();
          dispatch(toggleDebugMode());
        }}
        className={`p-0 rounded transition-colors ${isDebugMode ? "text-green-400" : "hover:bg-slate-700"}`}
        title="Toggle Debug Mode"
      >
        <Bug size={12} />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onSizeChange();
        }}
        className="p-0 rounded hover:bg-slate-700"
      >
        <ChevronRight size={12} />
      </button>
    </div>
  );
};

export default SmallIndicator;
