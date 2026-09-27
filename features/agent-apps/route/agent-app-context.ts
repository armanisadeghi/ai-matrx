/**
 * The open agent app as ONE XML context bundle (`app_bundle`) — what an agent
 * on `/agent-apps/[id]/**` needs up front, in the fewest tokens (the context
 * budget, `features/surfaces/runtime/context-bundle.ts`). Pure: built from the
 * row the page already hydrated into Redux, never a fetch.
 *
 * Budget: a focused record, ~10,000 chars in total. The custom component
 * source is the big part, clipped at 6,000 with `clipped="true"
 * total_chars="N"` so the agent knows `component_code` holds the rest.
 */

import {
  xmlElement,
  xmlList,
  xmlText,
} from "@/features/surfaces/runtime/context-bundle";

export const APP_BUNDLE_CODE_MAX_CHARS = 6000;
const APP_BUNDLE_DESCRIPTION_MAX_CHARS = 1500;

export interface AgentAppBundleSource {
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  status?: string | null;
  visibility?: string | null;
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

interface VariableRow {
  name?: unknown;
  type?: unknown;
  label?: unknown;
  required?: unknown;
}

export function buildAgentAppBundle(
  app: AgentAppBundleSource,
  activeView?: string,
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
      public_url: app.visibility === "public" ? `/p/${app.slug}` : null,
      status: app.status,
      visibility: app.visibility,
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
      xmlText("component_code", app.component_code, {
        max: APP_BUNDLE_CODE_MAX_CHARS,
        attrs: { language: app.component_language },
      }),
    ],
  );
}
