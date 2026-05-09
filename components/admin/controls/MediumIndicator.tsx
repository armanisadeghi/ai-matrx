// components/admin/controls/MediumIndicator.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  Move,
  User,
  Server,
  RefreshCw,
  AlertCircle,
  Loader2,
  Check,
  Activity,
  Bug,
  Gauge,
  Camera,
} from "lucide-react";
import { PiPathFill } from "react-icons/pi";
import { usePathname } from "next/navigation";
import { debugModules } from "@/components/admin/debug/debugModuleRegistry";
import DebugModulePanel from "@/components/admin/debug/DebugModulePanel";
import DevPerfOverlayIsland from "@/features/shell/islands/DevPerfOverlayIsland";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  toggleDebugMode,
  selectIsDebugMode,
} from "@/lib/redux/slices/adminDebugSlice";
import { selectIsSuperAdmin, selectUser } from "@/lib/redux/slices/userSlice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  selectActiveServer,
  selectResolvedBaseUrl,
  selectAllServerHealth,
  selectActiveServerHealth,
  selectRecentApiCalls,
  switchServer,
  checkServerHealth,
  setCustomUrl,
  type ServerEnvironment,
} from "@/lib/redux/slices/apiConfigSlice";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { setUseSnapshot } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectIsSnapshot } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";

/** Debug module ids that open a WindowPanel instead of the modal DebugModulePanel. */
const DEBUG_MODULE_IDS_AS_WINDOW = new Set<string>([
  "agent-assistant-markdown",
]);

interface StatusDotProps {
  status: "healthy" | "unhealthy" | "checking" | "unknown";
  size?: number;
}

const StatusDot: React.FC<StatusDotProps> = ({ status, size = 8 }) => {
  const colors: Record<string, string> = {
    healthy: "bg-green-500",
    unhealthy: "bg-red-500",
    checking: "bg-yellow-400 animate-pulse",
    unknown: "bg-gray-500",
  };
  return (
    <span
      className={`inline-block rounded-full ${colors[status] ?? colors.unknown}`}
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
};

interface MediumIndicatorProps {
  onDragStart: (e: React.MouseEvent) => void;
  onSizeUp: () => void;
  onSizeDown: () => void;
}

const MediumIndicator: React.FC<MediumIndicatorProps> = ({
  onDragStart,
  onSizeUp,
  onSizeDown,
}) => {
  const currentPath = usePathname();
  const [showServerDropdown, setShowServerDropdown] = useState(false);
  const [showRecentCalls, setShowRecentCalls] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showPerfOverlay, setShowPerfOverlay] = useState(false);
  const [activeDebugModule, setActiveDebugModule] = useState<string | null>(
    null,
  );
  const serverButtonRef = useRef<HTMLDivElement>(null);
  const serverDropdownRef = useRef<HTMLDivElement>(null);

  const dispatch = useAppDispatch();

  // ── Selectors (all from Redux — no local state for these) ──
  const user = useAppSelector(selectUser);
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const activeServer = useAppSelector(selectActiveServer);
  const resolvedUrl = useAppSelector(selectResolvedBaseUrl);
  const activeHealth = useAppSelector(selectActiveServerHealth);
  const allServerHealth = useAppSelector(selectAllServerHealth);
  const recentCalls = useAppSelector(selectRecentApiCalls);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const isSnapshot = useAppSelector(selectIsSnapshot);

  const handleToggleDebugMode = () => dispatch(toggleDebugMode());
  const handleToggleSnapshot = () => dispatch(setUseSnapshot(!isSnapshot));

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (e.currentTarget === e.target) onDragStart(e);
  };

  const handleServerSelect = (env: ServerEnvironment) => {
    if (env === "custom") {
      setShowCustomInput(true);
      setShowServerDropdown(false);
      return;
    }
    dispatch(switchServer({ env }));
    setShowServerDropdown(false);
  };

  const handleCustomUrlSubmit = () => {
    const trimmed = customUrlInput.trim();
    if (!trimmed) return;
    dispatch(setCustomUrl(trimmed));
    dispatch(checkServerHealth({ env: "custom", force: true }));
    setShowCustomInput(false);
    setCustomUrlInput("");
  };

  const handleForceHealthCheck = () => {
    dispatch(checkServerHealth({ force: true }));
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showServerDropdown &&
        serverDropdownRef.current &&
        serverButtonRef.current &&
        !serverDropdownRef.current.contains(event.target as Node) &&
        !serverButtonRef.current.contains(event.target as Node)
      ) {
        setShowServerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showServerDropdown]);

  // Position dropdown below the button
  useEffect(() => {
    if (
      showServerDropdown &&
      serverButtonRef.current &&
      serverDropdownRef.current
    ) {
      const rect = serverButtonRef.current.getBoundingClientRect();
      serverDropdownRef.current.style.left = `${rect.left}px`;
      serverDropdownRef.current.style.top = `${rect.bottom + 5}px`;
    }
  }, [showServerDropdown]);

  const lastCheckedLabel = activeHealth.lastCheckedAt
    ? `${Math.round((Date.now() - activeHealth.lastCheckedAt) / 1000)}s ago`
    : "never";

  return (
    <div
      className="flex flex-col w-96 rounded-lg bg-slate-800 text-white shadow-lg overflow-visible"
      onMouseDown={handleContainerMouseDown}
    >
      {/* Header */}
      <div className="flex justify-between items-center px-2 py-1 bg-slate-900">
        <div className="font-semibold text-sm">Matrx Admin</div>
        <div className="flex items-center gap-1">
          <div
            className="cursor-move p-1 rounded hover:bg-slate-700"
            onMouseDown={onDragStart}
          >
            <Move size={14} />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSizeDown();
            }}
            className="p-1 rounded hover:bg-slate-700"
          >
            <ChevronRight size={14} className="rotate-180" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSizeUp();
            }}
            className="p-1 rounded hover:bg-slate-700"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Status Row */}
      <div className="flex items-center justify-between px-2 py-1 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <StatusDot status={activeHealth.status} size={10} />
          <span className="text-xs text-slate-400">
            {activeHealth.status}
            {activeHealth.latencyMs != null && ` · ${activeHealth.latencyMs}ms`}
            {` · ${lastCheckedLabel}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleDebugMode}
            className={`p-1 rounded transition-colors ${isDebugMode ? "bg-green-700 text-green-300" : "text-slate-400 hover:bg-slate-700"}`}
            title="Toggle Debug Mode"
          >
            <Bug size={14} />
          </button>
          <button
            onClick={() => setShowPerfOverlay((v) => !v)}
            className={`p-1 rounded transition-colors ${showPerfOverlay ? "bg-blue-700 text-blue-300" : "text-slate-400 hover:bg-slate-700"}`}
            title="Toggle Performance Overlay"
          >
            <Gauge size={14} />
          </button>
          {isAdmin && (
            <button
              onClick={handleToggleSnapshot}
              className={`p-1 rounded transition-colors ${isSnapshot ? "bg-purple-700 text-purple-200" : "text-slate-400 hover:bg-slate-700"}`}
              title={
                isSnapshot
                  ? "Snapshot mode ON — every request stamps snapshot:true"
                  : "Toggle Snapshot mode (admin: capture full server snapshot per request)"
              }
            >
              <Camera size={14} />
            </button>
          )}
          <button
            onClick={handleForceHealthCheck}
            className="p-1 rounded hover:bg-slate-700"
            title="Re-check server health"
          >
            {activeHealth.status === "checking" ? (
              <Loader2 size={14} className="animate-spin text-yellow-400" />
            ) : (
              <RefreshCw size={14} />
            )}
          </button>
        </div>
      </div>

      {/* Debug Modules Row */}
      {debugModules.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-slate-900/30 border-t border-slate-700/50">
          <span className="text-[10px] text-slate-400 mr-1">Debug:</span>
          {debugModules.map((module) => {
            const Icon = module.icon;
            return (
              <button
                key={module.id}
                onClick={() => {
                  if (DEBUG_MODULE_IDS_AS_WINDOW.has(module.id)) {
                    dispatch(
                      openOverlay({
                        overlayId: "agentAssistantMarkdownDebugWindow",
                      }),
                    );
                    return;
                  }
                  setActiveDebugModule(module.id);
                }}
                className={`p-1 rounded hover:bg-slate-700 transition-colors ${
                  activeDebugModule === module.id ? "bg-slate-700" : ""
                } ${module.color || "text-slate-300"}`}
                title={`${module.name}: ${module.description}`}
              >
                <Icon size={12} />
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <div className="px-2 py-1 text-xs space-y-1">
        {/* User Info */}
        <div className="flex items-center justify-between gap-2">
          <User size={16} className="shrink-0" />
          <span className="text-blue-400 truncate flex-1 text-right">
            {user.email || user.id}
            {isAdmin && <span className="text-green-400 ml-1">(Admin)</span>}
          </span>
        </div>

        {/* Server Selection */}
        <div className="relative">
          <div
            ref={serverButtonRef}
            className="flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-700/50 p-1 rounded"
            onClick={() => setShowServerDropdown(!showServerDropdown)}
          >
            <Server size={16} className="shrink-0" />
            <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
              <StatusDot status={activeHealth.status} size={7} />
              <span
                className={`truncate ${
                  activeHealth.status === "unhealthy"
                    ? "text-red-400"
                    : resolvedUrl?.includes("localhost")
                      ? "text-green-400"
                      : "text-blue-400"
                }`}
                title={resolvedUrl ?? "not configured"}
              >
                {resolvedUrl ?? `${activeServer} — not configured`}
              </span>
            </div>
          </div>
        </div>

        {/* Custom URL Input */}
        {showCustomInput && (
          <div className="flex gap-1">
            <input
              type="text"
              value={customUrlInput}
              onChange={(e) => setCustomUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCustomUrlSubmit()}
              placeholder="https://your-server.com"
              className="flex-1 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={handleCustomUrlSubmit}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
            >
              Set
            </button>
            <button
              onClick={() => {
                setShowCustomInput(false);
                setCustomUrlInput("");
              }}
              className="px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Error display */}
        {activeHealth.error && activeHealth.status === "unhealthy" && (
          <div className="flex items-center gap-1 text-red-400 px-1">
            <AlertCircle size={12} />
            <span className="truncate">{activeHealth.error}</span>
          </div>
        )}

        {/* Recent API Calls */}
        <div
          className="flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-700/50 p-1 rounded text-slate-400"
          onClick={() => setShowRecentCalls(!showRecentCalls)}
        >
          <Activity size={14} />
          <span className="flex-1 text-right">
            Recent Calls {recentCalls.length > 0 && `(${recentCalls.length})`}
          </span>
          <ChevronRight
            size={12}
            className={showRecentCalls ? "rotate-90" : ""}
          />
        </div>

        {showRecentCalls && (
          <div className="pl-2 space-y-1 max-h-40 overflow-y-auto">
            {recentCalls.length === 0 ? (
              <div className="text-slate-500 text-[10px] px-1">
                No calls yet
              </div>
            ) : (
              recentCalls.slice(0, 20).map((call) => (
                <div
                  key={call.id}
                  className="flex items-center gap-1.5 text-[10px] font-mono"
                  title={`${call.method} ${call.baseUrl}${call.path}`}
                >
                  <span
                    className={
                      call.status === "success"
                        ? "text-green-400"
                        : call.status === "error"
                          ? "text-red-400"
                          : "text-yellow-400"
                    }
                  >
                    {call.method}
                  </span>
                  <span className="text-slate-400 truncate">{call.path}</span>
                  {call.durationMs != null && (
                    <span className="text-slate-500 shrink-0">
                      {call.durationMs}ms
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Current Path */}
        <div className="flex items-start justify-between gap-2">
          <PiPathFill size={16} className="text-slate-400 shrink-0" />
          <div
            className="text-xs font-semibold text-slate-400 flex flex-col items-end"
            title={currentPath}
          >
            {currentPath
              .split("/")
              .filter((part) => part)
              .map((part, index) => (
                <span key={index}>{part}</span>
              ))}
          </div>
        </div>
      </div>

      {/* Server Dropdown */}
      {showServerDropdown && (
        <div
          ref={serverDropdownRef}
          className="fixed bg-slate-900 rounded-md shadow-lg z-50 py-1 min-w-[240px] max-w-[480px] max-h-72 overflow-y-auto"
        >
          <div className="text-xs font-semibold px-2 py-1 text-slate-400 sticky top-0 bg-slate-900 border-b border-slate-700">
            Select Server
          </div>
          {allServerHealth.map(
            ({ env, resolvedUrl: envUrl, isConfigured, health, isActive }) => (
              <div
                key={env}
                className={`flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-slate-700 ${
                  !isConfigured ? "opacity-50" : ""
                }`}
                onClick={() =>
                  isConfigured || env === "custom"
                    ? handleServerSelect(env)
                    : undefined
                }
                title={
                  !isConfigured && env !== "custom"
                    ? `${env} — env var not set`
                    : (envUrl ?? env)
                }
              >
                <StatusDot
                  status={isConfigured ? health.status : "unknown"}
                  size={7}
                />
                <span
                  className={
                    isActive ? "text-green-400 font-semibold" : "text-white"
                  }
                >
                  {env}
                </span>
                {isActive && (
                  <Check size={10} className="text-green-400 shrink-0" />
                )}
                <span className="text-slate-400 truncate ml-auto">
                  {env === "custom"
                    ? "enter URL →"
                    : isConfigured
                      ? envUrl
                      : "not configured"}
                </span>
                {isConfigured && health.latencyMs != null && (
                  <span className="text-slate-500 shrink-0">
                    {health.latencyMs}ms
                  </span>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {/* Debug Module Panel */}
      <DebugModulePanel
        moduleId={activeDebugModule}
        onClose={() => setActiveDebugModule(null)}
      />

      {/* Perf Overlay — rendered outside the indicator panel, controlled by local state */}
      <DevPerfOverlayIsland show={showPerfOverlay} />
    </div>
  );
};

export default MediumIndicator;
