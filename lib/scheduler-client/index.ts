// lib/scheduler-client/index.ts
//
// @matrx/scheduler-client — TypeScript twin of the Python matrx-scheduler
// package in aidream. This is the CANONICAL home for the TS client;
// matrx-extend vendors a copy of this module (see Phase 3c).
//
// Purpose: give clients that can't run the Python host (Chrome
// extension, web tab, edge function) the same claim / subscribe /
// status-transition primitives the Python scanner uses, against the
// same sch_* tables.

export { createSchedulerClient } from "./client";
export type {
    SchedulerClient,
    SchedulerClientConfig,
} from "./client";

export {
    claimTask,
    completeRun,
    failRun,
    markRunRunning,
} from "./claim";
export type {
    ClaimTaskOptions,
    CompleteRunOptions,
    FailRunOptions,
    MarkRunRunningOptions,
} from "./claim";

export { subscribeToTasks } from "./subscribe";
export type {
    SubscribeOptions,
    TaskEvent,
    TaskEventHandler,
    TaskEventType,
} from "./subscribe";

export {
    computeNextDueAt,
    isEventDrivenTrigger,
    nextNCronFires,
    validateCron,
} from "./next-due";
export type {
    ContextMatchTriggerConfig,
    CronTriggerConfig,
    HeartbeatTriggerConfig,
    IntervalTriggerConfig,
    NextFireResult,
    OneShotTriggerConfig,
    ScheduledTriggerConfig,
} from "./next-due";

export {
    SCHEDULER_SURFACES,
    isSchedulerSurface,
} from "./surfaces";
export type {
    SchedulerComponent,
    SchedulerSurface,
} from "./surfaces";

export {
    SchedulerClientError,
    TaskClaimRaceError,
    isClaimRaceLoss,
} from "./errors";

export type {
    AgentAuthMode,
    Json,
    OutputRef,
    OutputRefKind,
    RunStatus,
    SchAgentTaskInsert,
    SchAgentTaskRow,
    SchAgentTaskUpdate,
    SchRunInsert,
    SchRunRow,
    SchRunUpdate,
    SchTaskInsert,
    SchTaskRow,
    SchTaskUpdate,
    SchTriggerInsert,
    SchTriggerRow,
    SchTriggerUpdate,
    TriggerType,
} from "./types";
