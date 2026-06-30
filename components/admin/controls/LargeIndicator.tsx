// components/admin/controls/LargeIndicator.tsx
import React, { Suspense, lazy, useState, useCallback, useMemo } from "react";
import {
  ChevronRight,
  X,
  Server,
  Activity,
  RefreshCw,
  AlertCircle,
  Check,
  Copy,
  ClipboardCheck,
  Terminal,
  Crown,
} from "lucide-react";
import MatrxDynamicPanel from "@/components/matrx/resizable/MatrxDynamicPanel";
import PageDebugDisplay from "@/components/admin/debug/PageDebugDisplay";
import { buildAgentContext } from "@/components/admin/debug/buildAgentContext";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectIsDebugMode,
  selectDebugData,
  selectRouteContext,
} from "@/lib/redux/preferences/adminDebugSlice";
import { useCapturedErrors } from "@/lib/diagnostics/useCapturedErrors";
import {
  selectShowCreatorPanel,
  toggleShowCreatorPanel,
} from "@/lib/redux/preferences/creatorDebugSlice";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectUser } from "@/lib/redux/slices/userSlice";
import {
  selectActiveServer,
  selectResolvedBaseUrl,
  selectActiveServerHealth,
  selectAllServerHealth,
  selectRecentApiCalls,
  checkServerHealth,
  switchServer,
  type ServerEnvironment,
} from "@/lib/redux/slices/apiConfigSlice";

interface LargeIndicatorProps {
  onSizeDown: () => void;
  onSizeSmall: () => void;
}

const statusColors: Record<string, string> = {
  healthy: "text-green-400",
  unhealthy: "text-red-400",
  checking: "text-yellow-400",
  unknown: "text-slate-400",
};

const statusBg: Record<string, string> = {
  healthy: "bg-green-500",
  unhealthy: "bg-red-500",
  checking: "bg-yellow-400 animate-pulse",
  unknown: "bg-gray-500",
};

const LargeIndicator: React.FC<LargeIndicatorProps> = ({
  onSizeDown,
  onSizeSmall,
}) => {
  const dispatch = useAppDispatch();
  const [copied, setCopied] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const reduxUser = useAppSelector(selectUser);
  const activeServer = useAppSelector(selectActiveServer);
  const resolvedUrl = useAppSelector(selectResolvedBaseUrl);
  const activeHealth = useAppSelector(selectActiveServerHealth);
  const allServerHealth = useAppSelector(selectAllServerHealth);
  const recentCalls = useAppSelector(selectRecentApiCalls);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const debugData = useAppSelector(selectDebugData);
  const routeContext = useAppSelector(selectRouteContext);
  const showCreatorPanel = useAppSelector(selectShowCreatorPanel);

  // Console / runtime errors now come from the systemwide capture store. Pull
  // the global-runtime sources (console + uncaught + rejections) and map them
  // to the snapshot shape buildAgentContext + the panel below expect.
  const capturedErrors = useCapturedErrors();
  const consoleErrors = useMemo(
    () =>
      capturedErrors
        .filter(
          (e) =>
            e.source === "console-error" ||
            e.source === "runtime-exception" ||
            e.source === "unhandled-rejection",
        )
        .map((e) => ({
          id: e.id,
          source: e.source,
          message: e.message,
          stack: e.stack,
          capturedAt: e.lastAt,
        })),
    [capturedErrors],
  );

  const handleCopyContext = useCallback(async () => {
    const context = buildAgentContext({
      routeContext,
      debugData,
      consoleErrors,
      activeServer,
      resolvedUrl,
      serverHealthStatus: activeHealth.status,
      serverLatencyMs: activeHealth.latencyMs,
      recentApiCalls: recentCalls,
      userEmail: reduxUser?.email,
    });
    try {
      await navigator.clipboard.writeText(context);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement("textarea");
      el.value = context;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [
    routeContext,
    debugData,
    consoleErrors,
    activeServer,
    resolvedUrl,
    activeHealth,
    recentCalls,
    reduxUser,
  ]);

  const lastCheckedLabel = activeHealth.lastCheckedAt
    ? `${Math.round((Date.now() - activeHealth.lastCheckedAt) / 1000)}s ago`
    : "never";

  const LargeControls = () => (
    <div className="bg-slate-800 text-white">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 bg-slate-900">
        <div className="font-semibold">Admin Dashboard</div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSizeDown();
            }}
            className="p-1 rounded hover:bg-slate-700"
          >
            <ChevronRight size={16} className="rotate-180" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSizeSmall();
            }}
            className="p-1 rounded hover:bg-slate-700"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* User + Active Server */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-700 p-3 rounded">
            <div className="text-xs text-slate-400">Admin</div>
            <div
              className="text-sm font-semibold text-blue-400 truncate"
              title={reduxUser?.id ?? undefined}
            >
              {reduxUser?.userMetadata?.fullName ||
                reduxUser?.userMetadata?.name ||
                reduxUser?.email ||
                reduxUser?.id}
              {isAdmin && (
                <span className="text-green-400 text-xs ml-1">(Admin)</span>
              )}
            </div>
          </div>
          <div className="bg-slate-700 p-3 rounded">
            <div className="text-xs text-slate-400">Active Server</div>
            <div
              className={`text-lg font-semibold ${statusColors[activeHealth.status] ?? statusColors.unknown}`}
            >
              {activeServer}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {activeHealth.latencyMs != null
                ? `${activeHealth.latencyMs}ms`
                : "—"}
              {" · "}
              {lastCheckedLabel}
            </div>
          </div>
        </div>

        {/* Active URL */}
        <div className="bg-slate-700 p-3 rounded">
          <div className="text-xs text-slate-400 flex items-center gap-2 mb-1">
            <Server size={12} />
            Active Endpoint
            <button
              onClick={() => dispatch(checkServerHealth({ force: true }))}
              className="ml-auto p-0.5 rounded hover:bg-slate-600"
              title="Re-check health"
            >
              <RefreshCw size={12} />
            </button>
          </div>
          <div
            className={`text-sm font-mono font-semibold break-all ${statusColors[activeHealth.status] ?? statusColors.unknown}`}
            title={resolvedUrl}
          >
            {resolvedUrl ?? `${activeServer} — not configured`}
          </div>
          {activeHealth.error && activeHealth.status === "unhealthy" && (
            <div className="flex items-center gap-1 text-xs text-red-400 mt-1">
              <AlertCircle size={12} />
              {activeHealth.error}
            </div>
          )}
        </div>

        {/* All Environments Health Grid */}
        <div className="bg-slate-700 p-3 rounded">
          <div className="text-xs text-slate-400 mb-2">All Environments</div>
          <div className="space-y-1.5">
            {allServerHealth.map(
              ({
                env,
                resolvedUrl: envUrl,
                isConfigured,
                health,
                isActive,
              }) => (
                <div
                  key={env}
                  className={`flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-0.5 hover:bg-slate-600/50 transition-colors ${
                    isActive ? "bg-slate-600/40" : ""
                  }`}
                  onClick={() =>
                    (isConfigured || env === "custom") &&
                    dispatch(switchServer({ env: env as ServerEnvironment }))
                  }
                  title={
                    isConfigured ? (envUrl ?? env) : `${env} — env var not set`
                  }
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      isConfigured
                        ? (statusBg[health.status] ?? statusBg.unknown)
                        : "bg-slate-600"
                    }`}
                  />
                  <span
                    className={`w-24 shrink-0 ${isActive ? "text-green-400 font-semibold" : "text-white"}`}
                  >
                    {env}
                  </span>
                  {isActive && (
                    <Check size={10} className="text-green-400 shrink-0" />
                  )}
                  <span
                    className={`truncate ${isConfigured ? "text-slate-300" : "text-slate-600"}`}
                  >
                    {isConfigured ? envUrl : "not configured"}
                  </span>
                  {isConfigured && health.latencyMs != null && (
                    <span className="text-slate-500 shrink-0 ml-auto">
                      {health.latencyMs}ms
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
        </div>

        {/* Recent API Calls */}
        <div className="bg-slate-700 p-3 rounded">
          <div className="text-xs text-slate-400 flex items-center gap-2 mb-2">
            <Activity size={12} />
            Recent API Calls
            <span className="ml-auto text-slate-500">
              {recentCalls.length} / 50
            </span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {recentCalls.length === 0 ? (
              <div className="text-slate-500 text-xs">
                No calls recorded yet
              </div>
            ) : (
              recentCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center gap-2 text-[10px] font-mono py-0.5 border-b border-slate-600/50"
                  title={`${call.method} ${call.baseUrl}${call.path}${call.httpStatus ? ` → ${call.httpStatus}` : ""}`}
                >
                  <span
                    className={
                      call.status === "success"
                        ? "text-green-400 w-8 shrink-0"
                        : call.status === "error"
                          ? "text-red-400 w-8 shrink-0"
                          : "text-yellow-400 w-8 shrink-0"
                    }
                  >
                    {call.method}
                  </span>
                  <span className="text-slate-300 truncate flex-1">
                    {call.path}
                  </span>
                  {call.httpStatus != null && (
                    <span
                      className={`shrink-0 ${call.httpStatus < 400 ? "text-green-400" : "text-red-400"}`}
                    >
                      {call.httpStatus}
                    </span>
                  )}
                  {call.durationMs != null && (
                    <span className="text-slate-500 shrink-0">
                      {call.durationMs}ms
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Copy Full Context — always available, the key AI-agent feature */}
        <div className="bg-slate-700 p-3 rounded">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-200">
                Copy Full Context
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Route · debug data · API calls · console errors → paste into AI
                agent
              </div>
            </div>
            <button
              onClick={handleCopyContext}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                copied
                  ? "bg-green-600 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {copied ? (
                <>
                  <ClipboardCheck size={13} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={13} />
                  Copy
                </>
              )}
            </button>
          </div>
          {routeContext && (
            <div className="mt-2 text-[10px] text-slate-500 font-mono">
              {routeContext.pathname}
              {Object.keys(routeContext.searchParams).length > 0 && (
                <span className="text-slate-600">
                  {" "}
                  (
                  {Object.entries(routeContext.searchParams)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ")}
                  )
                </span>
              )}
            </div>
          )}
        </div>

        {/* Creator Panel — admin failsafe to show/hide the inline creator panel */}
        <div className="bg-slate-700 p-3 rounded">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-200">
                Creator Panel
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Show the run-control panel above the agent input
              </div>
            </div>
            <button
              onClick={() => dispatch(toggleShowCreatorPanel())}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                showCreatorPanel
                  ? "bg-green-600 text-white"
                  : "bg-slate-600 hover:bg-slate-500 text-slate-200"
              }`}
            >
              <Crown size={13} />
              {showCreatorPanel ? "On" : "Off"}
            </button>
          </div>
        </div>

        {/* Console Errors */}
        <div className="bg-slate-700 p-3 rounded">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setShowErrors(!showErrors)}
          >
            <Terminal
              size={12}
              className={
                consoleErrors.length > 0 ? "text-red-400" : "text-slate-400"
              }
            />
            <span className="text-xs text-slate-400 flex-1">
              Console Errors
            </span>
            {consoleErrors.length > 0 && (
              <span className="text-[10px] font-semibold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full">
                {consoleErrors.length}
              </span>
            )}
            <ChevronRight
              size={12}
              className={`text-slate-500 transition-transform ${showErrors ? "rotate-90" : ""}`}
            />
          </div>
          {showErrors && (
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {consoleErrors.length === 0 ? (
                <div className="text-[10px] text-slate-500">
                  No errors captured
                </div>
              ) : (
                consoleErrors.slice(0, 10).map((err) => (
                  <div key={err.id} className="bg-slate-800 rounded p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-red-400 font-semibold">
                        {err.source}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(err.capturedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-300 break-all">
                      {err.message}
                    </div>
                    {err.stack && (
                      <div className="text-[9px] font-mono text-slate-500 mt-1 break-all">
                        {err.stack.split("\n").slice(1, 4).join("\n")}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Debug Section */}
        {isDebugMode && (
          <div className="mt-2">
            {debugData && Object.keys(debugData).length > 0 ? (
              <PageDebugDisplay debugData={debugData} />
            ) : (
              <Suspense
                fallback={
                  <div className="text-xs text-slate-400">
                    Loading entity analyzer...
                  </div>
                }
              ></Suspense>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <MatrxDynamicPanel
      initialPosition="left"
      defaultExpanded={true}
      expandButtonProps={{ label: "" }}
    >
      <LargeControls />
    </MatrxDynamicPanel>
  );
};

export default LargeIndicator;
