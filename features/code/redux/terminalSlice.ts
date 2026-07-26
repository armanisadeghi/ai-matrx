import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { BottomTabId } from "../types";

export interface TerminalLine {
  id: string;
  type: "command" | "stdout" | "stderr" | "info";
  text: string;
  exitCode?: number;
  cwd?: string;
  tab: BottomTabId;
  /** Who originated this line — defaults to "user" when omitted. Agent-driven
   *  runs are tagged "agent" so the UI can badge them. */
  source?: "user" | "agent";
}

export interface CodeTerminalState {
  open: boolean;
  activeTab: BottomTabId;
  /** Shared append-only log for all bottom-panel tabs. */
  lines: TerminalLine[];
  /** Recent commands for ArrowUp / ArrowDown recall, newest last. */
  history: string[];
  executing: boolean;
}

const initialState: CodeTerminalState = {
  // Terminal is visible (small) on initial load. The WorkspaceLayout's
  // dynamic defaults render the terminal at ~15% of the center column when
  // this is true; toggling it via the toolbar/status-bar collapses it.
  open: true,
  activeTab: "terminal",
  lines: [],
  history: [],
  executing: false,
};

let lineIdCounter = 0;
const nextLineId = () => `line-${++lineIdCounter}`;

const slice = createSlice({
  name: "codeTerminal",
  initialState,
  reducers: {
    setOpen(state, action: PayloadAction<boolean>) {
      state.open = action.payload;
    },
    toggleOpen(state) {
      state.open = !state.open;
    },
    setActiveTab(state, action: PayloadAction<BottomTabId>) {
      state.activeTab = action.payload;
      state.open = true;
    },
    appendLine(state, action: PayloadAction<Omit<TerminalLine, "id">>) {
      state.lines.push({ id: nextLineId(), ...action.payload });
    },
    appendLines(state, action: PayloadAction<Omit<TerminalLine, "id">[]>) {
      for (const l of action.payload)
        state.lines.push({ id: nextLineId(), ...l });
    },
    clearLines(state, action: PayloadAction<BottomTabId | undefined>) {
      const tab = action.payload;
      state.lines = tab ? state.lines.filter((l) => l.tab !== tab) : [];
    },
    pushHistory(state, action: PayloadAction<string>) {
      if (!action.payload.trim()) return;
      if (state.history[state.history.length - 1] === action.payload) return;
      state.history.push(action.payload);
      if (state.history.length > 200) state.history.shift();
    },
    setExecuting(state, action: PayloadAction<boolean>) {
      state.executing = action.payload;
    },
  },
});

export const {
  setOpen,
  toggleOpen,
  setActiveTab,
  appendLine,
  appendLines,
  clearLines,
  pushHistory,
  setExecuting,
} = slice.actions;

export default slice.reducer;

// ─── Selectors ──────────────────────────────────────────────────────────────

const emptyLines: TerminalLine[] = [];
const emptyHistory: string[] = [];

type WithCodeTerminal = { codeTerminal: CodeTerminalState };

export const selectCodeTerminal = (state: WithCodeTerminal) =>
  state.codeTerminal ?? initialState;
export const selectTerminalOpen = (state: WithCodeTerminal) =>
  selectCodeTerminal(state).open;
export const selectTerminalActiveTab = (state: WithCodeTerminal) =>
  selectCodeTerminal(state).activeTab;
export const selectTerminalLines = (state: WithCodeTerminal) =>
  selectCodeTerminal(state).lines ?? emptyLines;
export const selectTerminalHistory = (state: WithCodeTerminal) =>
  selectCodeTerminal(state).history ?? emptyHistory;
export const selectTerminalExecuting = (state: WithCodeTerminal) =>
  selectCodeTerminal(state).executing;
