"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Grid2X2,
  List,
  Loader2,
  Logs,
  Power,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Terminal,
} from "lucide-react";
import { ConnectionBar } from "../_lib/ConnectionBar";
import { MessageLog } from "../_lib/ResultPanel";
import { useMatrxLocalContext } from "../_lib/MatrxLocalContext";
import type { ToolResult } from "../_lib/types";

// ---------------------------------------------------------------------------
// PowerShell availability banner
// ---------------------------------------------------------------------------

function PsBanner({
  available,
  checking,
}: {
  available: boolean | null;
  checking: boolean;
}) {
  if (checking) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        Checking PowerShell availability…
      </div>
    );
  }
  if (available === true) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/8 border-b border-green-500/20 text-xs text-green-700 dark:text-green-400">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        PowerShell detected — all tools available
      </div>
    );
  }
  if (available === false) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/8 border-b border-yellow-500/20 text-xs text-yellow-700 dark:text-yellow-400">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>
          PowerShell not detected on the engine host. Tools will return an error
          unless you install it.
          <span className="ml-2 text-muted-foreground">
            Windows: built-in · macOS:{" "}
            <code className="font-mono">brew install --cask powershell</code> ·
            Linux: see Microsoft docs
          </span>
        </span>
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared result panel (inline, matches system/files style)
// ---------------------------------------------------------------------------

function ResultArea({
  activeSection,
  activeResult,
  loading,
}: {
  activeSection: string | null;
  activeResult: ToolResult | null;
  loading: boolean;
}) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-3 py-1.5 border-b bg-muted/40 flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold">
          {activeSection ? `Result — ${activeSection}` : "Result"}
        </span>
        {activeResult && (
          <Badge
            variant={
              activeResult.type === "success" ? "outline" : "destructive"
            }
            className="text-[10px] h-4 px-1"
          >
            {activeResult.type}
          </Badge>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && activeResult && (
          <div className="p-3 space-y-3">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/30 rounded p-2">
              {activeResult.output}
            </pre>
            {activeResult.metadata && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Metadata
                </summary>
                <pre className="mt-1 p-2 bg-muted rounded font-mono text-[10px] overflow-auto max-h-40">
                  {JSON.stringify(activeResult.metadata, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
        {!loading && !activeResult && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Run a tool to see results
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible tool section header
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  badge,
  open,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 p-2 hover:bg-accent/40 transition-colors text-left"
    >
      <Icon className="w-3 h-3 text-primary shrink-0" />
      <span className="text-xs font-semibold flex-1">{title}</span>
      {badge && (
        <Badge variant="secondary" className="text-[9px] h-3.5 px-1 mr-0.5">
          {badge}
        </Badge>
      )}
      {open ? (
        <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" />
      ) : (
        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PowerShellPage() {
  const local = useMatrxLocalContext();
  const { invokeTool, loading, logs, clearLogs } = local;

  const [activeResult, setActiveResult] = useState<ToolResult | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [psAvailable, setPsAvailable] = useState<boolean | null>(null);
  const [psChecking, setPsChecking] = useState(false);

  // Section open/closed state — all open by default
  const [openSections, setOpenSections] = useState({
    env: true,
    registry: true,
    services: true,
    eventlog: true,
    features: true,
  });

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Field state ────────────────────────────────────────────────────────

  // Env Get
  const [envGetName, setEnvGetName] = useState("");
  // Env Set
  const [envSetName, setEnvSetName] = useState("MY_VAR");
  const [envSetValue, setEnvSetValue] = useState("hello");
  const [envSetScope, setEnvSetScope] = useState<
    "Process" | "User" | "Machine"
  >("Process");

  // Registry Read
  const [regReadKey, setRegReadKey] = useState(
    "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
  );
  const [regReadValue, setRegReadValue] = useState("ProductName");
  // Registry Write
  const [regWriteKey, setRegWriteKey] = useState("HKCU:\\SOFTWARE\\MatrxTest");
  const [regWriteName, setRegWriteName] = useState("TestValue");
  const [regWriteValue, setRegWriteValue] = useState("hello");
  const [regWriteType, setRegWriteType] = useState("String");

  // Services
  const [svcFilter, setSvcFilter] = useState("");
  const [svcStatus, setSvcStatus] = useState("");
  const [svcControlName, setSvcControlName] = useState("Spooler");
  const [svcAction, setSvcAction] = useState<
    "start" | "stop" | "restart" | "pause" | "resume"
  >("restart");

  // Event Log
  const [evtLog, setEvtLog] = useState("System");
  const [evtLevel, setEvtLevel] = useState("Error");
  const [evtCount, setEvtCount] = useState(20);
  const [evtSource, setEvtSource] = useState("");

  // Windows Features
  const [featFilter, setFeatFilter] = useState("");
  const [featInstalledOnly, setFeatInstalledOnly] = useState(true);

  // ── PS availability check ──────────────────────────────────────────────

  const checkPs = async () => {
    setPsChecking(true);
    try {
      const result = await invokeTool("PsGetEnv", { name: "PATH" });
      // If the engine returns the PS-unavailable error message, mark unavailable
      const unavailable =
        result.output?.includes("PowerShell is not available") ||
        result.type === "error";
      setPsAvailable(!unavailable);
    } catch {
      setPsAvailable(false);
    } finally {
      setPsChecking(false);
    }
  };

  // ── Run helper ─────────────────────────────────────────────────────────

  const run = async (
    section: string,
    tool: string,
    input: Record<string, unknown>,
  ) => {
    setActiveSection(section);
    setActiveResult(null);
    const result = await invokeTool(tool, input);
    setActiveResult(result);
    // Auto-detect PS unavailability from first real run
    if (result.output?.includes("PowerShell is not available")) {
      setPsAvailable(false);
    } else if (psAvailable === null && result.type === "success") {
      setPsAvailable(true);
    }
  };

  const inputCls =
    "w-full h-7 text-xs font-mono rounded border px-2 bg-background";
  const isLoading = (s: string) => !!loading && activeSection === s;

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card shrink-0">
        <Link href="/demos/local-tools">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 h-6 text-xs px-1.5"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </Button>
        </Link>
        <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-sm font-semibold">PowerShell Tools</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Env · Registry · Services · Event Log · Windows Features
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={checkPs}
            disabled={psChecking || !!loading}
          >
            {psChecking ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Check PS
          </Button>
        </div>
      </div>

      {/* Connection bar */}
      <div className="shrink-0 border-b px-3 py-1">
        <ConnectionBar hook={local} />
      </div>

      {/* PS availability banner */}
      <PsBanner available={psAvailable} checking={psChecking} />

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: tool controls ── */}
        <div className="w-72 shrink-0 border-r overflow-y-auto flex flex-col divide-y bg-card">
          {/* ── Environment Variables ── */}
          <div>
            <SectionHeader
              icon={List}
              title="Environment Variables"
              open={openSections.env}
              onToggle={() => toggleSection("env")}
            />
            {openSections.env && (
              <div className="px-2 pb-2 space-y-2">
                {/* Get */}
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pt-1">
                    Get
                  </p>
                  <label className="text-[10px] text-muted-foreground">
                    Variable name (blank = all)
                  </label>
                  <input
                    type="text"
                    value={envGetName}
                    onChange={(e) => setEnvGetName(e.target.value)}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                    placeholder="PATH"
                  />
                  <Button
                    size="sm"
                    disabled={!!loading}
                    className="w-full h-7 text-xs gap-1"
                    onClick={() =>
                      run(
                        "env-get",
                        "PsGetEnv",
                        envGetName ? { name: envGetName } : {},
                      )
                    }
                  >
                    {isLoading("env-get") ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Search className="w-3 h-3" />
                    )}
                    Get Env
                  </Button>
                </div>

                {/* Set */}
                <div className="space-y-1 pt-1 border-t">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pt-0.5">
                    Set
                  </p>
                  <label className="text-[10px] text-muted-foreground">
                    Variable name
                  </label>
                  <input
                    type="text"
                    value={envSetName}
                    onChange={(e) => setEnvSetName(e.target.value)}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                    placeholder="MY_VAR"
                  />
                  <label className="text-[10px] text-muted-foreground">
                    Value
                  </label>
                  <input
                    type="text"
                    value={envSetValue}
                    onChange={(e) => setEnvSetValue(e.target.value)}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                  <label className="text-[10px] text-muted-foreground">
                    Scope
                  </label>
                  <select
                    value={envSetScope}
                    onChange={(e) =>
                      setEnvSetScope(e.target.value as typeof envSetScope)
                    }
                    className={`${inputCls} cursor-pointer`}
                    style={{ fontSize: "16px" }}
                  >
                    <option value="Process">Process (current session)</option>
                    <option value="User">User (Windows, persistent)</option>
                    <option value="Machine">Machine (Windows, admin)</option>
                  </select>
                  <Button
                    size="sm"
                    disabled={!!loading || !envSetName}
                    className="w-full h-7 text-xs gap-1"
                    onClick={() =>
                      run("env-set", "PsSetEnv", {
                        name: envSetName,
                        value: envSetValue,
                        scope: envSetScope,
                      })
                    }
                  >
                    {isLoading("env-set") ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Settings className="w-3 h-3" />
                    )}
                    Set Env
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Registry ── */}
          <div>
            <SectionHeader
              icon={Grid2X2}
              title="Registry"
              badge="Windows"
              open={openSections.registry}
              onToggle={() => toggleSection("registry")}
            />
            {openSections.registry && (
              <div className="px-2 pb-2 space-y-2">
                {/* Read */}
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pt-1">
                    Read
                  </p>
                  <label className="text-[10px] text-muted-foreground">
                    Key path
                  </label>
                  <input
                    type="text"
                    value={regReadKey}
                    onChange={(e) => setRegReadKey(e.target.value)}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                    placeholder="HKLM:\SOFTWARE\..."
                  />
                  <label className="text-[10px] text-muted-foreground">
                    Value name (blank = all)
                  </label>
                  <input
                    type="text"
                    value={regReadValue}
                    onChange={(e) => setRegReadValue(e.target.value)}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                    placeholder="ProductName"
                  />
                  <Button
                    size="sm"
                    disabled={!!loading || !regReadKey}
                    className="w-full h-7 text-xs gap-1"
                    onClick={() =>
                      run("reg-read", "RegistryRead", {
                        key_path: regReadKey,
                        ...(regReadValue ? { value_name: regReadValue } : {}),
                      })
                    }
                  >
                    {isLoading("reg-read") ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Search className="w-3 h-3" />
                    )}
                    Read Registry
                  </Button>
                </div>

                {/* Write */}
                <div className="space-y-1 pt-1 border-t">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pt-0.5">
                    Write
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-yellow-600 dark:text-yellow-400 bg-yellow-500/8 rounded px-1.5 py-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Modifies registry — prefer HKCU paths
                  </div>
                  <label className="text-[10px] text-muted-foreground">
                    Key path
                  </label>
                  <input
                    type="text"
                    value={regWriteKey}
                    onChange={(e) => setRegWriteKey(e.target.value)}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                    placeholder="HKCU:\SOFTWARE\MyApp"
                  />
                  <label className="text-[10px] text-muted-foreground">
                    Value name
                  </label>
                  <input
                    type="text"
                    value={regWriteName}
                    onChange={(e) => setRegWriteName(e.target.value)}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                  <label className="text-[10px] text-muted-foreground">
                    Value
                  </label>
                  <input
                    type="text"
                    value={regWriteValue}
                    onChange={(e) => setRegWriteValue(e.target.value)}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                  />
                  <label className="text-[10px] text-muted-foreground">
                    Type
                  </label>
                  <select
                    value={regWriteType}
                    onChange={(e) => setRegWriteType(e.target.value)}
                    className={`${inputCls} cursor-pointer`}
                    style={{ fontSize: "16px" }}
                  >
                    {[
                      "String",
                      "DWord",
                      "QWord",
                      "Binary",
                      "MultiString",
                      "ExpandString",
                    ].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!!loading || !regWriteKey || !regWriteName}
                    className="w-full h-7 text-xs gap-1"
                    onClick={() =>
                      run("reg-write", "RegistryWrite", {
                        key_path: regWriteKey,
                        value_name: regWriteName,
                        value: regWriteValue,
                        value_type: regWriteType,
                      })
                    }
                  >
                    {isLoading("reg-write") ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Shield className="w-3 h-3" />
                    )}
                    Write Registry
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Services ── */}
          <div>
            <SectionHeader
              icon={Power}
              title="Services"
              open={openSections.services}
              onToggle={() => toggleSection("services")}
            />
            {openSections.services && (
              <div className="px-2 pb-2 space-y-2">
                {/* List */}
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pt-1">
                    List
                  </p>
                  <label className="text-[10px] text-muted-foreground">
                    Name filter (optional)
                  </label>
                  <input
                    type="text"
                    value={svcFilter}
                    onChange={(e) => setSvcFilter(e.target.value)}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                    placeholder="spooler"
                  />
                  <label className="text-[10px] text-muted-foreground">
                    Status filter (optional)
                  </label>
                  <select
                    value={svcStatus}
                    onChange={(e) => setSvcStatus(e.target.value)}
                    className={`${inputCls} cursor-pointer`}
                    style={{ fontSize: "16px" }}
                  >
                    <option value="">Any</option>
                    <option value="running">Running</option>
                    <option value="stopped">Stopped</option>
                    <option value="paused">Paused</option>
                  </select>
                  <Button
                    size="sm"
                    disabled={!!loading}
                    className="w-full h-7 text-xs gap-1"
                    onClick={() =>
                      run("svc-list", "ServiceList", {
                        ...(svcFilter ? { filter: svcFilter } : {}),
                        ...(svcStatus ? { status: svcStatus } : {}),
                      })
                    }
                  >
                    {isLoading("svc-list") ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <List className="w-3 h-3" />
                    )}
                    List Services
                  </Button>
                </div>

                {/* Control */}
                <div className="space-y-1 pt-1 border-t">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pt-0.5">
                    Control
                  </p>
                  <label className="text-[10px] text-muted-foreground">
                    Service name
                  </label>
                  <input
                    type="text"
                    value={svcControlName}
                    onChange={(e) => setSvcControlName(e.target.value)}
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                    placeholder="Spooler"
                  />
                  <label className="text-[10px] text-muted-foreground">
                    Action
                  </label>
                  <select
                    value={svcAction}
                    onChange={(e) =>
                      setSvcAction(e.target.value as typeof svcAction)
                    }
                    className={`${inputCls} cursor-pointer`}
                    style={{ fontSize: "16px" }}
                  >
                    <option value="start">start</option>
                    <option value="stop">stop</option>
                    <option value="restart">restart</option>
                    <option value="pause">pause</option>
                    <option value="resume">resume</option>
                  </select>
                  <Button
                    size="sm"
                    variant={svcAction === "stop" ? "destructive" : "default"}
                    disabled={!!loading || !svcControlName}
                    className="w-full h-7 text-xs gap-1"
                    onClick={() =>
                      run("svc-control", "ServiceControl", {
                        name: svcControlName,
                        action: svcAction,
                      })
                    }
                  >
                    {isLoading("svc-control") ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Power className="w-3 h-3" />
                    )}
                    {svcAction.charAt(0).toUpperCase() + svcAction.slice(1)}{" "}
                    Service
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Event Log ── */}
          <div>
            <SectionHeader
              icon={Logs}
              title="Event Log"
              badge="Windows"
              open={openSections.eventlog}
              onToggle={() => toggleSection("eventlog")}
            />
            {openSections.eventlog && (
              <div className="px-2 pb-2 space-y-1">
                <div className="pt-1" />
                <label className="text-[10px] text-muted-foreground">
                  Log name
                </label>
                <select
                  value={evtLog}
                  onChange={(e) => setEvtLog(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                  style={{ fontSize: "16px" }}
                >
                  {["System", "Application", "Security"].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  <option value="custom">Custom…</option>
                </select>
                {evtLog === "custom" && (
                  <input
                    type="text"
                    className={inputCls}
                    style={{ fontSize: "16px" }}
                    placeholder="Custom log name"
                    onChange={(e) => setEvtLog(e.target.value || "custom")}
                  />
                )}
                <label className="text-[10px] text-muted-foreground">
                  Level
                </label>
                <select
                  value={evtLevel}
                  onChange={(e) => setEvtLevel(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                  style={{ fontSize: "16px" }}
                >
                  {["Error", "Warning", "Information", "Critical", "All"].map(
                    (l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ),
                  )}
                </select>
                <label className="text-[10px] text-muted-foreground">
                  Count (max 200)
                </label>
                <input
                  type="number"
                  value={evtCount}
                  onChange={(e) =>
                    setEvtCount(
                      Math.min(200, Math.max(1, Number(e.target.value))),
                    )
                  }
                  className={inputCls}
                  style={{ fontSize: "16px" }}
                  min={1}
                  max={200}
                />
                <label className="text-[10px] text-muted-foreground">
                  Source filter (optional)
                </label>
                <input
                  type="text"
                  value={evtSource}
                  onChange={(e) => setEvtSource(e.target.value)}
                  className={inputCls}
                  style={{ fontSize: "16px" }}
                  placeholder="e.g. Kernel-Power"
                />
                <Button
                  size="sm"
                  disabled={!!loading}
                  className="w-full h-7 text-xs gap-1 mt-1"
                  onClick={() =>
                    run("eventlog", "EventLog", {
                      log_name: evtLog,
                      level: evtLevel,
                      count: evtCount,
                      ...(evtSource ? { source: evtSource } : {}),
                    })
                  }
                >
                  {isLoading("eventlog") ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Logs className="w-3 h-3" />
                  )}
                  Query Event Log
                </Button>
              </div>
            )}
          </div>

          {/* ── Windows Features ── */}
          <div>
            <SectionHeader
              icon={Grid2X2}
              title="Windows Features"
              badge="Windows"
              open={openSections.features}
              onToggle={() => toggleSection("features")}
            />
            {openSections.features && (
              <div className="px-2 pb-2 space-y-1">
                <div className="pt-1" />
                <label className="text-[10px] text-muted-foreground">
                  Name filter (optional)
                </label>
                <input
                  type="text"
                  value={featFilter}
                  onChange={(e) => setFeatFilter(e.target.value)}
                  className={inputCls}
                  style={{ fontSize: "16px" }}
                  placeholder="Hyper-V"
                />
                <label className="flex items-center gap-1.5 cursor-pointer text-xs mt-1">
                  <Checkbox
                    checked={featInstalledOnly}
                    onCheckedChange={(v) => setFeatInstalledOnly(v === true)}
                    className="shrink-0"
                  />
                  Installed only
                </label>
                <Button
                  size="sm"
                  disabled={!!loading}
                  className="w-full h-7 text-xs gap-1 mt-1"
                  onClick={() =>
                    run("features", "WindowsFeatures", {
                      ...(featFilter ? { filter: featFilter } : {}),
                      installed_only: featInstalledOnly,
                    })
                  }
                >
                  {isLoading("features") ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Grid2X2 className="w-3 h-3" />
                  )}
                  List Features
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: results + log ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ResultArea
            activeSection={activeSection}
            activeResult={activeResult}
            loading={!!loading}
          />
          <div className="h-48 border-t shrink-0 flex flex-col overflow-hidden">
            <MessageLog
              logs={logs}
              onClear={clearLogs}
              maxHeight="max-h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
