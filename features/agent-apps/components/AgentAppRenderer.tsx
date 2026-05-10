// @ts-nocheck

"use client";

import { AgentAppPublicRenderer } from "./AgentAppPublicRenderer";
import type { AgentApp, PublicAgentApp } from "../types";

interface AgentAppRendererProps {
  app: AgentApp | PublicAgentApp;
  slug: string;
}

export function AgentAppRenderer({ app, slug }: AgentAppRendererProps) {
  const publicSubset: PublicAgentApp = {
    id: app.id,
    slug: app.slug,
    name: app.name,
    agent_id: app.agent_id,
    agent_version_id: app.agent_version_id,
    use_latest: app.use_latest,
    tagline: app.tagline,
    description: app.description,
    category: app.category,
    tags: app.tags,
    preview_image_url: app.preview_image_url,
    favicon_url: app.favicon_url,
    component_code: app.component_code,
    component_language: app.component_language,
    allowed_imports: app.allowed_imports,
    variable_schema: app.variable_schema,
    layout_config: app.layout_config,
    styling_config: app.styling_config,
    shell_kind: app.shell_kind,
    shell_config: app.shell_config,
    slot_overrides: app.slot_overrides,
    slot_code: app.slot_code,
    total_executions: app.total_executions,
    success_rate: app.success_rate,
  };

  return <AgentAppPublicRenderer app={publicSubset} slug={slug} />;
}
