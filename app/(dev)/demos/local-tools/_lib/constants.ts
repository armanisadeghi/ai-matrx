/** Installed (packaged) Matrx Local app — ~/.matrx, ports 22140–22159 */
export const MATRX_LOCAL_LIVE_PORT_START = 22140;
/** Dev source-run Matrx Local — ~/.matrx-dev, ports 22240–22259 */
export const MATRX_LOCAL_DEV_PORT_START = 22240;
export const MATRX_LOCAL_PORT_RANGE = 20;
/** @deprecated Prefer MATRX_LOCAL_LIVE_PORT_START */
export const MATRX_LOCAL_PORT_START = MATRX_LOCAL_LIVE_PORT_START;

export const DEFAULT_LOCAL_URL = `http://127.0.0.1:${MATRX_LOCAL_LIVE_PORT_START}`;

export type LocalEngineProfile = "live" | "dev";

export const LOCAL_ENGINE_PROFILES: Record<
  LocalEngineProfile,
  { label: string; shortLabel: string; portStart: number }
> = {
  live: {
    label: "Installed app",
    shortLabel: "Installed",
    portStart: MATRX_LOCAL_LIVE_PORT_START,
  },
  dev: {
    label: "Dev engine",
    shortLabel: "Dev",
    portStart: MATRX_LOCAL_DEV_PORT_START,
  },
};

/** All localhost engine ports to probe (live range first, then dev). */
export function localEngineScanPorts(): number[] {
  return [
    ...Array.from(
      { length: MATRX_LOCAL_PORT_RANGE },
      (_, i) => MATRX_LOCAL_LIVE_PORT_START + i,
    ),
    ...Array.from(
      { length: MATRX_LOCAL_PORT_RANGE },
      (_, i) => MATRX_LOCAL_DEV_PORT_START + i,
    ),
  ];
}

export function localEngineProfileFromPort(
  port: number,
): LocalEngineProfile | null {
  if (
    port >= MATRX_LOCAL_LIVE_PORT_START &&
    port < MATRX_LOCAL_LIVE_PORT_START + MATRX_LOCAL_PORT_RANGE
  ) {
    return "live";
  }
  if (
    port >= MATRX_LOCAL_DEV_PORT_START &&
    port < MATRX_LOCAL_DEV_PORT_START + MATRX_LOCAL_PORT_RANGE
  ) {
    return "dev";
  }
  return null;
}

export const LOCAL_ENGINE_SCAN_LABEL = `${MATRX_LOCAL_LIVE_PORT_START}–${MATRX_LOCAL_LIVE_PORT_START + MATRX_LOCAL_PORT_RANGE - 1} + ${MATRX_LOCAL_DEV_PORT_START}–${MATRX_LOCAL_DEV_PORT_START + MATRX_LOCAL_PORT_RANGE - 1}`;

export const ALL_TOOLS = [
  // ── File Operations ──────────────────────────────────────────────
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  // ── Execution ────────────────────────────────────────────────────
  "Bash",
  "BashOutput",
  "TaskStop",
  // ── System ───────────────────────────────────────────────────────
  "SystemInfo",
  "Screenshot",
  "ListDirectory",
  "OpenUrl",
  "OpenPath",
  // ── Clipboard ────────────────────────────────────────────────────
  "ClipboardRead",
  "ClipboardWrite",
  // ── Notifications ────────────────────────────────────────────────
  "Notify",
  // ── Network / Scraping ───────────────────────────────────────────
  "FetchUrl",
  "FetchWithBrowser",
  "Scrape",
  "Search",
  "Research",
  // ── File Transfer ────────────────────────────────────────────────
  "DownloadFile",
  "UploadFile",
  // ── Process Management ───────────────────────────────────────────
  "ListProcesses",
  "LaunchApp",
  "KillProcess",
  "FocusApp",
  "ListPorts",
  // ── Window Management ────────────────────────────────────────────
  "ListWindows",
  "FocusWindow",
  "MoveWindow",
  "MinimizeWindow",
  // ── Input Automation ─────────────────────────────────────────────
  "TypeText",
  "Hotkey",
  "MouseClick",
  "MouseMove",
  // ── Audio ────────────────────────────────────────────────────────
  "ListAudioDevices",
  "RecordAudio",
  "PlayAudio",
  "TranscribeAudio",
  // ── Browser Automation ───────────────────────────────────────────
  "BrowserNavigate",
  "BrowserClick",
  "BrowserType",
  "BrowserExtract",
  "BrowserScreenshot",
  "BrowserEval",
  "BrowserTabs",
  // ── Network Discovery ────────────────────────────────────────────
  "NetworkInfo",
  "NetworkScan",
  "PortScan",
  "MDNSDiscover",
  // ── System Monitoring ────────────────────────────────────────────
  "SystemResources",
  "BatteryStatus",
  "DiskUsage",
  "TopProcesses",
  // ── File Watching ────────────────────────────────────────────────
  "WatchDirectory",
  "WatchEvents",
  "StopWatch",
  // ── OS App Integration ───────────────────────────────────────────
  "AppleScript",
  "PowerShellScript",
  "GetInstalledApps",
  // ── Scheduler / Heartbeat ────────────────────────────────────────
  "ScheduleTask",
  "ListScheduled",
  "CancelScheduled",
  "HeartbeatStatus",
  "PreventSleep",
  // ── Media Processing ─────────────────────────────────────────────
  "ImageOCR",
  "ImageResize",
  "PdfExtract",
  "ArchiveCreate",
  "ArchiveExtract",
  // ── WiFi & Bluetooth ─────────────────────────────────────────────
  "WifiNetworks",
  "BluetoothDevices",
  "ConnectedDevices",
  // ── Documents ────────────────────────────────────────────────────
  "ListDocuments",
  "ListDocumentFolders",
  "ReadDocument",
  "WriteDocument",
  "SearchDocuments",
  // ── PowerShell / System Integration ─────────────────────────────
  "PSGetEnv",
  "PSSetEnv",
  "RegistryRead",
  "RegistryWrite",
  "ServiceList",
  "ServiceControl",
  "EventLog",
  "WindowsFeatures",
] as const;

export type ToolName = (typeof ALL_TOOLS)[number];

export const TOOL_CATEGORIES = {
  "File Operations": ["Read", "Write", "Edit", "Glob", "Grep"],
  "Shell Execution": ["Bash", "BashOutput", "TaskStop"],
  System: ["SystemInfo", "Screenshot", "ListDirectory", "OpenUrl", "OpenPath"],
  Clipboard: ["ClipboardRead", "ClipboardWrite"],
  Notifications: ["Notify"],
  "Network — Simple": ["FetchUrl", "FetchWithBrowser"],
  "Network — Scraper": ["Scrape", "Search", "Research"],
  "File Transfer": ["DownloadFile", "UploadFile"],
  "Process Management": [
    "ListProcesses",
    "LaunchApp",
    "KillProcess",
    "FocusApp",
    "ListPorts",
  ],
  "Window Management": [
    "ListWindows",
    "FocusWindow",
    "MoveWindow",
    "MinimizeWindow",
  ],
  "Input Automation": ["TypeText", "Hotkey", "MouseClick", "MouseMove"],
  Audio: ["ListAudioDevices", "RecordAudio", "PlayAudio", "TranscribeAudio"],
  "Browser Automation": [
    "BrowserNavigate",
    "BrowserClick",
    "BrowserType",
    "BrowserExtract",
    "BrowserScreenshot",
    "BrowserEval",
    "BrowserTabs",
  ],
  "Network Discovery": [
    "NetworkInfo",
    "NetworkScan",
    "PortScan",
    "MDNSDiscover",
  ],
  "System Monitoring": [
    "SystemResources",
    "BatteryStatus",
    "DiskUsage",
    "TopProcesses",
  ],
  "File Watching": ["WatchDirectory", "WatchEvents", "StopWatch"],
  "OS App Integration": ["AppleScript", "PowerShellScript", "GetInstalledApps"],
  "Scheduler & Heartbeat": [
    "ScheduleTask",
    "ListScheduled",
    "CancelScheduled",
    "HeartbeatStatus",
    "PreventSleep",
  ],
  "Media Processing": [
    "ImageOCR",
    "ImageResize",
    "PdfExtract",
    "ArchiveCreate",
    "ArchiveExtract",
  ],
  "WiFi & Bluetooth": ["WifiNetworks", "BluetoothDevices", "ConnectedDevices"],
  Documents: [
    "ListDocuments",
    "ListDocumentFolders",
    "ReadDocument",
    "WriteDocument",
    "SearchDocuments",
  ],
  PowerShell: [
    "PSGetEnv",
    "PSSetEnv",
    "RegistryRead",
    "RegistryWrite",
    "ServiceList",
    "ServiceControl",
    "EventLog",
    "WindowsFeatures",
  ],
} as const;

export const WS_TIMEOUT_DEFAULT = 30_000;
export const WS_TIMEOUT_RESEARCH = 120_000;
export const DISCOVERY_TIMEOUT = 500;
export const STATUS_POLL_INTERVAL = 15_000;
export const HEALTH_POLL_INTERVAL = 15_000;
