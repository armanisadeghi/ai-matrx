/**
 * Execution Configuration Types
 *
 * Defines how LLM recipe execution results are displayed to the user.
 */

// ============================================================================
// Result Display Types
// ============================================================================

export type ResultDisplayMode =
  | "modal-full"
  | "modal-compact"
  | "chat-bubble"
  | "inline"
  | "sidebar"
  | "flexible-panel"
  | "panel"
  | "toast"
  | "floating-chat"
  | "direct"
  | "background"
  | "chat-collapsible"
  | "chat-assistant";

/**
 * Display modes that render NO user interface whatsoever — no overlay, no
 * component, no composer, no button.
 *
 * This exists because `autoRun` is a USER-INTERFACE control: it decides
 * whether the interface stops and lets the person act before the request goes
 * out. Where there is no interface there is nothing to stop, nobody to offer
 * the choice to, and — critically — nothing that could ever fire the run
 * later. So on these modes `autoRun` is not obeyed, it is IGNORED: honoring a
 * `false` would not defer the send, it would delete the run and leave a
 * seeded conversation that can never execute.
 *
 * `direct` is deliberately NOT in this list. It means "no overlay — the
 * CALLER renders the interface", and callers overwhelmingly do: `/chat`
 * (`features/cx-chat/hooks/useInstanceBootstrap.ts`) creates an empty
 * conversation with `direct` + `autoRun: false` precisely so the user can type
 * in the chat composer first. Treating `direct` as headless would fire a blank
 * run the moment anyone opened a chat.
 *
 * ADDING A DISPLAY MODE: decide which side it belongs on. If it paints
 * nothing a human can see or press, it belongs here.
 */
export const HEADLESS_DISPLAY_MODES = ["background"] as const;

export type HeadlessDisplayMode = (typeof HEADLESS_DISPLAY_MODES)[number];

/** Modes that CAN carry an interface — everything that is not headless. */
export type InterfaceDisplayMode = Exclude<
  ResultDisplayMode,
  HeadlessDisplayMode
>;

export function isHeadlessDisplayMode(
  mode: ResultDisplayMode,
): mode is HeadlessDisplayMode {
  return (HEADLESS_DISPLAY_MODES as readonly string[]).includes(mode);
}

/**
 * Flags on `AgentExecutionConfig` that describe an INTERFACE and nothing else:
 * whether a gate stops the person before the send, whether the variables panel
 * is painted, whether a composer is offered after the answer. Like `autoRun`,
 * every one of them is a question about what a human sees — so on a mode that
 * paints nothing (`HEADLESS_DISPLAY_MODES`) each is describing an interface
 * that does not exist.
 *
 * Arman's rule, quoted in `features/agents/docs/AUTORUN_IS_A_UI_CONTROL.md`:
 * *"If there is no user interface, it's impossible for autorun to have any
 * impact at all because there is no ui."* The same sentence is true of these
 * three with their names swapped in; `autoRun` was only the one that had
 * already cost us runs.
 *
 * `showPreExecutionGate: true` is the dangerous one: it takes the same shape
 * as the `autoRun` defect — the launch returns early behind a gate overlay on
 * a launch nobody is watching, so the run is not deferred, it is thrown away.
 * The other two are merely meaningless. All three are treated the same way, by
 * `resolveInterfaceOnlyFlag`: ignored at the root, screamed about by name.
 */
export const INTERFACE_ONLY_LAUNCH_FLAGS = [
  "showPreExecutionGate",
  "showVariablePanel",
  "allowChat",
] as const;

export type InterfaceOnlyLaunchFlag =
  (typeof INTERFACE_ONLY_LAUNCH_FLAGS)[number];

/**
 * Resolve one interface-only flag, refusing to honour it on a headless mode.
 *
 * Precedence is unchanged (caller literal → the shortcut's / job's stored
 * answer → undefined); the only new behaviour is at the end: on a headless
 * mode a `true` becomes `false` and says so, naming the flag, the mode and
 * which side asserted it, so the CALL SITE gets fixed rather than the symptom.
 *
 * Silence is deliberate for `false`/omitted — leaving a user-interface flag
 * off a mode with no user interface is the sane thing to write, exactly as
 * with `autoRun`.
 */
export function resolveInterfaceOnlyFlag({
  flag,
  callerValue,
  storedValue,
  displayMode,
  conversationLabel,
}: {
  flag: InterfaceOnlyLaunchFlag;
  callerValue: boolean | undefined;
  storedValue?: boolean | null | undefined;
  displayMode: ResultDisplayMode;
  conversationLabel?: string;
}): boolean | undefined {
  const stored = storedValue ?? undefined;
  const resolved = callerValue ?? stored;

  if (!isHeadlessDisplayMode(displayMode) || resolved !== true) {
    return resolved;
  }

  const source =
    callerValue === true ? "the call site" : "the stored shortcut/job record";
  console.error(
    `[launchAgentExecution] IGNORING ${flag}=true: it was passed with displayMode="${displayMode}"` +
      `${conversationLabel ? ` (${conversationLabel})` : ""}, which renders no interface. ` +
      `${flag} decides what the person sees before or after the send; with no UI there is nobody to show it to. ` +
      `${flag === "showPreExecutionGate" ? "Honouring it would hold the run behind a gate nobody can ever press, which does not defer the run, it deletes it. " : ""}` +
      `Treating it as false. Fix ${source}: drop ${flag}, or launch on a display mode that paints something.`,
  );
  return false;
}

export interface DisplayModeMeta {
  label: string;
  description: string;
  icon: string;
  color: string;
  useCases: readonly string[];
  testMode: boolean;
}

export const RESULT_DISPLAY_META: Record<ResultDisplayMode, DisplayModeMeta> = {
  "modal-full": {
    label: "Full Modal",
    description: "Full-featured modal dialog with chat interface and history",
    icon: "Square",
    color: "text-purple-600 dark:text-purple-400",
    useCases: [
      "Complex interactions",
      "Multi-turn conversations",
      "Review before action",
    ],
    testMode: false,
  },
  "modal-compact": {
    label: "Compact Modal",
    description: "Streamlined modal with essential controls and preview",
    icon: "RectangleVertical",
    color: "text-blue-600 dark:text-blue-400",
    useCases: ["Quick edits", "Single responses", "Simple previews"],
    testMode: false,
  },
  "chat-bubble": {
    label: "Chat Bubble",
    description: "Persistent floating chat bubble for conversational agents",
    icon: "MessageCircle",
    color: "text-violet-600 dark:text-violet-400",
    useCases: ["Conversational AI", "Help assistant", "Persistent chat"],
    testMode: false,
  },
  inline: {
    label: "Inline",
    description:
      "Minimal overlay at cursor/selection with immediate action options",
    icon: "FileEdit",
    color: "text-amber-600 dark:text-amber-400",
    useCases: ["Text manipulation", "In-place edits", "Quick replacements"],
    testMode: true,
  },
  sidebar: {
    label: "Sidebar",
    description:
      "Persistent sidebar panel (FloatingSheet) with contextual results",
    icon: "PanelRight",
    color: "text-teal-600 dark:text-teal-400",
    useCases: [
      "Parallel workflows",
      "Reference while working",
      "Multi-document tasks",
    ],
    testMode: false,
  },
  "flexible-panel": {
    label: "Flexible Panel",
    description:
      "Advanced resizable panel with full position control and fullscreen mode",
    icon: "Maximize2",
    color: "text-emerald-600 dark:text-emerald-400",
    useCases: [
      "Complex workflows",
      "Full customization",
      "Multi-position support",
      "Adjustable sizing",
    ],
    testMode: false,
  },
  panel: {
    label: "Panel",
    description: "Embedded panel within the current layout, no overlay",
    icon: "LayoutDashboard",
    color: "text-indigo-600 dark:text-indigo-400",
    useCases: ["Builder test panel", "Embedded agent", "Side-by-side work"],
    testMode: false,
  },
  toast: {
    label: "Toast",
    description: "Brief notification with result summary or confirmation",
    icon: "BellRing",
    color: "text-orange-600 dark:text-orange-400",
    useCases: ["Simple confirmations", "Status updates", "Quick answers"],
    testMode: false,
  },
  "floating-chat": {
    label: "Floating Chat",
    description:
      "Draggable, resizable OS-style window with full chat interface",
    icon: "AppWindow",
    color: "text-sky-600 dark:text-sky-400",
    useCases: [
      "Persistent conversation",
      "Multitasking while chatting",
      "Movable workspace",
    ],
    testMode: false,
  },
  "chat-collapsible": {
    label: "Chat Collapsible",
    description: "Collapsible chat interface with chat history",
    icon: "MessageSquare",
    color: "text-blue-600 dark:text-blue-400",
    useCases: [
      "Chat history",
      "Chat interface",
      "Chat collapsible",
      "Chat messages",
    ],
    testMode: true,
  },
  "chat-assistant": {
    label: "Chat Assistant",
    description:
      "Persistent bottom-right floating assistant with stacking card UI and heartbeat architecture",
    icon: "MessageSquare",
    color: "text-pink-600 dark:text-pink-400",
    useCases: [
      "Always-on assistant",
      "Proactive suggestions",
      "Ambient AI helper",
      "Micro-interactions",
    ],
    testMode: false,
  },
  direct: {
    label: "Direct Stream",
    description:
      "Streams output directly to target component with no intermediate UI",
    icon: "ArrowRight",
    color: "text-cyan-600 dark:text-cyan-400",
    useCases: ["Live updates", "Real-time collaboration", "Embedded outputs"],
    testMode: true,
  },
  background: {
    label: "Background",
    description: "Silent execution with state updates only, no UI shown",
    icon: "Loader",
    color: "text-slate-600 dark:text-slate-400",
    useCases: ["Automation", "Batch processing", "Pre-computation"],
    testMode: true,
  },
};

export const hasVisibleUI = (display: ResultDisplayMode): boolean => {
  return display !== "background" && display !== "direct";
};

export const isInteractive = (display: ResultDisplayMode): boolean => {
  return (
    display === "modal-full" ||
    display === "modal-compact" ||
    display === "sidebar" ||
    display === "floating-chat"
  );
};

// ============================================================================
// Execution Configuration
// ============================================================================

export interface AgentUiRunConfig {
  result_display: ResultDisplayMode;
  auto_run: boolean;
  allow_chat: boolean;
  show_variables: boolean;
  apply_variables: boolean;
  track_in_runs: boolean;
  use_pre_execution_input: boolean; // Show input modal before execution
}

export const DEFAULT_EXECUTION_CONFIG: AgentUiRunConfig = {
  result_display: "modal-full",
  auto_run: true,
  allow_chat: true,
  show_variables: false,
  apply_variables: true,
  track_in_runs: true,
  use_pre_execution_input: false,
};

export function parseExecutionConfig(
  result_display?: string | null,
  auto_run?: boolean | null,
  allow_chat?: boolean | null,
  show_variables?: boolean | null,
  apply_variables?: boolean | null,
  track_in_runs?: boolean | null,
  use_pre_execution_input?: boolean | null,
): AgentUiRunConfig {
  return {
    result_display:
      (result_display as ResultDisplayMode) ||
      DEFAULT_EXECUTION_CONFIG.result_display,
    auto_run: auto_run ?? DEFAULT_EXECUTION_CONFIG.auto_run,
    allow_chat: allow_chat ?? DEFAULT_EXECUTION_CONFIG.allow_chat,
    show_variables: show_variables ?? DEFAULT_EXECUTION_CONFIG.show_variables,
    apply_variables:
      apply_variables ?? DEFAULT_EXECUTION_CONFIG.apply_variables,
    track_in_runs: track_in_runs ?? DEFAULT_EXECUTION_CONFIG.track_in_runs,
    use_pre_execution_input:
      use_pre_execution_input ??
      DEFAULT_EXECUTION_CONFIG.use_pre_execution_input,
  };
}

export function requiresModalUI(display: ResultDisplayMode): boolean {
  return (
    display === "modal-full" ||
    display === "modal-compact" ||
    display === "sidebar"
  );
}

export function requiresInlineUI(display: ResultDisplayMode): boolean {
  return display === "inline";
}

export function showsResults(display: ResultDisplayMode): boolean {
  return display !== "background";
}

/**
 * Get all display types as an array
 */
export function getAllDisplayTypes(): ResultDisplayMode[] {
  return Object.keys(RESULT_DISPLAY_META) as ResultDisplayMode[];
}

/**
 * Get metadata for a specific display type
 */
export function getDisplayMeta(display: ResultDisplayMode) {
  return RESULT_DISPLAY_META[display];
}

/**
 * Check if a display type requires test mode UI
 */
export function isTestMode(display: ResultDisplayMode): boolean {
  return RESULT_DISPLAY_META[display].testMode;
}
