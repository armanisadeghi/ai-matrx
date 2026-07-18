import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AgentAssignmentBatchResult } from "@/lib/api/call-api";
import type { RootState } from "@/lib/redux/rootReducer";

export type AssignmentDemoMode =
  | "single_random"
  | "coordinated_rows"
  | "independent_random"
  | "cartesian";

export interface AssignmentDemoRow {
  id: number;
  topic: string;
  research: string;
}

export interface AssignmentDemoVariable {
  id: number;
  name: string;
  options: string;
}

interface AgentAssignmentsState {
  agentId: string | null;
  agentName: string | null;
  mode: AssignmentDemoMode;
  userInput: string;
  singleVariableName: string;
  rows: AssignmentDemoRow[];
  variables: AssignmentDemoVariable[];
  count: number;
  limit: number;
  withoutReplacement: boolean;
  randomizeOrder: boolean;
  maxConcurrency: number;
  sessionKey: string | null;
  sessionId: string | null;
  completed: number;
  total: number;
  runStatus: "idle" | "running" | "completed" | "failed" | "cancelled";
  streamedText: string;
  result: AgentAssignmentBatchResult | null;
  error: string | null;
  nextRowId: number;
  nextVariableId: number;
}

const initialState: AgentAssignmentsState = {
  agentId: null,
  agentName: null,
  mode: "coordinated_rows",
  userInput:
    "Write a useful blog article using the assigned topic and its paired research.",
  singleVariableName: "topic",
  rows: [
    {
      id: 1,
      topic: "How durable AI workflows recover after failures",
      research: "Focus on idempotency keys, leases, and resumable sessions.",
    },
    {
      id: 2,
      topic: "Why unbiased randomization matters in content experiments",
      research: "Discuss cryptographic randomness and avoiding modulo or duplicate bias.",
    },
    {
      id: 3,
      topic: "Designing agent systems that stay simple as orchestration grows",
      research: "Compare pre-resolution with coupling orchestration into the agent runtime.",
    },
  ],
  variables: [
    { id: 1, name: "tone", options: "practical\nconversational\nanalytical" },
    { id: 2, name: "audience", options: "developers\nproduct leaders" },
  ],
  count: 6,
  limit: 6,
  withoutReplacement: true,
  randomizeOrder: false,
  maxConcurrency: 3,
  sessionKey: null,
  sessionId: null,
  completed: 0,
  total: 0,
  runStatus: "idle",
  streamedText: "",
  result: null,
  error: null,
  nextRowId: 4,
  nextVariableId: 3,
};

const slice = createSlice({
  name: "agentAssignments",
  initialState,
  reducers: {
    setAgent(
      state,
      action: PayloadAction<{ id: string; name: string | null }>,
    ) {
      state.agentId = action.payload.id;
      state.agentName = action.payload.name;
    },
    setMode(state, action: PayloadAction<AssignmentDemoMode>) {
      state.mode = action.payload;
      state.sessionKey = null;
      state.sessionId = null;
      state.result = null;
      state.error = null;
      state.runStatus = "idle";
      state.completed = 0;
      state.total = 0;
      state.streamedText = "";
    },
    setUserInput(state, action: PayloadAction<string>) {
      state.userInput = action.payload;
    },
    setSingleVariableName(state, action: PayloadAction<string>) {
      state.singleVariableName = action.payload;
    },
    addRow(state) {
      state.rows.push({ id: state.nextRowId, topic: "", research: "" });
      state.nextRowId += 1;
    },
    removeRow(state, action: PayloadAction<number>) {
      if (state.rows.length > 1) {
        state.rows = state.rows.filter((row) => row.id !== action.payload);
      }
    },
    updateRow(
      state,
      action: PayloadAction<{
        id: number;
        field: "topic" | "research";
        value: string;
      }>,
    ) {
      const row = state.rows.find((item) => item.id === action.payload.id);
      if (row) row[action.payload.field] = action.payload.value;
    },
    addVariable(state) {
      state.variables.push({
        id: state.nextVariableId,
        name: "",
        options: "",
      });
      state.nextVariableId += 1;
    },
    removeVariable(state, action: PayloadAction<number>) {
      if (state.variables.length > 1) {
        state.variables = state.variables.filter(
          (variable) => variable.id !== action.payload,
        );
      }
    },
    updateVariable(
      state,
      action: PayloadAction<{
        id: number;
        field: "name" | "options";
        value: string;
      }>,
    ) {
      const variable = state.variables.find(
        (item) => item.id === action.payload.id,
      );
      if (variable) variable[action.payload.field] = action.payload.value;
    },
    setCount(state, action: PayloadAction<number>) {
      state.count = action.payload;
    },
    setLimit(state, action: PayloadAction<number>) {
      state.limit = action.payload;
    },
    setWithoutReplacement(state, action: PayloadAction<boolean>) {
      state.withoutReplacement = action.payload;
    },
    setRandomizeOrder(state, action: PayloadAction<boolean>) {
      state.randomizeOrder = action.payload;
    },
    setMaxConcurrency(state, action: PayloadAction<number>) {
      state.maxConcurrency = action.payload;
    },
    runStarted(state, action: PayloadAction<string | null>) {
      state.runStatus = "running";
      state.sessionKey = action.payload;
      state.sessionId = null;
      state.completed = 0;
      state.total = 0;
      state.streamedText = "";
      state.result = null;
      state.error = null;
    },
    progressReceived(
      state,
      action: PayloadAction<{
        sessionId: string;
        completed: number;
        total: number;
        status: string;
      }>,
    ) {
      state.sessionId = action.payload.sessionId;
      state.completed = action.payload.completed;
      state.total = action.payload.total;
      if (action.payload.status === "cancelled") state.runStatus = "cancelled";
    },
    textReceived(state, action: PayloadAction<string>) {
      state.streamedText += action.payload;
    },
    resultReceived(state, action: PayloadAction<AgentAssignmentBatchResult>) {
      state.result = action.payload;
      state.sessionId = action.payload.session.id;
      state.completed =
        action.payload.session.completed_items +
        action.payload.session.failed_items +
        action.payload.session.cancelled_items;
      state.total = action.payload.session.total_items;
      if (action.payload.session.status === "cancelled") {
        state.runStatus = "cancelled";
      } else if (
        action.payload.session.status === "pending" ||
        action.payload.session.status === "running"
      ) {
        state.runStatus = "running";
      } else {
        state.runStatus = "completed";
      }
    },
    runCompleted(state) {
      state.runStatus = "completed";
    },
    runFailed(state, action: PayloadAction<string>) {
      state.runStatus = "failed";
      state.error = action.payload;
    },
    resetSession(state) {
      state.sessionKey = null;
      state.sessionId = null;
      state.completed = 0;
      state.total = 0;
      state.result = null;
      state.error = null;
      state.runStatus = "idle";
      state.streamedText = "";
    },
  },
});

export const agentAssignmentsActions = slice.actions;
export const agentAssignmentsReducer = slice.reducer;

export const selectAgentAssignmentsDemo = (state: RootState) =>
  state.agentAssignments;
