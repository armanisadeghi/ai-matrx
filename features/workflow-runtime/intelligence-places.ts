// features/workflow-runtime/intelligence-places.ts
//
// WHERE EACH WORKFLOW JOB RUNS — drawn on /intelligence/workflow.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
// Most workflow jobs run inside the Workflow Studio (a separate app in the
// aidream repo: Conductor, step Stewards, setup helper, Plan Room and its
// assists, recovery advice, run suggestions). Those places carry
// `app: "workflow-studio"`; the same test reads their sources from the sibling
// aidream checkout and follows each call (`calls`) to the server files that
// route it and name the job. Server-only pipelines (the extract sweep, research
// workflow probes) have no screen and read "Not recorded yet".

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;
const STUDIO_WORKFLOW = "https://workflows.aimatrx.com/workflows/[workflowId]";

export const WORKFLOW_PLACES: FeaturePlaces = {
  feature: "workflow",
  label: "Workflows",
  roots: [
    "features/workflow-runtime",
    "features/workflow-emit",
    "features/workflow-comparison",
    "app/(core)/workflows",
  ],
  places: [
    {
      id: "run",
      label: "Run a workflow",
      trigger: "Run it — every AI step of the run",
      urlPattern: "/workflows/[workflowId]",
      mandateKeys: [K.workflow__step_intelligence],
      sources: ["features/workflow-runtime/components/run/WorkflowRunPage.tsx"],
    },
    {
      id: "studio-conductor",
      label: "Workflow Studio — the Conductor",
      trigger: "Conductor button — the chat that builds and changes the whole workflow",
      urlPattern: STUDIO_WORKFLOW,
      mandateKeys: [K.workflow__conductor],
      app: "workflow-studio",
      sources: ["src/features/canvas/conductor/use-conductor-chat.ts"],
      calls: "/conductor-context",
      server: [
        "aidream/api/routers/workflow.py",
        "aidream/services/workflow_conductor/context.py",
      ],
    },
    {
      id: "studio-steward",
      label: "Workflow Studio — a step's Steward",
      trigger: "Steward button on a step — the chat about that one step",
      urlPattern: STUDIO_WORKFLOW,
      mandateKeys: [
        K.workflow__steward,
        K.workflow__steward__agent_run,
        K.workflow__steward__data,
        K.workflow__steward__decision,
        K.workflow__steward__user_input,
      ],
      app: "workflow-studio",
      sources: ["src/features/canvas/node-agent/use-node-agent-chat.ts"],
      calls: "/agent-context",
      server: [
        "aidream/api/routers/workflow.py",
        "aidream/services/workflow_node_agent/context.py",
      ],
    },
    {
      id: "studio-setup-helper",
      label: "Workflow Studio — step setup helper",
      trigger: "Get help setting up an agent step",
      urlPattern: STUDIO_WORKFLOW,
      mandateKeys: [K.workflow__wizard__agent_run],
      app: "workflow-studio",
      sources: ["src/features/canvas/node-setup/node-setup-wizard.tsx"],
      calls: "/agent-context",
      server: [
        "aidream/api/routers/workflow.py",
        "aidream/services/workflow_node_agent/context.py",
      ],
    },
    {
      id: "studio-plan-room",
      label: "Workflow Studio — Plan Room",
      trigger: "The Plan's Steward chat",
      urlPattern: STUDIO_WORKFLOW,
      mandateKeys: [K.workflow__plan_design],
      app: "workflow-studio",
      sources: ["src/hooks/use-steward-chat.ts"],
    },
    {
      id: "studio-plan-assists",
      label: "Workflow Studio — Plan Room helpers",
      trigger: "Write notes, recommend a step type, design the input or output shape",
      urlPattern: STUDIO_WORKFLOW,
      mandateKeys: [
        K.workflow__plan_notes_writer,
        K.workflow__plan_node_type_recommender,
        K.workflow__plan_input_kind_authoring,
        K.workflow__plan_output_kind_authoring,
      ],
      app: "workflow-studio",
      sources: ["src/hooks/use-plan-assist.ts"],
      calls: "/assist",
      server: [
        "aidream/api/routers/workflow_plans.py",
        "aidream/services/workflow_plans/mandates.py",
      ],
    },
    {
      id: "studio-run-suggestions",
      label: "Workflow Studio — failed step",
      trigger: "Suggested fixes on a failed step",
      urlPattern: STUDIO_WORKFLOW,
      mandateKeys: [K.workflow__run_assist_suggester],
      app: "workflow-studio",
      sources: ["src/hooks/use-run-assists.ts"],
      calls: "/suggestions",
      server: [
        "aidream/api/routers/workflow_recovery.py",
        "aidream/services/runtime/run_assists.py",
      ],
    },
    {
      id: "studio-recovery",
      label: "Workflow Studio — run recovery",
      trigger: "Ask AI how to recover a stopped run",
      urlPattern: STUDIO_WORKFLOW,
      mandateKeys: [K.workflow__recovery_advisor],
      app: "workflow-studio",
      sources: ["src/hooks/use-recovery-agent.ts"],
      calls: "/recovery/handle",
      server: [
        "aidream/api/routers/workflow_recovery.py",
        "aidream/services/runtime/recovery_advisor.py",
      ],
    },
  ],
};
