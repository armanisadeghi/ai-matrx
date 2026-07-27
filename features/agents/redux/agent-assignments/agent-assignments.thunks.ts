import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import type { AssignmentProgressData } from "@/types/python-generated/stream-events";
import {
  callAgentAssignmentSession,
  callAgentAssignments,
  callAgentStart,
  callCancelAgentAssignmentSession,
  type AgentAssignmentRunBody,
} from "@/lib/api/call-api";
import type { AppThunk } from "@/lib/redux/store";

import {
  agentAssignmentsActions,
  type AssignmentDemoVariable,
} from "./agent-assignments.slice";

function isAssignmentProgress(
  event: TypedStreamEvent,
): event is { event: "data"; data: AssignmentProgressData } {
  return event.event === "data" && event.data.type === "assignment_progress";
}

function errorMessage(error: { message: string; serverDetail?: unknown }): string {
  if (typeof error.serverDetail === "object" && error.serverDetail !== null) {
    return `${error.message}: ${JSON.stringify(error.serverDetail)}`;
  }
  return error.message;
}

const TERMINAL_SESSION_STATUSES = new Set([
  "completed",
  "partially_failed",
  "failed",
  "cancelled",
]);

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function optionMap(
  variables: AssignmentDemoVariable[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const variable of variables) {
    const name = variable.name.trim();
    const options = variable.options
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean);
    if (!name) throw new Error("Every variable needs a name.");
    if (options.length === 0) {
      throw new Error(`Variable “${name}” needs at least one option.`);
    }
    if (new Set(options).size !== options.length) {
      throw new Error(`Variable “${name}” contains duplicate options.`);
    }
    if (result[name]) throw new Error(`Variable name “${name}” is duplicated.`);
    result[name] = options;
  }
  return result;
}

function buildBatchRequest(
  state: ReturnType<
    typeof import("./agent-assignments.slice").selectAgentAssignmentsDemo
  >,
  sessionKey: string,
): AgentAssignmentRunBody {
  if (!state.agentId) throw new Error("Select an agent before running the demo.");

  let plan: AgentAssignmentRunBody["plan"];
  if (state.mode === "coordinated_rows") {
    const rows = state.rows.map((row, index) => {
      const topic = row.topic.trim();
      const research = row.research.trim();
      if (!topic || !research) {
        throw new Error(`Paired row ${index + 1} needs both topic and research.`);
      }
      return {
        key: `blog-${index + 1}`,
        values: { topic, research_data: research },
      };
    });
    plan = {
      strategy: "coordinated_rows",
      rows,
      order: state.randomizeOrder ? "random" : "declared",
    };
  } else if (state.mode === "independent_random") {
    plan = {
      strategy: "independent_random",
      variables: optionMap(state.variables),
      count: state.count,
      uniqueness: state.withoutReplacement
        ? "without_replacement"
        : "allow_repeats",
    };
  } else {
    plan = {
      strategy: "cartesian",
      variables: optionMap(state.variables),
      order: state.randomizeOrder ? "random" : "declared",
      limit: state.limit,
    };
  }

  return {
    agent: {
      agent_id: state.agentId,
      user_input: state.userInput,
      source_app: "matrx-frontend",
      source_feature: "agent-assignment-demo",
    },
    plan,
    session_key: sessionKey,
    max_concurrency: state.maxConcurrency,
    metadata: { demo: "blog-articles" },
  };
}

export function runAssignmentDemo(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const state = getState().agentAssignments;
    if (!state.agentId) {
      dispatch(agentAssignmentsActions.runFailed("Select an agent before running."));
      return;
    }

    if (state.mode === "single_random") {
      const variableName = state.singleVariableName.trim();
      if (!variableName) {
        dispatch(
          agentAssignmentsActions.runFailed("Enter the opted-in variable name."),
        );
        return;
      }
      dispatch(agentAssignmentsActions.runStarted(null));
      const response = await callAgentStart({
        agentId: state.agentId,
        body: {
          // Required on every start request: client-minted id (correlation),
          // is_new, and store. This demo run persists like a normal chat.
          conversation_id: crypto.randomUUID(),
          is_new: true,
          store: true,
          user_input: state.userInput,
          variables: {
            [variableName]: { type: "auto_assign", strategy: "random" },
          },
          source_app: "matrx-frontend",
          source_feature: "agent-assignment-demo",
        },
        onStreamEvent: (event) => {
          if (event.event === "chunk") {
            dispatch(agentAssignmentsActions.textReceived(event.data.text));
          }
        },
      })(dispatch, getState, undefined);
      if (response.error) {
        dispatch(agentAssignmentsActions.runFailed(errorMessage(response.error)));
        return;
      }
      dispatch(agentAssignmentsActions.runCompleted());
      return;
    }

    const sessionKey = state.sessionKey ?? `assignment-demo:${crypto.randomUUID()}`;
    let body: AgentAssignmentRunBody;
    try {
      body = buildBatchRequest(state, sessionKey);
    } catch (error) {
      dispatch(
        agentAssignmentsActions.runFailed(
          error instanceof Error ? error.message : "Invalid assignment plan.",
        ),
      );
      return;
    }

    dispatch(agentAssignmentsActions.runStarted(sessionKey));
    const response = await callAgentAssignments({
      body,
      onStreamEvent: (event) => {
        if (!isAssignmentProgress(event)) return;
        dispatch(
          agentAssignmentsActions.progressReceived({
            sessionId: event.data.session_id,
            completed: event.data.completed,
            total: event.data.total,
            status: event.data.status,
          }),
        );
      },
    })(dispatch, getState, undefined);
    if (response.error) {
      dispatch(agentAssignmentsActions.runFailed(errorMessage(response.error)));
      return;
    }

    const sessionId = getState().agentAssignments.sessionId;
    if (!sessionId) {
      dispatch(
        agentAssignmentsActions.runFailed(
          "The batch completed without returning a durable session id.",
        ),
      );
      return;
    }
    await dispatch(pollAssignmentSession(sessionId));
  };
}

function pollAssignmentSession(sessionId: string): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    while (true) {
      const response = await callAgentAssignmentSession(sessionId)(
        dispatch,
        getState,
        undefined,
      );
      if (response.error) {
        dispatch(agentAssignmentsActions.runFailed(errorMessage(response.error)));
        return;
      }
      if (!response.data) {
        dispatch(
          agentAssignmentsActions.runFailed(
            "The durable session returned no result payload.",
          ),
        );
        return;
      }
      dispatch(agentAssignmentsActions.resultReceived(response.data));
      if (TERMINAL_SESSION_STATUSES.has(response.data.session.status)) return;
      await wait(1_000);
    }
  };
}

export function loadAssignmentSession(
  sessionId: string,
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const response = await callAgentAssignmentSession(sessionId)(
      dispatch,
      getState,
      undefined,
    );
    if (response.error) {
      dispatch(agentAssignmentsActions.runFailed(errorMessage(response.error)));
      return;
    }
    if (response.data) {
      dispatch(agentAssignmentsActions.resultReceived(response.data));
    }
  };
}

export function cancelAssignmentDemo(): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const sessionId = getState().agentAssignments.sessionId;
    if (!sessionId) return;
    const response = await callCancelAgentAssignmentSession(sessionId)(
      dispatch,
      getState,
      undefined,
    );
    if (response.error) {
      dispatch(agentAssignmentsActions.runFailed(errorMessage(response.error)));
      return;
    }
    if (response.data) {
      dispatch(agentAssignmentsActions.resultReceived(response.data));
    }
  };
}
