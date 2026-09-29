/**
 * The open agent app as ONE XML context bundle (`app_bundle`) — what an agent
 * on `/agent-apps/[id]/**` needs up front, in the fewest tokens (the context
 * budget, `features/surfaces/runtime/context-bundle.ts`). Pure: built from the
 * row the page already hydrated into Redux, never a fetch.
 *
 * Budget: a focused record, ~9,000 chars in total. The custom component
 * source is clipped at 3,500 and the latest run's result at 2,500, each with
 * `clipped="true" total_chars="N"` so the agent knows `component_code` /
 * `run_result` hold the rest. The latest run (input, status, result) rides
 * along because on /run it is what the person is looking at.
 */

import {
  xmlElement,
  xmlList,
  xmlText,
} from "@/features/surfaces/runtime/context-bundle";

export const APP_BUNDLE_CODE_MAX_CHARS = 3500;
export const APP_BUNDLE_RESULT_MAX_CHARS = 2500;
const APP_BUNDLE_DESCRIPTION_MAX_CHARS = 1500;

export interface AgentAppBundleSource {
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  status?: string | null;
  published_to_web?: boolean | null;
  category?: string | null;
  tags?: string[] | null;
  version?: number | null;
  shell_kind?: string | null;
  component_language?: string | null;
  component_code?: string | null;
  variable_schema?: unknown;
  total_executions?: number | null;
  success_rate?: number | null;
  last_execution_at?: string | null;
}

/** The app's latest run on this page, read from state the page rendered. */
export interface AgentAppRunSnapshot {
  conversationId?: string;
  status: "idle" | "running" | "done" | "error";
  input?: Record<string, unknown>;
  inputText?: string;
  result?: string;
  error?: string;
}

interface VariableRow {
  name?: unknown;
  type?: unknown;
  label?: unknown;
  required?: unknown;
}

export function buildAgentAppBundle(
  app: AgentAppBundleSource,
  activeView?: string,
  run?: AgentAppRunSnapshot,
): string {
  const variables = Array.isArray(app.variable_schema)
    ? (app.variable_schema as VariableRow[])
    : [];
  return xmlElement(
    "agent_app",
    {
      id: app.id,
      name: app.name,
      slug: app.slug,
      public_url: app.published_to_web ? `/p/${app.slug}` : null,
      status: app.status,
      published_to_web: app.published_to_web,
      category: app.category,
      tags: app.tags?.length ? app.tags.join(", ") : null,
      version: app.version,
      shell: app.shell_kind,
      view: activeView,
    },
    [
      xmlText("tagline", app.tagline),
      xmlText("description", app.description, {
        max: APP_BUNDLE_DESCRIPTION_MAX_CHARS,
      }),
      xmlList(
        "variables",
        variables,
        (v) =>
          xmlElement("variable", {
            name: typeof v.name === "string" ? v.name : null,
            label: typeof v.label === "string" ? v.label : null,
            type: typeof v.type === "string" ? v.type : null,
            required: v.required === true ? true : null,
          }),
      ),
      xmlElement("usage", {
        runs: app.total_executions,
        success_rate: app.success_rate,
        last_run: app.last_execution_at?.slice(0, 10),
      }),
      run && run.status !== "idle"
        ? xmlElement(
            "latest_run",
            { status: run.status, conversation_id: run.conversationId },
            [
              run.input && Object.keys(run.input).length > 0
                ? xmlList(
                    "input",
                    Object.entries(run.input),
                    ([name, value]) =>
                      xmlText("value", typeof value === "string" ? value : JSON.stringify(value), {
                        max: 500,
                        attrs: { name },
                      }),
                  )
                : "",
              xmlText("typed", run.inputText, { max: 500 }),
              xmlText("error", run.error, { max: 300 }),
              xmlText("result", run.result, { max: APP_BUNDLE_RESULT_MAX_CHARS }),
            ],
          )
        : "",
      xmlText("component_code", app.component_code, {
        max: APP_BUNDLE_CODE_MAX_CHARS,
        attrs: { language: app.component_language },
      }),
    ],
  );
}
