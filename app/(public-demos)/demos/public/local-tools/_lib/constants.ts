export const MATRX_LOCAL_PORT_START = 22140;
export const MATRX_LOCAL_PORT_RANGE = 20;
export const DEFAULT_LOCAL_URL = `http://127.0.0.1:${MATRX_LOCAL_PORT_START}`;

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
  "PowerShell": [
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
