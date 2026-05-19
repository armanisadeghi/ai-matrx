// components/markdown-studio/block-type-colors.ts
// Stable color palette for render block types. Used by every visualization
// (stats card, badges, analysis cells) so a "code" chip looks the same
// whether it appears in the live preview gutter or in the drift report.

export interface BlockTypeStyle {
  /** Tailwind text color class (semantic). */
  text: string;
  /** Tailwind background with subtle alpha. */
  bg: string;
  /** Tailwind border color. */
  border: string;
  /** Friendly label. */
  label: string;
}

const DEFAULT_STYLE: BlockTypeStyle = {
  text: "text-foreground",
  bg: "bg-muted/40",
  border: "border-border",
  label: "block",
};

const STYLES: Record<string, BlockTypeStyle> = {
  text: {
    text: "text-foreground",
    bg: "bg-muted/40",
    border: "border-border",
    label: "Text",
  },
  code: {
    text: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    label: "Code",
  },
  table: {
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    label: "Table",
  },
  image: {
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/30",
    label: "Image",
  },
  video: {
    text: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    label: "Video",
  },
  thinking: {
    text: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    label: "Thinking",
  },
  reasoning: {
    text: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    label: "Reasoning",
  },
  decision: {
    text: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    label: "Decision",
  },
  artifact: {
    text: "text-cyan-700 dark:text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    label: "Artifact",
  },
  task: {
    text: "text-orange-700 dark:text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    label: "Task",
  },
  tool: {
    text: "text-orange-700 dark:text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    label: "Tool",
  },
  info: {
    text: "text-sky-700 dark:text-sky-300",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    label: "Info",
  },
  quiz: {
    text: "text-pink-700 dark:text-pink-300",
    bg: "bg-pink-500/10",
    border: "border-pink-500/30",
    label: "Quiz",
  },
  flashcards: {
    text: "text-pink-700 dark:text-pink-300",
    bg: "bg-pink-500/10",
    border: "border-pink-500/30",
    label: "Flashcards",
  },
  questionnaire: {
    text: "text-indigo-700 dark:text-indigo-300",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
    label: "Questionnaire",
  },
  timeline: {
    text: "text-teal-700 dark:text-teal-300",
    bg: "bg-teal-500/10",
    border: "border-teal-500/30",
    label: "Timeline",
  },
};

export function getBlockTypeStyle(type: string): BlockTypeStyle {
  return STYLES[type] ?? { ...DEFAULT_STYLE, label: type };
}
