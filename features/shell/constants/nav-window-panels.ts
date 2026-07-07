/**
 * Controlled registry for window panels promoted from the Windows menu into
 * main-shell nav flyouts. Each entry maps a nav `panelAction` id to the
 * canonical ToolsGrid tile (single open path — no duplicated seed logic).
 *
 * When a tile is migrated here, move its ToolsGrid `category` to `"dupes"` so
 * it only appears in the admin Dupes tab until the migration is complete.
 */

/** Lucide icon for every nav entry that opens a window panel (see `shellIconMap`). */
export const NAV_WINDOW_PANEL_ICON = "AppWindow";

export type ShellNavPanelActionId =
  | "open-chat-panel"
  | "open-chat-history-panel"
  | "open-notes-panel"
  | "open-code-editor-panel"
  | "open-tasks-panel"
  | "open-agent-connections-panel"
  | "open-transcript-studio-panel"
  | "open-pdf-extractor-panel"
  | "open-web-scraper-panel"
  | "open-data-tables-panel"
  | "open-gallery-panel"
  | "open-files-panel"
  | "open-voice-pad-panel"
  | "open-advanced-voice-pad-panel"
  | "open-crop-studio-panel"
  | "open-agent-settings-panel"
  | "open-agent-advanced-editor-panel"
  | "open-run-history-panel"
  | "open-smart-code-editor-panel"
  | "open-code-files-panel"
  | "open-context-switcher-panel"
  | "open-news-panel"
  | "open-ai-voice-panel"
  | "open-transcription-cleanup-panel"
  | "open-import-agent-panel"
  | "open-site-workbench-panel";

export interface NavWindowPanelActionDef {
  tileId: string;
  label: string;
  iconName: string;
  /** Graceful fallback for mobile / ctrl-click surfaces. */
  href: string;
}

export const NAV_WINDOW_PANEL_ACTIONS: Record<
  ShellNavPanelActionId,
  NavWindowPanelActionDef
> = {
  "open-chat-panel": {
    tileId: "tile.agent-run",
    label: "Chat Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/chat/new",
  },
  "open-chat-history-panel": {
    tileId: "tile.ai-results",
    label: "Chat History Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/chat/new",
  },
  "open-notes-panel": {
    tileId: "tile.notes-pinned",
    label: "Notes Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/notes",
  },
  "open-code-editor-panel": {
    tileId: "tile.code-editor",
    label: "Code Editor Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/code",
  },
  "open-tasks-panel": {
    tileId: "tile.quick-tasks",
    label: "Tasks Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/tasks",
  },
  "open-agent-connections-panel": {
    tileId: "tile.agent-connections",
    label: "Agent Connections Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/agent-connections",
  },
  "open-transcript-studio-panel": {
    tileId: "tile.transcript-studio",
    label: "Transcript Studio Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/transcripts/studio",
  },
  "open-pdf-extractor-panel": {
    tileId: "tile.pdf-extractor",
    label: "PDF Extractor Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/tools/pdf-extractor",
  },
  "open-web-scraper-panel": {
    tileId: "tile.scraper",
    label: "Web Scraper Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/scraper",
  },
  "open-data-tables-panel": {
    tileId: "tile.quick-data",
    label: "Data Tables Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/data",
  },
  "open-gallery-panel": {
    tileId: "tile.gallery",
    label: "Gallery Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/images",
  },
  "open-files-panel": {
    tileId: "tile.quick-files",
    label: "Files Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/files/all",
  },
  "open-voice-pad-panel": {
    tileId: "tile.voice-pad",
    label: "Voice Pad Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/transcripts",
  },
  "open-advanced-voice-pad-panel": {
    tileId: "tile.voice-pad-advanced",
    label: "Advanced Voice Pad Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/transcripts",
  },
  "open-crop-studio-panel": {
    tileId: "tile.crop-studio",
    label: "Crop Studio Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/images",
  },
  "open-agent-settings-panel": {
    tileId: "tile.agent-settings",
    label: "Agent Settings Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/agents/all",
  },
  "open-agent-advanced-editor-panel": {
    tileId: "tile.agent-advanced-editor",
    label: "Agent Advanced Editor Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/agents/all",
  },
  "open-run-history-panel": {
    tileId: "tile.agent-run-history",
    label: "Run History Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/agents/all",
  },
  "open-smart-code-editor-panel": {
    tileId: "tile.smart-code-editor",
    label: "Smart Code Editor Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/code",
  },
  "open-code-files-panel": {
    tileId: "tile.code-files",
    label: "Code Files Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/code",
  },
  "open-context-switcher-panel": {
    tileId: "tile.context-switcher",
    label: "Context Switcher Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/scopes",
  },
  "open-news-panel": {
    tileId: "tile.news",
    label: "News Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/news",
  },
  "open-ai-voice-panel": {
    tileId: "tile.ai-voice",
    label: "AI Voice Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/transcripts",
  },
  "open-transcription-cleanup-panel": {
    tileId: "tile.transcription-cleanup",
    label: "Transcription Cleanup Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/transcripts/cleanup",
  },
  "open-import-agent-panel": {
    tileId: "tile.agent-import",
    label: "Import Agent Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/agents/new/import",
  },
  "open-site-workbench-panel": {
    tileId: "tile.site-workbench",
    label: "Site Workbench Window",
    iconName: NAV_WINDOW_PANEL_ICON,
    href: "/tools/pdf-extractor",
  },
};

/** Tiles removed from the everyday Tools tab while migrated to nav. */
export const MIGRATED_NAV_PANEL_TILE_IDS: ReadonlySet<string> = new Set(
  Object.values(NAV_WINDOW_PANEL_ACTIONS).map((entry) => entry.tileId),
);
