"use client";

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";

export type BatchExtractDebugStatus =
  "pending" | "streaming" | "complete" | "error";

export interface BatchExtractDebugRequest {
  method: "POST";
  url: string;
  queryParams: Record<string, string>;
  fileNames: string[];
  fileSizes: number[];
  authorizationPreview: string | null;
}

export interface BatchExtractDebugResponse {
  httpStatus: number;
  statusText: string;
  contentType: string | null;
  requestId: string | null;
}

export interface BatchExtractDebugLine {
  index: number;
  receivedAt: string;
  raw: string;
}

export interface BatchExtractDebugSession {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: BatchExtractDebugStatus;
  request: BatchExtractDebugRequest;
  response: BatchExtractDebugResponse | null;
  lines: BatchExtractDebugLine[];
  error: string | null;
}

export interface PdfBatchExtractDebugState {
  sessions: BatchExtractDebugSession[];
  selectedSessionId: string | null;
}

const MAX_SESSIONS = 20;
const MAX_LINES_PER_SESSION = 2000;

const initialState: PdfBatchExtractDebugState = {
  sessions: [],
  selectedSessionId: null,
};

function trimSessions(
  sessions: BatchExtractDebugSession[],
): BatchExtractDebugSession[] {
  if (sessions.length <= MAX_SESSIONS) return sessions;
  return sessions.slice(0, MAX_SESSIONS);
}

const pdfBatchExtractDebugSlice = createSlice({
  name: "pdfBatchExtractDebug",
  initialState,
  reducers: {
    startBatchExtractDebugSession(
      state,
      action: PayloadAction<{
        id: string;
        startedAt: string;
        request: BatchExtractDebugRequest;
      }>,
    ) {
      const session: BatchExtractDebugSession = {
        id: action.payload.id,
        startedAt: action.payload.startedAt,
        finishedAt: null,
        status: "pending",
        request: action.payload.request,
        response: null,
        lines: [],
        error: null,
      };
      state.sessions = trimSessions([session, ...state.sessions]);
      state.selectedSessionId = action.payload.id;
    },

    markBatchExtractDebugStreaming(
      state,
      action: PayloadAction<{ sessionId: string }>,
    ) {
      const session = state.sessions.find(
        (s) => s.id === action.payload.sessionId,
      );
      if (!session) return;
      session.status = "streaming";
    },

    appendBatchExtractDebugLine(
      state,
      action: PayloadAction<{
        sessionId: string;
        line: BatchExtractDebugLine;
      }>,
    ) {
      const session = state.sessions.find(
        (s) => s.id === action.payload.sessionId,
      );
      if (!session) return;
      if (session.lines.length >= MAX_LINES_PER_SESSION) return;
      session.lines.push(action.payload.line);
      session.status = "streaming";
    },

    finishBatchExtractDebugSession(
      state,
      action: PayloadAction<{
        sessionId: string;
        finishedAt: string;
        status: Extract<BatchExtractDebugStatus, "complete" | "error">;
        response: BatchExtractDebugResponse | null;
        error: string | null;
      }>,
    ) {
      const session = state.sessions.find(
        (s) => s.id === action.payload.sessionId,
      );
      if (!session) return;
      session.finishedAt = action.payload.finishedAt;
      session.status = action.payload.status;
      session.response = action.payload.response;
      session.error = action.payload.error;
    },

    selectBatchExtractDebugSession(
      state,
      action: PayloadAction<string | null>,
    ) {
      state.selectedSessionId = action.payload;
    },

    clearBatchExtractDebugSessions(state) {
      state.sessions = [];
      state.selectedSessionId = null;
    },
  },
});

export const {
  startBatchExtractDebugSession,
  markBatchExtractDebugStreaming,
  appendBatchExtractDebugLine,
  finishBatchExtractDebugSession,
  selectBatchExtractDebugSession,
  clearBatchExtractDebugSessions,
} = pdfBatchExtractDebugSlice.actions;

export const pdfBatchExtractDebugReducer = pdfBatchExtractDebugSlice.reducer;

export const selectPdfBatchExtractDebugSessions = (
  state: RootState,
): BatchExtractDebugSession[] => state.pdfBatchExtractDebug.sessions;

export const selectPdfBatchExtractDebugSelectedSessionId = (
  state: RootState,
): string | null => state.pdfBatchExtractDebug.selectedSessionId;

export const selectPdfBatchExtractDebugSelectedSession = (
  state: RootState,
): BatchExtractDebugSession | null => {
  const id = state.pdfBatchExtractDebug.selectedSessionId;
  if (!id) return state.pdfBatchExtractDebug.sessions[0] ?? null;
  return (
    state.pdfBatchExtractDebug.sessions.find((s) => s.id === id) ??
    state.pdfBatchExtractDebug.sessions[0] ??
    null
  );
};
