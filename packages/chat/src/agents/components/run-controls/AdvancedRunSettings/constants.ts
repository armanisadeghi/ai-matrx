/**
 * AdvancedRunSettings — option catalogs.
 *
 * Strictly UX data. No model IDs here — this version is descriptive: the
 * user tells us what they need and a server-side algorithm resolves the
 * concrete model + provider-specific settings (reasoning_effort vs.
 * thinking_level, tool ids, etc.).
 */

// ── Shared 5-level scale ─────────────────────────────────────────────────────

export type Level = 'minimal' | 'low' | 'medium' | 'high' | 'max';

export const LEVELS: readonly { id: Level; label: string }[] = [
  { id: 'minimal', label: 'Min' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Med' },
  { id: 'high', label: 'High' },
  { id: 'max', label: 'Max' },
] as const;

export const DEFAULT_LEVEL: Level = 'medium';
export const LEVEL_COUNT = LEVELS.length;

export function levelIndex(id: Level): number {
  return LEVELS.findIndex((l) => l.id === id);
}

// ── Primary output ───────────────────────────────────────────────────────────

export type PrimaryOutput = 'text' | 'image' | 'audio' | 'video';

export const PRIMARY_OUTPUTS: readonly { id: PrimaryOutput; label: string }[] =
  [
    { id: 'text', label: 'Text' },
    { id: 'image', label: 'Image' },
    { id: 'audio', label: 'Audio' },
    { id: 'video', label: 'Video' },
  ] as const;

export const DEFAULT_PRIMARY_OUTPUT: PrimaryOutput = 'text';

// ── Input modes (multi-select) ────────────────────────────────────────────────

export type InputMode =
  | 'text'
  | 'image'
  | 'documents'
  | 'audio'
  | 'video'
  | 'youtube';

export const INPUT_MODES: readonly { id: InputMode; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Image' },
  { id: 'documents', label: 'Documents' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'youtube', label: 'YouTube Video' },
] as const;

export const DEFAULT_INPUT_MODES: InputMode[] = ['text'];

// ── Model attribute axes (each graded on the shared Level scale) ─────────────

export type AttributeKey = 'rawIntelligence' | 'speed' | 'cost' | 'reasoningAbility';

export const ATTRIBUTES: readonly { id: AttributeKey; label: string }[] = [
  { id: 'rawIntelligence', label: 'Raw Intelligence' },
  { id: 'speed', label: 'Speed' },
  { id: 'cost', label: 'Cost' },
  { id: 'reasoningAbility', label: 'Reasoning Ability' },
] as const;

export type AttributesValue = Record<AttributeKey, Level>;

export const DEFAULT_ATTRIBUTES: AttributesValue = {
  rawIntelligence: 'medium',
  speed: 'medium',
  cost: 'medium',
  reasoningAbility: 'medium',
};

// ── Importance sliders (Not important → Critical) ────────────────────────────

export type ImportanceKey =
  | 'codeWriting'
  | 'contentWriting'
  | 'friendliness'
  | 'math'
  | 'visualReasoning'
  | 'multilingualReasoning'
  | 'designSkills';

export const IMPORTANCE_ITEMS: readonly { id: ImportanceKey; label: string }[] =
  [
    { id: 'codeWriting', label: 'Code Writing' },
    { id: 'contentWriting', label: 'Content Writing' },
    { id: 'friendliness', label: 'Friendliness' },
    { id: 'math', label: 'Math' },
    { id: 'visualReasoning', label: 'Visual Reasoning' },
    { id: 'multilingualReasoning', label: 'Multilingual Reasoning' },
    { id: 'designSkills', label: 'Design Skills' },
  ] as const;

export type ImportanceValue = Record<ImportanceKey, Level>;

export const DEFAULT_IMPORTANCE: ImportanceValue = {
  codeWriting: 'low',
  contentWriting: 'low',
  friendliness: 'medium',
  math: 'low',
  visualReasoning: 'low',
  multilingualReasoning: 'low',
  designSkills: 'low',
};

// ── Tools ─────────────────────────────────────────────────────────────────────

export type ToolKey =
  | 'web_search'
  | 'run_code'
  | 'access_database'
  | 'use_browser'
  | 'news'
  | 'research'
  | 'seo'
  | 'access_files';

export const TOOLS: readonly { id: ToolKey; label: string }[] = [
  { id: 'web_search', label: 'Search the web' },
  { id: 'run_code', label: 'Run code' },
  { id: 'access_database', label: 'Access database' },
  { id: 'use_browser', label: 'Use Browser' },
  { id: 'news', label: 'News' },
  { id: 'research', label: 'Research' },
  { id: 'seo', label: 'SEO' },
  { id: 'access_files', label: 'Access Files' },
] as const;

export const DEFAULT_TOOLS: ToolKey[] = [];

// ── Artifact skills ──────────────────────────────────────────────────────────
// Consolidated list — each maps to one or more block types in the registry.
// Labels are human-friendly; internal ids are stable for the algorithm.

export type ArtifactSkillKey =
  | 'structured_text'
  | 'code'
  | 'tables'
  | 'tasks'
  | 'images'
  | 'videos'
  | 'audio'
  | 'flashcards'
  | 'quizzes'
  | 'slideshows'
  | 'presentations'
  | 'timeline'
  | 'recipes'
  | 'comparison'
  | 'research'
  | 'math_problems'
  | 'decision_tree'
  | 'troubleshooting'
  | 'interactive_diagrams'
  | 'questionnaires'
  | 'progress_tracking'
  | 'transcripts'
  | 'tree_structure'
  | 'resource_collection';

export const ARTIFACT_SKILLS: readonly {
  id: ArtifactSkillKey;
  label: string;
}[] = [
  { id: 'structured_text', label: 'Structured text' },
  { id: 'code', label: 'Code' },
  { id: 'tables', label: 'Tables' },
  { id: 'tasks', label: 'Task lists' },
  { id: 'images', label: 'Images' },
  { id: 'videos', label: 'Videos' },
  { id: 'audio', label: 'Audio' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'quizzes', label: 'Quizzes' },
  { id: 'slideshows', label: 'Slideshows' },
  { id: 'presentations', label: 'Presentations' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'recipes', label: 'Cooking recipes' },
  { id: 'comparison', label: 'Comparison tables' },
  { id: 'research', label: 'Research' },
  { id: 'math_problems', label: 'Math problems' },
  { id: 'decision_tree', label: 'Decision trees' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'interactive_diagrams', label: 'Interactive diagrams' },
  { id: 'questionnaires', label: 'Questionnaires' },
  { id: 'progress_tracking', label: 'Progress tracking' },
  { id: 'transcripts', label: 'Transcripts' },
  { id: 'tree_structure', label: 'Tree structures' },
  { id: 'resource_collection', label: 'Resource collections' },
] as const;

export const DEFAULT_ARTIFACT_SKILLS: ArtifactSkillKey[] = [
  'structured_text',
  'code',
  'tables',
  'tasks',
];

// ── Aggregate value shape ────────────────────────────────────────────────────

export interface AdvancedRunSettingsValue {
  primaryOutput: PrimaryOutput;
  inputModes: InputMode[];
  attributes: AttributesValue;
  importance: ImportanceValue;
  thinkingLevel: Level;
  tools: ToolKey[];
  artifactSkills: ArtifactSkillKey[];
}

export const DEFAULT_ADVANCED_RUN_SETTINGS: AdvancedRunSettingsValue = {
  primaryOutput: DEFAULT_PRIMARY_OUTPUT,
  inputModes: DEFAULT_INPUT_MODES,
  attributes: DEFAULT_ATTRIBUTES,
  importance: DEFAULT_IMPORTANCE,
  thinkingLevel: DEFAULT_LEVEL,
  tools: DEFAULT_TOOLS,
  artifactSkills: DEFAULT_ARTIFACT_SKILLS,
};
