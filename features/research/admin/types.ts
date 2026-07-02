import type { Json } from '@/types/database.types';
import type { ResearchTemplate, AutonomyLevel } from '../types';

export const AGENT_CONFIG_KEYS = [
    'page_summary_agent_id',
    'keyword_synthesis_agent_id',
    'research_report_agent_id',
    'updater_agent_id',
    'consolidation_agent_id',
    'auto_tagger_agent_id',
    'document_assembly_agent_id',
] as const;

export type AgentConfigKey = (typeof AGENT_CONFIG_KEYS)[number];

export interface AgentConfigEntry {
    key: AgentConfigKey;
    label: string;
    description: string;
    builtinId: string | null;
    builtinName?: string;
    usedBy: string;
}

export const AGENT_CONFIG_META: Record<AgentConfigKey, { label: string; description: string; usedBy: string }> = {
    page_summary_agent_id: {
        label: 'Page Summary Agent',
        description: 'Summarizes individual scraped pages',
        usedBy: 'analysis.py → analyze_source()',
    },
    keyword_synthesis_agent_id: {
        label: 'Keyword Synthesis Agent',
        description: 'Synthesizes analyses for a single keyword',
        usedBy: 'synthesis.py → synthesize_keyword()',
    },
    research_report_agent_id: {
        label: 'Research Report Generator',
        description: 'Generates the full project-level research report',
        usedBy: 'synthesis.py → synthesize_project()',
    },
    updater_agent_id: {
        label: 'Research Report Updater',
        description: 'Updates existing reports with new information',
        usedBy: 'synthesis.py → keyword & project update mode',
    },
    consolidation_agent_id: {
        label: 'Tag Consolidation Agent',
        description: 'Consolidates content under a tag',
        usedBy: 'tagging.py → consolidate_tag()',
    },
    auto_tagger_agent_id: {
        label: 'Auto-Tagger Agent',
        description: 'Suggests tags for a source',
        usedBy: 'tagging.py → suggest_tags_for_source()',
    },
    document_assembly_agent_id: {
        label: 'Document Assembly Agent',
        description: 'Assembles the final polished document',
        usedBy: 'document.py → assemble_document()',
    },
};

export const SYSTEM_CONSTANTS = [
    {
        key: 'GENERIC_PAGE_SUMMARY_AGENT_ID',
        label: 'Page Summary Fallback',
        description: 'System-wide fallback for page summary when no template/project override exists',
        defaultValue: '7e021d98-5ea7-4ff1-b295-1c941312439d',
        module: 'analysis.py',
    },
    {
        key: 'GENERIC_SUGGEST_AGENT_ID',
        label: 'Suggest Agent Fallback',
        description: 'System-wide fallback for research setup suggestions',
        defaultValue: '4f802fd1-2132-4347-a598-ef01febbcf2c',
        module: 'analysis.py',
    },
] as const;

export interface TemplateFormData {
    name: string;
    description: string;
    keyword_templates: string[];
    default_tags: string[];
    agent_config: Record<string, string>;
    autonomy_level: AutonomyLevel;
    metadata: Record<string, unknown>;
}

export interface PromptBuiltinRef {
    id: string;
    name: string;
    is_active: boolean;
}

export interface TemplateWithAgentNames extends ResearchTemplate {
    agent_names?: Record<string, string>;
}

/**
 * Narrow `rs_template.agent_config` (raw JSONB) into a `role_key -> agent id`
 * string map. Non-object rows and non-string values are dropped rather than
 * assumed — the honest empty state for a template with no wiring yet.
 */
export function jsonToAgentConfigStrings(value: Json | null): Record<string, string> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
        if (typeof v === 'string') out[k] = v;
    }
    return out;
}
